import { useQuery } from '@tanstack/react-query';
import BigNumber from 'bignumber.js';
import { HEDERA_MIRROR_NODE_URL } from '@/config/hedera';
import { HEDERA_TOKEN_BY_ID } from '@/config/hederaTokens';

/**
 * Hedera transaction history from the public mirror node (the WDK Indexer
 * has no Hedera support).
 *
 * Kept: transfers of HBAR and of every NBX-go token (config/hederaTokens.ts)
 * that touch the account. HBAR sent from this wallet goes out as an EVM
 * transaction (ETHEREUMTRANSACTION), so both that and CRYPTOTRANSFER count;
 * fee-only legs to node/system accounts (0.0.3–0.0.999) are ignored.
 * Mirror-node amounts are in each token's smallest unit, tinybar for HBAR.
 */
export interface HederaTransfer {
  id: string;
  symbol: string;
  direction: 'in' | 'out';
  /** Human amount, always positive. */
  amount: string;
  counterparty: string | null;
  timestamp: number; // ms
  status: 'confirmed' | 'failed';
  explorerUrl: string;
}

interface MirrorTx {
  transaction_id: string;
  consensus_timestamp: string;
  result: string;
  name: string;
  transfers?: { account: string; amount: number }[];
  token_transfers?: { token_id: string; account: string; amount: number }[];
}

async function mirror<T>(path: string): Promise<T> {
  const res = await fetch(`${HEDERA_MIRROR_NODE_URL}${path}`);
  if (!res.ok) throw new Error(`Mirror node ${res.status}`);
  return res.json() as Promise<T>;
}

/** Hedera account id (0.0.x) behind an EVM address, cached for the session. */
const accountIds = new Map<string, string | null>();
export async function hederaAccountId(evmAddress: string): Promise<string | null> {
  const key = evmAddress.toLowerCase();
  if (accountIds.has(key)) return accountIds.get(key)!;
  try {
    const id = (await mirror<{ account: string }>(`/api/v1/accounts/${evmAddress}`)).account;
    accountIds.set(key, id);
    return id;
  } catch {
    // An EVM-alias account only exists once it has received HBAR or a token.
    return null;
  }
}

const isSystem = (account: string) => Number(account.split('.')[2]) <= 999;

/** Recent transfers, newest first. Plain function so GO can call it directly. */
export async function fetchHederaTransfers(evmAddress: string, limit = 50): Promise<HederaTransfer[]> {
  const accountId = await hederaAccountId(evmAddress);
  if (!accountId) return [];
  const { transactions } = await mirror<{ transactions: MirrorTx[] }>(
    `/api/v1/transactions?account.id=${accountId}&limit=${limit}&order=desc`,
  );

  const out: HederaTransfer[] = [];
  for (const tx of transactions) {
    const ts = Math.round(Number(tx.consensus_timestamp) * 1000);
    const status = tx.result === 'SUCCESS' ? 'confirmed' : 'failed';
    const explorerUrl = `https://hashscan.io/mainnet/transaction/${tx.consensus_timestamp}`;

    // Token legs (USDT0, SAUCE, PLEX…), one entry per token that moved for us.
    for (const t of (tx.token_transfers ?? []).filter((t) => t.account === accountId)) {
      const tok = HEDERA_TOKEN_BY_ID[t.token_id];
      if (!tok || t.amount === 0) continue;
      const other = (tx.token_transfers ?? []).find(
        (o) => o.token_id === t.token_id && o.account !== accountId && Math.sign(o.amount) !== Math.sign(t.amount),
      );
      out.push({
        id: `${tx.transaction_id}-${t.token_id}`,
        symbol: tok.symbol,
        direction: t.amount >= 0 ? 'in' : 'out',
        amount: new BigNumber(Math.abs(t.amount)).shiftedBy(-tok.decimals).decimalPlaces(6).toFormat(),
        counterparty: other?.account ?? null,
        timestamp: ts,
        status,
        explorerUrl,
      });
    }

    // HBAR leg — skip fee-only movements (the only other parties are system accounts).
    if (tx.name !== 'CRYPTOTRANSFER' && tx.name !== 'ETHEREUMTRANSACTION') continue;
    const hbar = (tx.transfers ?? []).find((t) => t.account === accountId);
    const others = (tx.transfers ?? []).filter((t) => t.account !== accountId && !isSystem(t.account) && t.amount !== 0);
    if (!hbar || others.length === 0) continue;
    // Our net includes the network fee on sends; report the counterparty's amount when we paid.
    const moved = hbar.amount < 0 ? Math.abs(others.filter((o) => o.amount > 0).reduce((s, o) => s + o.amount, 0)) || Math.abs(hbar.amount) : hbar.amount;
    out.push({
      id: `${tx.transaction_id}-hbar`,
      symbol: 'HBAR',
      direction: hbar.amount >= 0 ? 'in' : 'out',
      amount: new BigNumber(moved).shiftedBy(-8).decimalPlaces(4).toFormat(),
      counterparty: others[0]?.account ?? null,
      timestamp: ts,
      status,
      explorerUrl,
    });
  }
  return out;
}

export function useHederaTransfers(evmAddress: string | undefined) {
  return useQuery({
    queryKey: ['hedera-history', 'v2', evmAddress],
    enabled: !!evmAddress,
    staleTime: 30_000,
    queryFn: () => fetchHederaTransfers(evmAddress!),
  });
}
