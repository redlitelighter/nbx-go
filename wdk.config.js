/** @type {import('@tetherto/wdk-worklet-bundler').WdkBundleConfig} */
module.exports = {
  // NBX-go is Hedera-only: one network, Hedera MAINNET (chainId 295), as a
  // plain EOA — Hedera has no 4337/7702 bundler or paymaster, so gas is paid
  // in HBAR. Swaps (SaucerSwap) and staking (Mothership) are direct contract
  // calls from the app, so no WDK protocols are bundled.
  //
  // Dropping the Bitcoin, Spark, EVM-7702, Base/Ethereum and the
  // USDT0/Orchestra/Rhino.fi/Aave/Morpho protocol modules (2026-10-30)
  // shrank the worklet bundle and the APK. Regenerate with
  // `npm run bundle:wdk` after changing this file.
  networks: {
    hedera: {
      package: '@tetherto/wdk-wallet-evm'
    }
  },
  protocols: {},
  preloadModules: []
}
