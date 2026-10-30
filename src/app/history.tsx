/**
 * History — Hedera transactions, newest first, each opening on HashScan.
 *
 * Source: the Hedera mirror node (wdk/hederaHistory.ts) — Hedera's own
 * indexer. The WDK Indexer API (@tetherto/wdk-indexer-http) was checked on
 * 2026-10-30: its getChains() lists ethereum, arbitrum, avalanche, polygon,
 * sepolia, tron, ton, bitcoin and spark — no Hedera — so it can't serve
 * NBX-go's history. Waiting on it for chains the app no longer has left this
 * page stuck on "Loading history".
 *
 * Filters: All / Received / Sent and a token picker; saved contacts are
 * shown by name instead of 0.0.x account ids.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, FlatList, Pressable, RefreshControl, Linking, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowDownLeft, ArrowUpRight, ExternalLink, Inbox } from 'lucide-react-native';
import { Screen, ScreenHeader, Text, LoadingState, Tap, Pill, Dropdown, Button } from '@/components';
import { useTheme } from '@/theme';
import { useWdkAddressForNetwork } from '@/wdk/hooks/useWalletData';
import { hederaAccountId, useHederaTransfers } from '@/wdk/hederaHistory';
import { HEDERA_ASSETS, HEDERA_TOKEN_BY_SYMBOL } from '@/config/hederaTokens';
import { useContacts } from '@/state/contacts';

type Dir = 'all' | 'in' | 'out';

function when(ts: number) {
  const d = new Date(ts);
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}

const label = (sym: string) => (sym === 'XSAUCE' ? 'xSAUCE' : sym);

export default function HistoryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { address: hederaAddress } = useWdkAddressForNetwork('hedera');
  const hedera = useHederaTransfers(hederaAddress);
  const contacts = useContacts((s) => s.contacts);
  const [dir, setDir] = useState<Dir>('all');
  const [token, setToken] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  // Saved contacts' Hedera account ids → names.
  const [names, setNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!useContacts.getState().loaded) useContacts.getState().load();
  }, []);
  useEffect(() => {
    let alive = true;
    (async () => {
      const m = new Map<string, string>();
      await Promise.all(
        contacts.flatMap((c) =>
          c.addresses
            .filter((a) => a.network === 'hedera')
            .map(async (a) => {
              const id = await hederaAccountId(a.address);
              if (id) m.set(id, c.name);
            }),
        ),
      );
      if (alive) setNames(m);
    })();
    return () => {
      alive = false;
    };
  }, [contacts]);

  const rows = useMemo(
    () => (hedera.data ?? []).filter((t) => (dir === 'all' || t.direction === dir) && (token === 'all' || t.symbol === token)),
    [hedera.data, dir, token],
  );

  const refresh = async () => {
    setRefreshing(true);
    try {
      await hedera.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']} noPadding>
      <View style={{ paddingHorizontal: 16 }}>
        <ScreenHeader title="History" onBack={() => router.back()} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Pill label="All" active={dir === 'all'} onPress={() => setDir('all')} />
          <Pill label="Received" active={dir === 'in'} onPress={() => setDir('in')} />
          <Pill label="Sent" active={dir === 'out'} onPress={() => setDir('out')} />
          <View style={{ marginLeft: 'auto' }}>
            <Dropdown
              label="Token"
              value={token}
              onChange={setToken}
              options={[
                { value: 'all', label: 'All tokens' },
                ...HEDERA_ASSETS.map((t) => ({ value: t.symbol, label: label(t.symbol), icon: t.icon })),
              ]}
            />
          </View>
        </View>
        {hederaAddress ? (
          <Pressable
            onPress={() => Linking.openURL(`https://hashscan.io/mainnet/account/${hederaAddress}`)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 12, marginBottom: 6 }}
            hitSlop={8}
          >
            <Text variant="small" color="brand" style={{ fontWeight: '600' }}>Open full history on HashScan</Text>
            <ExternalLink size={14} color={theme.colors.brand} />
          </Pressable>
        ) : null}
      </View>

      {!hederaAddress || (hedera.isLoading && !hedera.data) ? (
        <LoadingState message="Loading your Hedera history" />
      ) : hedera.isError ? (
        <View style={{ padding: 24, gap: 12 }}>
          <Text variant="body" color="textSecondary" center>Couldn’t reach the Hedera mirror node. Check your connection.</Text>
          <Button label="Try again" variant="tinted" onPress={refresh} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.brand} />}
          renderItem={({ item }) => {
            const In = item.direction === 'in';
            const Arrow = In ? ArrowDownLeft : ArrowUpRight;
            const tok = HEDERA_TOKEN_BY_SYMBOL[item.symbol];
            const who = item.counterparty ? names.get(item.counterparty) ?? item.counterparty : null;
            return (
              <Tap
                onPress={() => Linking.openURL(item.explorerUrl)}
                pressedColor={theme.colors.pressed}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.colors.border,
                  backgroundColor: 'transparent',
                }}
              >
                <View>
                  {tok ? <Image source={tok.icon} style={{ width: 36, height: 36, borderRadius: 18 }} /> : null}
                  <View
                    style={{
                      position: 'absolute',
                      right: -4,
                      bottom: -4,
                      width: 18,
                      height: 18,
                      borderRadius: 9,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: In ? theme.colors.success : theme.colors.brand,
                      borderWidth: 2,
                      borderColor: theme.colors.bgPrimary,
                    }}
                  >
                    <Arrow size={10} color="#fff" strokeWidth={3} />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="body" style={{ fontWeight: '600' }}>
                    {In ? 'Received' : 'Sent'} {label(item.symbol)}
                  </Text>
                  <Text variant="small" color="textSecondary" numberOfLines={1}>
                    {who ? `${In ? 'From' : 'To'} ${who} · ` : ''}
                    {when(item.timestamp)}
                    {item.status !== 'confirmed' ? ' · failed' : ''}
                  </Text>
                </View>
                <Text variant="body" color={item.status !== 'confirmed' ? 'textDisabled' : In ? 'success' : 'textPrimary'} style={{ fontWeight: '600', fontVariant: ['tabular-nums'] }} numberOfLines={1}>
                  {In ? '+' : '−'}{item.amount}
                </Text>
                <ExternalLink size={14} color={theme.colors.textDisabled} />
              </Tap>
            );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', padding: 32, gap: 10 }}>
              <Inbox size={32} color={theme.colors.textDisabled} />
              <Text variant="body" color="textSecondary" center>
                {dir === 'all' && token === 'all' ? 'No transactions yet.' : 'Nothing matches these filters.'}
              </Text>
              {dir === 'all' && token === 'all' ? <Button label="Deposit HBAR or USDT0" variant="tinted" onPress={() => router.push('/receive')} /> : null}
            </View>
          }
        />
      )}
    </Screen>
  );
}
