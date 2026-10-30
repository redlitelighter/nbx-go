/**
 * Profile — account card (Hedera address + copy, total balance) and entry
 * points to Assets, History and Contacts.
 */
import React from 'react';
import { View, Pressable, ScrollView, Image } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Copy, Wallet, History, Users, ChevronRight, ExternalLink, Nfc } from 'lucide-react-native';
import { Text, Card, Tap, BuiltOnWdk } from '@/components';
import { useTheme } from '@/theme';
import { useWdkAccount, useWdkAddressForNetwork, useWdkTotalUsd } from '@/wdk/hooks/useWalletData';
import { useToast } from '@/state/toast';
import { HEDERA_EXPLORER_URL } from '@/config/hedera';
import { Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Address grouped like a card number: 0x9316 E953 … 9C76 (first 8 and last 4 hex). */
function cardNumber(addr: string) {
  if (!addr) return '—';
  const h = addr.replace(/^0x/i, '').toUpperCase();
  return `0x${h.slice(0, 4)} ${h.slice(4, 8)} •••• ${h.slice(-4)}`;
}

function short(addr: string) {
  return addr ? `${addr.slice(0, 8)}…${addr.slice(-6)}` : '—';
}

export default function ProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const account = useWdkAccount();
  const { address } = useWdkAddressForNetwork('hedera');
  const { total } = useWdkTotalUsd();

  const copy = async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    useToast.getState().show('Address copied');
  };

  return (
    <SafeAreaView edges={['left', 'right']} style={{ flex: 1, backgroundColor: theme.colors.bgPrimary }}>
    <ScrollView
      className="page-profile"
      style={{ flex: 1, backgroundColor: theme.colors.bgPrimary }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
    >
      {/* Account card — styled as an orange NBX-go card. */}
      <View
        style={{
          aspectRatio: 1.586, // ISO/IEC 7810 ID-1, a real card's shape
          borderRadius: 22,
          padding: 20,
          overflow: 'hidden',
          backgroundColor: theme.colors.brand,
          justifyContent: 'space-between',
        }}
      >
        {/* Depth: two soft circles instead of a gradient. */}
        <View pointerEvents="none" style={{ position: 'absolute', width: 260, height: 260, borderRadius: 130, right: -80, top: -110, backgroundColor: 'rgba(255,255,255,0.12)' }} />
        <View pointerEvents="none" style={{ position: 'absolute', width: 220, height: 220, borderRadius: 110, left: -70, bottom: -120, backgroundColor: 'rgba(0,0,0,0.10)' }} />

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Image source={require('@/../assets/images/nbx-logo.png')} style={{ width: 44, height: 44 }} resizeMode="contain" />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Nfc size={22} color="rgba(255,255,255,0.9)" />
            <Pressable onPress={() => address && Linking.openURL(`${HEDERA_EXPLORER_URL}/account/${address}`)} hitSlop={10} accessibilityLabel="View on HashScan">
              <ExternalLink size={18} color="#fff" />
            </Pressable>
          </View>
        </View>

        <View>
          {/* EMV-style chip */}
          <View style={{ width: 40, height: 30, borderRadius: 6, backgroundColor: '#F6C26B', marginBottom: 12, opacity: 0.95 }}>
            <View style={{ position: 'absolute', left: 13, top: 0, bottom: 0, width: 1.5, backgroundColor: 'rgba(0,0,0,0.18)' }} />
            <View style={{ position: 'absolute', right: 13, top: 0, bottom: 0, width: 1.5, backgroundColor: 'rgba(0,0,0,0.18)' }} />
            <View style={{ position: 'absolute', top: 14, left: 0, right: 0, height: 1.5, backgroundColor: 'rgba(0,0,0,0.18)' }} />
          </View>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600', letterSpacing: 0.6 }}>TOTAL BALANCE</Text>
          <Text style={{ color: '#fff', fontSize: 30, fontWeight: '600', fontVariant: ['tabular-nums'], marginTop: 2 }}>{total}</Text>
        </View>

        <View>
          <Pressable onPress={copy} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} accessibilityLabel="Copy address">
            <Text style={{ color: '#fff', fontSize: 15, letterSpacing: 1.5, fontVariant: ['tabular-nums'], fontWeight: '600' }}>{cardNumber(address ?? '')}</Text>
            <Copy size={14} color="#fff" />
          </Pressable>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
            <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '600', letterSpacing: 0.8 }} numberOfLines={1}>
              {(account.data?.name ?? 'Account 1').toUpperCase()}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '600', letterSpacing: 0.8 }}>HEDERA MAINNET</Text>
          </View>
        </View>
      </View>

      <Card style={{ padding: 0, marginTop: 16, overflow: 'hidden' }}>
        <Row icon={Wallet} label="Assets" hint="Tokens and balances" onPress={() => router.push('/assets')} />
        <Row icon={History} label="History" hint="Transactions with explorer links" onPress={() => router.push('/history')} />
        <Row icon={Users} label="Contacts" hint="Saved addresses" onPress={() => router.push('/contacts')} last />
      </Card>
      <BuiltOnWdk style={{ marginTop: 24 }} />
    </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  icon: Icon,
  label,
  hint,
  onPress,
  last,
}: {
  icon: React.ElementType;
  label: string;
  hint: string;
  onPress: () => void;
  last?: boolean;
}) {
  const theme = useTheme();
  return (
    <Tap
      onPress={onPress}
      pressedColor={theme.colors.pressed}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: 'transparent',
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          backgroundColor: theme.colors.brandTint,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={18} color={theme.colors.brand} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text variant="tokenName">{label}</Text>
        <Text variant="small" color="textSecondary">{hint}</Text>
      </View>
      <ChevronRight size={18} color={theme.colors.textSecondary} />
    </Tap>
  );
}
