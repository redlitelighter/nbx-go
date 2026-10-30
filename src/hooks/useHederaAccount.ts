import { useMemo } from 'react';
import { useAccount } from '@tetherto/wdk-react-native-core';
import type { HederaAccount } from '@/services/saucerService';
import { useAccounts } from '@/state/accounts';

/** The ACTIVE account's Hedera signer — everything in NBX-go runs on it. */
export function useHederaAccount(): { account: HederaAccount; address: string; ready: boolean } {
  const accountIndex = useAccounts((s) => s.activeIndex);
  const hedera = useAccount<HederaAccount>({ network: 'hedera', accountIndex });
  return useMemo(
    () => ({ account: hedera.extension(), address: hedera.address ?? '', ready: Boolean(hedera.address) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hedera],
  );
}
