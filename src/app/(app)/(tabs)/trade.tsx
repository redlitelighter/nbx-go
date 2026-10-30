/**
 * Trade — Spot: TradingView Lightweight Charts (inlined, no CDN — see
 * scripts/build-chart-html.js) in a WebView, fed SaucerSwap USD candles for
 * the Hedera ecosystem tokens (wdk/market.ts) via postMessage.
 *
 * Order panel (exchange-card style, NBX orange): Buy / Sell × Market / Limit,
 * every pair quoted in USDT0.
 *   Market → opens Swap prefilled (SaucerSwap, confirm there).
 *   Limit  → you set a USDT0 price; the order sets the funds aside and
 *            hooks/useOrderWatcher.ts swaps on SaucerSwap when SaucerSwap's
 *            price reaches it (while NBX-go is open — no backend).
 * Accepts ?asset=SAUCE&side=buy&type=limit&amount=10&price=0.009 (from GO).
 *
 * Candle size per range: 1D → 5-min, 1W/1M → hourly, 3M/1Y → daily.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, ActivityIndicator, ScrollView, Alert, Linking, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import BigNumber from 'bignumber.js';
import * as LocalAuthentication from 'expo-local-authentication';
import { withoutAutoLock } from '@/state/lockSuppression';
import { useHbarForFees } from '@/hooks/useHbarForFees';
import { Clock, X, ExternalLink, CheckCircle2, XCircle } from 'lucide-react-native';
import { Text, Pill, Tap, Button, ExchangeCard, TokenPill, DetailsCard, DetailRow, Dropdown } from '@/components';
import { useTheme } from '@/theme';
import { useMarkets, useMarketQuotes, useOhlc } from '@/wdk/market';
import { useWdkBalances } from '@/wdk/hooks/useWalletData';
import { useOrders, reservedBySymbol, type LimitOrder, type OrderSide } from '@/state/orders';
import { COIN_LIST } from '@/config/coinList';
import { HEDERA_TOKEN_BY_SYMBOL, USDT0_HEDERA_ID } from '@/config/hederaTokens';
import { HEDERA_EXPLORER_URL } from '@/config/hedera';
import { CHART_HTML } from '@/assets/chartHtml.generated';

const TRADABLE = COIN_LIST;
const USDT0 = HEDERA_TOKEN_BY_SYMBOL.USDT0;
const RANGES = [
  { label: '1D', days: 1 },
  { label: '1W', days: 7 },
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '1Y', days: 365 },
] as const;
const NUDGES = [-0.05, -0.02, 0, 0.02, 0.05];

/** Price in USDT0 with enough significant digits for sub-cent tokens. */
function fmtPrice(n: number) {
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n < 0.01) return n.toPrecision(4);
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 4 : 2 });
}

const clean = (t: string) => {
  const d = t.replace(/[^0-9.]/g, '');
  const i = d.indexOf('.');
  return i === -1 ? d : d.slice(0, i + 1) + d.slice(i + 1).replace(/\./g, '');
};

async function confirm(message: string): Promise<boolean> {
  const [hw, enrolled] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]);
  if (hw && enrolled) return (await withoutAutoLock(() => LocalAuthentication.authenticateAsync({ promptMessage: message }))).success;
  return new Promise((resolve) =>
    Alert.alert('Confirm order', message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Place order', onPress: () => resolve(true) },
    ]),
  );
}

export default function TradeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ asset?: string; side?: string; type?: string; amount?: string; price?: string }>();
  const [tab, setTab] = useState<'spot' | 'futures'>('spot');
  const [symbol, setSymbol] = useState(TRADABLE.find((c) => c.symbol === 'SAUCE')?.symbol ?? TRADABLE[0].symbol);
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[0]);
  const [ready, setReady] = useState(false);
  const web = useRef<WebView>(null);

  const [side, setSide] = useState<OrderSide>('buy');
  const [type, setType] = useState<'market' | 'limit'>('limit');
  const [priceText, setPriceText] = useState('');
  const [amountText, setAmountText] = useState('');
  const [priceEdited, setPriceEdited] = useState(false);

  const orders = useOrders((s) => s.orders);
  const balances = useWdkBalances();

  useEffect(() => {
    if (params.asset && TRADABLE.some((c) => c.symbol === params.asset)) setSymbol(params.asset);
    if (params.side === 'buy' || params.side === 'sell') setSide(params.side);
    if (params.type === 'market' || params.type === 'limit') setType(params.type);
    if (params.amount && /^\d+(\.\d+)?$/.test(params.amount)) setAmountText(params.amount);
    if (params.price && /^\d+(\.\d+)?$/.test(params.price)) {
      setPriceText(params.price);
      setPriceEdited(true);
    }
  }, [params.asset, params.side, params.type, params.amount, params.price]);

  const coin = TRADABLE.find((c) => c.symbol === symbol)!;
  const token = HEDERA_TOKEN_BY_SYMBOL[coin.symbol];
  const markets = useMarkets(TRADABLE.map((c) => c.tokenId));
  const usdt0Quote = useMarketQuotes([USDT0_HEDERA_ID]);
  const quote = markets.data?.[coin.tokenId];
  const ohlc = useOhlc(coin.tokenId, range.days);
  const up = (quote?.change24h ?? 0) >= 0;

  // Every pair is quoted in USDT0: SaucerSwap's USD price ÷ USDT0's USD price.
  const usdt0Usd = usdt0Quote.data?.[USDT0_HEDERA_ID]?.price ?? 1;
  const spot = quote ? quote.price / usdt0Usd : null;

  // Default the limit price to the live price until the user types one.
  useEffect(() => {
    if (!priceEdited && spot) setPriceText(new BigNumber(spot).precision(4).toFixed());
  }, [spot, priceEdited, symbol]);
  // A different coin clears the price/amount — but not on mount or when GO
  // prefilled this coin's order.
  const lastSymbol = useRef(symbol);
  useEffect(() => {
    if (lastSymbol.current === symbol) return;
    lastSymbol.current = symbol;
    if (params.asset === symbol && params.price) return;
    setPriceEdited(false);
    setAmountText('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  // Push candles into the chart whenever they (or the page) change.
  useEffect(() => {
    if (!ready || !ohlc.data) return;
    web.current?.postMessage(JSON.stringify({ type: 'candles', candles: ohlc.data, up: theme.colors.success, down: theme.colors.error }));
  }, [ready, ohlc.data, theme.colors.success, theme.colors.error]);

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const m = JSON.parse(e.nativeEvent.data);
      if (m.type === 'ready') setReady(true);
      else if (m.type === 'error') console.warn('[trade chart]', m.message);
    } catch {}
  };

  // ── Order maths ──
  const reserved = reservedBySymbol(orders);
  const balanceOf = (sym: string, id: string) => {
    const row = balances.data.find((b) => b.token.id === id);
    const bal = new BigNumber(row && row.amount !== '—' ? row.amount : 0);
    return BigNumber.max(bal.minus(reserved[sym] ?? 0), 0);
  };
  const spendSym = side === 'buy' ? 'USDT0' : coin.symbol;
  const available = side === 'buy' ? balanceOf('USDT0', 'usdt0-hedera') : balanceOf(coin.symbol, coin.wdkAssetId);
  const price = new BigNumber(type === 'market' ? spot ?? 0 : priceText || 0);
  const amount = new BigNumber(amountText || 0);
  const valid = amount.gt(0) && price.gt(0);
  const over = amount.gt(available);
  // buy: USDT0 → token; sell: token → USDT0 (before fees).
  const receive = valid ? (side === 'buy' ? amount.dividedBy(price) : amount.times(price)) : null;
  const vsSpot = spot && type === 'limit' && price.gt(0) ? price.dividedBy(spot).minus(1).toNumber() : null;
  const fillsNow = vsSpot != null && (side === 'buy' ? vsSpot >= 0 : vsSpot <= 0);

  // Every fill is a Hedera swap paid in HBAR.
  const fees = useHbarForFees();

  const placeOrder = async () => {
    if (!valid || over) return;
    if (type === 'market') {
      router.navigate({
        pathname: '/swap',
        params: side === 'buy'
          ? { from: 'hedera:USDT0', to: coin.destination, amount: amount.toFixed() }
          : { from: coin.destination, to: 'hedera:USDT0', amount: amount.toFixed() },
      });
      return;
    }
    const summary =
      side === 'buy'
        ? `Buy ${coin.symbol} with ${amount.toFormat()} USDT0 when the price is ${price.toFixed()} USDT0 or lower`
        : `Sell ${amount.toFormat()} ${coin.symbol} when the price is ${price.toFixed()} USDT0 or higher`;
    if (!(await confirm(summary))) return;
    await useOrders.getState().place({ side, token: coin.symbol, amount: amount.toFixed(), price: price.toFixed() });
    setAmountText('');
    Alert.alert(
      'Order placed',
      `${summary}. ${amount.toFormat()} ${spendSym} is set aside. Orders fill while NBX-go is open — keep the app running to catch your price.`,
    );
  };

  const myOrders = useMemo(() => orders.filter((o) => o.token === coin.symbol || o.status === 'open'), [orders, coin.symbol]);

  return (
    <SafeAreaView edges={['left', 'right']} className="page-trade" style={{ flex: 1, backgroundColor: theme.colors.bgPrimary }}>
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 }}>
        <Pill label="Spot" active={tab === 'spot'} onPress={() => setTab('spot')} />
        <Pill label="Futures" active={tab === 'futures'} onPress={() => setTab('futures')} />
      </View>

      {tab === 'futures' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text variant="h2">Futures are coming</Text>
          <Text variant="body" color="textSecondary" center style={{ marginTop: 8 }}>
            Perpetuals aren't available yet. Spot trading on Hedera runs through SaucerSwap today.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
          {/* Pair + price */}
          <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
            <Dropdown
              label="Active pair"
              value={symbol}
              onChange={setSymbol}
              options={TRADABLE.map((c) => {
                const m = markets.data?.[c.tokenId];
                return {
                  value: c.symbol,
                  label: `${c.symbol}/USDT0`,
                  icon: c.icon,
                  detail: m ? `${m.change24h >= 0 ? '+' : ''}${m.change24h.toFixed(2)}%` : undefined,
                  detailColor: m ? (m.change24h >= 0 ? 'success' : 'error') : undefined,
                };
              })}
            />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 14 }}>
            <View style={{ flex: 1 }}>
              <Text variant="balance" style={{ fontWeight: '600', fontVariant: ['tabular-nums'] }}>
                {spot ? fmtPrice(spot) : '—'} <Text variant="body" color="textSecondary">USDT0</Text>
              </Text>
              <Text variant="body" color={quote ? (up ? 'success' : 'error') : 'textSecondary'} style={{ fontWeight: '600' }}>
                {quote ? `${up ? '+' : ''}${quote.change24h.toFixed(2)}% today` : ' '}
              </Text>
            </View>
          </View>

          {/* Chart */}
          <View style={{ height: 260, marginTop: 12 }}>
            <WebView
              ref={web}
              originWhitelist={['*']}
              source={{ html: CHART_HTML }}
              onMessage={onMessage}
              javaScriptEnabled
              scrollEnabled={false}
              nestedScrollEnabled
              style={{ flex: 1, backgroundColor: theme.colors.bgPrimary }}
              containerStyle={{ backgroundColor: theme.colors.bgPrimary }}
            />
            {!ready || ohlc.isLoading ? (
              <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={theme.colors.brand} />
              </View>
            ) : null}
            {ohlc.isError ? (
              <Text variant="small" color="textSecondary" center style={{ position: 'absolute', bottom: 8, left: 0, right: 0 }}>
                Chart data is temporarily unavailable.
              </Text>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 }}>
            {RANGES.map((r) => (
              <Pill key={r.label} label={r.label} active={r.label === range.label} onPress={() => setRange(r)} />
            ))}
          </View>

          {/* Order panel */}
          <View style={{ paddingHorizontal: 16, gap: 12 }}>
            <View style={{ flexDirection: 'row', padding: 4, borderRadius: 999, backgroundColor: theme.colors.bgSecondary }}>
              {(['buy', 'sell'] as const).map((s) => (
                <Tap
                  key={s}
                  onPress={() => setSide(s)}
                  style={{ flex: 1, height: 42, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: side === s ? theme.colors.brand : 'transparent' }}
                >
                  <Text variant="button" style={{ fontWeight: '600', color: side === s ? '#fff' : theme.colors.textSecondary }}>
                    {s === 'buy' ? 'Buy' : 'Sell'} {coin.symbol}
                  </Text>
                </Tap>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pill label="Limit" active={type === 'limit'} onPress={() => setType('limit')} />
              <Pill label="Market" active={type === 'market'} onPress={() => setType('market')} />
            </View>

            {type === 'limit' ? (
              <>
                <ExchangeCard
                  label={`${side === 'buy' ? 'Buy' : 'Sell'} when 1 ${coin.symbol} is`}
                  value={priceText}
                  onChangeText={(t) => {
                    setPriceText(clean(t));
                    setPriceEdited(true);
                  }}
                  token={<TokenPill symbol="USDT0" icon={USDT0.icon} />}
                  left={spot ? `Market ${fmtPrice(spot)} USDT0` : ' '}
                  right={vsSpot != null ? `${vsSpot >= 0 ? '+' : ''}${(vsSpot * 100).toFixed(1)}% vs market` : ' '}
                />
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {NUDGES.map((n) => (
                    <Pill
                      key={n}
                      label={n === 0 ? 'Market' : `${n > 0 ? '+' : ''}${n * 100}%`}
                      onPress={() => {
                        if (!spot) return;
                        setPriceText(new BigNumber(spot).times(1 + n).precision(4).toFixed());
                        setPriceEdited(true);
                      }}
                    />
                  ))}
                </View>
              </>
            ) : null}

            <ExchangeCard
              label={side === 'buy' ? 'You spend' : 'You sell'}
              value={amountText}
              onChangeText={(t) => setAmountText(clean(t))}
              token={<TokenPill symbol={spendSym} icon={side === 'buy' ? USDT0.icon : coin.icon} />}
              left={receive ? `≈ ${receive.decimalPlaces(side === 'buy' ? 4 : 6, BigNumber.ROUND_DOWN).toFormat()} ${side === 'buy' ? coin.symbol : 'USDT0'}` : ' '}
              right={`${available.decimalPlaces(4, BigNumber.ROUND_DOWN).toFormat()} ${spendSym} free · Max`}
              onRightPress={() => setAmountText(available.decimalPlaces(side === 'buy' ? 6 : token?.decimals ?? 6, BigNumber.ROUND_DOWN).toFixed())}
            />

            <DetailsCard>
              <DetailRow label="Pair" value={`${coin.symbol} / USDT0`} info="Every NBX-go pair is quoted in USDT0, Tether's dollar token on Hedera." />
              <DetailRow
                label={type === 'limit' ? 'Fills when' : 'Fills'}
                value={type === 'limit' ? `price ${side === 'buy' ? '≤' : '≥'} ${price.gt(0) ? price.toFixed() : '—'} USDT0` : 'now, at the market price'}
                info={
                  type === 'limit'
                    ? 'NBX-go watches SaucerSwap’s price while the app is open and swaps when it reaches yours — only if the pool can actually fill within 1% of your price.'
                    : 'A market order opens Swap with the amount filled in; you confirm the live quote there.'
                }
              />
              {type === 'limit' ? (
                <DetailRow label="Set aside" value={valid ? `${amount.toFormat()} ${spendSym}` : '—'} info="Reserved for this order so other trades can’t spend it. Cancel the order to free it." />
              ) : null}
              <DetailRow label="Provider" value="SaucerSwap" info="Orders execute as SaucerSwap V2 swaps on Hedera." />
              <DetailRow label="Fees" value="0.03% + pool fee" info="A 0.03% NBX platform fee plus SaucerSwap's pool fee, taken when the order fills." />
            </DetailsCard>

            {fees.message ? (
              <Text variant="small" color={fees.empty ? 'error' : 'brand'}>
                {fees.message}{type === 'limit' && !fees.empty ? ' Orders also need HBAR when they fill.' : ''}
              </Text>
            ) : null}
            {over ? <Text variant="small" color="error">More than your free {spendSym}{reserved[spendSym] ? ` (${reserved[spendSym]} is set aside for open orders)` : ''}.</Text> : null}
            {fillsNow ? (
              <Text variant="small" color="textSecondary">
                That price is already {side === 'buy' ? 'above' : 'below'} the market, so this order would fill straight away — a market order is simpler.
              </Text>
            ) : null}

            <Button
              label={type === 'market' ? `${side === 'buy' ? 'Buy' : 'Sell'} ${coin.symbol} now` : `Place ${side} order`}
              onPress={placeOrder}
              disabled={!valid || over || fees.empty}
            />
          </View>

          {/* Orders */}
          {myOrders.length ? (
            <View style={{ paddingHorizontal: 16, marginTop: 20, gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text variant="headTitle">Orders</Text>
                {myOrders.some((o) => o.status !== 'open' && o.status !== 'filling') ? (
                  <Tap onPress={() => useOrders.getState().clearDone()} hitSlop={8}>
                    <Text variant="small" color="brand">Clear history</Text>
                  </Tap>
                ) : null}
              </View>
              {myOrders.map((o) => (
                <OrderRow key={o.id} order={o} />
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function OrderRow({ order: o }: { order: LimitOrder }) {
  const theme = useTheme();
  const Icon = o.status === 'filled' ? CheckCircle2 : o.status === 'failed' || o.status === 'cancelled' ? XCircle : Clock;
  const color = o.status === 'filled' ? theme.colors.success : o.status === 'failed' ? theme.colors.error : o.status === 'cancelled' ? theme.colors.textDisabled : theme.colors.brand;
  const t = HEDERA_TOKEN_BY_SYMBOL[o.token];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: theme.colors.bgSecondary }}>
      {t ? <Image source={t.icon} style={{ width: 32, height: 32, borderRadius: 16 }} /> : null}
      <View style={{ flex: 1 }}>
        <Text variant="body" style={{ fontWeight: '600' }}>
          {o.side === 'buy' ? 'Buy' : 'Sell'} {o.token} @ {o.price} USDT0
        </Text>
        <Text variant="small" color="textSecondary">
          {o.side === 'buy' ? `${o.amount} USDT0` : `${o.amount} ${o.token}`} · {o.status === 'filling' ? 'filling…' : o.status}
          {o.error ? ` · ${o.error}` : ''}
        </Text>
      </View>
      {o.status === 'open' ? (
        <Tap
          onPress={() =>
            Alert.alert('Cancel order', `Cancel this ${o.side} order? The set-aside funds become free again.`, [
              { text: 'Keep', style: 'cancel' },
              { text: 'Cancel order', style: 'destructive', onPress: () => useOrders.getState().cancel(o.id) },
            ])
          }
          hitSlop={8}
          accessibilityLabel="Cancel order"
        >
          <X size={18} color={theme.colors.textSecondary} />
        </Tap>
      ) : o.hash ? (
        <Tap onPress={() => Linking.openURL(`${HEDERA_EXPLORER_URL}/transaction/${o.hash}`)} hitSlop={8} accessibilityLabel="View on HashScan">
          <ExternalLink size={16} color={theme.colors.brand} />
        </Tap>
      ) : (
        <Icon size={18} color={color} />
      )}
    </View>
  );
}
