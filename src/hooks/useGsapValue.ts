/**
 * src/hooks/useGsapValue.ts
 *
 * GSAP runs as a pure-JS tween engine on a plain-object "proxy".
 * Each frame it updates `obj.v`, which we mirror into a Reanimated
 * shared value so that `useAnimatedStyle` picks up the change on the
 * UI thread without bridge overhead.
 *
 * Usage:
 *   const opacity = useGsapValue(0);
 *   // animate in
 *   opacity.tweenTo(1, { duration: 0.25, ease: 'power2.out' });
 *   // use in animated style
 *   const style = useAnimatedStyle(() => ({ opacity: opacity.sharedValue.value }));
 */
import { useRef } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import gsap from 'gsap';

export interface GsapValue {
  /** The Reanimated shared value — use inside useAnimatedStyle. */
  sharedValue: ReturnType<typeof useSharedValue<number>>;
  /**
   * Tween to `target`. Any valid GSAP tween vars can be passed
   * (duration, ease, delay, onComplete, …) except onUpdate (reserved).
   */
  tweenTo(target: number, vars?: Omit<gsap.TweenVars, 'onUpdate'>): gsap.core.Tween;
  /** Kill any in-flight tween and jump directly to `value`. */
  set(value: number): void;
}

export function useGsapValue(initial: number): GsapValue {
  const sharedValue = useSharedValue(initial);
  // A plain JS object that GSAP mutates each frame
  const proxy = useRef({ v: initial }).current;
  // Keep track of the live tween so we can kill it before starting a new one
  const tweenRef = useRef<gsap.core.Tween | null>(null);

  return {
    sharedValue,
    tweenTo(target, vars = {}) {
      // Kill previous tween before starting a new one to avoid fighting animations
      tweenRef.current?.kill();
      const tween = gsap.to(proxy, {
        v: target,
        duration: 0.22,
        ease: 'power2.out',
        ...vars,
        onUpdate() {
          // Write onto the shared value — Reanimated reads this on the UI thread
          sharedValue.value = proxy.v;
        },
      });
      tweenRef.current = tween;
      return tween;
    },
    set(value: number) {
      tweenRef.current?.kill();
      proxy.v = value;
      sharedValue.value = value;
    },
  };
}
