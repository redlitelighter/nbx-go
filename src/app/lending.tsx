/**
 * Earn — SAUCE single-sided staking on SaucerSwap (services/stakingService.ts).
 * Stake SAUCE for xSAUCE, which grows in SAUCE as SaucerSwap fees flow in;
 * unstake any time. Hedera only. No SAUCE yet? "Get SAUCE" opens Swap.
 *
 * Route kept as /lending (GO and Home link here).
 */
import React, { useEffect, useState } from 'react';
import { View, TextInput, Alert, Linking, Image, type ImageSourcePropType } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import BigNumber from 'bignumber.js';
import * as LocalAuthentication from 'expo-local-authentication';
import { withoutAutoLock } from '@/state/lockSuppression';
import { useHbarForFees } from '@/hooks/useHbarForFees';
import { Screen, ScreenHeader, Text, Button, Pill, Card, Tap, TokenPill } from '@/components';
import { TrendingUp, Layers, Wallet, Repeat, ArrowDownToLine, ArrowUpFromLine, Info, Unlock } from 'lucide-react-native';
import { useTheme } from '@/theme';
import { useHederaAccount } from '@/hooks/useHederaAccount';
import { HEDERA_EXPLORER_URL } from '@/config/hedera';
import { SAUCE, XSAUCE, getPosition, previewStake, stake, useStakingStats, type StakeStep } from '@/services/stakingService';
import { friendlyTxError } from '@/services/saucerService';

type Mode = 'stake' | 'unstake';

const DECIMALS = 6; // SAUCE and xSAUCE
const fmt = (v: bigint, dp = 4) => new BigNumber(v.toString()).shiftedBy(-DECIMALS).decimalPlaces(dp, BigNumber.ROUND_DOWN).toFormat();
const pct = (v: number | null | undefined) => (v == null ? '—' : `${(v * 100).toFixed(2)}%`);

function toUnits(text: string): bigint | null {
  try {
    const n = new BigNumber(text);
    if (n.isNaN() || n.lte(0)) return null;
    return BigInt(n.shiftedBy(DECIMALS).integerValue(BigNumber.ROUND_DOWN).toFixed(0));
  } catch {
    return null;
  }
}

async function confirm(message: string): Promise<boolean> {
  const [hw, enrolled] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]);
  if (hw && enrolled) return (await withoutAutoLock(() => LocalAuthentication.authenticateAsync({ promptMessage: message }))).success;
  return new Promise((resolve) =>
    Alert.alert('Confirm', `${message} on Hedera mainnet?`, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Confirm', onPress: () => resolve(true) },
    ]),
  );
}

const STEP_TEXT: Record<StakeStep, string> = {
  associate: 'Setting up your account for the token…',
  approve: 'Approving…',
  submit: 'Submitting…',
};

export default function EarnScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { account, address } = useHederaAccount();
  const stats = useStakingStats();

  // Prefill from GO (/lending?amount=100&mode=unstake).
  const params = useLocalSearchParams<{ amount?: string; mode?: string }>();
  const [mode, setMode] = useState<Mode>(params.mode === 'unstake' || params.mode === 'withdraw' ? 'unstake' : 'stake');
  const [amountText, setAmountText] = useState(params.amount && /^\d+(\.\d+)?$/.test(params.amount) ? params.amount : '');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; error?: boolean; hash?: string } | null>(null);

  const position = useQuery({
    queryKey: ['sauce-staking-position', address],
    enabled: !!address,
    queryFn: () => getPosition(address),
  });

  const amount = toUnits(amountText);
  // Staking takes up to three Hedera transactions (associate, approve, enter/leave), each paid in HBAR.
  const fees = useHbarForFees();
  const cap = mode === 'stake' ? position.data?.sauce : position.data?.xsauce;
  const over = amount != null && cap != null && amount > cap;
  const [give, get] = mode === 'stake' ? [SAUCE, XSAUCE] : [XSAUCE, SAUCE];

  // What the user gets back, at the live Mothership ratio.
  const [preview, setPreview] = useState<bigint | null>(null);
  useEffect(() => {
    setPreview(null);
    if (amount == null) return;
    const t = setTimeout(() => previewStake(mode, amount).then(setPreview).catch(() => setPreview(null)), 350);
    return () => clearTimeout(t);
  }, [mode, amountText]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async () => {
    if (amount == null || over) return;
    const label = `${mode === 'stake' ? 'Stake' : 'Unstake'} ${amountText} ${give.symbol === 'XSAUCE' ? 'xSAUCE' : 'SAUCE'}`;
    if (!(await confirm(label))) return;
    setBusy(true);
    setStatus({ text: 'Starting…' });
    try {
      const hash = await stake(account, mode, amount, (s) => setStatus({ text: STEP_TEXT[s] }));
      setStatus({ text: mode === 'stake' ? 'Staked — you now hold more xSAUCE.' : 'Unstaked — SAUCE is back in your wallet.', hash });
      setAmountText('');
      position.refetch();
    } catch (e: any) {
      setStatus({ text: friendlyTxError(e), error: true });
    } finally {
      setBusy(false);
    }
  };

  const sym = (t: typeof SAUCE) => (t.symbol === 'XSAUCE' ? 'xSAUCE' : 'SAUCE');

  return (
    <Screen
      scroll
      edges={['top', 'bottom']}
      footer={
        <Button
          label={mode === 'stake' ? 'Stake SAUCE' : 'Unstake xSAUCE'}
          onPress={run}
          loading={busy}
          disabled={busy || amount == null || over || !address || fees.empty}
        />
      }
    >
      <ScreenHeader title="Earn" onBack={() => router.back()} />

      <Card style={{ padding: 18, borderRadius: 20, borderWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flexDirection: 'row' }}>
            <Image source={SAUCE.icon} style={{ width: 32, height: 32, borderRadius: 16 }} />
            <Image source={XSAUCE.icon} style={{ width: 32, height: 32, borderRadius: 16, marginLeft: -10, borderWidth: 2, borderColor: theme.colors.bgSecondary }} />
          </View>
          <Text variant="small" color="textSecondary">SaucerSwap · SAUCE staking · Hedera</Text>
        </View>
        <Text variant="balance" style={{ fontWeight: '600', marginTop: 10, fontVariant: ['tabular-nums'] }}>
          {stats.isLoading ? '…' : pct(stats.data?.apr30d)}
        </Text>
        <Text variant="small" color="textSecondary">
          APR, 30-day average · 5-day {pct(stats.data?.apr5d)} · variable
        </Text>

        <View style={{ flexDirection: 'row', marginTop: 16, gap: 12 }}>
          <Stat icon={Layers} token={XSAUCE.icon} label="Staked" value={position.data ? `${fmt(position.data.xsauce)} xSAUCE` : '…'} />
          <Stat icon={TrendingUp} token={SAUCE.icon} label="Worth" value={position.data ? `${fmt(position.data.xsauceInSauce)} SAUCE` : '…'} />
        </View>
        <View style={{ flexDirection: 'row', marginTop: 10, gap: 12 }}>
          <Stat icon={Wallet} token={SAUCE.icon} label="In wallet" value={position.data ? `${fmt(position.data.sauce)} SAUCE` : '…'} />
          <Stat icon={Repeat} label="Rate" value={stats.data?.ratio ? `1 xSAUCE = ${stats.data.ratio.toFixed(4)} SAUCE` : '—'} />
        </View>
      </Card>

      {position.data && position.data.sauce === 0n && mode === 'stake' ? (
        <Tap
          onPress={() => router.navigate({ pathname: '/swap', params: { from: 'hedera:USDT0', to: 'hedera:SAUCE' } })}
          pressedColor={theme.colors.pressed}
          style={{ marginTop: 12, padding: 14, borderRadius: 16, backgroundColor: theme.colors.bgSecondary }}
        >
          <Text variant="body" style={{ fontWeight: '600' }}>Get SAUCE</Text>
          <Text variant="small" color="textSecondary">Swap USDT0 or HBAR for SAUCE on SaucerSwap first.</Text>
        </Tap>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
        <ModePill label="Stake" Icon={ArrowDownToLine} active={mode === 'stake'} onPress={() => setMode('stake')} />
        <ModePill label="Unstake" Icon={ArrowUpFromLine} active={mode === 'unstake'} onPress={() => setMode('unstake')} />
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginTop: 12,
          paddingHorizontal: 16,
          height: 60,
          borderRadius: 16,
          backgroundColor: theme.colors.bgSecondary,
        }}
      >
        <TextInput
          value={amountText}
          onChangeText={(t) => setAmountText(t.replace(/[^0-9.]/g, ''))}
          placeholder="0.00"
          placeholderTextColor={theme.colors.textDisabled}
          keyboardType="decimal-pad"
          editable={!busy}
          style={{ flex: 1, fontSize: 24, fontWeight: '600', color: theme.colors.textPrimary, fontVariant: ['tabular-nums'] }}
        />
        <View style={{ marginRight: 10 }}>
          <TokenPill symbol={sym(give)} icon={give.icon} />
        </View>
        <Pill label="Max" onPress={() => cap != null && setAmountText(fmt(cap, 6).replace(/,/g, ''))} />
      </View>
      {over ? (
        <Text variant="small" color="error" style={{ marginTop: 6 }}>More than your {sym(give)} balance</Text>
      ) : preview != null ? (
        <Text variant="small" color="textSecondary" style={{ marginTop: 6 }}>You receive ≈ {fmt(preview)} {sym(get)}</Text>
      ) : null}

      {fees.message ? (
        <Text variant="small" color={fees.empty ? 'error' : 'brand'} style={{ marginTop: 8 }}>{fees.message}</Text>
      ) : null}

      {status ? (
        <Tap onPress={() => status.hash && Linking.openURL(`${HEDERA_EXPLORER_URL}/transaction/${status.hash}`)} style={{ marginTop: 12 }}>
          <Text variant="small" color={status.error ? 'error' : 'textSecondary'}>
            {status.text}{status.hash ? ' · View on HashScan' : ''}
          </Text>
        </Tap>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
        <Unlock size={16} color={theme.colors.textSecondary} style={{ marginTop: 2 }} />
      <Text variant="small" color="textSecondary" style={{ flex: 1 }}>
        xSAUCE has no lock-up — unstake any time at the current rate. The rate rises as SaucerSwap fees are added to the pool; APR is a past
        average, not a promise. Each step costs a small HBAR network fee.
      </Text>
      </View>
    </Screen>
  );
}

function Stat({ label, value, icon: Icon, token }: { label: string; value: string; icon: React.ElementType; token?: ImageSourcePropType }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {token ? <Image source={token} style={{ width: 16, height: 16, borderRadius: 8 }} /> : <Icon size={14} color={theme.colors.brand} />}
        <Text variant="small" color="textSecondary">{label}</Text>
      </View>
      <Text variant="body" style={{ fontWeight: '600', marginTop: 2, fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}

function ModePill({ label, Icon, active, onPress }: { label: string; Icon: React.ElementType; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Tap
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        height: 36,
        borderRadius: 18,
        backgroundColor: active ? theme.colors.brand : theme.colors.bgSecondary,
      }}
    >
      <Icon size={15} color={active ? '#fff' : theme.colors.textSecondary} />
      <Text variant="small" style={{ fontWeight: '600', color: active ? '#fff' : theme.colors.textPrimary }}>{label}</Text>
    </Tap>
  );
}
