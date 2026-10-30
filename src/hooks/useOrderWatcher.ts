import { useEffect, useRef } from 'react';
import BigNumber from 'bignumber.js';
import { useHederaAccount } from '@/hooks/useHederaAccount';
import { useOrders, isTriggered, type LimitOrder } from '@/state/orders';
import { useToast } from '@/state/toast';
import { HEDERA_TOKEN_BY_SYMBOL, SAUCERSWAP } from '@/config/hederaTokens';
import { executeSwap, friendlyTxError, quoteSwap } from '@/services/saucerService';

const POLL_MS = 30_000;
/** Extra room between the trigger price and the executed price (slippage). */
const SLIPPAGE = 0.01;

/** USDT0 per token, from SaucerSwap's USD prices (USDT0 ≈ but not exactly $1). */
async function pricesInUsdt0(symbols: string[]): Promise<Record<string, number>> {
  const res = await fetch(`${SAUCERSWAP.api}/tokens/default`);
  if (!res.ok) throw new Error(`SaucerSwap ${res.status}`);
  const list: { id: string; priceUsd: number }[] = await res.json();
  const usd = (id: string) => list.find((t) => t.id === id)?.priceUsd;
  const usdt0 = usd(HEDERA_TOKEN_BY_SYMBOL.USDT0.id);
  const out: Record<string, number> = {};
  if (!usdt0) return out;
  for (const s of symbols) {
    const t = HEDERA_TOKEN_BY_SYMBOL[s];
    const p = t && usd(t.native ? SAUCERSWAP.whbarId : t.id);
    if (p) out[s] = p / usdt0;
  }
  return out;
}

/**
 * Watches open limit orders while the wallet is unlocked (mounted in the
 * tabs layout) and fills them on SaucerSwap when the price is hit. The
 * user authorised each order with biometrics when placing it.
 *
 * Two checks before a fill: the SaucerSwap spot price crosses the limit,
 * AND the actual quote's execution price is within 1% of the limit — so a
 * thin pool can't fill a "buy at 0.009" at 0.02.
 */
export function useOrderWatcher() {
  const { account, ready } = useHederaAccount();
  const busy = useRef(false);

  useEffect(() => {
    if (!useOrders.getState().loaded) useOrders.getState().load();
  }, []);

  useEffect(() => {
    if (!ready) return;
    const tick = async () => {
      if (busy.current) return;
      const open = useOrders.getState().orders.filter((o) => o.status === 'open');
      if (!open.length) return;
      busy.current = true;
      try {
        const prices = await pricesInUsdt0([...new Set(open.map((o) => o.token))]);
        for (const o of open) {
          const p = prices[o.token];
          if (p != null && isTriggered(o, p)) await fill(o);
        }
      } catch (e: any) {
        console.warn('[orders] price check failed:', e?.message ?? e);
      } finally {
        busy.current = false;
      }
    };

    const fill = async (o: LimitOrder) => {
      const token = HEDERA_TOKEN_BY_SYMBOL[o.token];
      const usdt0 = HEDERA_TOKEN_BY_SYMBOL.USDT0;
      if (!token) return;
      const [from, to] = o.side === 'buy' ? [usdt0, token] : [token, usdt0];
      const amountIn = BigInt(new BigNumber(o.amount).shiftedBy(from.decimals).integerValue(BigNumber.ROUND_DOWN).toFixed(0));
      const q = await quoteSwap(account, from, to, amountIn, SLIPPAGE);
      const inN = new BigNumber(q.amountIn.toString()).shiftedBy(-from.decimals);
      const outN = new BigNumber(q.amountOut.toString()).shiftedBy(-to.decimals);
      // USDT0 per token at the price this swap would actually execute.
      const exec = o.side === 'buy' ? inN.dividedBy(outN) : outN.dividedBy(inN);
      const limit = new BigNumber(o.price);
      const ok = o.side === 'buy' ? exec.lte(limit.times(1 + SLIPPAGE)) : exec.gte(limit.times(1 - SLIPPAGE));
      if (!ok) return; // spot crossed but the pool can't fill at your price yet

      await useOrders.getState().update(o.id, { status: 'filling' });
      try {
        const r = await executeSwap(account, q);
        await useOrders.getState().update(o.id, { status: 'filled', filledAt: Date.now(), hash: r.hash });
        useToast.getState().show(`Order filled: ${o.side} ${o.token} at ${exec.decimalPlaces(8).toFixed()} USDT0`);
      } catch (e: any) {
        await useOrders.getState().update(o.id, { status: 'failed', error: friendlyTxError(e) });
        useToast.getState().show(`Order failed: ${o.side} ${o.token}`);
      }
    };

    tick();
    const t = setInterval(tick, POLL_MS);
    return () => clearInterval(t);
  }, [ready, account]);
}
