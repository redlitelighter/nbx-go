import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Text, Button, BrandMark, BuiltOnWdk } from '@/components';
import { useResponsive } from '@/theme/responsive';
import { usePrefs, TERMS_VERSION } from '@/state/prefs';


// using a proper cropped asset (e.g. measure it in an image editor: w / h).
const LOGO_ASPECT_RATIO = 2.79;

// Logo never exceeds this width, even on tablets — prevents it from
// growing to dominate large screens just because wp(55) is a big number there.
const LOGO_MAX_WIDTH = 360;

export default function Welcome() {
  const router = useRouter();
  const { wp } = useResponsive();

  const logoWidth = Math.min(wp(55), LOGO_MAX_WIDTH);
  // Beta terms are agreed before any wallet is created or imported.
  const termsOk = usePrefs((s) => s.termsAccepted) >= TERMS_VERSION;

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 56 }}>
        <BrandMark size={Math.round(logoWidth / 4.2)} />
        <Text
          variant="body"
          color="textSecondary"
          center
          style={{ maxWidth: '85%', marginTop: 40 }}
        >
          The next step on Hedera. Self-custodial — your keys, your coins.
        </Text>
      </View>

      <Button
        label="Create new wallet"
        onPress={() => router.push(termsOk ? '/(onboarding)/seed-hidden' : { pathname: '/(onboarding)/terms', params: { next: 'create' } })}
      />
      <Button
        label="Import existing wallet"
        variant="secondary"
        onPress={() => router.push(termsOk ? '/(onboarding)/import' : { pathname: '/(onboarding)/terms', params: { next: 'import' } })}
      />
      <BuiltOnWdk style={{ marginTop: 14 }} />
    </Screen>
  );
}
