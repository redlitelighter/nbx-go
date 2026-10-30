/**
 * src/config/hederaTokens.ts — the Hedera ecosystem NBX-go trades in.
 *
 * NBX-go is Hedera-only. Every id below was checked on 2026-10-30:
 *   - SAUCE, xSAUCE, DOVU, DAVINCI, KARATE: SaucerSwap's own token list
 *     (api.saucerswap.finance/tokens: `dueDiligenceComplete: true`).
 *   - PLEX: Lambdaplex's own asset list (api.lambdaplex.io/assets →
 *     0.0.10479419); traded on SaucerSwap via the HBAR/PLEX 1% V2 pool.
 *   - USDT0: docs.usdt0.to deployments (HTS 0.0.10282787).
 * Hedera has many copycat tokens with the same symbol — never add one by
 * symbol alone. Not included: BERRY (0.0.7496578 isn't on SaucerSwap and
 * has no pool); the older DOVU 0.0.624505 (failed due diligence).
 *
 * Routes aren't hard-coded: services/saucerService.ts builds them from
 * SaucerSwap's live V2 pool list.
 */
import type { ImageSourcePropType } from 'react-native';

/** Long-zero EVM address of a Hedera entity id ("0.0.731861" → 0x…0b2ad5). */
export const hederaEvmAddress = (id: string) =>
  `0x${BigInt(id.split('.')[2]).toString(16).padStart(40, '0')}`;

/** Weibar per tinybar: the JSON-RPC relay takes tx `value` in weibar (18 dp). */
export const TINYBAR_TO_WEIBAR = 10_000_000_000n;

export const SAUCERSWAP = {
  /** SaucerSwapV2SwapRouter. */
  router: hederaEvmAddress('0.0.3949434'),
  /** QuoterV2. */
  quoter: hederaEvmAddress('0.0.3949424'),
  /** WHBAR token (paths use it wherever HBAR is involved). */
  whbarId: '0.0.1456986',
  /** Mothership — SAUCE ⇄ xSAUCE single-sided staking. */
  mothership: hederaEvmAddress('0.0.1460199'),
  api: 'https://api.saucerswap.finance',
  /**
   * Endpoints that will run QuoterV2, tried in order. Hashio (the app's
   * normal relay) blacklists the quoter; thirdweb sometimes load-balances
   * onto Hashio; the public mirror node's contracts/call is heavily
   * rate-limited (429s). Verified 2026-10-30.
   */
  quoteRpcs: ['https://hedera.linkpool.pro', 'https://295.rpc.thirdweb.com'],
  mirrorCall: 'https://mainnet.mirrornode.hedera.com/api/v1/contracts/call',
};

export interface HederaToken {
  /** Hedera token id ('0.0.0' for native HBAR). */
  id: string;
  symbol: string;
  name: string;
  decimals: number;
  /** Bundled logo (assets/images/tokens/hedera — works offline). */
  icon: ImageSourcePropType;
  color: string;
  /** Native HBAR: no token contract; swaps wrap/unwrap via WHBAR. */
  native?: boolean;
  /** Shown on Home / Trade with a chart. */
  market?: boolean;
}

// Token logos are bundled with the app (downloaded from SaucerSwap's icon CDN,
// PNG — React Native's Image can't render its SVG variants), so they show
// instantly and offline. Metro needs each require() written out in full.
const ICONS = {
  HBAR: require('@/../assets/images/tokens/hedera/0.0.1456986.png'),
  USDT0: require('@/../assets/images/tokens/hedera/0.0.10282787.png'),
  SAUCE: require('@/../assets/images/tokens/hedera/0.0.731861.png'),
  XSAUCE: require('@/../assets/images/tokens/hedera/0.0.1460200.png'),
  PLEX: require('@/../assets/images/tokens/hedera/0.0.10479419.png'),
  DOVU: require('@/../assets/images/tokens/hedera/0.0.3716059.png'),
  DAVINCI: require('@/../assets/images/tokens/hedera/0.0.3706639.png'),
  KARATE: require('@/../assets/images/tokens/hedera/0.0.2283230.png'),
};

export const HEDERA_ASSETS: HederaToken[] = [
  { id: '0.0.0', symbol: 'HBAR', name: 'Hedera', decimals: 8, icon: ICONS.HBAR, color: '#222222', native: true, market: true },
  { id: '0.0.10282787', symbol: 'USDT0', name: 'USDT0', decimals: 6, icon: ICONS.USDT0, color: '#009393' },
  { id: '0.0.731861', symbol: 'SAUCE', name: 'SaucerSwap', decimals: 6, icon: ICONS.SAUCE, color: '#2D2D2D', market: true },
  { id: '0.0.1460200', symbol: 'XSAUCE', name: 'xSAUCE (staked SAUCE)', decimals: 6, icon: ICONS.XSAUCE, color: '#2D2D2D' },
  { id: '0.0.10479419', symbol: 'PLEX', name: 'PLEX · Lambdaplex', decimals: 8, icon: ICONS.PLEX, color: '#6C5CE7', market: true },
  { id: '0.0.3716059', symbol: 'DOVU', name: 'Dovu', decimals: 8, icon: ICONS.DOVU, color: '#3C1E6E', market: true },
  { id: '0.0.3706639', symbol: 'DAVINCI', name: 'Davincigraph', decimals: 9, icon: ICONS.DAVINCI, color: '#B8860B', market: true },
  { id: '0.0.2283230', symbol: 'KARATE', name: 'Karate', decimals: 8, icon: ICONS.KARATE, color: '#C0392B', market: true },
];

/** Tradable on SaucerSwap (xSAUCE comes from staking, not swaps). */
export const HEDERA_SWAP_TOKENS = HEDERA_ASSETS.filter((t) => t.symbol !== 'XSAUCE');
/** Ecosystem tokens other than the money (HBAR/USDT0) — GO's "buy" targets. */
export const HEDERA_ECOSYSTEM_TOKENS = HEDERA_SWAP_TOKENS.filter((t) => !t.native && t.symbol !== 'USDT0');
export const MARKET_TOKENS = HEDERA_ASSETS.filter((t) => t.market);

export const HEDERA_TOKEN_BY_SYMBOL: Record<string, HederaToken> = Object.fromEntries(
  HEDERA_ASSETS.map((t) => [t.symbol, t]),
);
export const HEDERA_TOKEN_BY_ID: Record<string, HederaToken> = Object.fromEntries(
  HEDERA_ASSETS.map((t) => [t.id, t]),
);

/** Wallet asset id (wdk/networks.ts) for a Hedera token. */
export const walletAssetId = (t: HederaToken) => (t.native ? 'hbar-hedera' : `${t.symbol.toLowerCase()}-hedera`);

/** Path address: WHBAR for native HBAR, else the token's long-zero address. */
export const pathAddress = (t: HederaToken) => hederaEvmAddress(t.native ? SAUCERSWAP.whbarId : t.id);

export const USDT0_HEDERA_ID = '0.0.10282787';
