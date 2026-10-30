/**
 * src/services/stakingService.ts — SAUCE single-sided staking (xSAUCE) on
 * SaucerSwap's Mothership. https://docs.saucerswap.finance/developers/staking
 *
 *   stake:   associate xSAUCE → approve SAUCE to Mothership → enter(amount)
 *   unstake: associate SAUCE  → approve xSAUCE to Mothership → leave(share)
 *
 * No lock-up: xSAUCE is redeemable for SAUCE any time at the current ratio,
 * which grows as SaucerSwap fees buy SAUCE into the pool. APR is
 * SaucerSwap's own 5/30-day average of that ratio's growth (/stats/sss).
 */
import { useQuery } from '@tanstack/react-query';
import { Interface } from 'ethers';
import { HEDERA_RPC_URL } from '@/config/hedera';
import { HEDERA_TOKEN_BY_SYMBOL, SAUCERSWAP, hederaEvmAddress } from '@/config/hederaTokens';
import { ensureAllowance, ensureAssociated, waitHederaReceipt, type HederaAccount } from '@/services/saucerService';

export const SAUCE = HEDERA_TOKEN_BY_SYMBOL.SAUCE;
export const XSAUCE = HEDERA_TOKEN_BY_SYMBOL.XSAUCE;

const MOTHERSHIP = new Interface([
  'function enter(uint256 _amount)',
  'function leave(uint256 _share)',
  'function xSauceForSauce(uint256 _xSauceAmount) view returns (uint256 sauceAmount_)',
  'function sauceForxSauce(uint256 _sauceAmount) view returns (uint256 xSauceAmount_)',
]);
const ERC20 = new Interface(['function balanceOf(address) view returns (uint256)']);

async function call(to: string, data: string): Promise<string> {
  const res = await fetch(HEDERA_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? 'eth_call failed');
  return json.result as string;
}

export interface StakingStats {
  /** APR as a fraction (0.05 = 5%), SaucerSwap's 5- and 30-day averages. */
  apr5d: number | null;
  apr30d: number | null;
  /** SAUCE per xSAUCE. */
  ratio: number | null;
}

export function useStakingStats() {
  return useQuery({
    queryKey: ['sauce-staking-stats'],
    queryFn: async (): Promise<StakingStats> => {
      const res = await fetch(`${SAUCERSWAP.api}/stats/sss`);
      if (!res.ok) throw new Error(`SaucerSwap staking stats ${res.status}`);
      const s = await res.json();
      const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
      return { apr5d: num(s.avg5day), apr30d: num(s.avg30day), ratio: num(s.ratio) };
    },
    staleTime: 5 * 60_000,
  });
}

export interface StakingPosition {
  sauce: bigint;
  xsauce: bigint;
  /** xSAUCE balance valued in SAUCE at the live Mothership ratio. */
  xsauceInSauce: bigint;
}

export async function getPosition(address: string): Promise<StakingPosition> {
  const bal = (tokenId: string) =>
    call(hederaEvmAddress(tokenId), ERC20.encodeFunctionData('balanceOf', [address])).then((r) => BigInt(r));
  const [sauce, xsauce] = await Promise.all([bal(SAUCE.id), bal(XSAUCE.id)]);
  const xsauceInSauce =
    xsauce > 0n
      ? (MOTHERSHIP.decodeFunctionResult(
          'xSauceForSauce',
          await call(SAUCERSWAP.mothership, MOTHERSHIP.encodeFunctionData('xSauceForSauce', [xsauce])),
        )[0] as bigint)
      : 0n;
  return { sauce, xsauce, xsauceInSauce };
}

/** xSAUCE received for staking `sauce` (or SAUCE for unstaking `xsauce`). */
export async function previewStake(mode: 'stake' | 'unstake', amount: bigint): Promise<bigint> {
  const fn = mode === 'stake' ? 'sauceForxSauce' : 'xSauceForSauce';
  const raw = await call(SAUCERSWAP.mothership, MOTHERSHIP.encodeFunctionData(fn, [amount]));
  return MOTHERSHIP.decodeFunctionResult(fn, raw)[0] as bigint;
}

export type StakeStep = 'associate' | 'approve' | 'submit';

/** Stakes SAUCE for xSAUCE, or unstakes xSAUCE for SAUCE. Real funds — confirm first. */
export async function stake(
  account: HederaAccount,
  mode: 'stake' | 'unstake',
  amount: bigint,
  onStep?: (s: StakeStep) => void,
): Promise<string> {
  const [give, get] = mode === 'stake' ? [SAUCE, XSAUCE] : [XSAUCE, SAUCE];
  onStep?.('associate');
  await ensureAssociated(account, get.id);
  onStep?.('approve');
  await ensureAllowance(account, give.id, SAUCERSWAP.mothership, amount);
  onStep?.('submit');
  const data = MOTHERSHIP.encodeFunctionData(mode === 'stake' ? 'enter' : 'leave', [amount]);
  const r = await account.sendTransaction({ to: SAUCERSWAP.mothership, value: 0n, data });
  await waitHederaReceipt(r.hash);
  return r.hash;
}
