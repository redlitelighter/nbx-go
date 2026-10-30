/**
 * src/services/xcIntentParser.ts — turn GO model output into a validated
 * wallet intent.
 *
 * The model is asked for one JSON object ({intent, slots, missing, message}).
 * We never act on raw text and never trust the model's own "missing" list:
 * the app normalises the slots, fills gaps only from what the user literally
 * typed, works out what is still missing, and asks for all of it in one
 * question (small on-device models are unreliable at this). Balances,
 * prices and contacts are answered from wallet data, never from the model.
 * A complete action becomes a confirmation card that opens Swap, Send or
 * Lend prefilled; the user still confirms there.
 */
import { ASSETS } from '@/wdk/networks';
import { HEDERA_SWAP_TOKENS, HEDERA_TOKEN_BY_SYMBOL, walletAssetId, type HederaToken } from '@/config/hederaTokens';
import type { Contact } from '@/state/contacts';

export const INTENTS = [
  'buy', 'sell', 'swap', 'bridge', 'send', 'lend', 'price', 'order',
  'balance', 'contacts', 'chart_analysis', 'clarify', 'refuse',
] as const;
export type IntentName = (typeof INTENTS)[number];

export type Recipient = string | { type: 'contact'; name: string };

export interface Slots {
  token?: string;
  amount?: number;
  currency?: string;
  fromToken?: string;
  fromChain?: string;
  toToken?: string;
  toChain?: string;
  chain?: string;
  recipient?: Recipient;
  protocol?: 'aave' | 'morpho';
  action?: 'supply' | 'withdraw';
  /** Limit orders: USDT0 per token, and which way. */
  price?: number;
  side?: 'buy' | 'sell';
}
type SlotName = keyof Slots;

export interface Intent {
  intent: IntentName;
  slots: Slots;
  message?: string;
}

export const REFUSE_TEXT = 'I can only help with trading and wallet actions. Try: swap, buy, send, lend, or check a price.';
export const CHART_DISCLAIMER = 'This is trend analysis, not financial advice.';
export const PLATFORM_FEE_LABEL = '0.03% platform fee';

export const XC_SYSTEM_PROMPT = `You are GO, the trading assistant inside this wallet app. You run on the user's device. The wallet is on Hedera only; its tokens are HBAR, USDT0, SAUCE, PLEX, DOVU, DAVINCI and KARATE. Swaps go through SaucerSwap. "lend" means staking SAUCE.

SCOPE
You only help with: buying, selling, swapping, bridging, sending tokens, lending, prices and amounts, portfolio and balances, contacts (for sending), and analysing chart images. For anything else reply exactly: "${REFUSE_TEXT}" Do not explain further.

OUTPUT FORMAT
Reply with ONE JSON object and nothing else:
{"intent":"buy|sell|swap|bridge|send|lend|price|order|balance|contacts|chart_analysis|clarify|refuse","slots":{...only fields the user actually gave...},"missing":[...names of required slots not yet provided...],"message":"short text shown to the user"}
Never invent slot values. Never guess amounts, addresses, chains or tokens.

REQUIRED SLOTS (every chain is Hedera, so never ask for a chain)
- buy / sell: token, amount (and currency, default USDT)
- swap: fromToken, toToken, amount
- send: token, amount, recipient (a full address OR a contact name)
- lend: amount (token is SAUCE; action supply = stake, withdraw = unstake)
- price: token
- order (buy or sell when a price is hit): side (buy|sell), token, amount, price (USDT0 per token)

RULES
1. If any required slot is missing, set intent to the action, list the missing slots, and ask for them in "message". Ask for everything missing in one short question.
2. If the user says only "buy" or "sell", ask: "Which token and what amount?"
3. SEND: always ask the user to define token, amount and recipient address, or to pick one from their saved contacts. Never assume the recipient. If the user gives a contact name, set recipient to {"type":"contact","name":"..."} and let the app resolve it.
4. Never execute anything. You only propose. The app shows a confirmation card and the user approves.
5. Swaps include a 0.03% platform fee. Mention it when summarising a swap.
6. Keep messages under 3 sentences.

EXAMPLES
User: buy 25 usdt of sauce
{"intent":"buy","slots":{"token":"SAUCE","amount":25,"currency":"USDT"},"missing":[],"message":"Buy SAUCE with 25 USDT."}
User: swap 100 hbar to plex
{"intent":"swap","slots":{"fromToken":"HBAR","toToken":"PLEX","amount":100},"missing":[],"message":"Swap 100 HBAR to PLEX."}
User: send 10 usdt0 to alice
{"intent":"send","slots":{"token":"USDT0","amount":10,"recipient":{"type":"contact","name":"alice"}},"missing":[],"message":"Send 10 USDT0 to alice."}
User: buy 10 usdt of sauce at 0.009
{"intent":"order","slots":{"side":"buy","token":"SAUCE","amount":10,"price":0.009},"missing":[],"message":"Buy SAUCE with 10 USDT0 when it hits 0.009."}
User: what is my balance
{"intent":"balance","slots":{},"missing":[],"message":""} /no_think`;

/**
 * Grammar for the model's reply (QVAC `responseFormat`): always valid JSON
 * with a known intent, so the 0.6B model can't drift into prose.
 */
export const XC_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'go_intent',
    schema: {
      type: 'object',
      properties: {
        intent: { type: 'string', enum: [...INTENTS] },
        slots: { type: 'object' },
        missing: { type: 'array', items: { type: 'string' } },
        message: { type: 'string' },
      },
      required: ['intent', 'slots', 'missing', 'message'],
    },
  },
};
/** Enough for the JSON envelope plus a three-sentence message. */
export const XC_PREDICT = 200;

/** Required slots per action, exactly as the spec lists them. */
const REQUIRED: Partial<Record<IntentName, SlotName[]>> = {
  // Hedera-only: chains are never asked for (any other chain is refused).
  buy: ['token', 'amount'],
  sell: ['token', 'amount'],
  swap: ['fromToken', 'toToken', 'amount'],
  bridge: [], // refused straight away — nothing to bridge on Hedera-only
  send: ['token', 'amount', 'recipient'],
  lend: ['amount'], // SAUCE staking; action defaults to stake
  price: ['token'],
  // Limit order: buy amount is USDT0 to spend, sell amount is the token.
  order: ['side', 'token', 'amount', 'price'],
};
const ACTIONS = Object.keys(REQUIRED) as IntentName[];

// ─── Normalisation ───────────────────────────────────────────────────────────

const TOKEN_ALIAS: Record<string, string> = {
  BITCOIN: 'BTC', ETHER: 'ETH', ETHEREUM: 'ETH', SOLANA: 'SOL', TETHER: 'USDT',
  HEDERA: 'HBAR', TRON: 'TRX', 'USD₮0': 'USDT0', 'USDT-0': 'USDT0',
  SAUCERSWAP: 'SAUCE', LAMBDAPLEX: 'PLEX', 'X-SAUCE': 'XSAUCE',
};
const CHAIN_ALIAS: Record<string, string> = {
  eth: 'ethereum', mainnet: 'ethereum', 'ethereum mainnet': 'ethereum', ethmainnet: 'ethereum',
  arb: 'arbitrum', 'arbitrum one': 'arbitrum', matic: 'polygon', sol: 'solana',
  btc: 'bitcoin', hbar: 'hedera', trx: 'tron', lightning: 'spark',
};
/** Chain names GO understands in free text (full names only — "btc" is a token). */
const TEXT_CHAINS = ['hedera', 'arbitrum', 'ethereum', 'base', 'polygon', 'bitcoin', 'solana', 'tron', 'spark'];

const normToken = (t: unknown) => {
  if (typeof t !== 'string' || !t.trim()) return undefined;
  const u = t.trim().toUpperCase();
  return TOKEN_ALIAS[u] ?? u;
};
const normChain = (c: unknown) => {
  if (typeof c !== 'string' || !c.trim()) return undefined;
  const l = c.trim().toLowerCase();
  return CHAIN_ALIAS[l] ?? l;
};
const normAmount = (a: unknown) => {
  const n = typeof a === 'number' ? a : typeof a === 'string' ? Number(a.replace(/[^0-9.]/g, '')) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const ADDRESS_RE = /\b(0x[a-fA-F0-9]{40}|bc1[a-z0-9]{20,90}|tb1[a-z0-9]{20,90}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b/;
const isAddress = (s: string) => ADDRESS_RE.test(s.trim()) && s.trim().match(ADDRESS_RE)![0] === s.trim();

function normRecipient(r: unknown): Recipient | undefined {
  if (r && typeof r === 'object' && typeof (r as any).name === 'string' && (r as any).name.trim()) {
    return { type: 'contact', name: (r as any).name.trim() };
  }
  if (typeof r !== 'string' || !r.trim()) return undefined;
  // A non-address string is a contact name for the app to resolve.
  return isAddress(r) ? r.trim() : { type: 'contact', name: r.trim() };
}

/** snake_case / alternative keys the model sometimes uses → our slot names. */
const KEY_ALIAS: Record<string, SlotName> = {
  asset: 'token', coin: 'token', symbol: 'token',
  from_token: 'fromToken', fromtoken: 'fromToken', from_asset: 'fromToken',
  to_token: 'toToken', totoken: 'toToken', to_asset: 'toToken',
  from_chain: 'fromChain', fromchain: 'fromChain', source_chain: 'fromChain',
  to_chain: 'toChain', tochain: 'toChain', destination_chain: 'toChain', destination: 'toChain',
  network: 'chain', provider: 'protocol', address: 'recipient', to: 'recipient', to_address: 'recipient',
};

function cleanSlots(raw: Record<string, unknown>): Slots {
  const flat: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) flat[KEY_ALIAS[k.toLowerCase()] ?? k] = v;
  const s: Slots = {
    token: normToken(flat.token),
    amount: normAmount(flat.amount),
    currency: normToken(flat.currency),
    fromToken: normToken(flat.fromToken),
    fromChain: normChain(flat.fromChain),
    toToken: normToken(flat.toToken),
    toChain: normChain(flat.toChain),
    chain: normChain(flat.chain),
    recipient: normRecipient(flat.recipient),
  };
  const p = typeof flat.protocol === 'string' ? flat.protocol.toLowerCase() : '';
  if (p === 'aave' || p === 'morpho') s.protocol = p;
  const a = typeof flat.action === 'string' ? flat.action.toLowerCase() : '';
  if (a === 'supply' || a === 'deposit' || a === 'lend') s.action = 'supply';
  if (a === 'withdraw' || a === 'redeem') s.action = 'withdraw';
  s.price = normAmount(flat.price ?? flat.limit ?? flat.limitPrice);
  const sd = typeof flat.side === 'string' ? flat.side.toLowerCase() : '';
  if (sd === 'buy' || sd === 'sell') s.side = sd;
  return Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)) as Slots;
}

/** Pulls the first {...} block out of model text (models often wrap JSON in prose or fences). */
function extractJson(text: string): any | null {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '');
  const start = cleaned.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === '{') depth++;
    else if (cleaned[i] === '}' && --depth === 0) {
      try {
        return JSON.parse(cleaned.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Keeps a model message to at most three sentences (spec rule 7). */
function limitSentences(m: string, n = 3) {
  const parts = m.match(/[^.!?]+[.!?]*/g) ?? [m];
  return parts.slice(0, n).join('').trim();
}

export function parseIntent(modelText: string): Intent | null {
  const raw = extractJson(modelText);
  if (!raw || typeof raw !== 'object') return null;
  const intent = String(raw.intent ?? '').toLowerCase().trim() as IntentName;
  if (!INTENTS.includes(intent)) return null;
  // Accept both {slots:{...}} and flat fields.
  const { intent: _i, slots, missing: _m, message, reply, ...rest } = raw;
  const merged = { ...(slots && typeof slots === 'object' ? slots : {}), ...rest };
  const msg = typeof message === 'string' ? message : typeof reply === 'string' ? reply : undefined;
  return { intent, slots: cleanSlots(merged), message: msg ? limitSentences(msg) : undefined };
}

// ─── Filling slots from the user's own words ─────────────────────────────────

const PRICE_RE =
  /(?:\bat\b|@|\bprice(?: of| is)?\b|\bhits?\b|\breach(?:es)?\b|\b(?:drops?|falls?|dips?|rises?|goes up|climbs?) to\b|\bwhen (?:it|the price|price)(?: is| hits| reaches)?\b|\blimit\b)\s*\$?\s*(\d+(?:\.\d+)?)/i;

// Off-Hedera symbols stay recognised so GO can say they're not supported.
const TOKEN_RE = /\b(USDT0|USDT|XSAUCE|SAUCE|PLEX|DOVU|DAVINCI|KARATE|HBAR|BERRY|BTC|ETH|SOL|TRX)\b/gi;
const TOKEN_NAME_RE = /\b(hedera|hbar|saucerswap|lambdaplex|tether)\b/gi;

/**
 * Slot values found literally in the user's text. Used to fill gaps the
 * model left (never to overwrite), so nothing here is a guess.
 */
function slotsFromText(text: string, intent: IntentName, contacts: Contact[]): Slots {
  const s: Slots = {};
  const addr = text.match(ADDRESS_RE)?.[0];
  if (addr) s.recipient = addr;
  let noAddr = addr ? text.replace(addr, ' ') : text;

  // A limit price: "at 0.009", "@ 0.009", "when it hits / drops to / reaches 0.009".
  const priceMatch = noAddr.match(PRICE_RE);
  if (priceMatch) {
    s.price = Number(priceMatch[1]);
    noAddr = noAddr.replace(priceMatch[0], ' ');
  }
  if (/\bbuy\b/i.test(text)) s.side = 'buy';
  else if (/\bsell\b/i.test(text)) s.side = 'sell';

  const num = noAddr.match(/(\d+(?:\.\d+)?)/);
  if (num) s.amount = Number(num[1]);

  const tokens = [...noAddr.matchAll(TOKEN_RE)].map((m) => normToken(m[1])!);
  // Full names ("bitcoin") only count as tokens for single-token actions;
  // in swap/bridge/send they are just as likely to be chains.
  if (['buy', 'sell', 'price', 'balance'].includes(intent) && !tokens.length) {
    tokens.push(...[...noAddr.matchAll(TOKEN_NAME_RE)].map((m) => normToken(m[1])!));
  }

  const lower = noAddr.toLowerCase();
  const from = lower.match(new RegExp(`\\bfrom\\s+(${TEXT_CHAINS.join('|')})\\b`))?.[1];
  const to = lower.match(new RegExp(`\\b(?:to|into|onto)\\s+(${TEXT_CHAINS.join('|')})\\b`))?.[1];
  const chains = TEXT_CHAINS.filter((c) => new RegExp(`\\b${c}\\b`).test(lower));

  if (intent === 'swap') {
    if (tokens[0]) s.fromToken = tokens[0];
    if (tokens[1]) s.toToken = tokens[1];
    if (from) s.fromChain = from;
    if (to) s.toChain = to;
  } else if (intent === 'bridge') {
    if (tokens[0]) s.token = tokens[0];
    if (from) s.fromChain = from;
    if (to) s.toChain = to;
    if (!from && !to && chains.length === 2) [s.fromChain, s.toChain] = chains;
  } else if ((intent === 'buy' || intent === 'sell' || intent === 'order') && tokens.length > 1) {
    // "buy 25 USDT of SAUCE" / "sell PLEX for HBAR": the money side is the currency.
    const money = tokens.find((t) => usdtFamily(t) || t === 'HBAR');
    const other = tokens.find((t) => t !== money);
    if (other) s.token = other;
    if (money) s.currency = money;
  } else {
    if (tokens[0]) s.token = tokens[0];
    if (chains.length === 1) s.chain = chains[0];
  }

  // Earn = SAUCE staking: stake/supply/deposit vs unstake/withdraw.
  if (/\b(stake|supply|deposit)\b/i.test(text)) s.action = 'supply';
  if (/\b(unstake|withdraw|redeem|take out)\b/i.test(text)) s.action = 'withdraw';

  if (intent === 'send' && !s.recipient) {
    // A saved contact named anywhere ("pay alice 5 hbar"), longest name first.
    const named = [...contacts]
      .sort((a, b) => b.name.length - a.name.length)
      .find((c) => new RegExp(`\\b${escapeRe(c.name)}\\b`, 'i').test(text));
    if (named) s.recipient = { type: 'contact', name: named.name };
    else {
      // "to bob" — an unknown name; the app checks it against contacts and asks.
      const to = noAddr.match(/\bto\s+([A-Za-z][A-Za-z0-9._-]{1,30})\b/);
      const word = to?.[1];
      if (word && !TOKEN_WORDS.test(word) && !TEXT_CHAINS.includes(word.toLowerCase()) && !/^(my|me|the|an?|it|them|him|her)$/i.test(word)) {
        s.recipient = { type: 'contact', name: word };
      }
    }
  }
  return s;
}

const TOKEN_WORDS = /^(USDT0?|XSAUCE|SAUCE|PLEX|DOVU|DAVINCI|KARATE|HBAR|BERRY|BTC|ETH|SOL|TRX|hedera|tether)$/i;

/** Verb → action, for requests GO can understand without the model. */
const FAST_VERBS: [IntentName, RegExp][] = [
  ['send', /\b(send|transfer|pay)\b/i],
  ['swap', /\b(swap|convert|exchange|trade)\b/i],
  ['buy', /\bbuy\b/i],
  ['sell', /\bsell\b/i],
  ['lend', /\b(stake|unstake|earn on)\b/i],
];

/**
 * Keyword fast path: "send 5 hbar to alice", "swap 100 hbar to plex",
 * "buy 25 usdt of sauce", "stake 100 sauce". Recognised in microseconds
 * instead of seconds on the 0.6B model; anything without a known verb still
 * goes to the model. Missing details are asked for by the app as usual.
 */
export function fastIntent(text: string, contacts: Contact[]): Intent | null {
  for (const [intent, re] of FAST_VERBS) {
    if (re.test(text)) return completeIntent({ intent, slots: {} }, text, contacts);
  }
  return null;
}

// ─── Transaction history ─────────────────────────────────────────────────────

const HISTORY_QUESTION =
  /\b(history|transactions?|transfers?|activity|past (payments?|sends?)|recent (payments?|sends?|activity)|(did i|have i) (get|receive|send)|received|incoming|outgoing|what (did i|have i) (send|sent|receive|received)|last \d+ (tx|transactions?|payments?))\b/i;

export interface HistoryQuery {
  direction?: 'in' | 'out';
  token?: string;
  count: number;
}

/** "check my transactions", "what did I receive?", "last 5 HBAR sends". */
export function detectHistoryQuestion(text: string): HistoryQuery | null {
  if (!HISTORY_QUESTION.test(text) || /\b(send|transfer|pay)\s+\d/i.test(text)) return null;
  const direction = /\b(received|receive|incoming|got|in)\b/i.test(text) ? 'in' : /\b(sent|send|outgoing|paid)\b/i.test(text) ? 'out' : undefined;
  const sym = [...text.matchAll(TOKEN_RE)].map((m) => normToken(m[1])!)[0];
  const n = Number(text.match(/\blast\s+(\d{1,2})\b/i)?.[1] ?? 5);
  return { direction, token: sym && usdtFamily(sym) ? 'USDT0' : sym, count: Math.min(Math.max(n, 1), 20) };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Keeps known slots, then fills gaps from `extra`. */
function fill(base: Slots, extra: Slots): Slots {
  const out: Slots = { ...base };
  for (const [k, v] of Object.entries(extra) as [SlotName, any][]) if (out[k] == null && v != null) (out as any)[k] = v;
  return out;
}

/**
 * "Buy/sell X at a price" is a limit order: a buy or sell that carries a
 * price becomes an `order` with that side.
 */
function asOrder(i: Intent): Intent {
  if ((i.intent === 'buy' || i.intent === 'sell') && i.slots.price != null) {
    return { ...i, intent: 'order', slots: { ...i.slots, side: i.slots.side ?? i.intent } };
  }
  return i;
}

/** A fresh model intent, with gaps filled from the same message. */
export function completeIntent(i: Intent, text: string, contacts: Contact[]): Intent {
  return asOrder({ ...i, slots: fill(i.slots, slotsFromText(text, i.intent, contacts)) });
}

const VERB_RE: Partial<Record<IntentName, RegExp>> = {
  buy: /\bbuy\b/i, sell: /\bsell\b/i, swap: /\b(swap|exchange|convert)\b/i, bridge: /\bbridge\b/i,
  send: /\b(send|transfer|pay)\b/i, lend: /\b(lend|supply|withdraw|stake|unstake|earn)\b/i, price: /\b(price|worth)\b/i,
};

/**
 * Merge a follow-up answer into the pending intent. The user switches
 * action only when they name a different verb — otherwise a bare "25" or
 * "on arbitrum" fills the pending question.
 */
export function mergeIntent(pending: Intent, next: Intent | null, text: string, contacts: Contact[]): Intent {
  if (next && next.intent !== pending.intent && VERB_RE[next.intent]?.test(text)) {
    return completeIntent(next, text, contacts);
  }
  if (next && ['refuse', 'balance', 'contacts', 'chart_analysis'].includes(next.intent) && !/\d/.test(text)) {
    return next;
  }
  const fromModel = next && (next.intent === pending.intent || next.intent === 'clarify') ? next.slots : {};
  return asOrder({ ...pending, slots: fill(fill(pending.slots, slotsFromText(text, pending.intent, contacts)), fromModel) });
}

// ─── Missing slots ───────────────────────────────────────────────────────────

const SLOT_LABEL: Record<SlotName, string> = {
  token: 'which token',
  amount: 'the amount',
  currency: 'the currency',
  fromToken: 'the token to swap from',
  fromChain: 'the chain it’s on',
  toToken: 'the token you want',
  toChain: 'the chain to receive it on',
  chain: 'which chain',
  recipient: 'the recipient address (or a saved contact)',
  protocol: 'Aave or Morpho',
  action: 'supply or withdraw',
  price: 'your price in USDT0',
  side: 'buy or sell',
};

export const isAction = (i: IntentName) => ACTIONS.includes(i);

export function missingSlots(i: Intent): SlotName[] {
  return (REQUIRED[i.intent] ?? []).filter((k) => i.slots[k] == null);
}

const joinList = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** One short question covering everything still missing, or null when complete. */
export function missingQuestion(i: Intent): string | null {
  const miss = missingSlots(i);
  if (!miss.length) return null;
  if ((i.intent === 'buy' || i.intent === 'sell') && miss.includes('token') && miss.includes('amount')) {
    return 'Which token and what amount?';
  }
  if (i.intent === 'price') return 'Which token’s price?';
  if (i.intent === 'send') {
    const rest = miss.filter((m) => m !== 'recipient').map((m) => SLOT_LABEL[m]);
    const parts = [...rest, ...(miss.includes('recipient') ? ['the recipient address'] : [])];
    return `To send, tell me ${joinList(parts)}${miss.includes('recipient') ? ' — or pick one of your saved contacts' : ''}.`;
  }
  const verb = { buy: 'buy', sell: 'sell', swap: 'swap', bridge: 'bridge', lend: 'stake', order: 'set the order' }[i.intent as string] ?? 'do that';
  return `To ${verb}, tell me ${joinList(miss.map((m) => SLOT_LABEL[m]))}.`;
}

// ─── Resolving a complete action ─────────────────────────────────────────────

const usdtFamily = (t?: string) => !!t && t.startsWith('USDT');
const fmt = (n: number) => String(Number(n.toFixed(6)));
const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/**
 * GO's token symbol → the Hedera token it means. Plain "USDT" means the
 * wallet's USDT0 (Tether's token on Hedera); xSAUCE comes from staking only.
 */
function hederaToken(sym?: string): HederaToken | undefined {
  if (!sym) return undefined;
  const s = usdtFamily(sym) ? 'USDT0' : sym;
  const t = HEDERA_TOKEN_BY_SYMBOL[s];
  return t && t.symbol !== 'XSAUCE' ? t : undefined;
}

const TRADABLE_LIST = 'HBAR, USDT0, SAUCE, PLEX, DOVU, DAVINCI or KARATE';
const notHedera = (sym?: string) =>
  `${sym ?? 'That token'} isn’t on Hedera in NBX-go. You can trade ${TRADABLE_LIST}.`;

export interface Proposal {
  summary: string;
  route: { pathname: string; params: Record<string, string> };
  /** Wallet asset this spends from and how much — for the balance check. */
  spend?: { assetId: string; amount: number; symbol: string };
  /** Token symbols involved, in order (icons on the card). */
  tokens?: string[];
}

export type Resolution =
  | { ok: true; proposal: Proposal }
  /** `retry` = keep the intent pending with these slots cleared, so the answer fills them. */
  | { ok: false; message: string; retry?: SlotName[] };

/** A SaucerSwap swap proposal (Swap screen prefilled). */
function swapProposal(from: HederaToken, to: HederaToken, amt: number, summary: string): Resolution {
  return {
    ok: true,
    proposal: {
      summary: `${summary} · SaucerSwap · ${PLATFORM_FEE_LABEL}`,
      route: { pathname: '/swap', params: { from: `hedera:${from.symbol}`, to: `hedera:${to.symbol}`, amount: String(amt) } },
      spend: { assetId: walletAssetId(from), amount: amt, symbol: from.symbol },
      tokens: [from.symbol, to.symbol],
    },
  };
}

/** NBX-go is Hedera-only: any other chain the user names is refused. */
function offHedera(...chains: (string | undefined)[]): string | null {
  const other = chains.find((c) => c && c !== 'hedera');
  return other ? `NBX-go works on Hedera only, so I can’t use ${other.charAt(0).toUpperCase() + other.slice(1)}.` : null;
}

export function resolveAction(i: Intent, contacts: Contact[]): Resolution {
  const s = i.slots;
  const amt = s.amount!;
  switch (i.intent) {
    case 'buy': {
      const off = offHedera(s.chain);
      if (off) return { ok: false, message: off, retry: ['chain'] };
      if (s.token === 'BERRY') return { ok: false, message: 'BERRY isn’t listed on SaucerSwap and has no pool, so GO can’t buy it safely.' };
      const to = hederaToken(s.token);
      if (!to) return { ok: false, message: notHedera(s.token), retry: ['token'] };
      // Spend USDT0 by default; "with HBAR" spends HBAR.
      const from = hederaToken(s.currency ?? 'USDT0');
      if (!from) return { ok: false, message: `GO buys with USDT0 or HBAR.`, retry: ['currency'] };
      if (from.id === to.id) return { ok: false, message: `That’s already ${to.symbol}.`, retry: ['token'] };
      return swapProposal(from, to, amt, `Buy ${to.symbol} with ${fmt(amt)} ${from.symbol}`);
    }
    case 'sell': {
      const from = hederaToken(s.token);
      if (!from) return { ok: false, message: notHedera(s.token), retry: ['token'] };
      // Sell into USDT0; selling USDT0 itself means cashing out to an exchange.
      if (from.symbol === 'USDT0') {
        return {
          ok: true,
          proposal: {
            summary: `Send ${fmt(amt)} USDT0 to your exchange’s Hedera deposit address to cash out`,
            route: { pathname: '/send/amount', params: { tokenId: 'usdt0-hedera', amount: String(amt) } },
            spend: { assetId: 'usdt0-hedera', amount: amt, symbol: 'USDT0' },
            tokens: ['USDT0'],
          },
        };
      }
      const to = hederaToken(s.currency ?? 'USDT0')!;
      return swapProposal(from, to, amt, `Sell ${fmt(amt)} ${from.symbol} for ${to.symbol}`);
    }
    case 'swap': {
      const off = offHedera(s.fromChain, s.toChain);
      if (off) return { ok: false, message: off };
      const from = hederaToken(s.fromToken);
      if (!from) return { ok: false, message: notHedera(s.fromToken), retry: ['fromToken'] };
      const to = hederaToken(s.toToken);
      if (!to) return { ok: false, message: notHedera(s.toToken), retry: ['toToken'] };
      if (from.id === to.id) return { ok: false, message: 'That’s the same token.', retry: ['toToken'] };
      return swapProposal(from, to, amt, `Swap ${fmt(amt)} ${from.symbol} → ${to.symbol}`);
    }
    case 'bridge':
      return { ok: false, message: 'NBX-go is Hedera-only, so there’s nothing to bridge. I can swap between Hedera tokens instead.' };
    case 'send': {
      const off = offHedera(s.chain);
      if (off) return { ok: false, message: off, retry: ['chain'] };
      const asset = ASSETS.find(
        (a) => a.getNetwork() === 'hedera' && (a.getSymbol() === s.token || (usdtFamily(s.token) && usdtFamily(a.getSymbol()))),
      );
      if (!asset) return { ok: false, message: `This wallet can’t send ${s.token}. Try ${TRADABLE_LIST}.`, retry: ['token'] };

      let address: string;
      let who: string;
      const r = s.recipient!;
      if (typeof r === 'string') {
        if (!/^0x[a-fA-F0-9]{40}$/.test(r)) {
          return { ok: false, message: 'That doesn’t look like a Hedera EVM address (0x…). Paste the full address or pick a contact.', retry: ['recipient'] };
        }
        address = r;
        who = shortAddr(r);
      } else {
        const q = r.name.toLowerCase();
        const exact = contacts.filter((c) => c.name.toLowerCase() === q);
        const matches = exact.length ? exact : contacts.filter((c) => c.name.toLowerCase().includes(q));
        if (!matches.length) {
          const names = contacts.map((c) => c.name);
          return {
            ok: false,
            message: names.length
              ? `I couldn’t find a contact called “${r.name}”. Pick one: ${joinList(names)} — or paste an address.`
              : `You don’t have any saved contacts yet, so I can’t find “${r.name}”. Paste the full address, or add them in Profile → Contacts.`,
            retry: ['recipient'],
          };
        }
        if (matches.length > 1) {
          return { ok: false, message: `Which one: ${joinList(matches.map((c) => c.name))}?`, retry: ['recipient'] };
        }
        const c = matches[0];
        const saved = c.addresses.find((x) => normChain(x.network) === 'hedera');
        if (!saved) {
          return { ok: false, message: `${c.name} has no Hedera address saved. Paste one, or pick another contact.`, retry: ['recipient'] };
        }
        address = saved.address;
        who = `${c.name} (${shortAddr(saved.address)})`;
      }
      return {
        ok: true,
        proposal: {
          summary: `Send ${fmt(amt)} ${asset.getSymbol()} on Hedera to ${who}`,
          route: { pathname: '/send/amount', params: { tokenId: asset.getId(), recipient: address, amount: String(amt) } },
          spend: { assetId: asset.getId(), amount: amt, symbol: asset.getSymbol() },
          tokens: [asset.getSymbol()],
        },
      };
    }
    case 'order': {
      const t = hederaToken(s.token);
      if (!t || t.symbol === 'USDT0') return { ok: false, message: t ? 'Orders trade a token against USDT0 — which token?' : notHedera(s.token), retry: ['token'] };
      const buy = s.side === 'buy';
      const price = String(Number(s.price!.toPrecision(6)));
      return {
        ok: true,
        proposal: {
          summary: buy
            ? `Limit buy: spend ${fmt(amt)} USDT0 on ${t.symbol} when 1 ${t.symbol} ≤ ${price} USDT0`
            : `Limit sell: ${fmt(amt)} ${t.symbol} when 1 ${t.symbol} ≥ ${price} USDT0`,
          route: { pathname: '/trade', params: { asset: t.symbol, side: s.side!, type: 'limit', amount: String(amt), price } },
          spend: buy ? { assetId: 'usdt0-hedera', amount: amt, symbol: 'USDT0' } : { assetId: walletAssetId(t), amount: amt, symbol: t.symbol },
          tokens: buy ? ['USDT0', t.symbol] : [t.symbol, 'USDT0'],
        },
      };
    }
    case 'lend': {
      // Earn on Hedera = SAUCE single-sided staking (xSAUCE) on SaucerSwap.
      if (s.token && s.token !== 'SAUCE' && s.token !== 'XSAUCE') {
        return { ok: false, message: 'Earning on Hedera is SAUCE staking — say “stake 100 SAUCE”. Swap into SAUCE first if you need to.', retry: ['token'] };
      }
      const unstake = s.action === 'withdraw';
      return {
        ok: true,
        proposal: {
          summary: `${unstake ? 'Unstake' : 'Stake'} ${fmt(amt)} ${unstake ? 'xSAUCE' : 'SAUCE'} on SaucerSwap`,
          route: { pathname: '/lending', params: { amount: String(amt), mode: unstake ? 'unstake' : 'stake' } },
          spend: { assetId: unstake ? 'xsauce-hedera' : 'sauce-hedera', amount: amt, symbol: unstake ? 'xSAUCE' : 'SAUCE' },
          tokens: unstake ? ['XSAUCE', 'SAUCE'] : ['SAUCE', 'XSAUCE'],
        },
      };
    }
    default:
      return { ok: false, message: REFUSE_TEXT };
  }
}

// ─── Answers built from wallet data ──────────────────────────────────────────

const BALANCE_QUESTION = /\b(balances?|holdings?|portfolio|how much (do i|i) (have|own|hold)|what do i (have|own|hold)|my (funds|money|wallet))\b/i;
const BALANCE_SYMBOL = /\b(HBAR|USDT0?|XSAUCE|SAUCE|PLEX|DOVU|DAVINCI|KARATE)\b/i;

/**
 * Balance questions are caught by keyword before the model runs: the 0.6B
 * model sometimes answers them as chat with made-up numbers.
 */
export function detectBalanceQuestion(text: string): Intent | null {
  if (!BALANCE_QUESTION.test(text)) return null;
  const sym = text.match(BALANCE_SYMBOL)?.[1]?.toUpperCase();
  return { intent: 'balance', slots: sym ? { token: sym } : {} };
}

export interface BalanceRow {
  token: { id: string; symbol: string; chain: string };
  amount: string;
  fiatValue: string;
  fetchFailed?: boolean;
}

const NETWORK_LABEL: Record<string, string> = { ethmainnet: 'Ethereum', ethereum: 'Sepolia (testnet)' };
const netLabel = (s: string) => NETWORK_LABEL[s] ?? s.charAt(0).toUpperCase() + s.slice(1);
/** 18-decimal amounts (HBAR, ETH) read badly in chat; keep at most 6 decimals. */
const trimAmount = (a: string) => (a.includes('.') ? String(Number(Number(a).toFixed(6))) : a);

/** The reply to a balance intent, built only from real wallet data. */
export function answerBalance(rows: BalanceRow[], total: string, asset?: string): string {
  const want = asset?.toUpperCase();
  // "USDT" / "USDT0" both mean any USDT-family holding.
  const matches = (sym: string) => !want || (usdtFamily(want) ? usdtFamily(sym.toUpperCase()) : sym.toUpperCase() === want);
  const picked = rows.filter((r) => matches(r.token.symbol));
  const held = picked.filter((r) => !r.fetchFailed && Number(r.amount) > 0);
  const failed = picked.filter((r) => r.fetchFailed).map((r) => netLabel(r.token.chain));
  const line = (r: BalanceRow) => `• ${trimAmount(r.amount)} ${r.token.symbol} on ${netLabel(r.token.chain)}${r.fiatValue !== '—' ? ` (${r.fiatValue})` : ''}`;

  const parts: string[] = [];
  if (want) {
    parts.push(held.length ? `Your ${want}:\n${held.map(line).join('\n')}` : `You don’t hold any ${want} right now.`);
  } else {
    parts.push(held.length ? `You have ${total} in total:\n${held.map(line).join('\n')}` : 'Your wallet is empty right now.');
  }
  if (failed.length) parts.push(`I couldn’t load ${[...new Set(failed)].join(', ')} — pull to refresh on Assets.`);
  return parts.join('\n\n');
}

/** One row of a token list in a GO reply (rendered with the token's icon). */
export interface TokenLine {
  symbol: string;
  primary: string;
  secondary?: string;
}

/** Balance reply as a header plus one icon row per holding. */
export function balanceReply(rows: BalanceRow[], total: string, asset?: string): { text: string; items: TokenLine[] } {
  const want = asset?.toUpperCase();
  const matches = (sym: string) => !want || (usdtFamily(want) ? usdtFamily(sym.toUpperCase()) : sym.toUpperCase() === want);
  const picked = rows.filter((r) => matches(r.token.symbol));
  const held = picked.filter((r) => !r.fetchFailed && Number(r.amount) > 0);
  const failed = picked.some((r) => r.fetchFailed);
  const items = held.map((r) => ({
    symbol: r.token.symbol,
    primary: `${trimAmount(r.amount)} ${r.token.symbol === 'XSAUCE' ? 'xSAUCE' : r.token.symbol}`,
    secondary: r.fiatValue !== '—' ? r.fiatValue : undefined,
  }));
  let text = want
    ? held.length ? `Your ${want === 'XSAUCE' ? 'xSAUCE' : want}, step by step:` : `You don’t hold any ${want} right now.`
    : held.length ? `You have ${total} on Hedera:` : 'Your wallet is empty right now — the first step is a USDT0 or HBAR deposit.';
  if (failed) text += '\n\nSome balances didn’t load — pull to refresh on Assets.';
  return { text, items };
}

/** Price reply as one icon row. */
export function priceReply(token: string, q?: { price: number; change24h: number | null }): { text: string; items: TokenLine[] } {
  if (!PRICEABLE.includes(token) || !q) return { text: answerPrice(token, q), items: [] };
  const price = q.price >= 1 ? q.price.toLocaleString('en-US', { maximumFractionDigits: 2 }) : q.price.toPrecision(4);
  const ch = q.change24h != null && Number.isFinite(q.change24h) ? `${q.change24h >= 0 ? '+' : ''}${q.change24h.toFixed(2)}% in 24h` : undefined;
  return { text: `${token} right now:`, items: [{ symbol: usdtFamily(token) ? 'USDT0' : token, primary: `$${price}`, secondary: ch }] };
}

/** A note when a proposal spends more than the wallet holds, else ''. */
export function shortfallNote(rows: BalanceRow[], spend?: Proposal['spend']): string {
  if (!spend) return '';
  const row = rows.find((r) => r.token.id === spend.assetId);
  if (!row || row.fetchFailed) return '';
  const have = Number(row.amount);
  return Number.isFinite(have) && spend.amount > have
    ? ` Heads up: you have ${trimAmount(row.amount)} ${spend.symbol} there, less than ${fmt(spend.amount)}.`
    : '';
}

/** Symbols GO quotes (services/priceService.ts: Bitfinex + SaucerSwap). */
export const PRICEABLE = ['USDT', ...HEDERA_SWAP_TOKENS.map((t) => t.symbol)];

const PRICE_QUESTION = /\b(price|prices|worth|trading at|value of|how much is|how much are|quote|cost)\b/i;

/**
 * Price questions are answered from live data without running the model —
 * the model added seconds and nothing else ("what's the price of SAUCE").
 */
export function detectPriceQuestion(text: string): Intent | null {
  if (!PRICE_QUESTION.test(text) || /\b(buy|sell|swap|send|bridge|lend)\b/i.test(text)) return null;
  const sym = [...text.matchAll(TOKEN_RE)].map((m) => normToken(m[1])!)[0]
    ?? [...text.matchAll(TOKEN_NAME_RE)].map((m) => normToken(m[1])!)[0];
  return sym ? { intent: 'price', slots: { token: sym } } : null;
}

export function answerPrice(token: string, q?: { price: number; change24h: number | null }): string {
  if (!PRICEABLE.includes(token)) return `${token} isn’t on Hedera in NBX-go. Try HBAR, SAUCE, PLEX, DOVU, DAVINCI or KARATE.`;
  if (!q) return `I couldn’t load the ${token} price just now — try again in a moment.`;
  const price = q.price >= 1 ? q.price.toLocaleString('en-US', { maximumFractionDigits: 2 }) : q.price.toPrecision(4);
  const ch = q.change24h != null && Number.isFinite(q.change24h) ? ` (${q.change24h >= 0 ? '+' : ''}${q.change24h.toFixed(2)}% in 24h)` : '';
  return `${token} is $${price}${ch}.`;
}

export function answerContacts(contacts: Contact[]): string {
  if (!contacts.length) return 'You have no saved contacts yet. Add them in Profile → Contacts, then say “send 10 USDT0 to <name>”.';
  const line = (c: Contact) => `• ${c.name} (${joinList([...new Set(c.addresses.map((a) => (normChain(a.network) ?? a.network).replace(/^./, (ch) => ch.toUpperCase())))])})`;
  return `Your saved contacts:\n${contacts.map(line).join('\n')}`;
}
