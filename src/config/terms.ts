/**
 * NBX-go beta terms — shown before creating/importing a wallet
 * ((onboarding)/terms.tsx) and summarised in Settings → Security & Privacy.
 * Bump TERMS_VERSION in state/prefs.ts when these change.
 */
export interface TermPoint {
  title: string;
  body: string;
}

export const TERMS: TermPoint[] = [
  {
    title: 'NBX-go is in beta',
    body: 'Features may change, break or be removed. Use small amounts while we take these first steps together.',
  },
  {
    title: 'Everything is on Hedera',
    body: 'Your wallet, balances and transactions live on Hedera mainnet. Real funds, real network fees in HBAR.',
  },
  {
    title: 'Every swap goes through SaucerSwap',
    body: 'Swaps, buys, sells and limit orders execute on SaucerSwap V2. NBX-go adds a 0.03% platform fee; pool fees and price impact apply.',
  },
  {
    title: 'AI runs offline, on QVAC',
    body: 'GO’s models run on your phone with QVAC. Your chats, voice notes and screenshots never leave the device.',
  },
  {
    title: 'No financial advice',
    body: 'GO shares information and numbers, not advice. NBX will not be held responsible for financial decisions or losses.',
  },
  {
    title: 'Your keys, your responsibility',
    body: 'NBX-go is self-custodial. Only your recovery phrase can restore your wallet — NBX can’t recover it for you.',
  },
];
