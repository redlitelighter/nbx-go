/**
 * StopBar — sits above GO's input while GO works or listens: a pulsing stop
 * button, what's happening, and a countdown that drains a progress line.
 * When the countdown reaches zero it calls `onStop` itself, so a stuck
 * model request or a forgotten recording never hangs the chat.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Square } from 'lucide-react-native';
import { Text } from './Text';
import { Tap } from './Tap';
import { useTheme } from '@/theme';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function StopBar({
  mode,
  seconds,
  onStop,
}: {
  mode: 'working' | 'listening';
  /** Auto-stop after this many seconds. */
  seconds: number;
  /** timedOut is true when the countdown ran out rather than a tap. */
  onStop: (timedOut: boolean) => void;
}) {
  const theme = useTheme();
  const [left, setLeft] = useState(seconds);
  // Always call the latest handler (it closes over the current recording / request).
  const stopRef = useRef(onStop);
  stopRef.current = onStop;

  useEffect(() => {
    const started = Date.now();
    setLeft(seconds);
    const t = setInterval(() => {
      const l = Math.max(0, seconds - Math.floor((Date.now() - started) / 1000));
      setLeft(l);
      if (l === 0) {
        clearInterval(t);
        stopRef.current(true);
      }
    }, 250);
    return () => clearInterval(t);
  }, [seconds, mode]);

  // A ring that keeps expanding out of the stop button: "tap me".
  const ring = useSharedValue(0);
  useEffect(() => {
    ring.value = withRepeat(withTiming(1, { duration: 1200, easing: Easing.out(Easing.quad) }), -1, false);
  }, [ring]);
  const ringStyle = useAnimatedStyle(() => ({ opacity: 0.55 * (1 - ring.value), transform: [{ scale: 1 + ring.value * 0.7 }] }));

  const color = mode === 'listening' ? theme.colors.error : theme.colors.brand;
  const urgent = left <= 10;

  return (
    <View style={{ marginHorizontal: 12, marginTop: 4, padding: 10, borderRadius: 18, backgroundColor: theme.colors.bgSecondary, borderWidth: 1, borderColor: theme.colors.border, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: 44, height: 44, borderRadius: 22, backgroundColor: color }, ringStyle]} />
          <Tap
            onPress={() => stopRef.current(false)}
            accessibilityLabel={mode === 'listening' ? 'Stop recording' : 'Stop GO'}
            style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: color }}
          >
            <Square size={15} color="#fff" fill="#fff" />
          </Tap>
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="body" style={{ fontWeight: '600' }}>
            {mode === 'listening' ? 'Listening — speak now' : 'GO is on it'}
          </Text>
          <Text variant="small" color="textSecondary">
            {mode === 'listening' ? 'Tap stop when you’re done' : 'Tap stop to cancel'} · stops by itself at 0:00
          </Text>
        </View>
        <Text variant="tokenName" color={urgent ? 'error' : 'textPrimary'} style={{ fontVariant: ['tabular-nums'] }}>
          {mmss(left)}
        </Text>
      </View>
      <View style={{ height: 3, borderRadius: 2, backgroundColor: theme.colors.border, overflow: 'hidden' }}>
        <View style={{ width: `${(left / seconds) * 100}%`, height: 3, backgroundColor: urgent ? theme.colors.error : color }} />
      </View>
    </View>
  );
}
