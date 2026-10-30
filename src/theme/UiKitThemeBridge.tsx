import React from 'react';
import { ThemeProvider as UiKitThemeProvider } from '@tetherto/wdk-uikit-react-native';
import { useTheme } from './ThemeProvider';

/**
 * Feeds the app's own theme (mode + brand color) into the WDK UI Kit's
 * ThemeProvider, so kit components (AmountInput, AssetSelector, …) match the
 * rest of the app. Must sit inside our ThemeProvider.
 *
 * Keyed on mode: the kit only reads `defaultMode` on mount.
 */
export function UiKitThemeBridge({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <UiKitThemeProvider
      key={theme.mode}
      defaultMode={theme.mode}
      brandConfig={{ primaryColor: theme.colors.brand }}
    >
      {children}
    </UiKitThemeProvider>
  );
}
