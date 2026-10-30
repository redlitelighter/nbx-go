/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    './App.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Brand
        brand:            'var(--color-brand)',
        'brand-pressed':  'var(--color-brand-pressed)',
        'brand-tint':     'var(--color-brand-tint)',

        // Text
        'text-primary':   'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-disabled':  'var(--color-text-disabled)',

        // Surfaces
        'bg-primary':     'var(--color-bg-primary)',
        'bg-secondary':   'var(--color-bg-secondary)',
        'bg-tertiary':    'var(--color-bg-tertiary)',

        // Borders
        border:           'var(--color-border)',
        'border-strong':  'var(--color-border-strong)',

        // Status
        success:          'var(--color-success)',
        'success-tint':   'var(--color-success-tint)',
        error:            'var(--color-error)',

        // Token identity
        usdt:             '#26A17B',
        ethereum:         '#627EEA',
        bitcoin:          '#F7931A',
        tron:             '#FF060A',

        // XC AI special
        'xc-from':        '#7C3AED',
        'xc-to':          '#4F46E5',

        // Fixed
        white: '#FFFFFF',
        black: '#000000',
      },
      fontFamily: {
        sans:  ['Inter-Regular', 'System'],
        medium:['Inter-Medium',  'System'],
        bold:  ['Inter-Bold',    'System'],
        mono:  ['Menlo', 'monospace'],
      },
      borderRadius: {
        sm:   '8px',
        md:   '12px',
        lg:   '14px',
        pill: '999px',
      },
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px',
        '2xl': '24px',
        '3xl': '32px',
      },
    },
  },
  plugins: [],
};
