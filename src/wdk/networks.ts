import type { WdkConfigs } from '@tetherto/wdk-react-native-core';
import type { BtcWalletConfig } from '@tetherto/wdk-wallet-btc';
import type { Evm7702GaslessWalletConfig } from '@tetherto/wdk-wallet-evm-7702-gasless';
import type { EvmWalletConfig } from '@tetherto/wdk-wallet-evm';
import { AppAsset, type AppAssetConfig } from './AppAsset';
import { HEDERA_ASSETS, hederaEvmAddress } from '@/config/hederaTokens';
import type { AssetIconSource } from '@/theme/assetIcons';

/**
 * ══════════════════════════════════════════════════════════════════════
 *  THE one file to edit when adding, removing, or changing a network.
 * ══════════════════════════════════════════════════════════════════════
 *
 * To add a network, you edit exactly two files:
 *
 *   1. `wdk.config.js` (repo root) — one entry naming the WDK package that
 *      implements it. That file is read by an external tool
 *      (`wdk-worklet-bundler`) at build time to compile the native worklet
 *      bundle, so it genuinely can't be merged into this one.
 *   2. THIS FILE — one entry in `NETWORKS` below.
 *
 * That's it. Everything else in the app derives from the entry you add
 * here: the runtime WDK config, the asset list, display labels, chain
 * colors and icons, block-explorer links, the indexer mapping, and every
 * screen that lists or filters by network.
 *
 * To remove a network, delete its entry here and its entry in
 * `wdk.config.js`. Nothing else needs touching.
 *
 * ── Two rules to follow when editing NETWORKS, and why they matter ────
 *
 * RULE 1: Write each `process.env.EXPO_PUBLIC_*` read out in full, as a
 * literal. Never build one by string interpolation, and never generate
 * them by looping over this array.
 *
 *   ✅  provider: process.env.EXPO_PUBLIC_EVM_POLYGON_PROVIDER
 *   ❌  provider: process.env[`EXPO_PUBLIC_EVM_${key}_PROVIDER`]
 *
 * `babel-preset-expo` replaces `process.env.EXPO_PUBLIC_*` with its actual
 * value at bundle time, but ONLY when the key is a literal it can read at
 * compile time. An interpolated key can't be inlined, so it silently
 * becomes `undefined` in a release build — while continuing to work fine
 * in development, because the dev server supplies these at runtime. This
 * is not hypothetical: it already shipped once here, and every EVM network
 * went out with `provider: ''` — no balances, no sends — before anyone
 * noticed. See `docs/RELEASE.md` for how to verify a build actually
 * inlined them.
 *
 * RULE 2: Write each `require()` for an icon out in full too, as a literal
 * path. Metro resolves image assets by statically reading that path at
 * build time; a path held in a variable can't be resolved, and the image
 * simply won't exist in the bundle.
 *
 * Both rules are the same underlying idea: these two things are read by
 * the build tooling before your code ever runs, so they have to be
 * written where the tooling can see them. Everything else in an entry is
 * ordinary data and has no such restriction.
 *
 * ── One thing that has to match `wdk.config.js` ───────────────────────
 *
 * The `network` key here must be identical to the key you use in
 * `wdk.config.js`, since that's what ties a UI network to its compiled
 * worklet module. If they disagree, the network will appear in the UI but
 * every call against it will fail.
 */

/**
 * 'evm'     → 7702-gasless smart EOA (needs a bundler + paymaster).
 * 'evm-eoa' → plain EOA via @tetherto/wdk-wallet-evm, for chains with no
 *             bundler/paymaster support (Hedera). The user pays gas natively.
 */
export type NetworkKind = 'bitcoin' | 'evm' | 'evm-eoa';

export interface NetworkAssetDefinition {
  id: string;
  isNative: boolean;
  /** Contract address for tokens; `null` for a chain's native coin. */
  address: string | null;
  symbol: string;
  name: string;
  decimals: number;
  color: string;
}

export interface NetworkDefinition {
  /** Must match this network's key in `wdk.config.js`. */
  network: string;
  kind: NetworkKind;

  // ── Runtime connection (literal env reads — see RULE 1 above) ────────
  /** Bitcoin-style networks only: the Blockbook HTTP endpoint. */
  provider?: string;
  /**
   * Bitcoin-style networks only: which chain the BTC wallet derives
   * ADDRESSES for. This is deliberately separate from `network` above and
   * is not interchangeable with it — `network` is this app's own key (and
   * must match `wdk.config.js`), whereas this is the BTC library's own
   * chain-mode setting, restricted to its three supported values. They
   * only look like the same thing because our key also happens to be
   * "bitcoin". Defaults to 'bitcoin' when omitted, matching the library's
   * own default.
   */
  btcNetwork?: BtcWalletConfig['network'];
  /** 'evm-eoa' networks only. */
  evmEoa?: {
    provider: string | undefined;
    chainId: number;
  };
  /** EVM networks only. */
  evm?: {
    provider: string | undefined;
    bundlerUrl: string | undefined;
    paymasterUrl: string | undefined;
  };

  // ── Display ──────────────────────────────────────────────────────────
  /** Base name shown in the UI, before any testnet suffix. */
  displayNameBase: string;
  /**
   * Optional testnet suffix, read from `.env`. When this network's
   * provider above can point at either mainnet or a testnet, read the
   * corresponding label var here — set in `.env`, the UI shows
   * "Ethereum (Sepolia)"; left blank, it shows plain "Ethereum". Leave
   * this `undefined` for networks that are mainnet-only, where there's no
   * ambiguity to communicate.
   */
  networkLabel?: string;
  color: string;
  icon: AssetIconSource;

  // ── Links and external naming ────────────────────────────────────────
  explorerName: string;
  explorerUrl: (hash: string) => string;
  /**
   * The WDK Indexer API's own name for this chain, which is NOT always the
   * same as `network` above — the indexer treats Sepolia as a distinct
   * chain from Ethereum mainnet, so our `ethereum` network maps to
   * `sepolia` there while it's pointed at the testnet. `null` means this
   * network has no transaction history available, and Activity will skip
   * it rather than show an empty list.
   */
  indexerBlockchain: string | null;

  assets: NetworkAssetDefinition[];
}

/**
 * NBX-go is Hedera-only: one network, Hedera MAINNET (real funds). The
 * testnet (Sepolia, Bitcoin Testnet3) and cross-chain (Ethereum, Base,
 * Arbitrum, Polygon) networks were removed on 2026-10-30. Their modules are
 * still in the worklet bundle (wdk.config.js) until it's next rebuilt; with
 * no entry here they're never initialised.
 */
export const NETWORKS = [
  {
    // Hedera MAINNET — the app's home chain. Real funds.
    // Token list checked against the USDT0 deployments API: USDT0 is the
    // only USDT0-network token on Hedera. See config/hedera.ts.
    network: 'hedera' as const,
    kind: 'evm-eoa',
    evmEoa: {
      provider: process.env.EXPO_PUBLIC_EVM_HEDERA_PROVIDER || 'https://mainnet.hashio.io/api',
      chainId: 295,
    },
    displayNameBase: 'Hedera',
    color: '#222222',
    icon: {
      source: require('@/../assets/images/chains/hedera-hbar-logo.png'),
      hasBackground: true,
    },
    explorerName: 'HashScan',
    explorerUrl: (h) => `https://hashscan.io/mainnet/transaction/${h}`,
    // The WDK Indexer has no Hedera support; Activity skips it.
    indexerBlockchain: null,
    assets: [
      {
        id: 'usdt0-hedera',
        isNative: false,
        // HTS token 0.0.10282787 via its ERC-20 facade (long-zero address).
        address: '0x00000000000000000000000000000000009Ce723',
        symbol: 'USDT0',
        name: 'USDT0',
        decimals: 6,
        color: '#009393',
      },
      {
        // Shown because every Hedera tx is paid in HBAR (no paymaster).
        id: 'hbar-hedera',
        isNative: true,
        address: null,
        symbol: 'HBAR',
        name: 'Hedera',
        // The JSON-RPC relay reports balances in weibar (18 decimals), not
        // tinybar (8).
        decimals: 18,
        color: '#222222',
      },
      // Hedera ecosystem tokens (config/hederaTokens.ts: SAUCE, xSAUCE,
      // PLEX, DOVU, DAVINCI, KARATE), read through each HTS token's ERC-20
      // facade.
      ...HEDERA_ASSETS.filter((t) => !t.native && t.symbol !== 'USDT0').map((t) => ({
        id: `${t.symbol.toLowerCase()}-hedera`,
        isNative: false,
        address: hederaEvmAddress(t.id),
        symbol: t.symbol,
        name: t.name,
        decimals: t.decimals,
        color: t.color,
      })),
    ],
  },

  // `satisfies` (not a `: NetworkDefinition[]` annotation) is what keeps
  // each entry's `as const` network literal intact — an explicit array
  // type annotation here would force every element back to the wide
  // `NetworkDefinition` shape (network: string) before NetworkId below
  // ever sees it. `satisfies` still fully validates every entry against
  // NetworkDefinition; it just doesn't erase the extra literal precision.
] satisfies NetworkDefinition[];

// ══════════════════════════════════════════════════════════════════════
//  Everything below is derived from NETWORKS above. You shouldn't need to
//  edit any of it to add, remove, or change a network.
// ══════════════════════════════════════════════════════════════════════

const BY_KEY: Record<string, NetworkDefinition> = Object.fromEntries(
  NETWORKS.map((n) => [n.network, n]),
);

/** The literal union of every configured network key — 'bitcoin' |
 * 'ethereum' | 'arbitrum' | 'polygon' today — derived from NETWORKS rather
 * than hand-copied. Adding or removing a NETWORKS entry updates this
 * automatically; nothing here needs editing when that list changes. */
export type NetworkId = (typeof NETWORKS)[number]['network'];

/** Every network key the app supports, in the order defined above. Network
 * pickers and filter lists derive from this rather than hardcoding keys. */
export const ALL_NETWORKS: NetworkId[] = NETWORKS.map((n) => n.network);

/** Kept as a record for call sites that want a whole definition. */
export const CHAINS = BY_KEY;

export function networkDisplayName(network: string): string {
  const def = BY_KEY[network];
  if (!def) return network[0]?.toUpperCase() + network.slice(1);
  return def.networkLabel ? `${def.displayNameBase} (${def.networkLabel})` : def.displayNameBase;
}

export function networkColorFor(network: string): string | undefined {
  return BY_KEY[network]?.color;
}

export function chainIconFor(network: string): AssetIconSource | undefined {
  return BY_KEY[network]?.icon;
}

export function explorerFor(
  network: string,
): { name: string; url: (hash: string) => string } | undefined {
  const def = BY_KEY[network];
  if (!def) return undefined;
  return { name: def.explorerName, url: def.explorerUrl };
}

export function indexerBlockchainFor(network: string): string | null {
  return BY_KEY[network]?.indexerBlockchain ?? null;
}

// ── Assets, flattened out of the per-network entries above ─────────────

export const assetConfigs: AppAssetConfig[] = NETWORKS.flatMap((n) =>
  n.assets.map((a) => ({
    id: a.id,
    network: n.network,
    isNative: a.isNative,
    address: a.address,
    symbol: a.symbol,
    name: a.name,
    decimals: a.decimals,
    color: a.color,
  })),
);

export const ASSETS: AppAsset[] = AppAsset.fromConfigs(assetConfigs);
export const ASSET_MAP = new Map<string, AppAsset>(ASSETS.map((a) => [a.getId(), a]));

// ── Runtime WDK config, built from the same entries ────────────────────

/**
 * The one example delegation address the WDK docs give (for
 * "SimpleAccount"), reused across all EVM networks — an assumption based
 * on CREATE2 deployments commonly landing at the same address per chain,
 * not independently confirmed per chain.
 */
const EVM_DELEGATION_ADDRESS =
  process.env.EXPO_PUBLIC_EVM_DELEGATION_ADDRESS || '0xe6Cae83BdE06E4c305530e199D7217f42808555B';

/**
 * Note this takes values that were ALREADY read literally in the entries
 * above and passes them in — it never reads `process.env` itself. That's
 * what keeps RULE 1 intact while still sharing one builder across every
 * EVM network.
 */
function buildEvmConfig(
  network: string,
  evm: NonNullable<NetworkDefinition['evm']>,
): Evm7702GaslessWalletConfig {
  if (!evm.provider || !evm.bundlerUrl) {
    console.warn(
      `[wdk/networks] "${network}" is missing its provider and/or bundler URL — ` +
        `balances and sends on this network will not work until they're set in .env.`,
    );
  }
  return {
    provider: evm.provider || '',
    bundlerUrl: evm.bundlerUrl || '',
    ...(evm.paymasterUrl ? { paymasterUrl: evm.paymasterUrl } : {}),
    delegationAddress: EVM_DELEGATION_ADDRESS,
    isSponsored: true,
  };
}

/**
 * Note the parameter type here is the BTC library's own union, NOT a plain
 * string — passing our internal network key straight through would be a
 * type error, and rightly so: they're different things that only coincide
 * today (see `btcNetwork` on NetworkDefinition above).
 *
 * ⚠️ Worth verifying if you touch Bitcoin config: `btcNetwork: 'bitcoin'`
 * means addresses are derived for MAINNET (bc1…), while the default
 * `EXPO_PUBLIC_BTC_PROVIDER` in `.env.example` points at a TESTNET
 * Blockbook instance. That combination is inherited unchanged from before
 * this file existed, so it isn't something introduced here — but it is a
 * mismatch worth confirming is intentional rather than assuming it is.
 * Testnet address derivation would be `btcNetwork: 'testnet'` (tb1…).
 */
function buildBitcoinConfig(
  btcNetwork: BtcWalletConfig['network'],
  provider: string | undefined,
): BtcWalletConfig {
  return {
    network: btcNetwork ?? 'bitcoin',
    client: {
      type: 'blockbook-http',
      clientConfig: { url: provider || 'https://btc1.trezor.io/api' },
    },
  };
}

function buildEvmEoaConfig(
  evmEoa: NonNullable<NetworkDefinition['evmEoa']>,
): EvmWalletConfig {
  return { provider: evmEoa.provider || '', chainId: evmEoa.chainId };
}

function buildNetworkConfig(n: NetworkDefinition) {
  if (n.kind === 'evm') return buildEvmConfig(n.network, n.evm!);
  if (n.kind === 'evm-eoa') return buildEvmEoaConfig(n.evmEoa!);
  return buildBitcoinConfig(n.btcNetwork, n.provider);
}

type AnyWalletConfig = BtcWalletConfig | Evm7702GaslessWalletConfig | EvmWalletConfig;

export const wdkConfigs: WdkConfigs<AnyWalletConfig> = {
  networks: Object.fromEntries(
    NETWORKS.map((n) => [
      n.network,
      {
        blockchain: n.network,
        config: buildNetworkConfig(n),
      },
    ]),
  ),
  // No WDK protocols: swaps (SaucerSwap) and staking (Mothership) are
  // plain Hedera contract calls — services/saucerService.ts, stakingService.ts.
  protocols: {},
} as WdkConfigs<AnyWalletConfig>;

export default wdkConfigs;