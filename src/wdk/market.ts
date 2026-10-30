import { useQuery } from '@tanstack/react-query';
import { SAUCERSWAP, HEDERA_TOKEN_BY_ID } from '@/config/hederaTokens';

/**
 * Hedera market data straight from SaucerSwap's public REST API (no key
 * needed for these, checked 2026-10-30): current USD price + 24h change
 * from /tokens/default, and candles from /tokens/prices/{id} (Home
 * sparklines, Trade chart). Ids are Hedera token ids; native HBAR (0.0.0)
 * is priced as WHBAR.
 */
const API = SAUCERSWAP.api;

/** SaucerSwap prices HBAR via WHBAR. */
const priceId = (id: string) => (HEDERA_TOKEN_BY_ID[id]?.native ? SAUCERSWAP.whbarId : id);

async function ss<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`SaucerSwap ${res.status}`);
  return res.json() as Promise<T>;
}

export interface MarketQuote {
  price: number;
  change24h: number;
}

interface DefaultToken {
  id: string;
  priceUsd: number;
  priceChangeDay?: number;
}

async function quotes(ids: string[]): Promise<Record<string, MarketQuote>> {
  const list = await ss<DefaultToken[]>('/tokens/default');
  const byId = new Map(list.map((t) => [t.id, t]));
  const out: Record<string, MarketQuote> = {};
  for (const id of ids) {
    const t = byId.get(priceId(id));
    if (t && Number.isFinite(t.priceUsd)) out[id] = { price: t.priceUsd, change24h: t.priceChangeDay ?? 0 };
  }
  return out;
}

/** Price + 24h % change per Hedera token id. Missing ids are left out. */
export function useMarketQuotes(ids: string[]) {
  const key = [...ids].sort().join(',');
  return useQuery({
    queryKey: ['ss-quotes', key],
    queryFn: () => quotes(ids),
    enabled: ids.length > 0,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

export type Interval = 'FIVEMIN' | 'HOUR' | 'DAY' | 'WEEK';

interface RawCandle {
  openUsd: number;
  highUsd: number;
  lowUsd: number;
  closeUsd: number;
  timestampSeconds: number;
}

async function candles(id: string, seconds: number, interval: Interval): Promise<RawCandle[]> {
  const to = Math.floor(Date.now() / 1000);
  const raw = await ss<RawCandle[]>(`/tokens/prices/${priceId(id)}?from=${to - seconds}&to=${to}&interval=${interval}`);
  return raw.filter((c) => Number.isFinite(c.closeUsd)).sort((a, b) => a.timestampSeconds - b.timestampSeconds);
}

/** 7 days of hourly USD closes for a Hedera token (oldest first) — GO's number-crunching. */
export async function weekCloses(id: string): Promise<number[]> {
  return (await candles(id, 7 * 86_400, 'HOUR')).map((c) => c.closeUsd);
}

export interface MarketCoin extends MarketQuote {
  id: string;
  /** ~7 days of hourly closes, oldest first. */
  sparkline: number[];
}

/** Price, 24h change and a 7-day hourly sparkline per Hedera token id. */
export function useMarkets(ids: string[]) {
  const key = [...ids].sort().join(',');
  return useQuery({
    queryKey: ['ss-markets', key],
    queryFn: async () => {
      const [q, lines] = await Promise.all([
        quotes(ids),
        Promise.all(ids.map((id) => candles(id, 7 * 86_400, 'HOUR').catch(() => [] as RawCandle[]))),
      ]);
      const out: Record<string, MarketCoin> = {};
      ids.forEach((id, i) => {
        if (q[id]) out[id] = { id, ...q[id], sparkline: lines[i].map((c) => c.closeUsd) };
      });
      return out;
    },
    enabled: ids.length > 0,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

export interface Candle {
  /** Unix seconds (what lightweight-charts expects). */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/** Candle size per Trade range: enough points to draw, few enough to load fast. */
const RANGE: Record<1 | 7 | 30 | 90 | 365, Interval> = { 1: 'FIVEMIN', 7: 'HOUR', 30: 'HOUR', 90: 'DAY', 365: 'DAY' };

/** USD OHLC candles for a Hedera token over the last `days`. */
export function useOhlc(id: string | null, days: 1 | 7 | 30 | 90 | 365) {
  return useQuery({
    queryKey: ['ss-ohlc', id, days],
    queryFn: async () =>
      (await candles(id!, days * 86_400, RANGE[days])).map(
        (c): Candle => ({ time: c.timestampSeconds, open: c.openUsd, high: c.highUsd, low: c.lowUsd, close: c.closeUsd }),
      ),
    enabled: !!id,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}
