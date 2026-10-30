import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

/**
 * Address book — local, encrypted at rest via expo-secure-store.
 *
 * Shape mirrors @tetherto/wdk-p2p-address-book (a contact = name + one
 * address per network) so moving to the P2P book later only swaps this
 * storage layer. That package needs Corestore/Hyperswarm native addons in
 * the worklet plus a blind-peer key for cross-device sync, so it isn't
 * wired up yet.
 */
export interface ContactAddress {
  network: string; // e.g. 'hedera', 'arbitrum', 'bitcoin', 'solana', 'tron'
  address: string;
}

export interface Contact {
  id: string;
  name: string;
  addresses: ContactAddress[];
  updatedAt: number;
}

const KEY = 'contacts.v1';

interface ContactsState {
  contacts: Contact[];
  loaded: boolean;
  load: () => Promise<void>;
  upsert: (c: Omit<Contact, 'id' | 'updatedAt'> & { id?: string }) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

async function persist(contacts: Contact[]) {
  await SecureStore.setItemAsync(KEY, JSON.stringify(contacts));
}

export const useContacts = create<ContactsState>((set, get) => ({
  contacts: [],
  loaded: false,
  load: async () => {
    if (get().loaded) return;
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      set({ contacts: raw ? (JSON.parse(raw) as Contact[]) : [], loaded: true });
    } catch {
      set({ contacts: [], loaded: true });
    }
  },
  upsert: async (c) => {
    const now = Date.now();
    const id = c.id ?? `${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const next = [...get().contacts.filter((x) => x.id !== id), { ...c, id, updatedAt: now }].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    set({ contacts: next });
    await persist(next);
  },
  remove: async (id) => {
    const next = get().contacts.filter((x) => x.id !== id);
    set({ contacts: next });
    await persist(next);
  },
}));
