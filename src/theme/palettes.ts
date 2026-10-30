/**
 * Color palettes. Both themes expose the SAME token names, so components
 * reference semantic tokens (e.g. `colors.textPrimary`) and never raw hex.
 * Adding/adjusting a theme means editing only this file.
 *
 * The `light` palette is extracted verbatim from the v2 prototype.
 * The `dark` palette is a first-pass mapping of the same tokens; tune freely.
 */

export interface Palette {
  // Brand
  brand: string;
  brandPressed: string;
  brandTint: string;
  brandTintPressed: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textDisabled: string;

  // Backgrounds / surfaces
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;

  // Borders / interaction
  border: string;
  borderStrong: string;
  pressed: string;
  disabledBg: string;

  // Status
  success: string;
  successTint: string;
  error: string;

  // Token brand colors (chain/token identity — same across themes)
  usdt: string;
  ethereum: string;
  bitcoin: string;
  tron: string;

  // Fixed
  white: string;
  black: string;
}

export const lightPalette: Palette = {
  brand: '#FF4E00',
  brandPressed: '#CC3E00',
  brandTint: 'rgba(255,78,0,0.16)',
  brandTintPressed: 'rgba(204,62,0,0.16)',

  textPrimary: '#171717',
  textSecondary: 'rgba(23,23,23,0.6)',
  textDisabled: 'rgba(23,23,23,0.3)',

  bgPrimary: '#FFFFFF',
  bgSecondary: '#FAF7F5',
  bgTertiary: 'rgba(255,255,255,0.75)',

  border: '#EBE4E1',
  borderStrong: '#D9D9D9',
  pressed: 'rgba(0,0,0,0.08)',
  disabledBg: 'rgba(0,0,0,0.06)',

  success: '#27AE60',
  successTint: 'rgba(39,174,96,0.12)',
  error: '#EB5757',

  usdt: '#26A17B',
  ethereum: '#627EEA',
  bitcoin: '#F7931A',
  tron: '#FF060A',

  white: '#FFFFFF',
  black: '#171717',
};

// Dark is the default (ThemeProvider DEFAULT_MODE). Layout after the
// "Crypto Trading Mobile App" Figma reference; surfaces after the
// design-taste-frontend skill's `true-black-flat` style: elevation is a
// lightness step alone (ground → surface → raised), borders sit at surface
// tone so they read as a tone step rather than a line, and the one accent
// (orange) is kept to primary actions and the active tab.
export const darkPalette: Palette = {
  brand: '#FF5A0F',
  brandPressed: '#E24E00',
  brandTint: 'rgba(255,90,15,0.16)',
  brandTintPressed: 'rgba(226,78,0,0.22)',

  textPrimary: '#FFFFFF',
  textSecondary: '#B4B4B4',
  textDisabled: '#6B6B6B',

  bgPrimary: '#050505',
  bgSecondary: '#121212',
  bgTertiary: '#242424',

  border: '#181818',
  borderStrong: '#333333',
  pressed: 'rgba(255,255,255,0.07)',
  disabledBg: 'rgba(255,255,255,0.06)',

  success: '#22C55E',
  successTint: 'rgba(34,197,94,0.14)',
  error: '#EF4444',

  usdt: '#26A17B',
  ethereum: '#627EEA',
  bitcoin: '#F7931A',
  tron: '#FF060A',

  white: '#FFFFFF',
  black: '#000000',
};
