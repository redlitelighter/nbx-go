/**
 * Swap — "Exchange Assets": Hedera-only swaps straight on SaucerSwap V2
 * (services/saucerService.ts), laid out after the exchange reference in NBX
 * orange: You pay / You receive cards, live quote as you type, a details
 * card (provider, price, fees, price impact, slippage) and one Confirm Swap.
 *
 * Any pair among config/hederaTokens.ts; routes come from SaucerSwap's live
 * pools and the best quote wins. Funds land in the user's own Hedera
 * account. Nothing moves until the user confirms with biometrics.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Modal, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BigNumber from 'bignumber.js';
import * as LocalAuthentication from 'expo-local-authentication';
import { withoutAutoLock } from '@/state/lockSuppression';
import { X, ExternalLink } from 'lucide-react-native';
import { useLocalSearchParams } from 'expo-router';
import { AssetSelector, type Token } from '@tetherto/wdk-uikit-react-native';
import { Screen, Text, Button, TokenPill, ExchangeCard, FlipButton, DetailsCard, DetailRow } from '@/components';
import { useTheme } from '@/theme';
import { useWdkBalances } from '@/wdk/hooks/useWalletData';
import { usePrices } from '@/wdk/pricing';
import { useHederaAccount } from '@/hooks/useHederaAccount';
import { useHbarForFees, HBAR_FEE_RESERVE } from '@/hooks/useHbarForFees';
import { useOrders, reservedBySymbol } from '@/state/orders';
import { HEDERA_EXPLORER_URL } from '@/config/hedera';
import { HEDERA_SWAP_TOKENS, HEDERA_TOKEN_BY_SYMBOL, walletAssetId, type HederaToken } from '@/config/hederaTokens';
import { executeSwap, friendlyTxError, quoteSwap, routeLabel, tokenFromRef, type SwapQuote, type SwapStep } from '@/services/saucerService';

type Phase = 'idle' | 'quoting' | 'quoted' | 'executing' | 'done' | 'error';

const SLIPPAGES = [0.005, 0.01, 0.02];
/** HBAR kept back for gas when using "max". */
const HBAR_GAS_RESERVE = 2;

const STEP_TEXT: Record<SwapStep, string> = {
  fee: 'Taking the 0.03% platform fee…',
  associate: 'Setting up your account for the token…',
  approve: 'Approving SaucerSwap…',
  swap: 'Swapping on SaucerSwap…',
};

function fmt(amount: bigint, decimals: number, dp = 6): string {
  return new BigNumber(amount.toString()).shiftedBy(-decimals).decimalPlaces(dp, BigNumber.ROUND_DOWN).toFormat();
}

function toBaseUnits(text: string, decimals: number): bigint | null {
  try {
    const n = new BigNumber(text);
    if (n.isNaN() || n.lte(0)) return null;
    return BigInt(n.shiftedBy(decimals).integerValue(BigNumber.ROUND_DOWN).toFixed(0));
  } catch {
    return null;
  }
}

function sanitizeAmountInput(text: string): string {
  const digitsAndDots = text.replace(/[^0-9.]/g, '');
  const firstDot = digitsAndDots.indexOf('.');
  if (firstDot === -1) return digitsAndDots;
  return digitsAndDots.slice(0, firstDot + 1) + digitsAndDots.slice(firstDot + 1).replace(/\./g, '');
}

const usd = (n: number) => (n > 0 && n < 0.01 ? `$${n.toPrecision(3)}` : `$${n.toFixed(2)}`);

export default function SwapScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ from?: string; to?: string; amount?: string }>();
  const { account, ready } = useHederaAccount();
  const balances = useWdkBalances();
  const orders = useOrders((s) => s.orders);
  const reserved = reservedBySymbol(orders);

  const [from, setFrom] = useState<HederaToken>(HEDERA_TOKEN_BY_SYMBOL.USDT0);
  const [to, setTo] = useState<HederaToken>(HEDERA_TOKEN_BY_SYMBOL.SAUCE);
  const [amountText, setAmountText] = useState('');
  const [slippage, setSlippage] = useState(0.01);
  const [picker, setPicker] = useState<'from' | 'to' | null>(null);
  const [recent, setRecent] = useState<string[]>(['HBAR', 'USDT0', 'SAUCE']);
  const [inverted, setInverted] = useState(false);

  const [phase, setPhase] = useState<Phase>('idle');
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  // Once a swap is submitted, a failure must not offer a one-tap retry: the
  // fee or approval may already be on-chain.
  const [submitted, setSubmitted] = useState(false);
  const quoteSeq = useRef(0);

  const busy = phase === 'executing';

  const { prices } = usePrices(useMemo(() => HEDERA_SWAP_TOKENS.map((t) => t.symbol), []));
  const priceOf = (t: HederaToken) => prices[t.symbol] ?? null;

  const balanceOf = (t: HederaToken): string => {
    const row = balances.data.find((b) => b.token.id === walletAssetId(t));
    return row && row.amount !== '—' ? row.amount : '0';
  };
  // Open limit orders set funds aside; Swap only spends what's free.
  const available = (t: HederaToken) => BigNumber.max(new BigNumber(balanceOf(t)).minus(reserved[t.symbol] ?? 0), 0);
  const fromAvail = available(from);
  const hbarBalance = balanceOf(HEDERA_TOKEN_BY_SYMBOL.HBAR);

  const amount = toBaseUnits(amountText, from.decimals);
  const overBalance = amount != null && new BigNumber(amountText).gt(fromAvail);
  // Network fees are paid in HBAR: block when there isn't enough left for
  // them, including when an HBAR swap would spend the last of it.
  const fees = useHbarForFees();
  const eatsFeeReserve =
    from.native && amount != null && !overBalance && new BigNumber(amountText).gt(new BigNumber(hbarBalance).minus(HBAR_FEE_RESERVE));
  const feeBlock = fees.empty || eatsFeeReserve;
  const feeMessage = eatsFeeReserve
    ? `Leave at least ${HBAR_FEE_RESERVE} HBAR for network fees — try ${BigNumber.max(new BigNumber(hbarBalance).minus(HBAR_GAS_RESERVE), 0).decimalPlaces(4, BigNumber.ROUND_DOWN).toFormat()} or less.`
    : fees.message;

  // Prefill from GO / Home / Trade (e.g. /swap?from=hedera:USDT0&to=hedera:SAUCE&amount=25).
  useEffect(() => {
    const f = tokenFromRef(params.from);
    const t = tokenFromRef(params.to);
    if (f && f.symbol !== 'XSAUCE') setFrom(f);
    if (t && t.symbol !== 'XSAUCE') setTo(t);
    if (params.amount && /^\d+(\.\d+)?$/.test(params.amount)) setAmountText(params.amount);
  }, [params.from, params.to, params.amount]);

  // Live quote as you type (debounced); stale responses are dropped.
  useEffect(() => {
    if (phase === 'executing' || submitted) return;
    setQuote(null);
    setError(null);
    if (phase === 'done') return;
    if (!ready || amount == null || from.id === to.id) {
      setPhase('idle');
      return;
    }
    const seq = ++quoteSeq.current;
    setPhase('quoting');
    const t = setTimeout(async () => {
      try {
        const q = await quoteSwap(account, from, to, amount, slippage);
        if (seq !== quoteSeq.current) return;
        setQuote(q);
        setPhase('quoted');
      } catch (e: any) {
        if (seq !== quoteSeq.current) return;
        setError(friendlyTxError(e) || 'Could not get a quote');
        setPhase('error');
      }
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, amountText, slippage, ready]);

  const pickerTokens: Token[] = useMemo(
    () =>
      HEDERA_SWAP_TOKENS.filter((t) => (picker === 'to' ? t.id !== from.id : true)).map((t) => {
        const bal = balanceOf(t);
        const p = priceOf(t);
        return {
          id: t.symbol,
          symbol: t.symbol,
          name: t.name,
          balance: bal,
          balanceUSD: p ? `$${new BigNumber(bal).times(p).toFixed(2)}` : '',
          icon: t.icon,
          color: t.color,
          network: 'Hedera',
          hasBalance: new BigNumber(bal || 0).gt(0),
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [picker, from, balances.data, prices],
  );

  const onSelectToken = (tk: Token) => {
    const t = HEDERA_TOKEN_BY_SYMBOL[tk.id];
    if (picker === 'from') {
      setFrom(t);
      if (t.id === to.id) setTo(from);
    } else setTo(t);
    setRecent((r) => [t.symbol, ...r.filter((s) => s !== t.symbol)].slice(0, 4));
    setPicker(null);
  };

  const onFlip = () => {
    setFrom(to);
    setTo(from);
    setAmountText('');
  };

  const onUseMax = () => {
    const max = from.native ? BigNumber.max(fromAvail.minus(HBAR_GAS_RESERVE), 0) : fromAvail;
    setAmountText(max.decimalPlaces(from.decimals, BigNumber.ROUND_DOWN).toFixed());
  };

  const confirmWithBiometrics = async (): Promise<boolean> => {
    const [hasHardware, enrolled] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]);
    if (!hasHardware || !enrolled) {
      return new Promise((resolve) =>
        Alert.alert('Confirm swap', 'This moves real funds on Hedera mainnet.', [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Confirm', style: 'destructive', onPress: () => resolve(true) },
        ]),
      );
    }
    const r = await withoutAutoLock(() => LocalAuthentication.authenticateAsync({ promptMessage: 'Confirm swap' }));
    return r.success;
  };

  const onExecute = async () => {
    if (!quote) return;
    if (!(await confirmWithBiometrics())) return;
    setPhase('executing');
    setSubmitted(true);
    setError(null);
    try {
      const r = await executeSwap(account, quote, (s) => setStatus(STEP_TEXT[s]));
      setHash(r.hash);
      setStatus(`Swapped ${fmt(quote.input, from.decimals)} ${from.symbol} → ~${fmt(quote.amountOut, to.decimals)} ${to.symbol}`);
      setPhase('done');
      balances.refetch?.();
    } catch (e: any) {
      setStatus(null);
      const msg = friendlyTxError(e);
      setError(/Nothing was sent|wasn’t sent|Cancelled/.test(msg) ? msg : `${msg} — check HashScan before retrying; the fee or approval may already have gone through.`);
      setPhase('error');
    }
  };

  const reset = () => {
    setPhase('idle');
    setQuote(null);
    setAmountText('');
    setHash(null);
    setError(null);
    setStatus(null);
    setSubmitted(false);
  };

  const fromPrice = priceOf(from);
  const toPrice = priceOf(to);
  const inUsd = amount != null && fromPrice ? new BigNumber(amountText).times(fromPrice).toNumber() : null;
  const outN = quote ? new BigNumber(quote.amountOut.toString()).shiftedBy(-to.decimals) : null;
  const outUsd = outN && toPrice ? outN.times(toPrice).toNumber() : null;
  // Value lost vs spot prices: pool fees + price impact. Thin pools (e.g.
  // selling PLEX) can lose most of the value — warn instead of letting it slip by.
  const impact = inUsd && outUsd != null && inUsd > 0 ? Math.max(0, 1 - outUsd / inUsd) : null;
  const rate =
    quote && quote.amountIn > 0n && outN
      ? outN.dividedBy(new BigNumber(quote.amountIn.toString()).shiftedBy(-from.decimals))
      : null;
  const priceText = rate
    ? inverted
      ? `1 ${to.symbol} ≈ ${new BigNumber(1).dividedBy(rate).decimalPlaces(8).toFormat()} ${from.symbol}`
      : `1 ${from.symbol} ≈ ${rate.decimalPlaces(rate.gte(1) ? 4 : 8).toFormat()} ${to.symbol}`
    : '—';
  const feeUsd =
    quote && fromPrice
      ? new BigNumber(quote.platformFee.toString()).shiftedBy(-from.decimals).times(fromPrice).toNumber() +
        (inUsd ?? 0) * quote.route.fees.reduce((s, f) => s + f / 1_000_000, 0)
      : null;

  const cta =
    phase === 'done'
      ? { label: 'New swap', onPress: reset, disabled: false }
      : phase === 'error' && submitted
        ? { label: 'Start over', onPress: reset, disabled: false }
        : {
            label: !amountText ? 'Enter an amount' : overBalance ? 'Insufficient balance' : feeBlock ? 'Keep HBAR for fees' : phase === 'quoting' ? 'Finding the best route…' : 'Confirm Swap',
            onPress: onExecute,
            disabled: phase !== 'quoted' || overBalance || feeBlock || !quote,
          };

  return (
    <Screen
      scroll
      edges={['top']}
      footer={<Button label={cta.label} onPress={cta.onPress} disabled={cta.disabled} loading={busy || phase === 'quoting'} />}
    >
      <ExchangeCard
        label="You pay"
        value={amountText}
        onChangeText={(t) => setAmountText(sanitizeAmountInput(t))}
        editable={!busy}
        token={<TokenPill symbol={from.symbol} icon={from.icon} onPress={busy ? undefined : () => setPicker('from')} />}
        left={inUsd != null ? usd(inUsd) : '$0.00'}
        right={`${fromAvail.decimalPlaces(6, BigNumber.ROUND_DOWN).toFormat()} ${from.symbol}${reserved[from.symbol] ? ' free' : ''} · Max`}
        onRightPress={busy ? undefined : onUseMax}
      />
      <FlipButton onPress={onFlip} disabled={busy} />
      <ExchangeCard
        label="You receive"
        value={outN ? outN.decimalPlaces(8, BigNumber.ROUND_DOWN).toFormat() : phase === 'quoting' ? '…' : ''}
        editable={false}
        token={<TokenPill symbol={to.symbol} icon={to.icon} onPress={busy ? undefined : () => setPicker('to')} />}
        left={outUsd != null ? usd(outUsd) : ' '}
        right={`${new BigNumber(balanceOf(to)).decimalPlaces(6, BigNumber.ROUND_DOWN).toFormat()} ${to.symbol}`}
      />

      {overBalance ? (
        <Text variant="small" color="error" style={{ marginTop: 10 }}>
          More than your available {from.symbol}{reserved[from.symbol] ? ` (${reserved[from.symbol]} is set aside for open orders)` : ''}.
        </Text>
      ) : null}
      {feeMessage ? (
        <Text variant="small" color={feeBlock ? 'error' : 'brand'} style={{ marginTop: 10 }}>{feeMessage}</Text>
      ) : null}

      <View style={{ marginTop: 14 }}>
        <DetailsCard>
          <DetailRow
            label="Provider"
            value={quote ? `SaucerSwap · ${routeLabel(quote.route)}` : 'SaucerSwap'}
            info="Swaps run on SaucerSwap V2, Hedera's main DEX. NBX-go checks every route between the two tokens and picks the one that gives you the most."
          />
          <DetailRow label="Price" value={priceText} info="The rate this quote executes at. Tap the value to flip it." onPress={rate ? () => setInverted((v) => !v) : undefined} />
          <DetailRow
            label="Fees"
            value={feeUsd != null ? `${usd(feeUsd)} · 0.03% + pool ${quote!.route.fees.map((f) => `${f / 10_000}%`).join('/')}` : '0.03% + pool fee'}
            info="A 0.03% NBX platform fee plus SaucerSwap's pool fee (0.05%–1% per hop, already inside the quote). Hedera network fees are paid in HBAR."
          />
          <DetailRow
            label="Price impact"
            value={impact != null ? `${(impact * 100).toFixed(2)}%` : '—'}
            valueColor={impact != null && impact > 0.05 ? 'error' : 'textPrimary'}
            info="How much less you get than the market price, from fees and the pool's depth. Above 5% means the pool is thin for this amount."
          />
          <DetailRow
            label="Slippage"
            value={`${slippage * 100}%`}
            info="The most the price may move before the swap reverts. Tap to change."
            onPress={busy ? undefined : () => setSlippage(SLIPPAGES[(SLIPPAGES.indexOf(slippage) + 1) % SLIPPAGES.length])}
          />
          {quote ? (
            <DetailRow
              label="Minimum received"
              value={`${fmt(quote.amountOutMin, to.decimals)} ${to.symbol}`}
              info="If the swap would give less than this, it reverts and nothing is spent but a network fee."
            />
          ) : null}
        </DetailsCard>
      </View>

      {impact != null && impact > 0.05 ? (
        <Text variant="small" color="error" style={{ marginTop: 10 }}>
          You’d get {(impact * 100).toFixed(0)}% less than the market value — this pool is thin in this direction. Try a smaller amount.
        </Text>
      ) : null}
      {quote?.needsAssociation ? (
        <Text variant="small" color="textSecondary" style={{ marginTop: 10 }}>
          Your account isn’t set up for {to.symbol} yet — the first step associates it (a small HBAR fee).
        </Text>
      ) : null}
      {status ? <Text variant="small" color={phase === 'done' ? 'success' : 'textSecondary'} style={{ marginTop: 12 }}>{status}</Text> : null}
      {error ? <Text variant="small" color="error" style={{ marginTop: 12 }}>{error}</Text> : null}
      {hash ? (
        <Pressable onPress={() => Linking.openURL(`${HEDERA_EXPLORER_URL}/transaction/${hash}`)} style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 10 }}>
          <Text variant="small" color="brand">View on HashScan</Text>
          <ExternalLink size={14} color={theme.colors.brand} />
        </Pressable>
      ) : null}

      <Modal visible={picker !== null} animationType="slide" onRequestClose={() => setPicker(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bgPrimary }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 }}>
            <Text variant="headTitle">{picker === 'from' ? 'You pay' : 'You receive'}</Text>
            <Pressable onPress={() => setPicker(null)} hitSlop={12}>
              <X size={22} color={theme.colors.textPrimary} />
            </Pressable>
          </View>
          <AssetSelector tokens={pickerTokens} recentTokens={recent} onSelectToken={onSelectToken} />
        </SafeAreaView>
      </Modal>
    </Screen>
  );
}
