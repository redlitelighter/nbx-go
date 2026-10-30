# WDK Android starter demo

This directory was bootstrapped from the official
[WDK React Native starter](https://github.com/tetherto/wdk-starter-react-native),
commit `f34ed48c76e2f23935146b9b8b76f93c55460e11`, following the
[React Native quickstart](https://docs.wdk.tether.io/start-building/react-native-quickstart/).

## Run on this Mac

Start the **Medium Phone API 36.1** emulator in Android Studio, then run:

```sh
npm run android
```

The launcher in `scripts/android.sh` uses the project-local JDK 17 in
`.local/jdk-17/Contents/Home` when `JAVA_HOME` is unset. It also detects the
Android SDK at `~/Library/Android/sdk`. You can override either location
with `JAVA_HOME` and `ANDROID_HOME`. The JDK and generated build outputs
are ignored by Git.

The launcher prefers IPv4 for Node and Java. This avoids an unreachable
IPv6 route encountered while downloading the React Native Android AAR
from its official artifact host on this network.

To restart only the JavaScript development server after the native app
has been installed:

```sh
NODE_OPTIONS=--dns-result-order=ipv4first npm start -- --localhost
```

This app includes native WDK/Bare modules, so use its installed native
Android app, rather than Expo Go.

## Configuration

`.env` is already copied from `.env.example`. No private API keys were
added. You can inspect onboarding and recovery phrase generation without
registering external services. The template's Pimlico URLs contain
`YOUR_PIMLICO_KEY` placeholders; configure those before testing EVM sends.
Transaction history requires `EXPO_PUBLIC_WDK_INDEXER_API_KEY`. Cloud
backup requires its own provider configuration.

The upstream template includes Bitcoin/Ethereum testnet settings and
Arbitrum/Polygon mainnet settings. This demo is for checking the alpha
starter and should use disposable wallets without real funds.

## Checks

Verified on 27 October 2026 with the Medium Phone API 36.1 ARM64 emulator:

- Dependency installation and WDK worklet generation succeeded.
- TypeScript and the Android production JavaScript export passed.
- The Android debug APK built, installed, and launched successfully.
- The welcome screen and Activity screen rendered.
- Runtime logs confirmed the primary wallet reached `ready`, and balance
  fetches completed for Bitcoin, Ethereum, Arbitrum, and Polygon.
- Activity displayed its expected missing Indexer API key configuration
  message. No fund transfers or cloud backups were tested.

The generated debug APK is at
`android/app/build/outputs/apk/debug/app-debug.apk`. It requires Metro
while running, as expected for a debug build.

```sh
npm run typecheck
npx expo export --platform android --output-dir .local/android-export
```

`npm install` also regenerates the native WDK worklet bundle through the
starter's `postinstall` script. The upstream README and `docs/` directory
contain the full wallet integration documentation.
