import { useQuery } from '@tanstack/react-query';
import { getQuotes } from '@/services/priceService';

/**
 * Real USD pricing. Majors via WDK's Bitfinex pricing client (CoinGecko as
 * fail-over), HBAR and Hedera ecosystem tokens via SaucerSwap — see
 * services/priceService.ts. Bitfinex is used first because CoinGecko's
 * free tier (~10–30 req/min) is shared with the market screens and was
 * throttling price lookups.
 */

/**
 * Current USD price for each of the given symbols (e.g. ['BTC', 'ETH']).
 * Returns a map so callers don't need to worry about result ordering;
 * unpriced symbols map to null.
 */
export function usePrices(symbols: string[]) {
  const key = [...symbols].sort().join(',');

  const query = useQuery({
    queryKey: ['prices', 'v2', key],
    queryFn: async () => {
      const quotes = await getQuotes(symbols);
      const map: Record<string, number | null> = {};
      symbols.forEach((symbol) => {
        map[symbol] = quotes[symbol.toUpperCase()]?.price ?? null;
      });
      return map;
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
    enabled: symbols.length > 0,
  });

  return {
    prices: query.data ?? {},
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
