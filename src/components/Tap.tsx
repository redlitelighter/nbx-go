import React, { useState } from 'react';
import { Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

interface TapProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** Background while pressed. */
  pressedColor?: string;
}

/**
 * Pressable with ONE flat style object plus a pressed background.
 *
 * Real bug this avoids, confirmed on device: NativeWind's JSX wrapper
 * (react-native-css-interop) drops Pressable's style on Android unless it is
 * a single plain object — both the function form `({ pressed }) => …` and an
 * array `[a, b]` were ignored, so `flexDirection: 'row'` and backgrounds
 * never applied and rows rendered as stacked columns. Plain-object styles
 * (e.g. Home's round icon buttons) worked. So everything is flattened here.
 */
export function Tap({ style, pressedColor, onPressIn, onPressOut, ...rest }: TapProps) {
  const [pressed, setPressed] = useState(false);
  const flat = StyleSheet.flatten([style, pressed && pressedColor ? { backgroundColor: pressedColor } : null]);
  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        onPressOut?.(e);
      }}
      style={flat}
    />
  );
}
