import React, { createContext, useContext, useMemo, useCallback } from 'react';
import { lightPalette, darkPalette, type Palette } from './palettes';
import { usePrefs } from '@/state/prefs';
import { fonts, typography, spacing, radii, layout } from './tokens';

/**
 * Theme system.
 *
 * - Default mode is 'dark', following the dark-first trading design the app
 *   now uses. Change DEFAULT_MODE below, or call setMode()/toggleMode() at
 *   runtime, to use light (the original v2 prototype).
 * - Both palettes share identical token names, so a theme is just a palette
 *   swap — no component touches raw colors.
 * - To follow the OS setting instead, wire `useColorScheme()` into the initial
 *   mode; left off by default so the app is deterministically v2 until changed.
 */
export type ThemeMode = 'light' | 'dark';

const DEFAULT_MODE: ThemeMode = 'dark';

const palettes: Record<ThemeMode, Palette> = {
  light: lightPalette,
  dark: darkPalette,
};

export interface Theme {
  mode: ThemeMode;
  colors: Palette;
  fonts: typeof fonts;
  typography: typeof typography;
  spacing: typeof spacing;
  radii: typeof radii;
  layout: typeof layout;
}

interface ThemeContextValue extends Theme {
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
  initialMode?: ThemeMode;
}) {
  // The mode lives in the persisted prefs store (Settings → Appearance).
  const mode = usePrefs((s) => s.theme) ?? DEFAULT_MODE;
  const setMode = usePrefs((s) => s.setTheme);
  const toggleMode = useCallback(() => setMode(usePrefs.getState().theme === 'light' ? 'dark' : 'light'), [setMode]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      colors: palettes[mode],
      fonts,
      typography,
      spacing,
      radii,
      layout,
      setMode,
      toggleMode,
    }),
    [mode, setMode, toggleMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
