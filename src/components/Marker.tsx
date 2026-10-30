/**
 * Marker — the small status glyph beside a task or step (native take on
 * shadcn's Marker): a hollow ring while pending, a pulsing brand dot while
 * running, a check when done, a cross on error, a square when stopped.
 */
import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, cancelAnimation } from 'react-native-reanimated';
import { Check, X, Square } from 'lucide-react-native';
import { useTheme } from '@/theme';

export type MarkerStatus = 'pending' | 'active' | 'done' | 'error' | 'stopped';

export function Marker({ status, size = 16 }: { status: MarkerStatus; size?: number }) {
  const theme = useTheme();
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (status === 'active') pulse.value = withRepeat(withTiming(0.35, { duration: 650 }), -1, true);
    else {
      cancelAnimation(pulse);
      pulse.value = 1;
    }
  }, [status, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const box = { width: size, height: size, borderRadius: size / 2, alignItems: 'center' as const, justifyContent: 'center' as const };
  const icon = Math.round(size * 0.62);

  switch (status) {
    case 'active':
      return (
        <View style={box}>
          <Animated.View style={[{ width: size * 0.55, height: size * 0.55, borderRadius: size, backgroundColor: theme.colors.brand }, pulseStyle]} />
        </View>
      );
    case 'done':
      return (
        <View style={[box, { backgroundColor: theme.colors.success }]}>
          <Check size={icon} color="#fff" strokeWidth={3} />
        </View>
      );
    case 'error':
      return (
        <View style={[box, { backgroundColor: theme.colors.error }]}>
          <X size={icon} color="#fff" strokeWidth={3} />
        </View>
      );
    case 'stopped':
      return (
        <View style={[box, { backgroundColor: theme.colors.bgTertiary }]}>
          <Square size={icon - 2} color={theme.colors.textSecondary} fill={theme.colors.textSecondary} />
        </View>
      );
    default:
      return <View style={[box, { borderWidth: 1.5, borderColor: theme.colors.borderStrong }]} />;
  }
}
