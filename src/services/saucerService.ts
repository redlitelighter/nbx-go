/**
 * src/services/saucerService.ts — Hedera swaps straight on SaucerSwap V2.
 * https://docs.saucerswap.finance/developers/v2/swap
 *
 * Quote:   routes come from SaucerSwap's live V2 pool list — every direct
 *          pool between the pair, plus one-hop routes via WHBAR / USDC /
 *          USDT0 / SAUCE — each quoted with QuoterV2.quoteExactInput; the
 *          best output wins.
 * Execute: (0.03% platform fee) → associate the output token if needed →
 *          approve the router (token input) → swap:
 *            token → token   exactInput
 *            HBAR  → token   multicall[exactInput, refundETH], value = amount
 *            token → HBAR    multicall[exactInput(recipient = router), unwrapWHBAR]
 *          Each step waits for consensus before the next one's gas estimate.
 *
 * Units: amounts are in each token's smallest unit; HBAR in tinybar (8 dp)
 * inside calldata, but the JSON-RPC relay takes tx `value` in weibar
 * (tinybar × 1e10).
 */
import { Interface, solidityPacked } from 'ethers';
import { HEDERA_MIRROR_NODE_URL, HEDERA_RPC_URL } from '@/config/hedera';
import { assertAdminAddress, computePlatformFee, getAdminAddress } from '@/config/chains';
import {
  HEDERA_TOKEN_BY_ID,
  SAUCERSWAP,
  TINYBAR_TO_WEIBAR,
  USDT0_HEDERA_ID,
  hederaEvmAddress,
  pathAddress,
  type HederaToken,
} from '@/config/hederaTokens';

/** The WDK Hedera account, as useAccount().extension() exposes it. */
export interface HederaAccount {
  getAddress(): Promise<string>;
  getAllowance(token: string, spender: string): Promise<bigint>;
  approve(options: { token: string; spender: string; amount: bigint }): Promise<{ hash: string }>;
  transfer(options: { token: string; recipient: string; amount: bigint }): Promise<{ hash: string }>;
  sendTransaction(tx: { to: string; value: bigint; data: string }): Promise<{ hash: string; fee?: bigint }>;
}

const QUOTER = new Interface([
  'function quoteExactInput(bytes path, uint256 amountIn) returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)',
]);
const ROUTER = new Interface([
  'function exactInput((bytes path, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum) params) payable returns (uint256 amountOut)',
  'function multicall(bytes[] data) payable returns (bytes[] results)',
  'function refundETH() payable',
  'function unwrapWHBAR(uint256 amountMinimum, address recipient) payable',
]);
/** HIP-719: an EOA associates itself with an HTS token by calling the token. */
const HRC719 = new Interface(['function associate() returns (uint256 responseCode)']);

// ── Pools & routes ────────────────────────────────────────────

interface Pool {
  a: string;
  b: string;
  fee: number;
  liquidity: bigint;
}

let poolCache: { at: number; pools: Pool[] } | null = null;

async function loadPools(): Promise<Pool[]> {
  if (poolCache && Date.now() - poolCache.at < 5 * 60_000) return poolCache.pools;
  const res = await fetch(`${SAUCERSWAP.api}/v2/pools`);
  if (!res.ok) throw new Error(`SaucerSwap pools ${res.status}`);
  const raw: { tokenA: { id: string }; tokenB: { id: string }; fee: number; liquidity: string }[] = await res.json();
  const pools = raw
    .map((p) => ({ a: p.tokenA.id, b: p.tokenB.id, fee: p.fee, liquidity: BigInt(p.liquidity || '0') }))
    .filter((p) => p.liquidity > 0n);
  poolCache = { at: Date.now(), pools };
  return pools;
}

/** Hop tokens for two-pool routes: WHBAR, USDC, USDT0, SAUCE. */
const HUBS = [SAUCERSWAP.whbarId, '0.0.456858', USDT0_HEDERA_ID, '0.0.731861'];

/** Path-level id: native HBAR trades as WHBAR. */
const poolId = (t: HederaToken) => (t.native ? SAUCERSWAP.whbarId : t.id);

export interface Route {
  /** Pool-level token ids, input first. */
  ids: string[];
  fees: number[];
}

function poolsBetween(pools: Pool[], x: string, y: string) {
  return pools
    .filter((p) => (p.a === x && p.b === y) || (p.a === y && p.b === x))
    .sort((p, q) => (q.liquidity > p.liquidity ? 1 : -1));
}

export async function findRoutes(from: HederaToken, to: HederaToken): Promise<Route[]> {
  const pools = await loadPools();
  const x = poolId(from);
  const y = poolId(to);
  if (x === y) return [];
  const routes: Route[] = poolsBetween(pools, x, y).map((p) => ({ ids: [x, y], fees: [p.fee] }));
  for (const hub of HUBS) {
    if (hub === x || hub === y) continue;
    const [p1] = poolsBetween(pools, x, hub);
    const [p2] = poolsBetween(pools, hub, y);
    if (p1 && p2) routes.push({ ids: [x, hub, y], fees: [p1.fee, p2.fee] });
  }
  return routes.slice(0, 6);
}

function encodePath(r: Route): string {
  const types: string[] = [];
  const vals: (string | number)[] = [];
  r.ids.forEach((id, i) => {
    types.push('address');
    vals.push(hederaEvmAddress(id));
    if (i < r.fees.length) {
      types.push('uint24');
      vals.push(r.fees[i]);
    }
  });
  return solidityPacked(types, vals);
}

export const routeLabel = (r: Route) =>
  r.ids.map((id) => (id === SAUCERSWAP.whbarId ? 'HBAR' : HEDERA_TOKEN_BY_ID[id]?.symbol ?? (id === '0.0.456858' ? 'USDC' : id))).join(' → ');

// ── Quote ─────────────────────────────────────────────────────

async function quoteRoute(r: Route, amountIn: bigint): Promise<bigint> {
  const data = QUOTER.encodeFunctionData('quoteExactInput', [encodePath(r), amountIn]);
  const decode = (raw: string) => QUOTER.decodeFunctionResult('quoteExactInput', raw).amountOut as bigint;
  let last: unknown;
  for (const rpc of SAUCERSWAP.quoteRpcs) {
    try {
      const res = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: SAUCERSWAP.quoter, data, gas: '0x2dc6c0' }, 'latest'] }),
      });
      const json = await res.json();
      if (json.result && json.result.length > 2) return decode(json.result);
      last = new Error(json.error?.message ?? `quote failed on ${rpc}`);
    } catch (e) {
      last = e;
    }
  }
  const res = await fetch(SAUCERSWAP.mirrorCall, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ block: 'latest', data, to: SAUCERSWAP.quoter, gas: 3_000_000 }),
  });
  if (res.ok) return decode((await res.json()).result);
  throw last instanceof Error ? last : new Error('SaucerSwap quote unavailable — try again in a minute');
}

export interface SwapQuote {
  from: HederaToken;
  to: HederaToken;
  /** What the user typed (smallest unit). */
  input: bigint;
  /** 0.03% platform fee, taken from the input — 0 when it can't be paid (see below). */
  platformFee: bigint;
  /** Swapped amount = input − platformFee. */
  amountIn: bigint;
  amountOut: bigint;
  amountOutMin: bigint;
  route: Route;
  /** Every route that quoted, best first, for display. */
  alternatives: { route: Route; amountOut: bigint }[];
  needsApproval: boolean;
  needsAssociation: boolean;
}

/**
 * The fee goes to the admin account in the input token. HBAR always
 * arrives; an HTS token only if the admin account can receive it, otherwise
 * the fee is skipped rather than failing the user's swap.
 *
 * No fee when the user IS the admin account: Hedera rejects a token
 * transfer to yourself (response code 74, ACCOUNT_REPEATED_IN_ACCOUNT_AMOUNTS),
 * which made every swap from the admin wallet revert at gas estimation.
 */
async function feeFor(from: HederaToken, input: bigint, own: string): Promise<bigint> {
  const admin = getAdminAddress();
  if (!admin || admin.toLowerCase() === own.toLowerCase()) return 0n;
  if (from.native || (await canReceiveHts(admin, from.id).catch(() => false))) return computePlatformFee(input);
  return 0n;
}

export async function quoteSwap(
  account: HederaAccount,
  from: HederaToken,
  to: HederaToken,
  input: bigint,
  slippage: number,
): Promise<SwapQuote> {
  const routes = await findRoutes(from, to);
  if (!routes.length) throw new Error(`No SaucerSwap pool connects ${from.symbol} and ${to.symbol}`);
  const own = await account.getAddress();
  const platformFee = await feeFor(from, input, own);
  const amountIn = input - platformFee;

  const settled = await Promise.allSettled(routes.map((r) => quoteRoute(r, amountIn)));
  const quoted = settled
    .map((s, i) => (s.status === 'fulfilled' && s.value > 0n ? { route: routes[i], amountOut: s.value } : null))
    .filter((q): q is { route: Route; amountOut: bigint } => !!q)
    .sort((p, q) => (q.amountOut > p.amountOut ? 1 : q.amountOut < p.amountOut ? -1 : 0));
  if (!quoted.length) {
    const err = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected');
    throw err?.reason ?? new Error('Not enough liquidity for this amount');
  }

  const [needsApproval, canReceive] = await Promise.all([
    from.native ? false : account.getAllowance(hederaEvmAddress(from.id), SAUCERSWAP.router).then((a) => a < amountIn),
    to.native ? true : canReceiveHts(own, to.id),
  ]);
  const best = quoted[0];
  return {
    from,
    to,
    input,
    platformFee,
    amountIn,
    amountOut: best.amountOut,
    amountOutMin: (best.amountOut * BigInt(Math.round((1 - slippage) * 10_000))) / 10_000n,
    route: best.route,
    alternatives: quoted,
    needsApproval,
    needsAssociation: !canReceive,
  };
}

// ── Hedera helpers ────────────────────────────────────────────

/**
 * Whether `address` can receive the HTS token: already associated, or has
 * free auto-association slots (-1 = unlimited, the default for accounts
 * auto-created from an EVM address).
 */
export async function canReceiveHts(address: string, tokenId: string): Promise<boolean> {
  const base = `${HEDERA_MIRROR_NODE_URL}/api/v1/accounts/${address}`;
  const held = await fetch(`${base}/tokens?token.id=${tokenId}`);
  if (held.status === 404) return false; // account doesn't exist yet
  if ((await held.json()).tokens?.length) return true;
  const acct = await (await fetch(base)).json();
  const max = acct.max_automatic_token_associations;
  if (max === -1) return true;
  if (typeof max !== 'number' || max === 0) return false;
  const used = await (await fetch(`${base}/tokens?limit=100`)).json();
  return (used.tokens?.filter((t: any) => t.automatic_association).length ?? max) < max;
}

/**
 * Waits for a Hedera tx to reach consensus (~3–5 s). Needed between steps:
 * the next tx's gas estimate simulates against current state and would
 * revert if the association / approval hadn't landed yet.
 */
export async function waitHederaReceipt(hash: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(HEDERA_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [hash] }),
    });
    const r = (await res.json()).result;
    if (r) {
      if (r.status !== '0x1') throw new Error(`Hedera transaction ${hash.slice(0, 10)}… failed`);
      return;
    }
    await new Promise((s) => setTimeout(s, 2_000));
  }
  throw new Error(`Timed out waiting for Hedera transaction ${hash.slice(0, 10)}…`);
}

/** Associates the account with an HTS token if it can't receive it yet. */
export async function ensureAssociated(account: HederaAccount, tokenId: string): Promise<string | null> {
  if (await canReceiveHts(await account.getAddress(), tokenId)) return null;
  const r = await account.sendTransaction({ to: hederaEvmAddress(tokenId), value: 0n, data: HRC719.encodeFunctionData('associate', []) });
  await waitHederaReceipt(r.hash);
  return r.hash;
}

/** Approves `spender` for at least `amount` of an HTS token. */
export async function ensureAllowance(account: HederaAccount, tokenId: string, spender: string, amount: bigint): Promise<string | null> {
  const token = hederaEvmAddress(tokenId);
  if ((await account.getAllowance(token, spender)) >= amount) return null;
  const a = await account.approve({ token, spender, amount });
  await waitHederaReceipt(a.hash);
  return a.hash;
}

// ── Execute ───────────────────────────────────────────────────

export type SwapStep = 'fee' | 'associate' | 'approve' | 'swap';

/**
 * Executes a quote. Caller confirms with the user first — this moves real
 * funds on Hedera mainnet. `onStep` fires as each step starts.
 */
export async function executeSwap(
  account: HederaAccount,
  q: SwapQuote,
  onStep?: (s: SwapStep) => void,
): Promise<{ hash: string }> {
  const own = await account.getAddress();

  if (q.platformFee > 0n) {
    onStep?.('fee');
    const admin = assertAdminAddress();
    const r = q.from.native
      ? await account.sendTransaction({ to: admin, value: q.platformFee * TINYBAR_TO_WEIBAR, data: '0x' })
      : await account.transfer({ token: hederaEvmAddress(q.from.id), recipient: admin, amount: q.platformFee });
    await waitHederaReceipt(r.hash);
  }

  if (!q.to.native) {
    onStep?.('associate');
    await ensureAssociated(account, q.to.id);
  }
  if (!q.from.native) {
    onStep?.('approve');
    await ensureAllowance(account, q.from.id, SAUCERSWAP.router, q.amountIn);
  }

  onStep?.('swap');
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
  const swap = (recipient: string) =>
    ROUTER.encodeFunctionData('exactInput', [{
      path: encodePath(q.route),
      recipient,
      deadline,
      amountIn: q.amountIn,
      amountOutMinimum: q.amountOutMin,
    }]);

  let tx: { to: string; value: bigint; data: string };
  if (q.from.native) {
    tx = {
      to: SAUCERSWAP.router,
      value: q.amountIn * TINYBAR_TO_WEIBAR,
      data: ROUTER.encodeFunctionData('multicall', [[swap(own), ROUTER.encodeFunctionData('refundETH', [])]]),
    };
  } else if (q.to.native) {
    tx = {
      to: SAUCERSWAP.router,
      value: 0n,
      data: ROUTER.encodeFunctionData('multicall', [[
        swap(SAUCERSWAP.router),
        ROUTER.encodeFunctionData('unwrapWHBAR', [q.amountOutMin, own]),
      ]]),
    };
  } else {
    tx = { to: SAUCERSWAP.router, value: 0n, data: swap(own) };
  }
  const r = await account.sendTransaction(tx);
  await waitHederaReceipt(r.hash);
  return { hash: r.hash };
}

/** Hedera response codes seen in HTS precompile reverts (the revert data is the code). */
const HEDERA_CODES: Record<number, string> = {
  10: 'Not enough HBAR to pay the network fee — always keep some HBAR in your wallet.',
  74: 'Hedera rejected a transfer to the same account.',
  165: 'Not enough of the token in your account.',
  178: 'Not enough of the token in your account.',
  184: 'Your account isn’t associated with this token yet.',
  292: 'SaucerSwap doesn’t have permission to spend this token yet.',
};

/**
 * A short, human message for a failed Hedera transaction instead of the raw
 * ethers error dump (which includes calldata and addresses).
 */
export function friendlyTxError(e: unknown): string {
  const raw = e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e ?? '');
  if (/user rejected|cancel/i.test(raw)) return 'Cancelled.';
  if (/insufficient funds|INSUFFICIENT_PAYER_BALANCE|INSUFFICIENT_TX_FEE|gas required exceeds/i.test(raw)) {
    return 'Not enough HBAR to pay the Hedera network fees. Always keep some HBAR (at least 1) in your wallet, then try again. Nothing was sent.';
  }
  const code = raw.match(/data=\\?"0x0{40,}([0-9a-f]{1,8})\\?"/i)?.[1];
  if (code) {
    const n = parseInt(code, 16);
    if (HEDERA_CODES[n]) return `${HEDERA_CODES[n]} Nothing was sent.`;
    return `Hedera rejected the transaction (response code ${n}). Nothing was sent.`;
  }
  if (/CALL_EXCEPTION|execution reverted/i.test(raw)) {
    return 'The swap would fail on-chain (simulation reverted), so it wasn’t sent. Try a smaller amount or higher slippage.';
  }
  if (/timed out|timeout/i.test(raw)) return 'Hedera took too long to confirm — check HashScan before retrying.';
  return raw.length > 160 ? `${raw.slice(0, 160)}…` : raw;
}

/** Helper for screens: a Hedera token by `hedera:SYMBOL` ref or symbol. */
export function tokenFromRef(ref: string | undefined): HederaToken | undefined {
  if (!ref) return undefined;
  const sym = ref.includes(':') ? ref.split(':')[1] : ref;
  return Object.values(HEDERA_TOKEN_BY_ID).find((t) => t.symbol === sym.toUpperCase());
}
