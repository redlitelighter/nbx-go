/**
 * Exchange UI pieces shared by Swap and Trade (after the "Exchange Assets"
 * reference, in NBX orange): a pay/receive card with a big amount and a
 * token pill, the round flip button between cards, and a details card of
 * label ⓘ — value rows.
 */
import React from 'react';
import { Image, Pressable, TextInput, View, Alert, type ImageSourcePropType } from 'react-native';
import { ArrowUpDown, ChevronDown, ChevronRight, Info } from 'lucide-react-native';
import { Text } from './Text';
import { useTheme } from '@/theme';

export function TokenPill({ symbol, icon, onPress, disabled }: { symbol: string; icon?: ImageSourcePropType; onPress?: () => void; disabled?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      hitSlop={6}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingLeft: 6,
        paddingRight: onPress ? 10 : 12,
        height: 36,
        borderRadius: 18,
        backgroundColor: theme.colors.bgTertiary,
      }}
    >
      {icon ? <Image source={icon} style={{ width: 24, height: 24, borderRadius: 12 }} /> : null}
      <Text variant="body" style={{ fontWeight: '600' }}>{symbol}</Text>
      {onPress ? <ChevronDown size={16} color={theme.colors.textSecondary} /> : null}
    </Pressable>
  );
}

export function ExchangeCard({
  label,
  value,
  onChangeText,
  editable = true,
  placeholder = '0',
  token,
  left,
  right,
  onRightPress,
}: {
  label: string;
  value: string;
  onChangeText?: (t: string) => void;
  editable?: boolean;
  placeholder?: string;
  token: React.ReactNode;
  /** Under the amount, e.g. "$5.96". */
  left?: string;
  /** Under the pill, e.g. the balance. */
  right?: string;
  onRightPress?: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ padding: 16, borderRadius: 20, backgroundColor: theme.colors.bgSecondary }}>
      <Text variant="small" color="textSecondary">{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 12 }}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          editable={editable && !!onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textDisabled}
          keyboardType="decimal-pad"
          numberOfLines={1}
          style={{ flex: 1, fontSize: 30, fontWeight: '600', color: theme.colors.textPrimary, fontVariant: ['tabular-nums'], padding: 0 }}
        />
        {token}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
        <Text variant="small" color="textSecondary" style={{ fontVariant: ['tabular-nums'] }}>{left ?? ' '}</Text>
        <Pressable onPress={onRightPress} disabled={!onRightPress} hitSlop={6}>
          <Text variant="small" color={onRightPress ? 'brand' : 'textSecondary'} style={{ fontVariant: ['tabular-nums'] }}>{right ?? ' '}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Round orange flip button that overlaps the two cards. */
export function FlipButton({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'center', marginVertical: -16, zIndex: 2 }}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityLabel="Flip"
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.brand,
          borderWidth: 4,
          borderColor: theme.colors.bgPrimary,
        }}
      >
        <ArrowUpDown size={18} color="#fff" />
      </Pressable>
    </View>
  );
}

export function DetailsCard({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return <View style={{ padding: 16, borderRadius: 20, backgroundColor: theme.colors.bgSecondary, gap: 14 }}>{children}</View>;
}

/** label ⓘ ········ value (›). Tapping ⓘ explains the row. */
export function DetailRow({
  label,
  value,
  info,
  onPress,
  valueColor,
}: {
  label: string;
  value: string;
  info?: string;
  onPress?: () => void;
  valueColor?: 'textPrimary' | 'error' | 'success' | 'brand';
}) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <Pressable
        onPress={() => info && Alert.alert(label, info)}
        disabled={!info}
        hitSlop={6}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
      >
        <Text variant="small" color="textSecondary">{label}</Text>
        {info ? <Info size={13} color={theme.colors.textDisabled} /> : null}
      </Pressable>
      <Pressable onPress={onPress} disabled={!onPress} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
        <Text variant="small" color={valueColor ?? 'textPrimary'} style={{ fontWeight: '600', textAlign: 'right', fontVariant: ['tabular-nums'], flexShrink: 1 }}>
          {value}
        </Text>
        {onPress ? <ChevronRight size={14} color={theme.colors.textSecondary} /> : null}
      </Pressable>
    </View>
  );
}
