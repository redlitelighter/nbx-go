/**
 * src/config/usdt0.ts
 *
 * USDT0 mainnet deployments, copied from the official USDT0 deployments API:
 *   https://docs.usdt0.to/api/deployments?product=usdt0   (checked 2026-10-29)
 *
 * Only EVM chains are listed — those are the ones the WDK USDT0 bridge
 * (`@tetherto/wdk-protocol-bridge-usdt0-evm`) can send FROM. Non-EVM
 * destinations (Solana/TON/TRON via the Legacy Mesh) are in LZ_ENDPOINT_IDS
 * in chains.ts.
 *
 * Hedera is NOT in the WDK bridge package's built-in chain table (beta.12),
 * so bridging to/from Hedera passes `oftContractAddress` + `dstEid` overrides
 * — see services/swapService.ts.
 */

export interface Usdt0Deployment {
  /** Key used by the WDK USDT0 bridge's `targetChain` (and our own registry). */
  key: string;
  name: string;
  chainId: number;
  /** LayerZero V2 endpoint ID. */
  eid: number;
  /** The ERC-20 the user holds. On Ethereum this is legacy USDT (OFT adapter locks it). */
  token: string;
  /** The OFT / OFT adapter contract `send()` is called on. */
  oft: string;
  /** True when the chain is in the WDK bridge's built-in table (no overrides needed). */
  builtIn: boolean;
}

export const USDT0_DEPLOYMENTS: Usdt0Deployment[] = [
  { key: 'ethereum',  name: 'Ethereum',       chainId: 1,      eid: 30101, token: '0xdAC17F958D2ee523a2206206994597C13D831ec7', oft: '0x6C96dE32CEa08842dcc4058c14d3aaAD7Fa41dee', builtIn: true },
  { key: 'arbitrum',  name: 'Arbitrum One',   chainId: 42161,  eid: 30110, token: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', oft: '0x14E4A1B13bf7F943c8ff7C51fb60FA964A298D92', builtIn: true },
  { key: 'berachain', name: 'Berachain',      chainId: 80094,  eid: 30362, token: '0x779Ded0c9e1022225f8E0630b35a9b54bE713736', oft: '0x3Dc96399109df5ceb2C226664A086140bD0379cB', builtIn: true },
  { key: 'conflux',   name: 'Conflux eSpace', chainId: 1030,   eid: 30212, token: '0xaf37E8B6C9ED7f6318979f56Fc287d76c30847ff', oft: '0xC57efa1c7113D98BdA6F9f249471704Ece5dd84A', builtIn: true },
  { key: 'flare',     name: 'Flare',          chainId: 14,     eid: 30295, token: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', oft: '0x567287d2A9829215a37e3B88843d32f9221E7588', builtIn: true },
  { key: 'hedera',    name: 'Hedera',         chainId: 295,    eid: 30316, token: '0x00000000000000000000000000000000009Ce723', oft: '0xe3119e23fC2371d1E6b01775ba312035425A53d6', builtIn: false },
  { key: 'hyperevm',  name: 'HyperEVM',       chainId: 999,    eid: 30367, token: '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb', oft: '0x904861a24F30EC96ea7CFC3bE9EA4B476d237e98', builtIn: true },
  { key: 'ink',       name: 'Ink',            chainId: 57073,  eid: 30339, token: '0x0200C29006150606B650577BBE7B6248F58470c1', oft: '0x1cB6De532588fCA4a21B7209DE7C456AF8434A65', builtIn: true },
  { key: 'mantle',    name: 'Mantle',         chainId: 5000,   eid: 30181, token: '0x779Ded0c9e1022225f8E0630b35a9b54bE713736', oft: '0xcb768e263FB1C62214E7cab4AA8d036D76dc59CC', builtIn: true },
  { key: 'megaeth',   name: 'MegaETH',        chainId: 4326,   eid: 30398, token: '0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb', oft: '0x9151434b16b9763660705744891fa906f660ecc5', builtIn: true },
  { key: 'monad',     name: 'Monad',          chainId: 143,    eid: 30390, token: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', oft: '0x9151434b16b9763660705744891fA906F660EcC5', builtIn: true },
  { key: 'morph',     name: 'Morph',          chainId: 2818,   eid: 30322, token: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', oft: '0xcb768e263FB1C62214E7cab4AA8d036D76dc59CC', builtIn: true },
  { key: 'optimism',  name: 'Optimism',       chainId: 10,     eid: 30111, token: '0x01bFF41798a0BcF287b996046Ca68b395DbC1071', oft: '0xF03b4d9AC1D5d1E7c4cEf54C2A313b9fe051A0aD', builtIn: true },
  { key: 'plasma',    name: 'Plasma',         chainId: 9745,   eid: 30383, token: '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb', oft: '0x02ca37966753bDdDf11216B73B16C1dE756A7CF9', builtIn: true },
  { key: 'polygon',   name: 'Polygon PoS',    chainId: 137,    eid: 30109, token: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', oft: '0x6BA10300f0DC58B7a1e4c0e41f5daBb7D7829e13', builtIn: true },
  { key: 'rootstock', name: 'Rootstock',      chainId: 30,     eid: 30333, token: '0x779dED0C9e1022225F8e0630b35A9B54Be713736', oft: '0x1a594d5d5d1c426281C1064B07f23F57B2716B61', builtIn: true },
  { key: 'sei',       name: 'Sei',            chainId: 1329,   eid: 30280, token: '0x9151434b16b9763660705744891fA906F660EcC5', oft: '0x56Fe74A2e3b484b921c447357203431a3485CC60', builtIn: true },
  { key: 'stable',    name: 'Stable',         chainId: 988,    eid: 30396, token: '0x779Ded0c9e1022225f8E0630b35a9b54bE713736', oft: '0xedaba024be4d87974d5aB11C6Dd586963CcCB027', builtIn: true },
  { key: 'unichain',  name: 'Unichain',       chainId: 130,    eid: 30320, token: '0x9151434b16b9763660705744891fA906F660EcC5', oft: '0xc07bE8994D035631c36fb4a89C918CeFB2f03EC3', builtIn: true },
  { key: 'xlayer',    name: 'XLayer',         chainId: 196,    eid: 30274, token: '0x779Ded0c9e1022225f8E0630b35a9b54bE713736', oft: '0x94bcca6bdfd6a61817ab0e960bfede4984505554', builtIn: true },
];

export const USDT0_BY_KEY: Record<string, Usdt0Deployment> = Object.fromEntries(
  USDT0_DEPLOYMENTS.map((d) => [d.key, d]),
);

export const USDT0_BY_CHAIN_ID: Record<number, Usdt0Deployment> = Object.fromEntries(
  USDT0_DEPLOYMENTS.map((d) => [d.chainId, d]),
);
