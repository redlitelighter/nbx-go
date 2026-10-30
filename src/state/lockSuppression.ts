import { create } from 'zustand';

interface LockSuppressionState {
  suppressed: boolean;
  /** Active suppressions; the flag clears only when every one has released. */
  count: number;
  suppress: () => void;
  release: () => void;
}

/**
 * Suppresses AutoLockOnBackground's lock-on-background behavior while a
 * KNOWN, legitimate foreground handoff is in progress.
 *
 * Android pauses our Activity (AppState → 'background') whenever a system
 * screen or dialog takes over, which AutoLockOnBackground can't tell apart
 * from the person really leaving the app. Without suppression the wallet
 * locked — "logged out" — every time GO opened the photo picker, the
 * microphone or camera permission prompt, or a biometric confirmation.
 * Cases: Google Sign-In's picker (cloud-provider.tsx), the image picker,
 * mic / camera permission prompts, LocalAuthentication prompts.
 *
 * Usage: wrap the call in withoutAutoLock(() => …). Counted, so overlapping
 * flows don't release each other early, and held a moment after the call
 * resolves because the 'active' transition back can land just after.
 */
export const useLockSuppression = create<LockSuppressionState>((set, get) => ({
  suppressed: false,
  count: 0,
  suppress: () => set({ count: get().count + 1, suppressed: true }),
  release: () => {
    const count = Math.max(0, get().count - 1);
    set({ count, suppressed: count > 0 });
  },
}));

/** Runs `fn` (a system picker / permission / biometric prompt) without auto-locking. */
export async function withoutAutoLock<T>(fn: () => Promise<T>): Promise<T> {
  const { suppress, release } = useLockSuppression.getState();
  suppress();
  try {
    return await fn();
  } finally {
    setTimeout(release, 1500);
  }
}
