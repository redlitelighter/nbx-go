import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  DarkTheme as NavDarkTheme,
  DefaultTheme as NavDefaultTheme,
  ThemeProvider as NavThemeProvider,
} from "@react-navigation/native";
import * as NavigationBar from "expo-navigation-bar";
import * as SystemUI from "expo-system-ui";
import { WdkAppProvider } from "@tetherto/wdk-react-native-core";
import { ThemeProvider, useTheme } from "@/theme";
import { UiKitThemeBridge } from "@/theme/UiKitThemeBridge";
import { wdkConfigs } from "@/wdk/config";
// Generated worklet bundle (produced by `wdk-worklet-bundler generate`).
import wdkBundle from "../../.wdk-bundle/wdk-worklet.bundle.js";
import AutoLockOnBackground from "@/wdk/hooks/AutoLockOnBackground";
import { WdkSessionGate } from "@/wdk/hooks/WdkSessionGate";
import "react-native-get-random-values";
import { CloudBackupProvider } from "@/wdk/cloud-backup/CloudBackupContext";
import { Toast } from "@/components";
import { AccountDiscovery } from "@/wdk/hooks/AccountDiscovery";
import "./global.css";

function useEdgeToEdge() {
  const theme = useTheme();
  useEffect(() => {
    (async () => {
      try {
        // expo-navigation-bar's style names the BAR, not its buttons (seen
        // on device: "light" drew a light bar with dark buttons under the
        // dark theme), so it matches the theme mode directly.
        await NavigationBar.setStyle(theme.mode);
      } catch {}
      // The root view shows through under the edge-to-edge nav bar; app.json's
      // userInterfaceStyle is "light", so without this it's a light band
      // under the dark tab bar.
      try {
        await SystemUI.setBackgroundColorAsync(theme.colors.bgSecondary);
      } catch {}
    })();
  }, [theme.mode, theme.colors.bgSecondary]);
}

function RootStack() {
  const theme = useTheme();
  useEdgeToEdge();
  // React Navigation paints its own background (white by default) behind
  // every navigator — it showed through the tab bar's rounded corners on
  // Home. Give it the app's palette instead.
  const navTheme = {
    ...(theme.mode === 'dark' ? NavDarkTheme : NavDefaultTheme),
    colors: {
      ...(theme.mode === 'dark' ? NavDarkTheme : NavDefaultTheme).colors,
      background: theme.colors.bgPrimary,
      card: theme.colors.bgSecondary,
      border: theme.colors.border,
      primary: theme.colors.brand,
      text: theme.colors.textPrimary,
    },
  };
  return (
    <NavThemeProvider value={navTheme}>
    <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.bgPrimary },
      }}
    >
      <Stack.Screen name="(onboarding)" />
      <Stack.Screen name="(app)" />
      <Stack.Screen name="unlock" />
      <Stack.Screen
        name="send"
        options={{
          presentation: "fullScreenModal",
          animation: "slide_from_bottom",
        }}
      />
      <Stack.Screen
        name="receive"
        options={{
          presentation: "fullScreenModal",
          animation: "slide_from_bottom",
        }}
      />
      <Stack.Screen name="accounts" />
      <Stack.Screen name="tx" />
      <Stack.Screen
        name="xc-chat"
        options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }}
      />
    </Stack>
    </NavThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <WdkAppProvider
      wdkConfigs={wdkConfigs}
      bundle={{ bundle: wdkBundle as string }}
    >
      <AutoLockOnBackground />
      <AccountDiscovery />
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ThemeProvider>
            <UiKitThemeBridge>
              <CloudBackupProvider>
                <WdkSessionGate />
                <RootStack />
                <Toast />
              </CloudBackupProvider>
            </UiKitThemeBridge>
          </ThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </WdkAppProvider>
  );
}
