import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

/**
 * App preferences (zustand, persisted with expo-secure-store): light/dark
 * theme, favourite coins on Home, and whether the beta terms were accepted.
 */
export type ThemeMode = 'light' | 'dark';

const KEY = 'prefs.v1';
export const DEFAULT_FAVORITES = ['HBAR', 'SAUCE'];
/** Bump when the terms change so everyone accepts the new version. */
export const TERMS_VERSION = 1;

interface PrefsState {
  theme: ThemeMode;
  favorites: string[];
  termsAccepted: number;
  loaded: boolean;
  load: () => Promise<void>;
  setTheme: (t: ThemeMode) => void;
  toggleFavorite: (symbol: string) => void;
  acceptTerms: () => void;
}

export const usePrefs = create<PrefsState>((set, get) => {
  const save = () => {
    const { theme, favorites, termsAccepted } = get();
    SecureStore.setItemAsync(KEY, JSON.stringify({ theme, favorites, termsAccepted })).catch(() => {});
  };
  return {
    theme: 'dark',
    favorites: DEFAULT_FAVORITES,
    termsAccepted: 0,
    loaded: false,
    load: async () => {
      try {
        const raw = await SecureStore.getItemAsync(KEY);
        const p = raw ? JSON.parse(raw) : {};
        set({
          theme: p.theme === 'light' ? 'light' : 'dark',
          favorites: Array.isArray(p.favorites) && p.favorites.length ? p.favorites : DEFAULT_FAVORITES,
          termsAccepted: typeof p.termsAccepted === 'number' ? p.termsAccepted : 0,
          loaded: true,
        });
      } catch {
        set({ loaded: true });
      }
    },
    setTheme: (theme) => {
      set({ theme });
      save();
    },
    toggleFavorite: (symbol) => {
      const favs = get().favorites;
      set({ favorites: favs.includes(symbol) ? favs.filter((s) => s !== symbol) : [...favs, symbol] });
      save();
    },
    acceptTerms: () => {
      set({ termsAccepted: TERMS_VERSION });
      save();
    },
  };
});

// Load once at startup.
usePrefs.getState().load();
