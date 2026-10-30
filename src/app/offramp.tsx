/**
 * Sell — Hedera only. Selling a token swaps it back to USDT0 on SaucerSwap
 * (opens Swap prefilled). No fiat provider is configured, so cashing out
 * means sending Hedera USDT0 to an exchange that accepts Hedera deposits and
 * selling there.
 */
import React from 'react';
import { View, Image } from 'react-native';
import { useRouter } from 'expo-router';
import BigNumber from 'bignumber.js';
import { ChevronRight, Info } from 'lucide-react-native';
import { Screen, ScreenHeader, Text, Card, Tap } from '@/components';
import { useTheme } from '@/theme';
import { SWAP_ASSETS } from '@/config/swapAssets';
import { useWdkBalances } from '@/wdk/hooks/useWalletData';

export default function OfframpScreen() {
  const theme = useTheme();
  const router = useRouter();
  const balances = useWdkBalances();
  const amountOf = (id: string) => balances.data.find((b) => b.token.id === id)?.amount ?? '0';
  const usdt0 = amountOf('usdt0-hedera');
  // Tokens the user can sell back into USDT0, held ones first.
  const sellable = SWAP_ASSETS.filter((a) => a.symbol !== 'USDT0').sort(
    (a, b) => Number(new BigNumber(amountOf(b.walletAssetId)).gt(0)) - Number(new BigNumber(amountOf(a.walletAssetId)).gt(0)),
  );

  return (
    <Screen edges={['top', 'bottom']} scroll>
      <View className="page-offramp">
        <ScreenHeader title="Sell" onBack={() => router.back()} />

        <Text variant="headTitle" style={{ marginBottom: 8 }}>Sell for USDT0</Text>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {sellable.map((a, i) => (
            <Tap
              key={a.ref}
              onPress={() => router.navigate({ pathname: '/swap', params: { from: a.ref, to: 'hedera:USDT0' } })}
              pressedColor={theme.colors.pressed}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 14,
                borderBottomWidth: i === sellable.length - 1 ? 0 : 1,
                borderBottomColor: theme.colors.border,
                backgroundColor: 'transparent',
              }}
            >
              <Image source={a.icon} style={{ width: 32, height: 32, borderRadius: 16 }} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text variant="tokenName">{a.symbol}</Text>
                <Text variant="small" color="textSecondary">{a.name}</Text>
              </View>
              <Text variant="small" color="textSecondary" style={{ marginRight: 8, fontVariant: ['tabular-nums'] }}>
                {new BigNumber(amountOf(a.walletAssetId)).decimalPlaces(4, BigNumber.ROUND_DOWN).toFormat()}
              </Text>
              <ChevronRight size={18} color={theme.colors.textSecondary} />
            </Tap>
          ))}
        </Card>

        <Text variant="headTitle" style={{ marginTop: 20, marginBottom: 8 }}>Cash out</Text>
        <Tap
          onPress={() => router.navigate({ pathname: '/send/amount', params: { tokenId: 'usdt0-hedera' } })}
          pressedColor={theme.colors.pressed}
          style={{ padding: 16, borderRadius: 16, backgroundColor: theme.colors.bgSecondary }}
        >
          <Text variant="body" style={{ fontWeight: '600' }}>Send {usdt0} USDT0 to an exchange</Text>
          <Text variant="small" color="textSecondary" style={{ marginTop: 2 }}>Paste the exchange's Hedera deposit address on the next screen.</Text>
        </Tap>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, alignItems: 'flex-start' }}>
          <Info size={16} color={theme.colors.textSecondary} style={{ marginTop: 2 }} />
          <Text variant="small" color="textSecondary" style={{ flex: 1 }}>
            Check that your exchange supports USDT0 deposits on Hedera before sending — funds sent on an unsupported network can be lost.
          </Text>
        </View>
      </View>
    </Screen>
  );
}
