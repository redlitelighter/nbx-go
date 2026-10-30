/**
 * Home — dark trading layout (after the "Crypto Trading Mobile App" Figma
 * reference): total balance with Deposit/Withdraw, quick actions, Favorites
 * cards and the Popular list, both with 7-day sparklines.
 *
 * Actions: Buy/Sell → /ramps (SaucerSwap today, fiat ramps coming soon),
 * GO (AI, highlighted, centre) → /xc-chat, Earn → /lending (SAUCE staking).
 * Favourites are the user's own pick (star on the Popular list, kept in
 * state/prefs.ts). Hedera ecosystem only, priced by SaucerSwap.
 */
import React, { useCallback, useEffect } from 'react';
import { View, Pressable, RefreshControl, ScrollView, Image } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowUpRight,
  Sparkles,
  Landmark,
  Star,
  Settings,
  User,
} from 'lucide-react-native';
import { Text, Sparkline, Tap } from '@/components';
import { useTheme } from '@/theme';
import { useGsapValue } from '@/hooks/useGsapValue';
import { useWdkBalances, useWdkTotalUsd } from '@/wdk/hooks/useWalletData';
import { useMarkets, type MarketCoin } from '@/wdk/market';
import { COIN_LIST, type CoinConfig } from '@/config/coinList';
import { usePrefs } from '@/state/prefs';

// Hedera ecosystem only — prices, sparklines and charts from SaucerSwap.
const PRICED = COIN_LIST.map((c) => c.tokenId);

function fmtUsd(n: number) {
  if (n >= 1000) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  // Hedera tokens trade at fractions of a cent: keep 4 significant digits.
  if (n < 0.01) return `$${n.toPrecision(4)}`;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 4 : 2 })}`;
}

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const balances = useWdkBalances();
  const { total } = useWdkTotalUsd();
  const markets = useMarkets(PRICED);
  const favorites = usePrefs((s) => s.favorites);
  const favCoins = COIN_LIST.filter((c) => favorites.includes(c.symbol));

  useFocusEffect(
    useCallback(() => {
      balances.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const usdt0 = balances.data.find((b) => b.token.id === 'usdt0-hedera');
  const buy = (coin: CoinConfig) =>
    router.push({ pathname: '/swap', params: { from: 'hedera:USDT0', to: coin.destination } });

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="page-home" style={{ flex: 1, backgroundColor: theme.colors.bgPrimary }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={balances.isRefetching ?? false}
            onRefresh={() => {
              balances.refetch();
              markets.refetch();
            }}
            tintColor={theme.colors.brand}
          />
        }
      >
        {/* Top bar */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <IconCircle onPress={() => router.push('/profile')}>
            <User size={18} color={theme.colors.textPrimary} />
          </IconCircle>
          <Text variant="small" color="textSecondary">Hedera mainnet</Text>
          <IconCircle onPress={() => router.push('/settings')}>
            <Settings size={18} color={theme.colors.textPrimary} />
          </IconCircle>
        </View>

        {/* Balance */}
        <Text variant="small" color="textSecondary" style={{ marginTop: 22 }}>Total balance</Text>
        <Text variant="balance" style={{ fontWeight: '600', letterSpacing: -0.5, marginTop: 2, fontVariant: ['tabular-nums'] }}>
          {total}
        </Text>
        <Text variant="small" color="textSecondary">{usdt0?.amount ?? '0'} USDT0 available</Text>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          <PillButton label="Deposit" icon={ArrowDownToLine} filled onPress={() => router.push('/receive')} />
          <PillButton label="Withdraw" icon={ArrowUpFromLine} onPress={() => router.push('/send')} />
        </View>

        {/* Quick actions */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-around',
            marginTop: 18,
            padding: 12,
            borderRadius: 20,
            backgroundColor: theme.colors.bgSecondary,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <Action label="Buy/Sell" icon={ArrowUpRight} onPress={() => router.push('/ramps')} />
          <Action label="GO" icon={Sparkles} highlight onPress={() => router.push('/xc-chat')} />
          <Action label="Earn" icon={Landmark} onPress={() => router.push('/lending')} />
        </View>

        {/* Favorites */}
        <SectionTitle title="Favorites" />
        {favCoins.length === 0 ? (
          <Text variant="small" color="textSecondary">Tap the star on any coin below to pin it here.</Text>
        ) : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }} style={{ marginHorizontal: -16 }}>
          {favCoins.map((coin, i) => (
            <FavoriteCard
              key={coin.symbol}
              coin={coin}
              index={i}
              market={markets.data?.[coin.tokenId]}
              onPress={() => router.push({ pathname: '/trade', params: { asset: coin.symbol } })}
            />
          ))}
        </ScrollView>

        {/* Popular */}
        <SectionTitle title="Popular cryptocurrency" />
        <View style={{ borderRadius: 20, backgroundColor: theme.colors.bgSecondary, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden' }}>
          {COIN_LIST.map((coin, i) => (
            <CoinRow
              key={coin.symbol}
              coin={coin}
              index={i}
              last={i === COIN_LIST.length - 1}
              market={markets.data?.[coin.tokenId]}
              loading={markets.isLoading}
              onBuy={() => buy(coin)}
              favorite={favorites.includes(coin.symbol)}
              onToggleFavorite={() => usePrefs.getState().toggleFavorite(coin.symbol)}
              onPress={() => router.push({ pathname: '/trade', params: { asset: coin.symbol } })}
            />
          ))}
        </View>
        {markets.isError ? (
          <Text variant="small" color="textSecondary" style={{ marginTop: 8 }}>
            Prices are temporarily unavailable — pull to refresh.
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <Text variant="headTitle" style={{ marginTop: 24, marginBottom: 10, fontWeight: '600' }}>{title}</Text>;
}

function IconCircle({ children, onPress }: { children: React.ReactNode; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.bgSecondary,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      {children}
    </Pressable>
  );
}

function PillButton({
  label,
  icon: Icon,
  onPress,
  filled,
}: {
  label: string;
  icon: React.ElementType;
  onPress: () => void;
  filled?: boolean;
}) {
  const theme = useTheme();
  const fg = filled ? '#0B0A0A' : theme.colors.textPrimary;
  return (
    <Tap
      onPress={onPress}
      pressedColor={theme.colors.pressed}
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 46,
        borderRadius: 23,
        backgroundColor: filled ? ('#FFFFFF') : 'transparent',
        borderWidth: filled ? 0 : 1,
        borderColor: theme.colors.borderStrong,
      }}
    >
      <Icon size={17} color={fg} />
      <Text variant="button" style={{ color: fg, fontWeight: '600' }}>{label}</Text>
    </Tap>
  );
}

function Action({
  label,
  icon: Icon,
  onPress,
  highlight,
}: {
  label: string;
  icon: React.ElementType;
  onPress: () => void;
  highlight?: boolean;
}) {
  const theme = useTheme();
  const scale = useGsapValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.sharedValue.value }] }));
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => scale.tweenTo(0.92, { duration: 0.1 })}
      onPressOut={() => scale.tweenTo(1, { duration: 0.15 })}
      style={{ alignItems: 'center', width: 68 }}
    >
      <Animated.View
        style={[
          {
            width: 50,
            height: 50,
            borderRadius: 25,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: highlight ? theme.colors.brand : theme.colors.bgTertiary,
          },
          style,
        ]}
      >
        <Icon size={22} color={highlight ? '#fff' : theme.colors.textPrimary} strokeWidth={2} />
      </Animated.View>
      <Text variant="small" style={{ marginTop: 6, fontWeight: highlight ? '600' : '500' }} color={highlight ? 'brand' : 'textPrimary'}>
        {label}
      </Text>
    </Pressable>
  );
}

function CoinAvatar({ coin, size }: { coin: CoinConfig; size: number }) {
  const theme = useTheme();
  // SaucerSwap's token logos are full circles already.
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: theme.colors.bgTertiary,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <Image source={coin.icon} style={{ width: size, height: size }} />
    </View>
  );
}

function useEnter(index: number) {
  const enter = useGsapValue(0);
  useEffect(() => {
    enter.tweenTo(1, { duration: 0.4, delay: index * 0.07, ease: 'power2.out' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return useAnimatedStyle(() => ({
    opacity: enter.sharedValue.value,
    transform: [{ translateY: (1 - enter.sharedValue.value) * 12 }],
  }));
}

function FavoriteCard({
  coin,
  index,
  market,
  onPress,
}: {
  coin: CoinConfig;
  index: number;
  market?: MarketCoin;
  onPress: () => void;
}) {
  const theme = useTheme();
  const style = useEnter(index);
  const up = (market?.change24h ?? 0) >= 0;
  const color = up ? theme.colors.success : theme.colors.error;
  return (
    <Animated.View style={[{ width: 168 }, style]}>
      <Pressable
        onPress={onPress}
        style={{
          padding: 14,
          borderRadius: 20,
          backgroundColor: theme.colors.bgSecondary,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <CoinAvatar coin={coin} size={30} />
          <View>
            <Text variant="body" style={{ fontWeight: '600' }}>{coin.symbol}</Text>
            <Text variant="small" color="textSecondary">{coin.name}</Text>
          </View>
        </View>
        <Text variant="h2" style={{ marginTop: 12 }}>{market ? fmtUsd(market.price) : '—'}</Text>
        <Text variant="small" style={{ color, fontWeight: '600' }}>
          {market ? `${up ? '+' : ''}${market.change24h.toFixed(2)}%` : ' '}
        </Text>
        <View style={{ marginTop: 8 }}>
          <Sparkline data={market?.sparkline ?? []} width={138} height={40} color={color} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

function CoinRow({
  coin,
  index,
  last,
  market,
  loading,
  onBuy,
  onPress,
  favorite,
  onToggleFavorite,
}: {
  coin: CoinConfig;
  index: number;
  last: boolean;
  market?: MarketCoin;
  loading: boolean;
  onBuy: () => void;
  onPress: () => void;
  favorite: boolean;
  onToggleFavorite: () => void;
}) {
  const theme = useTheme();
  const style = useEnter(index + 2);
  const up = (market?.change24h ?? 0) >= 0;
  const color = up ? theme.colors.success : theme.colors.error;
  const available = !!coin.destination;

  return (
    <Animated.View style={style}>
      <Tap
        onPress={onPress}
        pressedColor={theme.colors.pressed}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 14,
          paddingVertical: 13,
          borderBottomWidth: last ? 0 : 1,
          borderBottomColor: theme.colors.border,
          backgroundColor: 'transparent',
        }}
      >
        <Pressable onPress={onToggleFavorite} hitSlop={10} accessibilityLabel={favorite ? 'Remove from favourites' : 'Add to favourites'} style={{ marginRight: 10 }}>
          <Star size={16} color={favorite ? theme.colors.brand : theme.colors.textDisabled} fill={favorite ? theme.colors.brand : 'transparent'} />
        </Pressable>
        <CoinAvatar coin={coin} size={36} />
        <View style={{ width: 78, marginLeft: 10 }}>
          <Text variant="body" style={{ fontWeight: '600' }}>{coin.symbol}</Text>
          <Text variant="small" color="textSecondary" numberOfLines={1}>{coin.name}</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center' }}>
          {market ? <Sparkline data={market.sparkline} width={64} height={26} color={color} fill={false} /> : null}
        </View>
        <View style={{ alignItems: 'flex-end', marginRight: 10, minWidth: 74 }}>
          <Text variant="body" style={{ fontWeight: '600' }}>
            {market ? fmtUsd(market.price) : available && loading ? '…' : '—'}
          </Text>
          <Text variant="small" style={{ color: market ? color : theme.colors.textSecondary, fontWeight: '600' }}>
            {market ? `${up ? '+' : ''}${market.change24h.toFixed(2)}%` : available ? ' ' : 'Soon'}
          </Text>
        </View>
        <Pressable
          onPress={onBuy}
          disabled={!available}
          hitSlop={4}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 7,
            borderRadius: 14,
            backgroundColor: available ? theme.colors.brand : theme.colors.disabledBg,
          }}
        >
          <Text variant="small" color={available ? 'white' : 'textDisabled'} style={{ fontWeight: '600' }}>Buy</Text>
        </Pressable>
      </Tap>
    </Animated.View>
  );
}
