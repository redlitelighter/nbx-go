/**
 * src/config/hedera.ts
 *
 * Hedera MAINNET — the app's home chain. Users hold USDT0 here and route out
 * to other chains/assets via USDT0 (LayerZero) + Orchestra / Rhino.fi.
 *
 * Supported tokens were checked against the USDT0 deployments API
 * (https://docs.usdt0.to/api/deployments?chainId=295, 2026-10-29): USDT0 is
 * the ONLY USDT0-network product on Hedera — XAUT0 and USAT are not deployed
 * there. HBAR is listed alongside it because it pays gas: Hedera has no
 * ERC-4337/7702 paymaster, so every Hedera tx needs a little HBAR.
 *
 * Token facts verified on the Hedera mirror node
 * (mainnet-public.mirrornode.hedera.com/api/v1/tokens/0.0.10282787):
 * name USDT0, symbol USDT0, 6 decimals, FUNGIBLE_COMMON.
 */

import { USDT0_BY_KEY } from './usdt0';

export const HEDERA_CHAIN_ID = 295;
export const HEDERA_LZ_EID = 30316;

/** Public JSON-RPC relay (Hashio). Rate limited — set your own in .env for production. */
export const HEDERA_RPC_URL =
  process.env.EXPO_PUBLIC_EVM_HEDERA_PROVIDER || 'https://mainnet.hashio.io/api';

export const HEDERA_MIRROR_NODE_URL = 'https://mainnet-public.mirrornode.hedera.com';
export const HEDERA_EXPLORER_URL = 'https://hashscan.io/mainnet';

export interface HederaToken {
  symbol: string;
  name: string;
  /** Native HTS id (shard.realm.num); `null` for HBAR. */
  htsId: string | null;
  /** EVM long-zero address (ERC-20 facade); `null` for HBAR. */
  evmAddress: string | null;
  /**
   * Decimals as seen through the EVM JSON-RPC relay. HBAR is 8 decimals
   * natively (tinybar) but the relay reports balances in weibar (18).
   */
  decimals: number;
  coingeckoId: string;
  icon: number; // require() result
  /** Hedera accounts must be associated with an HTS token before receiving it. */
  requiresAssociation: boolean;
  explorerUrl: string;
}

export const HEDERA_TOKENS: HederaToken[] = [
  {
    symbol: 'USDT0',
    name: 'USDT0',
    htsId: '0.0.10282787',
    evmAddress: USDT0_BY_KEY.hedera.token,
    decimals: 6,
    coingeckoId: 'usdt0',
    // Official USDT0 symbol from the USDT0 media kit (docs.usdt0.to/resources/mediakit).
    icon: require('@/../assets/images/tokens/usdt0-logo.png'),
    requiresAssociation: true,
    explorerUrl: `${HEDERA_EXPLORER_URL}/token/0.0.10282787`,
  },
  {
    symbol: 'HBAR',
    name: 'Hedera',
    htsId: null,
    evmAddress: null,
    decimals: 18,
    coingeckoId: 'hedera-hashgraph',
    icon: require('@/../assets/images/tokens/hedera-hbar-logo.png'),
    requiresAssociation: false,
    explorerUrl: HEDERA_EXPLORER_URL,
  },
];

export const HEDERA_USDT0 = HEDERA_TOKENS[0];
