import React from 'react';
import { Image } from 'react-native';
import { useTheme } from '@/theme';
import { Text } from './Text';

/**
 * NBX-go logo — the official mark (Kenyatta-centre-style tower and pavilion
 * over "NBX-GO", in white and orange). Dark theme shows the artwork alone on
 * the screen's black; light theme shows the full black rounded-square icon,
 * since the white artwork would vanish on a light background.
 *
 * `size` is kept from the old text wordmark (≈ cap height); the image is
 * scaled so existing call sites (Welcome, Unlock, splash, App Info) keep a
 * similar visual weight.
 */
const MARK = require('@/../assets/images/nbx-logo.png');
const ICON = require('@/../assets/images/icon.png');

export function BrandMark({ size = 40 }: { size?: number }) {
  const theme = useTheme();
  const side = Math.round(size * 2.8);
  return (
    <Image
      source={theme.mode === 'dark' ? MARK : ICON}
      accessibilityRole="image"
      accessibilityLabel="NBX-go"
      resizeMode="contain"
      style={{ width: side, height: side, borderRadius: theme.mode === 'dark' ? 0 : side * 0.22 }}
    />
  );
}

/** Small, quiet attribution — the app is built on Tether's Wallet Development Kit. */
export function BuiltOnWdk({ style }: { style?: object }) {
  return (
    <Text variant="small" color="textDisabled" center style={style}>
      Built on WDK by Tether
    </Text>
  );
}
