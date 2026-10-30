/**
 * Buy — swap-based on-ramp. There's no fiat provider configured, so "buying"
 * means swapping Hedera USDT0 into a Hedera ecosystem token on SaucerSwap.
 * Picking an asset opens Swap prefilled.
 *
 * Accepts `?asset=SAUCE` (from Home's market list) to preselect.
 */
import React from 'react';
import { View, Pressable, ScrollView, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { ChevronRight, Copy } from 'lucide-react-native';
import { Screen, ScreenHeader, Text, Card, Tap } from '@/components';
import { useTheme } from '@/theme';
import { SWAP_ASSETS, type SwapAsset } from '@/config/swapAssets';
import { useWdkAddressForNetwork, useWdkBalances } from '@/wdk/hooks/useWalletData';
import { useToast } from '@/state/toast';

const BUYABLE = SWAP_ASSETS.filter((a) => !a.ref.endsWith(':USDT0'));

export default function OnrampScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { asset } = useLocalSearchParams<{ asset?: string }>();
  const { address } = useWdkAddressForNetwork('hedera');
  const balances = useWdkBalances();
  const usdt0 = balances.data.find((b) => b.token.id === 'usdt0-hedera')?.amount ?? '0';

  const list = asset ? [...BUYABLE].sort((a, b) => Number(b.symbol === asset) - Number(a.symbol === asset)) : BUYABLE;

  const buy = (a: SwapAsset) => router.navigate({ pathname: '/swap', params: { from: 'hedera:USDT0', to: a.ref } });

  return (
    <Screen edges={['top', 'bottom']} scroll>
      <View className="page-onramp">
        <ScreenHeader title={asset ? `Buy ${asset}` : 'Buy'} onBack={() => router.back()} />

        <Card style={{ padding: 16, backgroundColor: theme.colors.bgSecondary }}>
          <Text variant="small" color="textSecondary">You pay with</Text>
          <Text variant="h2" style={{ marginTop: 2 }}>{usdt0} USDT0</Text>
          <Text variant="small" color="textSecondary" style={{ marginTop: 2 }}>on Hedera mainnet</Text>
          <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
            <Text variant="small" color="textSecondary">Top up: send USDT0 (Hedera) to</Text>
            <Pressable
              onPress={async () => {
                if (!address) return;
                await Clipboard.setStringAsync(address);
                useToast.getState().show('Hedera address copied');
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}
            >
              <Text style={{ fontVariant: ['tabular-nums'], fontSize: 13, flex: 1 }} numberOfLines={1}>{address || '—'}</Text>
              <Copy size={14} color={theme.colors.brand} />
            </Pressable>
          </View>
        </Card>

        <Text variant="headTitle" style={{ marginTop: 20, marginBottom: 8 }}>Choose what to buy</Text>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {list.map((a, i) => (
            <Tap
              key={a.ref}
              onPress={() => buy(a)}
              pressedColor={theme.colors.pressed}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 14,
                borderBottomWidth: i === list.length - 1 ? 0 : 1,
                borderBottomColor: theme.colors.border,
                backgroundColor: a.symbol === asset ? theme.colors.brandTint : 'transparent',
              }}
            >
              <Image source={a.icon} style={{ width: 32, height: 32, borderRadius: 16 }} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text variant="tokenName">{a.symbol}</Text>
                <Text variant="small" color="textSecondary">{a.name} · {a.chainName}</Text>
              </View>
              <ChevronRight size={18} color={theme.colors.textSecondary} />
            </Tap>
          ))}
        </Card>
        <Text variant="small" color="textSecondary" style={{ marginTop: 12 }}>
          Swapped on SaucerSwap, on Hedera — no bridges. A 0.03% platform fee applies.
        </Text>
      </View>
    </Screen>
  );
}
