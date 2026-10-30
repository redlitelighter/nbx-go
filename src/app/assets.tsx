/**
 * Assets — every token the wallet holds, grouped as a table: asset,
 * network, balance, USD value. Pull to refresh.
 */
import React from 'react';
import { View, FlatList, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, ScreenHeader, Text, AssetIcon, LoadingState } from '@/components';
import { useTheme } from '@/theme';
import { useWdkBalances, useWdkTotalUsd } from '@/wdk/hooks/useWalletData';
import { networkDisplayName } from '@/wdk/chains';

export default function AssetsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const balances = useWdkBalances();
  const { total } = useWdkTotalUsd();

  return (
    <Screen edges={['top', 'bottom']} noPadding>
      <View style={{ paddingHorizontal: 16 }}>
        <ScreenHeader title="Assets" onBack={() => router.back()} />
        <Text variant="small" color="textSecondary">Total</Text>
        <Text variant="h1" style={{ marginBottom: 12 }}>{total}</Text>
      </View>

      {/* Table header */}
      <View
        style={{
          flexDirection: 'row',
          paddingHorizontal: 16,
          paddingVertical: 8,
          backgroundColor: theme.colors.bgSecondary,
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        <Text variant="small" color="textSecondary" style={{ flex: 1.4 }}>Asset</Text>
        <Text variant="small" color="textSecondary" style={{ flex: 1, textAlign: 'right' }}>Balance</Text>
        <Text variant="small" color="textSecondary" style={{ flex: 0.9, textAlign: 'right' }}>Value</Text>
      </View>

      {balances.isLoading ? (
        <LoadingState message="Loading balances" />
      ) : (
        <FlatList
          data={balances.data}
          keyExtractor={(b) => b.token.id}
          refreshControl={
            <RefreshControl refreshing={balances.isRefetching ?? false} onRefresh={() => balances.refetch()} tintColor={theme.colors.brand} />
          }
          renderItem={({ item }) => (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: theme.colors.border,
              }}
            >
              <View style={{ flex: 1.4, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <AssetIcon symbol={item.token.symbol} network={item.token.chain} size={32} showChainBadge />
                <View>
                  <Text variant="body" style={{ fontWeight: '600' }}>{item.token.symbol}</Text>
                  <Text variant="small" color="textSecondary">{networkDisplayName(item.token.chain)}</Text>
                </View>
              </View>
              <Text
                variant="body"
                color={item.fetchFailed ? 'error' : 'textPrimary'}
                style={{ flex: 1, textAlign: 'right' }}
                numberOfLines={1}
              >
                {item.fetchFailed ? 'Failed' : item.amount}
              </Text>
              <Text variant="body" color="textSecondary" style={{ flex: 0.9, textAlign: 'right' }} numberOfLines={1}>
                {item.fiatValue}
              </Text>
            </View>
          )}
          ListEmptyComponent={
            <Text variant="body" color="textSecondary" center style={{ marginTop: 32 }}>No assets yet.</Text>
          }
        />
      )}
    </Screen>
  );
}
