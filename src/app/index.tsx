import React from 'react';
import { Redirect } from 'expo-router';
import { useWdkSession } from '@/wdk/hooks/useWdkSession';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ErrorState, BrandMark, BuiltOnWdk, Text } from '@/components';
import { ScrambleText } from '@/components/ScrambleText';
import { useTheme } from '@/theme';

const LOADING_WORDS = ['NBX', 'agents', 'finance', 'swaps', 'Hedera', 'QVAC'];

function BrandSplash() {
  const theme = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.bgPrimary, paddingHorizontal: 24 }}>
      <BrandMark size={52} />
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 28, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Text variant="body" color="textSecondary">Please wait as </Text>
        <ScrambleText
          words={LOADING_WORDS}
          style={{ color: theme.colors.brand, fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'], minWidth: 64, textAlign: 'center' }}
        />
        <Text variant="body" color="textSecondary"> is loading</Text>
      </View>
      <ActivityIndicator color={theme.colors.brand} style={{ marginTop: 18 }} />
      <BuiltOnWdk style={{ position: 'absolute', bottom: 48 }} />
    </SafeAreaView>
  );
}

/**
 * Entry gate — routes based on the WDK's real lifecycle state.
 * WDK is the source of truth: INITIALIZING -> loading, NO_WALLET -> onboarding,
 * LOCKED -> unlock, READY -> app.
 *
 * No "Try again" button on the error state below, as of
 * wdk-react-native-core PR #77 (tetherto/wdk-react-native-core#77):
 * useWdkApp() no longer exposes a `retry()` function at all. That PR's own
 * guidance for the removal is to re-call whichever specific lifecycle
 * method failed (unlock/createWallet/restoreWallet) — but there genuinely
 * isn't one of those to re-call here. This screen renders when the
 * underlying worklet/app-level initialization itself failed, before any
 * such method was ever called, so there's no specific action this screen
 * can retry. `onRetry` is optional on ErrorState (see StateViews.tsx), so
 * omitting it here is a real, deliberate choice — not a missed prop — and
 * correctly makes the button disappear entirely rather than wire it to a
 * fabricated action that doesn't reflect what's actually possible with the
 * new API. If this needs a real retry path later, it would mean giving
 * WdkAppProvider a remount key at the layout level, which is a genuinely
 * bigger, separate change than this file alone.
 */
export default function Index() {
  const { status } = useWdkSession();

  // The wallet engine takes a few seconds to boot; show the brand meanwhile
  // (continues the native splash, which uses the same dark background).
  if (status === 'loading') return <BrandSplash />;
  if (status === 'error') return <ErrorState message="Wallet failed to initialize. Please close and reopen the app." />;
  if (status === 'noWallet') return <Redirect href="/(onboarding)/welcome" />;
  if (status === 'locked') return <Redirect href="/unlock" />;
  return <Redirect href="/(app)/(tabs)/home" />;
}
