/**
 * Terms — NBX-go beta terms the user agrees to before creating or importing
 * a wallet (config/terms.ts). Each point is ticked, then "I agree" continues
 * to `?next=create|import`. Acceptance is stored in state/prefs.ts.
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Square, CheckSquare, FlaskConical, Globe, ArrowLeftRight, Cpu, ShieldAlert, KeyRound } from 'lucide-react-native';
import { Screen, ScreenHeader, Text, Button, Tap } from '@/components';
import { useTheme } from '@/theme';
import { TERMS } from '@/config/terms';
import { usePrefs } from '@/state/prefs';

const ICONS = [FlaskConical, Globe, ArrowLeftRight, Cpu, ShieldAlert, KeyRound];

export default function TermsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [ticked, setTicked] = useState<boolean[]>(TERMS.map(() => false));
  const all = ticked.every(Boolean);

  const agree = () => {
    usePrefs.getState().acceptTerms();
    router.replace(next === 'import' ? '/(onboarding)/import' : '/(onboarding)/seed-hidden');
  };

  return (
    <Screen
      scroll
      edges={['top', 'bottom']}
      footer={<Button label={all ? 'I agree — take the next step' : `Tick all ${TERMS.length} to continue`} onPress={agree} disabled={!all} />}
    >
      <ScreenHeader title="Before you start" onBack={() => router.back()} />
      <Text variant="body" color="textSecondary" style={{ marginBottom: 14 }}>
        A few things to agree on before NBX-go creates or imports your wallet.
      </Text>
      <View style={{ gap: 10 }}>
        {TERMS.map((t, i) => {
          const Icon = ICONS[i] ?? ShieldAlert;
          const Box = ticked[i] ? CheckSquare : Square;
          return (
            <Tap
              key={t.title}
              onPress={() => setTicked((x) => x.map((v, j) => (j === i ? !v : v)))}
              pressedColor={theme.colors.pressed}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: ticked[i] }}
              style={{ flexDirection: 'row', gap: 12, padding: 14, borderRadius: 16, backgroundColor: theme.colors.bgSecondary }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: theme.colors.brandTint, alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={18} color={theme.colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="body" style={{ fontWeight: '600' }}>{t.title}</Text>
                <Text variant="small" color="textSecondary" style={{ marginTop: 2 }}>{t.body}</Text>
              </View>
              <Box size={22} color={ticked[i] ? theme.colors.brand : theme.colors.textDisabled} />
            </Tap>
          );
        })}
      </View>
      <Tap onPress={() => setTicked(TERMS.map(() => true))} style={{ alignSelf: 'center', marginTop: 14 }} hitSlop={8}>
        <Text variant="small" color="brand" style={{ fontWeight: '600' }}>Tick all</Text>
      </Tap>
    </Screen>
  );
}
