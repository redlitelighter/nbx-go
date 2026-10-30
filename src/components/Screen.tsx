import React from 'react';
import { View, ScrollView, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { SafeAreaView, SafeAreaProvider, Edge, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';

interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  noPadding?: boolean;
  edges?: Edge[];
  /**
   * Pinned below the content and above the keyboard — use for the primary
   * action (e.g. "Import wallet") so it can never end up hidden behind the
   * keyboard at the bottom of a long scroll view.
   */
  footer?: React.ReactNode;
}

/**
 * Standard screen container: themed background, safe-area aware, 20px padding.
 *
 * FIX for a real bug: screens presented as a native modal (e.g. send/receive,
 * both `presentation: 'fullScreenModal'` in _layout.tsx's Stack) don't
 * reliably inherit safe-area insets from the app-level SafeAreaProvider on
 * iOS — confirmed as a known, documented issue directly in
 * react-native-safe-area-context's own GitHub repo (their README explicitly
 * says to add a SafeAreaProvider "at the root of modals and routes", not
 * just once at the app root). Symptom: the header/back button renders under
 * the status bar specifically on modal-presented screens, while regular
 * pushed screens are unaffected. Wrapping every Screen in its own
 * SafeAreaProvider (cheap — it's just a context provider, not a real native
 * view) re-establishes correct insets regardless of how the screen was
 * presented, fixing this for every current and future screen rather than
 * patching each modal screen individually.
 *
 * Keyboard handling: iOS uses KeyboardAvoidingView 'padding'. Android does
 * NOT — with `edgeToEdgeEnabled` (app.json) the OS no longer resizes the
 * window for the keyboard, so KeyboardAvoidingView 'height' silently does
 * nothing and the keyboard draws over the bottom of the screen (the real
 * bug: Import wallet's button and last word boxes were hidden). Instead we
 * pad by the live keyboard height from Reanimated's useAnimatedKeyboard,
 * which reads the keyboard inset directly and works with edge-to-edge.
 */
export function Screen(props: ScreenProps) {
  return (
    <SafeAreaProvider>
      <ScreenInner {...props} />
    </SafeAreaProvider>
  );
}

function ScreenInner({ children, scroll, noPadding, edges = ['top', 'bottom'], footer }: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const keyboard = useAnimatedKeyboard();
  const bottomInset = edges.includes('bottom') ? insets.bottom : 0;

  // The keyboard height is measured from the screen's bottom edge, which
  // already includes the nav-bar inset SafeAreaView pads for — subtract it
  // so we don't double-pad.
  const keyboardPad = useAnimatedStyle(() => ({
    paddingBottom: Math.max(keyboard.height.value - bottomInset, 0),
  }));

  const padding = noPadding
    ? {}
    : {
        paddingHorizontal: theme.layout.screenPaddingH,
        paddingTop: theme.layout.screenPaddingTop,
        paddingBottom: footer ? 12 : theme.layout.screenPaddingBottom,
      };

  const inner = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.grow, padding]}
      showsVerticalScrollIndicator={false}
      // "always" rather than "handled" — a real bug on Send Amount
      // specifically: Scan sits right next to an actively-focused text
      // input, and on iOS the FIRST tap on a nearby button can get consumed
      // by dismissing the keyboard instead of firing onPress, even with
      // "handled" set. "always" removes that ambiguity entirely — every
      // tap passes through to its target regardless of keyboard/focus state.
      keyboardShouldPersistTaps="always"
      keyboardDismissMode="none"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, padding]}>{children}</View>
  );

  const footerView = footer ? (
    <View
      style={{
        paddingHorizontal: noPadding ? 0 : theme.layout.screenPaddingH,
        paddingTop: 10,
        paddingBottom: noPadding ? 0 : theme.layout.screenPaddingBottom,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.colors.border,
        backgroundColor: theme.colors.bgPrimary,
      }}
    >
      {footer}
    </View>
  ) : null;

  return (
    <SafeAreaView edges={edges} style={[styles.flex, { backgroundColor: theme.colors.bgPrimary }]}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      {Platform.OS === 'ios' ? (
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          {inner}
          {footerView}
        </KeyboardAvoidingView>
      ) : (
        <Animated.View style={[styles.flex, keyboardPad]}>
          {inner}
          {footerView}
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 }, grow: { flexGrow: 1 } });
