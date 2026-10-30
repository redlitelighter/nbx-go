/**
 * src/config/coinList.ts
 *
 * Home / Trade coin list — the Hedera ecosystem (config/hederaTokens.ts,
 * `market: true`). Prices and charts come from SaucerSwap (wdk/market.ts);
 * buying swaps Hedera USDT0 into the coin on SaucerSwap.
 */
import type { ImageSourcePropType } from 'react-native';
import { MARKET_TOKENS } from '@/config/hederaTokens';

export interface CoinConfig {
  symbol: string;
  name: string;
  /** Hedera token id ('0.0.0' = HBAR) — the key for market data. */
  tokenId: string;
  /** `hedera:SYMBOL` the Buy button swaps USDT0 into. */
  destination: string;
  /** Wallet asset id for balance lookups. */
  wdkAssetId: string;
  icon: ImageSourcePropType;
}

export const COIN_LIST: CoinConfig[] = MARKET_TOKENS.map((t) => ({
  symbol: t.symbol,
  name: t.name,
  tokenId: t.id,
  destination: `hedera:${t.symbol}`,
  wdkAssetId: t.native ? 'hbar-hedera' : `${t.symbol.toLowerCase()}-hedera`,
  icon: t.icon,
}));
