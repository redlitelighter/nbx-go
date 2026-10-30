/**
 * Security & Privacy — a summary of the NBX-go beta terms (config/terms.ts)
 * and how keys, data and AI are handled.
 */
import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { FlaskConical, Globe, ArrowLeftRight, Cpu, ShieldAlert, KeyRound, Lock, EyeOff, CheckCircle2 } from 'lucide-react-native';
import { Screen, ScreenHeader, Text } from '@/components';
import { useTheme } from '@/theme';
import { TERMS } from '@/config/terms';
import { usePrefs, TERMS_VERSION } from '@/state/prefs';

const ICONS = [FlaskConical, Globe, ArrowLeftRight, Cpu, ShieldAlert, KeyRound];

const PRACTICES = [
  { Icon: KeyRound, title: 'Keys stay on this phone', body: 'Your recovery phrase is encrypted with your password in the device’s secure storage. NBX has no copy.' },
  { Icon: Lock, title: 'Locks itself', body: 'The wallet locks when the app goes to the background; unlocking needs your password or biometrics.' },
  { Icon: EyeOff, title: 'No tracking', body: 'GO runs offline on QVAC. Chats, voice notes and screenshots are processed on-device and never uploaded.' },
];

export default function SecurityScreen() {
  const theme = useTheme();
  const router = useRouter();
  const accepted = usePrefs((s) => s.termsAccepted) >= TERMS_VERSION;

  const Card = ({ Icon, title, body }: { Icon: React.ElementType; title: string; body: string }) => (
    <View style={{ flexDirection: 'row', gap: 12, padding: 14, borderRadius: 16, backgroundColor: theme.colors.bgSecondary }}>
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: theme.colors.brandTint, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={18} color={theme.colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="body" style={{ fontWeight: '600' }}>{title}</Text>
        <Text variant="small" color="textSecondary" style={{ marginTop: 2 }}>{body}</Text>
      </View>
    </View>
  );

  return (
    <Screen scroll edges={['top', 'bottom']}>
      <ScreenHeader title="Security & Privacy" onBack={() => router.back()} />

      <Text variant="headTitle" style={{ marginBottom: 8 }}>How your wallet is protected</Text>
      <View style={{ gap: 10 }}>
        {PRACTICES.map((p) => (
          <Card key={p.title} Icon={p.Icon} title={p.title} body={p.body} />
        ))}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 8 }}>
        <Text variant="headTitle">Terms you agreed to</Text>
        {accepted ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <CheckCircle2 size={14} color={theme.colors.success} />
            <Text variant="small" color="success">Accepted</Text>
          </View>
        ) : null}
      </View>
      <View style={{ gap: 10 }}>
        {TERMS.map((t, i) => (
          <Card key={t.title} Icon={ICONS[i] ?? ShieldAlert} title={t.title} body={t.body} />
        ))}
      </View>
      <Text variant="small" color="textSecondary" style={{ marginTop: 14 }}>
        NBX-go is in beta. Never share your recovery phrase — no one from NBX will ever ask for it.
      </Text>
    </Screen>
  );
}
