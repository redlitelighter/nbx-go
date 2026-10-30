/**
 * Going — GO's "working on it" indicator: a step-themed phrase (NBX's slogan
 * is "The next step") with three dots that fill in turn. Phrases rotate
 * while it runs.
 */
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { Text } from './Text';
import { useTheme } from '@/theme';

const DEFAULT_WORDS = ['going', 'calculating steps', 'stepping foot on Hedera', 'taking the next step', 'lining up the steps'];

function Dot({ delay }: { delay: number }) {
  const theme = useTheme();
  const v = useSharedValue(0.25);
  useEffect(() => {
    v.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 320 }), withTiming(0.25, { duration: 320 })), -1));
  }, [delay, v]);
  const style = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ translateY: (1 - v.value) * 2 }] }));
  return <Animated.View style={[{ width: 5, height: 5, borderRadius: 3, backgroundColor: theme.colors.brand }, style]} />;
}

export function Going({ words = DEFAULT_WORDS }: { words?: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % words.length), 1600);
    return () => clearInterval(t);
  }, [words.length]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Text variant="body" color="textSecondary">{words[i]}</Text>
      <View style={{ flexDirection: 'row', gap: 4, paddingTop: 4 }}>
        <Dot delay={0} />
        <Dot delay={160} />
        <Dot delay={320} />
      </View>
    </View>
  );
}
