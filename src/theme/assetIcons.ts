/**
 * Static require() map for chain/token logos (Metro needs static, analyzable
 * require() calls — no dynamic path building). Keyed by our own network/
 * symbol identifiers from src/wdk/assets.ts.
 *
 * hasBackground reflects what's actually IN each image, checked directly
 * (not assumed): Bitcoin and Tether's logos are full "coin" style with a
 * colored circle already baked in — rendering our OWN circle behind them
 * would double up. Ethereum/Arbitrum/Polygon are just the mark on a
 * transparent background, same as official brand kits typically ship them,
 * and still need a colored circle behind them for legibility/consistency.
 *
 * USDT0 uses its own official symbol from the USDT0 media kit
 * (docs.usdt0.to/resources/mediakit), not the generic Tether/USDT mark.
 */

export interface AssetIconSource {
  source: number; // return type of require() for an image asset
  hasBackground: boolean;
}

// CHAIN_ICONS moved to wdk/chains.ts, as part of unifying every genuinely
// UI-facing per-network fact (label, color, icon, explorer, indexer
// mapping) into one registry — see that file's own header comment for the
// full reasoning. Still defined with literal require() calls there,
// exactly as here — Metro needs statically analyzable paths, which moving
// them into a registry object doesn't change, since the object itself is
// still a static literal, not built dynamically.
//
// TOKEN_ICONS stays here deliberately, NOT folded into the same registry —
// it's keyed by asset SYMBOL (BTC/ETH/USDT/USDT0), not by network. Multiple
// assets can share one network (native ETH and USDT-on-Ethereum both sit
// on 'ethereum') but need different icons — a genuinely different axis
// than the per-network registry, not the same fact organized differently.

export const TOKEN_ICONS: Record<string, AssetIconSource> = {
  BTC: { source: require('@/../assets/images/tokens/bitcoin-btc-logo.png'), hasBackground: true },
  ETH: { source: require('@/../assets/images/chains/ethereum-eth-logo.png'), hasBackground: false },
  USDT: { source: require('@/../assets/images/tokens/tether-usdt-logo.png'), hasBackground: true },
  // Official USDT0 symbol from the USDT0 media kit (docs.usdt0.to/resources/mediakit).
  USDT0: { source: require('@/../assets/images/tokens/usdt0-logo.png'), hasBackground: true },
  // Hedera's mark is a dark circle with the ℏ glyph baked in.
  HBAR: { source: require('@/../assets/images/tokens/hedera-hbar-logo.png'), hasBackground: true },
};