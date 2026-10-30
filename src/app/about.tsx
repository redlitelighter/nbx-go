/**
 * App Info — what NBX-go is built on: Hedera (the network), Tether's WDK
 * (the wallet), QVAC (on-device AI) and SaucerSwap (swaps). NBX was
 * incubated by the NSE (Nairobi Securities Exchange).
 */
import React from 'react';
import { View, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { Globe, Wallet, Cpu, ArrowLeftRight, Building2, ExternalLink } from 'lucide-react-native';
import { Screen, ScreenHeader, Text, Tap, BrandMark } from '@/components';
import { useTheme } from '@/theme';

const STACK = [
  {
    Icon: Globe,
    title: 'Hedera',
    body: 'Everything in NBX-go runs on Hedera mainnet — fast finality (~3–5 s), low fixed fees paid in HBAR, and a carbon-negative network.',
    url: 'https://hedera.com',
  },
  {
    Icon: Wallet,
    title: 'WDK by Tether',
    body: 'The Wallet Development Kit powers the self-custodial wallet: key generation, encryption, signing and balances — all on your device.',
    url: 'https://docs.wdk.tether.io',
  },
  {
    Icon: Cpu,
    title: 'QVAC',
    body: 'Tether’s local AI runtime. GO’s text, vision and speech models run offline on your phone — no cloud, no data sharing.',
    url: 'https://qvac.tether.io',
  },
  {
    Icon: ArrowLeftRight,
    title: 'SaucerSwap',
    body: 'Hedera’s leading DEX. Every swap, buy, sell and limit order in NBX-go executes on SaucerSwap V2.',
    url: 'https://saucerswap.finance',
  },
  {
    Icon: Building2,
    title: 'Incubated by the NSE',
    body: 'NBX was incubated by the Nairobi Securities Exchange.',
    url: 'https://www.nse.co.ke',
  },
];

export default function AboutScreen() {
  const theme = useTheme();
  const router = useRouter();
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <Screen scroll edges={['top', 'bottom']}>
      <ScreenHeader title="App Info" onBack={() => router.back()} />
      <View style={{ alignItems: 'center', paddingVertical: 16 }}>
        <BrandMark size={44} />
        <Text variant="body" color="textSecondary" style={{ marginTop: 10 }}>The next step · v{version} beta</Text>
      </View>

      <View style={{ gap: 10 }}>
        {STACK.map((s) => (
          <Tap
            key={s.title}
            onPress={() => Linking.openURL(s.url)}
            pressedColor={theme.colors.pressed}
            style={{ flexDirection: 'row', gap: 12, padding: 14, borderRadius: 16, backgroundColor: theme.colors.bgSecondary }}
          >
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: theme.colors.brandTint, alignItems: 'center', justifyContent: 'center' }}>
              <s.Icon size={18} color={theme.colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="body" style={{ fontWeight: '600' }}>{s.title}</Text>
              <Text variant="small" color="textSecondary" style={{ marginTop: 2 }}>{s.body}</Text>
            </View>
            <ExternalLink size={14} color={theme.colors.textDisabled} />
          </Tap>
        ))}
      </View>
    </Screen>
  );
}
