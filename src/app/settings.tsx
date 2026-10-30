/**
 * Settings — appearance (light / dark, persisted in state/prefs.ts), GO's
 * models, wallet shortcuts, Security & Privacy (beta terms summary) and
 * App Info (WDK, QVAC, Hedera). Every row opens a real screen.
 */
import React from 'react';
import { View, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, Cpu, Shield, Info, Moon, Users, History, Wallet, LogOut } from 'lucide-react-native';
import { useWalletActions } from '@/wdk/hooks/useWalletActions';
import { usePasswordSession } from '@/state/passwordSession';
import { useTheme } from '@/theme';
import { Screen, ScreenHeader, Text, Tap, Toggle, BuiltOnWdk } from '@/components';
import { usePrefs } from '@/state/prefs';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ marginTop: 20 }}>
      <Text variant="small" color="textSecondary" style={{ fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', paddingHorizontal: 4, marginBottom: 8 }}>
        {title}
      </Text>
      <View style={{ borderRadius: 16, backgroundColor: theme.colors.bgSecondary, overflow: 'hidden' }}>{children}</View>
    </View>
  );
}

function Row({
  icon: Icon,
  label,
  hint,
  onPress,
  right,
  last,
}: {
  icon: React.ElementType;
  label: string;
  hint?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  last?: boolean;
}) {
  const theme = useTheme();
  return (
    <Tap
      onPress={onPress}
      disabled={!onPress}
      pressedColor={theme.colors.pressed}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: theme.colors.border,
        backgroundColor: 'transparent',
      }}
    >
      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: theme.colors.brandTint, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={18} color={theme.colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="body" style={{ fontWeight: '600' }}>{label}</Text>
        {hint ? <Text variant="small" color="textSecondary">{hint}</Text> : null}
      </View>
      {right ?? (onPress ? <ChevronRight size={16} color={theme.colors.textDisabled} /> : null)}
    </Tap>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const theme = usePrefs((s) => s.theme);
  const setTheme = usePrefs((s) => s.setTheme);
  const { lock } = useWalletActions();
  const clearPassword = usePasswordSession((s) => s.clear);

  /**
   * Log out = lock. NBX-go is self-custodial: the encrypted wallet stays on
   * this phone and the password (or biometrics) unlocks it again. Same path
   * as AutoLockOnBackground: lock, then always clear the in-memory password;
   * WdkSessionGate then routes to /unlock.
   */
  const logOut = () =>
    Alert.alert('Log out of NBX-go?', 'Your wallet stays on this phone, locked. Unlock it again with your password.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: () => {
          lock()
            .catch((e) => console.warn('[settings] lock failed:', e))
            .finally(() => {
              clearPassword();
              router.replace('/unlock');
            });
        },
      },
    ]);

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader title="Settings" onBack={() => router.back()} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }}>
        <Section title="Appearance">
          <Row
            icon={Moon}
            label="Dark mode"
            hint={theme === 'dark' ? 'On — easy on the eyes' : 'Off — light theme'}
            right={<Toggle value={theme === 'dark'} onValueChange={(v) => setTheme(v ? 'dark' : 'light')} />}
            onPress={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            last
          />
        </Section>

        <Section title="GO">
          <Row icon={Cpu} label="Models" hint="Text, vision and speech — switch to smarter ones" onPress={() => router.push('/models')} last />
        </Section>

        <Section title="Wallet">
          <Row icon={Wallet} label="Assets" hint="Your Hedera tokens" onPress={() => router.push('/assets')} />
          <Row icon={Users} label="Contacts" hint="Saved Hedera addresses" onPress={() => router.push('/contacts')} />
          <Row icon={History} label="History" hint="Transactions, linked to HashScan" onPress={() => router.push('/history')} last />
        </Section>

        <Section title="Security & About">
          <Row icon={Shield} label="Security & Privacy" hint="How NBX-go keeps your keys and data" onPress={() => router.push('/security')} />
          <Row icon={Info} label="App Info" hint="Built on WDK, QVAC and Hedera" onPress={() => router.push('/about')} last />
        </Section>

        <Section title="Account">
          <Row
            icon={LogOut}
            label="Log out"
            hint="Lock the wallet — unlock again with your password"
            onPress={logOut}
            right={<View />}
            last
          />
        </Section>

        <BuiltOnWdk style={{ marginTop: 24 }} />
      </ScrollView>
    </Screen>
  );
}
