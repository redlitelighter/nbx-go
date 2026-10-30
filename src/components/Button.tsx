import React, { useState } from 'react';
import { Pressable, ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme';
import { useResponsive } from '@/theme/responsive';
import { Text } from './Text';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'tinted';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
}

/**
 * Real bug fixed, confirmed on device: the style used to be Pressable's
 * function form `({ pressed }) => [...]`, which NativeWind's Pressable
 * wrapper drops on Android — every primary button rendered with no fill
 * (e.g. "Open Models", "Supply USDT0"). The pressed state is tracked here and
 * the style passed as ONE flat object (same fix as components/Tap.tsx).
 *
 * Fully round, weight 600 — per the design-taste-frontend skill (buttons are
 * square or fully round; nothing above 600 in the true-black-flat style).
 */
export function Button({ label, onPress, variant = 'primary', disabled, loading, icon }: ButtonProps) {
  const theme = useTheme();
  const { moderateScale } = useResponsive();
  const [pressed, setPressed] = useState(false);

  const bg = disabled
    ? theme.colors.disabledBg
    : variant === 'primary'
      ? pressed ? theme.colors.brandPressed : theme.colors.brand
      : variant === 'tinted'
        ? pressed ? theme.colors.brandTintPressed : theme.colors.brandTint
        : pressed ? theme.colors.pressed : 'transparent';
  const labelColor = disabled
    ? 'textDisabled'
    : variant === 'primary' ? 'white'
    : variant === 'secondary' ? 'brand'
    : 'textPrimary';

  const style = StyleSheet.flatten([
    styles.base,
    {
      paddingVertical: moderateScale(14),
      paddingHorizontal: moderateScale(16),
      borderRadius: 999,
      backgroundColor: bg,
      borderWidth: variant === 'secondary' ? 1.5 : 0,
      borderColor: theme.colors.borderStrong,
      transform: [{ scale: pressed ? 0.99 : 1 }],
    },
  ]);

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={style}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? theme.colors.white : theme.colors.brand} />
      ) : (
        <View style={styles.content}>
          {icon ? <View>{icon}</View> : null}
          <Text variant="button" color={labelColor as any} style={styles.label}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { marginTop: 8 },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  label: { textTransform: 'capitalize', fontWeight: '600' },
});
