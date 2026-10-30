/**
 * Buy / Sell — one page for getting in and out. Today, on Hedera: buy any
 * ecosystem token with USDT0 or HBAR on SaucerSwap, sell back to USDT0, or
 * deposit / send to an exchange. Fiat on-ramps and off-ramps (M-Pesa, card,
 * bank) are shown as coming soon.
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowDownLeft, ArrowUpRight, ArrowDownToLine, ArrowUpFromLine, Smartphone, CreditCard, Landmark, ChevronRight, Clock } from 'lucide-react-native';
import { Screen, ScreenHeader, Text, Tap, Pill } from '@/components';
import { useTheme } from '@/theme';

type Mode = 'buy' | 'sell';

const RAMPS: Record<Mode, { label: string; note: string; Icon: React.ElementType }[]> = {
  buy: [
    { label: 'M-Pesa', note: 'Buy USDT0 with mobile money', Icon: Smartphone },
    { label: 'Card', note: 'Visa / Mastercard', Icon: CreditCard },
    { label: 'Bank transfer', note: 'Local and SEPA', Icon: Landmark },
  ],
  sell: [
    { label: 'M-Pesa', note: 'Cash out USDT0 to mobile money', Icon: Smartphone },
    { label: 'Bank account', note: 'Withdraw to your bank', Icon: Landmark },
  ],
};

export default function RampsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('buy');

  const today =
    mode === 'buy'
      ? [
          { label: 'Buy Hedera tokens', note: 'Swap USDT0 or HBAR for SAUCE, PLEX, DOVU… on SaucerSwap', Icon: ArrowDownLeft, go: () => router.push('/onramp') },
          { label: 'Deposit', note: 'Receive USDT0 or HBAR to your Hedera address', Icon: ArrowDownToLine, go: () => router.push('/receive') },
        ]
      : [
          { label: 'Sell for USDT0', note: 'Swap any Hedera token back to USDT0 on SaucerSwap', Icon: ArrowUpRight, go: () => router.push('/offramp') },
          { label: 'Send to an exchange', note: 'Cash out via an exchange that accepts Hedera USDT0', Icon: ArrowUpFromLine, go: () => router.push({ pathname: '/send/amount', params: { tokenId: 'usdt0-hedera' } }) },
        ];

  const Row = ({ label, note, Icon, onPress, soon }: { label: string; note: string; Icon: React.ElementType; onPress?: () => void; soon?: boolean }) => (
    <Tap
      onPress={onPress}
      disabled={soon}
      pressedColor={theme.colors.pressed}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: theme.colors.bgSecondary, opacity: soon ? 0.7 : 1 }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: soon ? theme.colors.bgTertiary : theme.colors.brandTint, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={20} color={soon ? theme.colors.textSecondary : theme.colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="body" style={{ fontWeight: '600' }}>{label}</Text>
        <Text variant="small" color="textSecondary">{note}</Text>
      </View>
      {soon ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 24, borderRadius: 12, backgroundColor: theme.colors.bgTertiary }}>
          <Clock size={12} color={theme.colors.textSecondary} />
          <Text variant="small" color="textSecondary">Soon</Text>
        </View>
      ) : (
        <ChevronRight size={18} color={theme.colors.textSecondary} />
      )}
    </Tap>
  );

  return (
    <Screen scroll edges={['top', 'bottom']}>
      <ScreenHeader title="Buy / Sell" onBack={() => router.back()} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pill label="Buy" active={mode === 'buy'} onPress={() => setMode('buy')} />
        <Pill label="Sell" active={mode === 'sell'} onPress={() => setMode('sell')} />
      </View>

      <Text variant="headTitle" style={{ marginTop: 20, marginBottom: 8 }}>Available now · on Hedera</Text>
      <View style={{ gap: 10 }}>
        {today.map((r) => (
          <Row key={r.label} label={r.label} note={r.note} Icon={r.Icon} onPress={r.go} />
        ))}
      </View>

      <Text variant="headTitle" style={{ marginTop: 22, marginBottom: 8 }}>{mode === 'buy' ? 'On-ramps' : 'Off-ramps'} · coming soon</Text>
      <View style={{ gap: 10 }}>
        {RAMPS[mode].map((r) => (
          <Row key={r.label} label={r.label} note={r.note} Icon={r.Icon} soon />
        ))}
      </View>
      <Text variant="small" color="textSecondary" style={{ marginTop: 14 }}>
        Fiat {mode === 'buy' ? 'on-ramps' : 'off-ramps'} are the next step for NBX-go. Until then, everything runs on Hedera through SaucerSwap.
      </Text>
    </Screen>
  );
}
