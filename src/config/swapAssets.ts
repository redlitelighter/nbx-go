/**
 * src/config/swapAssets.ts
 *
 * Assets the Buy / Sell screens and GO offer — the Hedera ecosystem from
 * config/hederaTokens.ts, all swapped on SaucerSwap (services/saucerService.ts).
 * NBX-go is Hedera-only.
 */

import type { ImageSourcePropType } from 'react-native';
import { HEDERA_SWAP_TOKENS, walletAssetId } from '@/config/hederaTokens';

/** `hedera:SYMBOL`. */
export type AssetRef = string;

export interface SwapAsset {
  ref: AssetRef;
  symbol: string;
  name: string;
  chainName: string;
  decimals: number;
  icon: ImageSourcePropType;
  color: string;
  /** App asset id for balance lookups. */
  walletAssetId: string;
}

export const SWAP_ASSETS: SwapAsset[] = HEDERA_SWAP_TOKENS.map((t) => ({
  ref: `hedera:${t.symbol}`,
  symbol: t.symbol,
  name: t.name,
  chainName: 'Hedera',
  decimals: t.decimals,
  icon: t.icon,
  color: t.color,
  walletAssetId: walletAssetId(t),
}));

export const SWAP_ASSET_BY_REF: Record<string, SwapAsset> = Object.fromEntries(
  SWAP_ASSETS.map((a) => [a.ref, a]),
);
