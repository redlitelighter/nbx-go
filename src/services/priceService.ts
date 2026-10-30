/**
 * src/services/priceService.ts — USD prices for the whole app (and GO).
 *
 * Majors come from WDK's Bitfinex pricing client (one batched /tickers call,
 * ~1–2 s), wrapped in WDK's PricingProvider for caching, with the CoinGecko
 * client as fail-over. Bitfinex has no HBAR or Hedera ecosystem tokens, so
 * those come from SaucerSwap's public token list (no API key), which also
 * carries 24h change. https://docs.wdk.tether.io/tools/price-rates
 */
import { BitfinexPricingClient } from '@tetherto/wdk-pricing-bitfinex-http';
import { CoingeckoPricingClient } from '@tetherto/wdk-pricing-coingecko-http';
import { PricingProvider } from '@tetherto/wdk-pricing-provider';
import { HEDERA_SWAP_TOKENS, SAUCERSWAP } from '@/config/hederaTokens';

export interface Quote {
  price: number;
  /** 24h change in percent (e.g. -2.5). */
  change24h: number | null;
}

const CACHE_MS = 60_000;

const coingecko = new CoingeckoPricingClient({
  coinIds: { USDT0: 'tether', HBAR: 'hedera-hashgraph', SOL: 'solana', TRX: 'tron' },
  ...(process.env.EXPO_PUBLIC_COINGECKO_API_KEY ? { apiKey: process.env.EXPO_PUBLIC_COINGECKO_API_KEY } : {}),
});

const provider = new PricingProvider({
  // USDT0 is Tether's own dollar token: price it as USDT on Bitfinex ("UST").
  client: [new BitfinexPricingClient({ currencyCodes: { USDT0: 'UST' } }), coingecko] as any,
  retries: 1,
  priceCacheDurationMs: CACHE_MS,
});

/** Symbols priced from SaucerSwap instead of Bitfinex. HBAR = WHBAR's price. */
const SAUCER_IDS: Record<string, string> = {
  HBAR: '0.0.1456986',
  ...Object.fromEntries(HEDERA_SWAP_TOKENS.map((t) => [t.symbol, t.id])),
};

let saucerCache: { at: number; byId: Record<string, Quote> } | null = null;

async function saucerQuotes(): Promise<Record<string, Quote>> {
  if (saucerCache && Date.now() - saucerCache.at < CACHE_MS) return saucerCache.byId;
  const res = await fetch(`${SAUCERSWAP.api}/tokens/default`);
  if (!res.ok) throw new Error(`SaucerSwap prices ${res.status}`);
  const list: { id: string; priceUsd: number; priceChangeDay?: number }[] = await res.json();
  const byId: Record<string, Quote> = {};
  for (const t of list) {
    if (Number.isFinite(t.priceUsd)) byId[t.id] = { price: t.priceUsd, change24h: t.priceChangeDay ?? null };
  }
  saucerCache = { at: Date.now(), byId };
  return byId;
}

/** USD quote per symbol; symbols with no price are left out. */
export async function getQuotes(symbols: string[]): Promise<Record<string, Quote>> {
  const want = [...new Set(symbols.map((s) => s.toUpperCase()))];
  const fromSaucer = want.filter((s) => SAUCER_IDS[s]);
  const fromBitfinex = want.filter((s) => !SAUCER_IDS[s]);
  const out: Record<string, Quote> = {};

  await Promise.all([
    fromSaucer.length
      ? saucerQuotes()
          .then((byId) => fromSaucer.forEach((s) => { const q = byId[SAUCER_IDS[s]]; if (q) out[s] = q; }))
          .catch(() => {})
      : null,
    fromBitfinex.length
      ? provider
          .getMultiLastPriceData(fromBitfinex.map((s) => ({ from: s, to: 'USD' })))
          .then((rows: any[]) =>
            rows.forEach((r, i) => {
              if (r && Number.isFinite(r.lastPrice)) {
                out[fromBitfinex[i]] = {
                  price: r.lastPrice,
                  change24h: Number.isFinite(r.dailyChangeRelative) ? r.dailyChangeRelative * 100 : null,
                };
              }
            }),
          )
          .catch(() => {})
      : null,
  ]);
  return out;
}
