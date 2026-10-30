import BigNumber from 'bignumber.js';
import { useWdkBalances } from '@/wdk/hooks/useWalletData';

/**
 * Every Hedera transaction (send, swap, approve, associate, stake) is paid
 * in HBAR — there is no paymaster. A swap can take up to four transactions
 * (fee, associate, approve, swap), so NBX-go asks users to keep a small HBAR
 * reserve and warns before they run dry.
 */
export const HBAR_FEE_RESERVE = 1;
/** Below this, warn but still allow (fees are usually ~$0.001–0.05 each). */
export const HBAR_FEE_LOW = 2;

export function useHbarForFees() {
  const balances = useWdkBalances();
  const row = balances.data.find((b) => b.token.id === 'hbar-hedera');
  const known = !!row && row.amount !== '—' && !balances.isLoading;
  const hbar = known ? new BigNumber(row!.amount).toNumber() : null;
  const empty = hbar != null && hbar < HBAR_FEE_RESERVE;
  const low = hbar != null && !empty && hbar < HBAR_FEE_LOW;
  return {
    /** Current HBAR, or null while loading. */
    hbar,
    /** Too little HBAR to safely pay network fees — block the action. */
    empty,
    /** Enough for now, but running low — warn. */
    low,
    message: empty
      ? `You need at least ${HBAR_FEE_RESERVE} HBAR to pay Hedera network fees — you have ${hbar!.toFixed(4)}. Deposit or buy a little HBAR first.`
      : low
        ? `Only ${hbar!.toFixed(2)} HBAR left for network fees. Always keep some HBAR in your wallet.`
        : null,
  };
}
