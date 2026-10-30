import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

/**
 * Limit orders — "buy SAUCE when it drops to 0.009 USDT0", "sell PLEX at
 * 0.002". Stored on the phone (expo-secure-store), never on a server.
 *
 * Funds are SET ASIDE, not locked: an open order reserves its input
 * (USDT0 for a buy, the token for a sell) so the app shows it as reserved
 * and won't let a new order spend it twice. hooks/useOrderWatcher.ts checks
 * SaucerSwap prices while the app is open and unlocked, and swaps on
 * SaucerSwap when the price is hit. There's no backend, so orders only fill
 * while NBX-go is running.
 */
export type OrderSide = 'buy' | 'sell';
export type OrderStatus = 'open' | 'filling' | 'filled' | 'cancelled' | 'failed';

export interface LimitOrder {
  id: string;
  side: OrderSide;
  /** Hedera token symbol traded against USDT0 (e.g. 'SAUCE'). */
  token: string;
  /** buy: USDT0 to spend · sell: token amount to sell (display units). */
  amount: string;
  /** Limit price in USDT0 per 1 token. */
  price: string;
  createdAt: number;
  status: OrderStatus;
  filledAt?: number;
  hash?: string;
  error?: string;
}

const KEY = 'orders.v1';

interface OrdersState {
  orders: LimitOrder[];
  loaded: boolean;
  load: () => Promise<void>;
  place: (o: Omit<LimitOrder, 'id' | 'createdAt' | 'status'>) => Promise<LimitOrder>;
  update: (id: string, patch: Partial<LimitOrder>) => Promise<void>;
  cancel: (id: string) => Promise<void>;
  clearDone: () => Promise<void>;
}

async function persist(orders: LimitOrder[]) {
  // Keep the store small: open orders plus the 20 most recent finished ones.
  const open = orders.filter((o) => o.status === 'open' || o.status === 'filling');
  const done = orders.filter((o) => !open.includes(o)).slice(0, 20);
  await SecureStore.setItemAsync(KEY, JSON.stringify([...open, ...done]));
}

export const useOrders = create<OrdersState>((set, get) => ({
  orders: [],
  loaded: false,
  load: async () => {
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      // An order caught mid-fill by an app kill is unknown — surface it as failed
      // (with a note) instead of silently retrying and maybe filling twice.
      const orders: LimitOrder[] = raw
        ? JSON.parse(raw).map((o: LimitOrder) =>
            o.status === 'filling' ? { ...o, status: 'failed', error: 'App closed while filling — check your balance / HashScan.' } : o,
          )
        : [];
      set({ orders, loaded: true });
    } catch {
      set({ orders: [], loaded: true });
    }
  },
  place: async (o) => {
    const order: LimitOrder = { ...o, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, createdAt: Date.now(), status: 'open' };
    const orders = [order, ...get().orders];
    set({ orders });
    await persist(orders);
    return order;
  },
  update: async (id, patch) => {
    const orders = get().orders.map((o) => (o.id === id ? { ...o, ...patch } : o));
    set({ orders });
    await persist(orders);
  },
  cancel: async (id) => get().update(id, { status: 'cancelled' }),
  clearDone: async () => {
    const orders = get().orders.filter((o) => o.status === 'open' || o.status === 'filling');
    set({ orders });
    await persist(orders);
  },
}));

/** Amount set aside per symbol by open orders (display units). */
export function reservedBySymbol(orders: LimitOrder[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const o of orders) {
    if (o.status !== 'open' && o.status !== 'filling') continue;
    const sym = o.side === 'buy' ? 'USDT0' : o.token;
    out[sym] = (out[sym] ?? 0) + Number(o.amount);
  }
  return out;
}

/** Whether `price` (USDT0 per token) triggers the order. */
export const isTriggered = (o: LimitOrder, price: number) =>
  o.side === 'buy' ? price <= Number(o.price) : price >= Number(o.price);
