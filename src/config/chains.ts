/**
 * src/config/chains.ts
 *
 * Single source of truth for ALL mainnet chain configs, RPC endpoints,
 * token addresses, and protocol contracts.
 *
 * Rules:
 *  - Mainnet ONLY. No testnet values.
 *  - Every address is 0x-prefixed and checksummed where applicable.
 *  - TODO markers indicate values that need operator confirmation.
 */

import { USDT0_DEPLOYMENTS } from './usdt0';
import { HEDERA_CHAIN_ID, HEDERA_RPC_URL, HEDERA_EXPLORER_URL } from './hedera';

// ── Chain IDs ────────────────────────────────────────────────
export const CHAIN_IDS = {
  // Home chain — users hold USDT0 here.
  HEDERA:     HEDERA_CHAIN_ID,
  ETHEREUM:   1,
  ARBITRUM:   42161,
  OPTIMISM:   10,
  POLYGON:    137,
  AVALANCHE:  43114,
  BSC:        56,
  BASE:       8453,
  // USDT0 bridge supported chains
  BERACHAIN:  80094,
  INK:        57073,
  PLASMA:     9745,
  CONFLUX:    1030,
  CORN:       21000000,
  CELO:       42220,
  FLARE:      14,
  HYPEREVM:   999,
  MANTLE:     5000,
  MEGAETH:    4326,
  MONAD:      143,
  MORPH:      2818,
  ROOTSTOCK:  30,
  SEI:        1329,
  STABLE:     988,
  UNICHAIN:   130,
  XLAYER:     196,
} as const;

export type ChainId = typeof CHAIN_IDS[keyof typeof CHAIN_IDS];

// ── RPC Endpoints (public / Alchemy fallback) ─────────────────
// TODO: Replace with your own RPC URLs or Alchemy/Infura keys
export const RPC_URLS: Record<number, string> = {
  [CHAIN_IDS.ETHEREUM]:  process.env.EXPO_PUBLIC_RPC_ETHEREUM  ?? 'https://eth.llamarpc.com',
  [CHAIN_IDS.ARBITRUM]:  process.env.EXPO_PUBLIC_RPC_ARBITRUM  ?? 'https://arb1.arbitrum.io/rpc',
  [CHAIN_IDS.OPTIMISM]:  process.env.EXPO_PUBLIC_RPC_OPTIMISM  ?? 'https://mainnet.optimism.io',
  [CHAIN_IDS.POLYGON]:   process.env.EXPO_PUBLIC_RPC_POLYGON   ?? 'https://polygon-rpc.com',
  [CHAIN_IDS.AVALANCHE]: process.env.EXPO_PUBLIC_RPC_AVALANCHE ?? 'https://api.avax.network/ext/bc/C/rpc',
  [CHAIN_IDS.BSC]:       process.env.EXPO_PUBLIC_RPC_BSC       ?? 'https://bsc-dataseed.binance.org',
  [CHAIN_IDS.BASE]:      process.env.EXPO_PUBLIC_RPC_BASE      ?? 'https://mainnet.base.org',
  [CHAIN_IDS.HEDERA]:    HEDERA_RPC_URL,
};

// ── Chain display info ────────────────────────────────────────
export interface ChainInfo {
  id: number;
  name: string;
  symbol: string;        // native gas token symbol
  rpc: string;
  explorerUrl: string;
  lifiKey?: string;      // LI.FI chain alias
}

export const CHAINS: Record<string, ChainInfo> = {
  hedera: {
    id:          CHAIN_IDS.HEDERA,
    name:        'Hedera',
    symbol:      'HBAR',
    rpc:         RPC_URLS[CHAIN_IDS.HEDERA],
    explorerUrl: HEDERA_EXPLORER_URL,
  },
  ethereum: {
    id:          CHAIN_IDS.ETHEREUM,
    name:        'Ethereum',
    symbol:      'ETH',
    rpc:         RPC_URLS[CHAIN_IDS.ETHEREUM],
    explorerUrl: 'https://etherscan.io',
    lifiKey:     'ethereum',
  },
  arbitrum: {
    id:          CHAIN_IDS.ARBITRUM,
    name:        'Arbitrum',
    symbol:      'ETH',
    rpc:         RPC_URLS[CHAIN_IDS.ARBITRUM],
    explorerUrl: 'https://arbiscan.io',
    lifiKey:     'arbitrum',
  },
  optimism: {
    id:          CHAIN_IDS.OPTIMISM,
    name:        'Optimism',
    symbol:      'ETH',
    rpc:         RPC_URLS[CHAIN_IDS.OPTIMISM],
    explorerUrl: 'https://optimistic.etherscan.io',
    lifiKey:     'optimism',
  },
  polygon: {
    id:          CHAIN_IDS.POLYGON,
    name:        'Polygon',
    symbol:      'MATIC',
    rpc:         RPC_URLS[CHAIN_IDS.POLYGON],
    explorerUrl: 'https://polygonscan.com',
    lifiKey:     'polygon',
  },
  avalanche: {
    id:          CHAIN_IDS.AVALANCHE,
    name:        'Avalanche',
    symbol:      'AVAX',
    rpc:         RPC_URLS[CHAIN_IDS.AVALANCHE],
    explorerUrl: 'https://snowtrace.io',
    lifiKey:     'avalanche',
  },
  bsc: {
    id:          CHAIN_IDS.BSC,
    name:        'BNB Chain',
    symbol:      'BNB',
    rpc:         RPC_URLS[CHAIN_IDS.BSC],
    explorerUrl: 'https://bscscan.com',
    lifiKey:     'bsc',
  },
  base: {
    id:          CHAIN_IDS.BASE,
    name:        'Base',
    symbol:      'ETH',
    rpc:         RPC_URLS[CHAIN_IDS.BASE],
    explorerUrl: 'https://basescan.org',
    lifiKey:     'base',
  },
};

// ── Token Addresses ────────────────────────────────────────────
// USDT (ERC-20) per chain
export const USDT_ADDRESSES: Record<number, string> = {
  [CHAIN_IDS.ETHEREUM]:  '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  [CHAIN_IDS.ARBITRUM]:  '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
  [CHAIN_IDS.OPTIMISM]:  '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
  [CHAIN_IDS.POLYGON]:   '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
  [CHAIN_IDS.AVALANCHE]: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
  [CHAIN_IDS.BSC]:       '0x55d398326f99059fF775485246999027B3197955',
};

// USDT0 token per chain — from the official deployments list in ./usdt0.ts.
// (Ethereum's entry is legacy USDT, which the USDT0 OFT adapter locks.)
export const USDT0_ADDRESSES: Record<number, string> = Object.fromEntries(
  USDT0_DEPLOYMENTS.map((d) => [d.chainId, d.token]),
);

// ── Aave V3 Pool addresses ─────────────────────────────────────
export const AAVE_POOL_ADDRESSES: Record<number, string> = {
  [CHAIN_IDS.ETHEREUM]:  '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
  [CHAIN_IDS.ARBITRUM]:  '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
  [CHAIN_IDS.OPTIMISM]:  '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
  [CHAIN_IDS.POLYGON]:   '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
  [CHAIN_IDS.AVALANCHE]: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
};

// Aave V3 aToken addresses for USDT (for supply/withdraw)
export const AAVE_AUSDT_ADDRESSES: Record<number, string> = {
  [CHAIN_IDS.ETHEREUM]:  '0x23878914EFE38d27C4D67Ab83ed1b93A74D4086a',
  [CHAIN_IDS.ARBITRUM]:  '0x6ab707Aca953eDAefBc4fD23bA73294241490620',
  [CHAIN_IDS.OPTIMISM]:  '0x6ab707Aca953eDAefBc4fD23bA73294241490620',
  [CHAIN_IDS.POLYGON]:   '0x6ab707Aca953eDAefBc4fD23bA73294241490620',
};

// ── USDT0 Bridge LayerZero endpoint IDs ───────────────────────
export const LZ_ENDPOINT_IDS = {
  HEDERA: 30316,
  SOLANA: 30168,
  TON:    30343,
  TRON:   30420,
} as const;

// ── Platform fee ──────────────────────────────────────────────
/** 0.03% expressed as basis points (3 / 10000 = 0.0003) */
export const PLATFORM_FEE_BPS = 3n;
export const PLATFORM_FEE_DENOMINATOR = 10000n;

/** Computes fee with bigint arithmetic. amount must be in the token's smallest unit (wei/satoshi/etc.) */
export function computePlatformFee(amountWei: bigint): bigint {
  return (amountWei * PLATFORM_FEE_BPS) / PLATFORM_FEE_DENOMINATOR;
}

// ── Admin / fee recipient ─────────────────────────────────────
export function getAdminAddress(): string {
  const addr = process.env.EXPO_PUBLIC_ADMIN_ADDRESS;
  return addr ?? '';
}

export function assertAdminAddress(): string {
  const addr = getAdminAddress();
  if (!addr || addr.trim() === '') {
    throw new Error(
      'EXPO_PUBLIC_ADMIN_ADDRESS is not set. Set it in .env before using swap/bridge features.',
    );
  }
  return addr;
}

// ── Morpho presets ─────────────────────────────────────────────
// These are re-exported by @morpho-org/wdk-protocol-lending-morpho-evm
// TODO: confirm preset keys by inspecting MORPHO_VAULT_PRESETS from the package
export const MORPHO_XAUT_PRESET_KEY = 'xaut' as const;

// ── Supported swap tokens for UI dropdowns ────────────────────
export interface TokenConfig {
  symbol:  string;
  name:    string;
  address: Record<number, string>; // chainId → address
  decimals: number;
  logoUri?: string;
  coingeckoId: string;
}

export const SWAP_TOKENS: TokenConfig[] = [
  {
    symbol:      'USDT',
    name:        'Tether USD',
    decimals:    6,
    coingeckoId: 'tether',
    address:     USDT_ADDRESSES,
  },
  {
    symbol:      'ETH',
    name:        'Ethereum',
    decimals:    18,
    coingeckoId: 'ethereum',
    address:     {
      [CHAIN_IDS.ETHEREUM]:  '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // sentinel for native
      [CHAIN_IDS.ARBITRUM]:  '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    },
  },
  {
    symbol:      'WBTC',
    name:        'Wrapped Bitcoin',
    decimals:    8,
    coingeckoId: 'wrapped-bitcoin',
    address:     {
      [CHAIN_IDS.ETHEREUM]:  '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      [CHAIN_IDS.ARBITRUM]:  '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
    },
  },
  {
    symbol:      'USDT0',
    name:        'USDT0',
    decimals:    6,
    coingeckoId: 'usdt0',
    address:     USDT0_ADDRESSES,
  },
  {
    symbol:      'HBAR',
    name:        'Hedera',
    decimals:    18, // weibar, as reported by the Hedera JSON-RPC relay
    coingeckoId: 'hedera-hashgraph',
    address:     { [CHAIN_IDS.HEDERA]: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' },
  },
  // TODO: Add PLEX token address once confirmed
  // {
  //   symbol:      'PLEX',
  //   name:        'PLEX',
  //   decimals:    18,
  //   coingeckoId: 'TODO',
  //   address:     { [CHAIN_IDS.???]: '0x...' },
  // },
];
