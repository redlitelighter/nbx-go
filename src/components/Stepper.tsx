import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { Check } from 'lucide-react-native';
import { useTheme } from '@/theme';
import { useGsapValue } from '@/hooks/useGsapValue';
import { Text } from './Text';

interface StepperProps {
  steps: string[];
  /** Index of the step in progress; `steps.length` means all done. */
  current: number;
  /** Marks the current step as failed. */
  error?: boolean;
}

/** Horizontal step indicator with a GSAP-driven progress bar. */
export function Stepper({ steps, current, error }: StepperProps) {
  const theme = useTheme();
  const progress = useGsapValue(0);

  useEffect(() => {
    const ratio = steps.length > 1 ? Math.min(current, steps.length - 1) / (steps.length - 1) : 1;
    progress.tweenTo(ratio, { duration: 0.35 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, steps.length]);

  const barStyle = useAnimatedStyle(() => ({ width: `${progress.sharedValue.value * 100}%` }));

  return (
    <View>
      <View style={{ height: 3, borderRadius: 2, backgroundColor: theme.colors.border, marginHorizontal: 12, marginTop: 11 }}>
        <Animated.View style={[{ height: 3, borderRadius: 2, backgroundColor: theme.colors.brand }, barStyle]} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: -14 }}>
        {steps.map((label, i) => {
          const done = i < current;
          const active = i === current;
          const failed = active && error;
          const bg = failed ? theme.colors.error : done || active ? theme.colors.brand : theme.colors.bgSecondary;
          return (
            <View key={label + i} style={{ alignItems: 'center', width: 64 }}>
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: bg,
                  borderWidth: done || active ? 0 : 1,
                  borderColor: theme.colors.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {done ? (
                  <Check size={14} color={theme.colors.white} />
                ) : (
                  <Text variant="small" color={active ? 'white' : 'textSecondary'}>{i + 1}</Text>
                )}
              </View>
              <Text variant="small" color={active ? 'textPrimary' : 'textSecondary'} center style={{ marginTop: 4 }}>
                {label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
