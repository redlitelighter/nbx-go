import { create } from 'zustand';

/**
 * One-shot hand-off for "pick an address from Contacts": Contacts sets the
 * address and navigates back; the caller (e.g. Swap's recipient field)
 * consumes it on focus.
 */
interface ContactPickState {
  picked: string | null;
}

export const useContactPick = create<ContactPickState>(() => ({ picked: null }));

export function setPickedAddress(address: string) {
  useContactPick.setState({ picked: address });
}

/** Returns the picked address once, then clears it. */
export function takePickedAddress(): string | null {
  const { picked } = useContactPick.getState();
  if (picked) useContactPick.setState({ picked: null });
  return picked;
}
