/**
 * src/services/goPersona.ts — who GO is and how it talks.
 *
 * GO is NBX-go's on-device assistant: professional and brief, with a dry
 * one-liner when a question is off-topic, and always one concrete next step.
 * NBX's slogan is "The next step", so GO talks in steps.
 *
 * How GO converses (all rules, never the 0.6B model — it would make facts up):
 * - Greetings, thanks, goodbyes and "how are you" get a short human reply.
 * - GO always knows the day and time (greetings, "what time is it?", and the
 *   model's system prompt).
 * - App commands ("open settings", "take me to swap") open the screen.
 * - Open-ended questions about Hedera, HBAR fees, USDT0, SaucerSwap,
 *   staking, limit orders, safety… are answered one short piece at a time;
 *   "tell me more" gives the next piece.
 * - Urgent messages (hacked, scammed, lost phone, wrong address) skip the
 *   chit-chat: the safety steps come first.
 * - Dead ends ("ok", "nah", "idk") get one short reply, then GO goes quiet
 *   instead of looping suggestions.
 * - NBX-go is separate from NBX; GO says so whenever NBX comes up.
 *
 * Markup: text inside [[double brackets]] is an action or suggestion — the
 * chat renders it in NBX orange between the plain commentary.
 */
import { HEDERA_TOKEN_BY_SYMBOL } from '@/config/hederaTokens';
import { PATTERN_QUESTION, explainPattern, findPattern } from '@/config/chartPatterns';

export const NBX_SLOGAN = 'The next step';

// ── A small thesaurus so GO doesn't repeat itself ─────────────

const THESAURUS = {
  step: ['next step', 'next move', 'next stride', 'next play'],
  here: ['Here’s', 'This is', 'Lined up:', 'Ready:'],
  check: ['checking', 'looking at', 'pulling up', 'scanning'],
  ok: ['Done.', 'All set.', 'Sorted.', 'There you go.'],
} as const;

export const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
export const syn = (k: keyof typeof THESAURUS) => pick(THESAURUS[k]);

/** Rotating "working" words for the Going indicator. */
export const STEP_WORDS = ['calculating steps', 'stepping foot on Hedera', 'taking the next step', 'lining up the steps', 'measuring the stride'];

// ── Spoken token names ────────────────────────────────────────

/**
 * Voice notes spell tokens the way they sound: HBAR is said "h-bah", so
 * Whisper writes "h bar", "age bar", "each bar", "HBA"…; USDT0 comes out as
 * "USDT zero". Normalise before anything else reads the text.
 */
export function normalizeSpoken(text: string): string {
  return text
    .replace(/\b(h[\s.-]?ba(?:r|h)s?|aitch[\s-]?ba(?:r|h)s?|age[\s-]?ba(?:r|h)s?|each[\s-]?ba(?:r|h)s?|hedera[\s-]?bars?)\b/gi, 'HBAR')
    .replace(/\bHBA\b/gi, 'HBAR')
    .replace(/\bu\.?\s?s\.?\s?d\.?\s?t\.?[\s-]?(zero|0|o)\b/gi, 'USDT0')
    .replace(/\bx[\s-]sauce\b/gi, 'xSAUCE');
}

// ── Day and time ──────────────────────────────────────────────

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const clock = (d = new Date()) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
export const today = (d = new Date()) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
/** "Saturday 31 October 2026, 09:12" — also handed to the model. */
export const nowLine = (d = new Date()) => `${today(d)}, ${clock(d)}`;

export function timeOfDay(d = new Date()): 'morning' | 'afternoon' | 'evening' | 'night' {
  const h = d.getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 22) return 'evening';
  return 'night';
}

const SUGGESTIONS: Record<ReturnType<typeof timeOfDay>, [string, string]> = {
  morning: ['[[check the SAUCE price]]', '[[see my balance]]'],
  afternoon: ['[[buy 25 USDT of SAUCE]]', '[[check the HBAR price]]'],
  evening: ['[[set a buy order for SAUCE at 0.009]]', '[[see my balance]]'],
  night: ['[[set a limit order]]', '[[see my balance]]'],
};

export function greeting(d = new Date()): string {
  const tod = timeOfDay(d);
  const open =
    tod === 'morning' ? pick(['Good morning.', 'Morning — markets never sleep, but you did.'])
    : tod === 'afternoon' ? pick(['Good afternoon.', 'Afternoon.'])
    : tod === 'evening' ? pick(['Good evening.', 'Evening — time for a calm next step.'])
    : pick(['Up late? So is the market.', 'Still up — so am I.']);
  const weekend = d.getDay() === 0 || d.getDay() === 6 ? ' Weekend, but Hedera never closes.' : '';
  const [a, b] = SUGGESTIONS[tod];
  return `${open} It’s ${DAYS[d.getDay()]}, ${clock(d)}.${weekend} I’m GO — try ${a} or ${b}.`;
}

// ── What GO can say without the model ─────────────────────────

/** One reply; `more` is handed out piece by piece on "tell me more". */
export type Converse =
  | { kind: 'say'; title: string; text: string; more?: string[] }
  | { kind: 'nav'; title: string; text: string; route: string }
  | { kind: 'advice' };

const GREETING = /^\s*(hi|hello|hey|yo|hiya|howdy|sup|good (morning|afternoon|evening|day)|morning|evening|habari|sasa|mambo|niaje)\b[\s\w,!.?]{0,12}$/i;
const SMALLTALK = /^\s*(how are you|how('?s| is) it going|how are things|you good|what'?s up|habari yako)\b[\s!.?]*$/i;
const THANKS = /^\s*(thanks|thank you|thx|ty|cheers|asante|appreciate it|great,? thanks)\b[\s\w!.]{0,16}$/i;
const FAREWELL = /^\s*(bye|goodbye|see you|see ya|later|good ?night|kwaheri|that'?s all|i'?m done)\b[\s!.]*$/i;
const TIME = /\b(what('?s| is) the (time|date|day)|what time|what day|which day|today'?s date|date today|what('?s| is) today)\b/i;
const MORE = /^\s*(tell me more|more|go on|continue|keep going|and\??|explain more|more please|next)[\s!.?]*$/i;
const DEAD_END = /^\s*(ok(ay)?|k+|cool|nice|fine|alright|sure|nothing|nvm|never ?mind|idk|i don'?t know|no|nah|nope|hmm+|lol|haha+|meh|whatever|not now|maybe later)[\s!.]*$/i;
const IDENTITY = /\b(who are you|what are you|what('?s| is) (go|your name)|what do you do|what can you do|help me|how do you work|introduce yourself|your purpose)\b/i;
const SEPARATE = /\b(are you nbx|is this (the )?nbx|nbx (account|support|exchange|app|login)|my nbx|same as nbx|part of nbx|nbx-?go (and|vs\.?|versus) nbx)\b/i;
const ABOUT_NBX = /\b(what('?s| is) nbx|about nbx|nbx-?go|who (made|built|created|owns) (you|nbx|this)|who('?s| is) behind|nse|nairobi securities exchange|incubat|is this (safe|legit))\b/i;
const SLOGAN = /\b(slogan|tagline|motto)\b/i;
const ADVICE =
  /\b(should i|is it (a )?good (time|idea|investment)|worth (buying|investing)|good investment|will (it|the price|\w+) (go up|go down|pump|moon|rise|fall)|what (should|would) (i|you) (buy|do|invest)|business decision|invest(ing)? in|make (me )?money|best (coin|token|investment)|recommend|predict)\b/i;
const QUESTION = /^\s*(what|what'?s|how|why|when|where|which|who|explain|tell me about|can you explain|is it|do i|does)\b/i;

// ── Urgent: safety first ──────────────────────────────────────

const URGENT: { re: RegExp; title: string; text: string; more?: string[] }[] = [
  {
    re: /\b(hack(ed)?|drain(ed)?|compromised|someone (has|knows|got|saw|stole) my (seed|phrase|words|recovery|password)|(seed|phrase|recovery words?) (leaked|stolen|exposed|shared))\b/i,
    title: 'Urgent: wallet at risk',
    text:
      'Act now, in this order:\n1. Create a fresh wallet with a NEW recovery phrase (Settings → Log out, then create).\n2. Send everything to the new address — biggest balance first, HBAR last because it pays the fees.\n3. Never use the old words again.',
    more: ['Anyone with your recovery phrase controls the wallet — NBX-go can’t freeze or reverse transactions on Hedera. Speed matters more than anything else here.'],
  },
  {
    re: /\b(lost|stolen|broke|broken) (my )?(phone|device)\b/i,
    title: 'Urgent: lost phone',
    text:
      'Your funds live on Hedera, not on the phone. If your recovery phrase is safe, import it on a new phone (Import wallet) and everything is back. If anyone could have seen the phrase, move your funds to a new wallet straight away.',
  },
  {
    re: /\b(wrong address|sent (it )?to the wrong|mistake(nly)? sent|sent by mistake|reverse (a |my |the )?(transaction|transfer|send)|get (it|my money) back)\b/i,
    title: 'Urgent: wrong address',
    text:
      'Hedera transactions are final — nobody, NBX-go included, can reverse them. If it went to an exchange, contact that exchange with the transaction link from History (Profile → History). If it went to a person you know, ask them to send it back.',
  },
  {
    re: /\b(scam(med|mer)?|phish(ing)?|fake (site|app|support)|someone (asked|is asking) for my (seed|phrase|words|password|keys)|urgent|emergency)\b/i,
    title: 'Urgent: stay safe',
    text:
      'Stop and don’t sign or send anything. NBX-go — and NBX — will never ask for your recovery phrase or password. If you already shared the phrase, move your funds to a new wallet now.',
  },
];

// ── Open-ended questions: short pieces, more on request ───────

const TOPICS: { re: RegExp; title: string; parts: string[] }[] = [
  {
    re: /\b(why (do i need|keep) hbar|fees?|gas|network fee|hbar for)\b/i,
    title: 'HBAR and fees',
    parts: [
      'Every Hedera transaction — sends, swaps, approvals, staking — is paid in HBAR. Keep at least 1 HBAR in your wallet. [[tell me more]]',
      'Fees are tiny, usually under $0.01. But with 0 HBAR you can’t move anything, not even USDT0. A swap can take up to four small transactions (fee, associate, approve, swap).',
      'Running low? [[buy HBAR]] with USDT0 on SaucerSwap.',
    ],
  },
  {
    re: /\b(hedera|hashgraph|hts)\b/i,
    title: 'Hedera',
    parts: [
      'Hedera is a public network with final transactions in about 3–5 seconds and fees of fractions of a cent, paid in HBAR. [[tell me more]]',
      'It’s governed by a council of large organisations. Tokens on it (like SAUCE or USDT0) must be associated with your account before you can hold them — NBX-go does that for you on your first swap.',
      'Every NBX-go action settles on Hedera mainnet; you can check any of them on HashScan from History (Profile → History).',
    ],
  },
  {
    re: /\b(usdt0|usdt|tether|stablecoin)\b/i,
    title: 'USDT0',
    parts: [
      'USDT0 is Tether’s dollar stablecoin on Hedera — 1 USDT0 aims to stay at $1. [[tell me more]]',
      'NBX-go prices limit orders in USDT0, and it’s the easiest way to buy other Hedera tokens: [[buy 25 USDT of SAUCE]].',
    ],
  },
  {
    re: /\b(saucerswap|swap(s|ping)?|slippage|dex|liquidity)\b/i,
    title: 'Swaps',
    parts: [
      'Swaps go through SaucerSwap, Hedera’s main exchange. You pick the tokens; NBX-go finds the route and shows the quote before you confirm. [[tell me more]]',
      'Slippage is how far the price may move before your swap fails instead of filling badly. Small, liquid pairs (HBAR, USDT0, SAUCE) need little.',
      'Try one: [[swap 10 HBAR to SAUCE]].',
    ],
  },
  {
    re: /\b(stak(e|ing)|xsauce|mothership|yield|earn)\b/i,
    title: 'Staking',
    parts: [
      'Staking SAUCE in SaucerSwap’s Mothership gives you xSAUCE, which grows in SAUCE value over time from protocol fees. [[tell me more]]',
      'Unstake any time to turn xSAUCE back into more SAUCE than you put in. Both steps cost a little HBAR. [[stake my SAUCE]].',
    ],
  },
  {
    re: /\b(limit order|order|target price|buy at|sell at)\b/i,
    title: 'Limit orders',
    parts: [
      'A limit order buys or sells only at your price, in USDT0. [[tell me more]]',
      'NBX-go watches the price while the app is open and runs the swap on SaucerSwap when it’s hit — keep HBAR for the fee. [[set a buy order for SAUCE]].',
    ],
  },
  {
    re: /\b(seed|recovery (phrase|words)|private key|backup|secure|security|safe)\b/i,
    title: 'Keeping it safe',
    parts: [
      'Your recovery phrase is the wallet. Write it on paper, keep it offline, and never share it — NBX-go will never ask for it. [[tell me more]]',
      'NBX-go is self-custodial: keys stay encrypted on your phone, and nothing can move without your confirmation.',
    ],
  },
  {
    re: /\b(on-?device|offline|qvac|privacy|private|my data|ai model|models?)\b/i,
    title: 'On-device AI',
    parts: [
      'I run on QVAC, entirely on your phone — what you type or say never leaves it. [[tell me more]]',
      'Bigger models answer better but download more and run slower. You can switch them in [[open models]].',
    ],
  },
  {
    re: /\b(pattern|chart|candles?|technical analysis|support|resistance)\b/i,
    title: 'Charts',
    parts: [
      'Send me a chart screenshot with the image button and I’ll read the trend and any pattern. [[tell me more]]',
      'I know Head & Shoulders, Double Tops and Bottoms, flags, pennants, triangles and wedges — ask about any of them by name.',
    ],
  },
];

// ── App commands ──────────────────────────────────────────────

const NAV_VERB = /\b(open|go to|goto|take me to|navigate to|launch|bring up|show me the)\b/i;
const NAV: { re: RegExp; route: string; label: string }[] = [
  { re: /\bsettings?\b/i, route: '/settings', label: 'Settings' },
  { re: /\bmodels?\b/i, route: '/models', label: 'Models' },
  { re: /\b(history|transactions)\b/i, route: '/history', label: 'History' },
  { re: /\bcontacts?\b/i, route: '/contacts', label: 'Contacts' },
  { re: /\b(assets|tokens|portfolio)\b/i, route: '/assets', label: 'Assets' },
  { re: /\bswap\b/i, route: '/swap', label: 'Swap' },
  { re: /\b(trade|spot|orders?)\b/i, route: '/trade', label: 'Trade' },
  { re: /\b(earn|stak(e|ing))\b/i, route: '/lending', label: 'Earn' },
  { re: /\b(receive|deposit|my address|qr)\b/i, route: '/receive', label: 'Receive' },
  { re: /\b(send|withdraw)\b/i, route: '/send', label: 'Send' },
  { re: /\b(security|privacy)\b/i, route: '/security', label: 'Security & Privacy' },
  { re: /\b(about|app info)\b/i, route: '/about', label: 'App Info' },
  { re: /\bprofile\b/i, route: '/profile', label: 'Profile' },
  { re: /\b(buy|sell|ramps?)\b/i, route: '/ramps', label: 'Buy/Sell' },
];
const LOGOUT = /\b(log ?out|sign ?out|lock (the )?(app|wallet))\b/i;

/**
 * Everything GO answers from rules, in priority order: urgent first, then
 * commands, small talk and knowledge. `deadEnds` = how many dead-end
 * replies GO has just given in a row (it goes quiet after one).
 */
export function converse(text: string, deadEnds = 0): Converse | null {
  const t = text.trim();

  for (const u of URGENT) if (u.re.test(t)) return { kind: 'say', title: u.title, text: u.text, more: u.more };

  if (LOGOUT.test(t)) return { kind: 'nav', title: 'Log out', text: 'Log out is in Settings → Account. Opening Settings.', route: '/settings' };
  if (NAV_VERB.test(t)) {
    const n = NAV.find((x) => x.re.test(t));
    if (n) return { kind: 'nav', title: `Open ${n.label}`, text: `Opening ${n.label}.`, route: n.route };
  }

  if (TIME.test(t)) {
    const d = new Date();
    return { kind: 'say', title: 'Time', text: `It’s ${today(d)}, ${clock(d)}. ${timeOfDay(d) === 'night' ? 'Late — a limit order can watch the price while you sleep.' : 'Hedera’s open — it never closes.'}` };
  }
  if (GREETING.test(t)) return { kind: 'say', title: 'Hello', text: greeting() };
  if (SMALLTALK.test(t)) return { kind: 'say', title: 'Hello', text: `Running smoothly on your phone, thanks. How’s your portfolio? [[see my balance]]` };
  if (THANKS.test(t)) return { kind: 'say', title: 'You’re welcome', text: pick(['Anytime.', 'Happy to help.', 'Glad that worked.']) };
  if (FAREWELL.test(t)) {
    return { kind: 'say', title: 'Goodbye', text: timeOfDay() === 'night' ? 'Good night — your keys stay safe with you.' : 'See you — your keys stay safe with you.' };
  }
  if (DEAD_END.test(t)) {
    return deadEnds > 0
      ? { kind: 'say', title: 'Standing by', text: 'I’ll be here when you need me.' }
      : { kind: 'say', title: 'Standing by', text: `${pick(['Fair enough.', 'Noted.', 'All good.'])} If you want a next step: [[see my balance]].` };
  }

  if (findPattern(t) && (PATTERN_QUESTION.test(t) || t.split(/\s+/).length <= 4)) {
    const p = findPattern(t)!;
    return { kind: 'say', title: 'Chart pattern', text: explainPattern(p) };
  }
  if (ADVICE.test(t)) return { kind: 'advice' };
  if (SEPARATE.test(t)) return { kind: 'say', title: 'NBX-go and NBX', text: SEPARATE_TEXT, more: NBX_MORE };
  if (ABOUT_NBX.test(t)) return { kind: 'say', title: 'About NBX-go', text: SEPARATE_TEXT, more: NBX_MORE };
  if (SLOGAN.test(t)) return { kind: 'say', title: NBX_SLOGAN, text: 'NBX’s slogan is “The next step”. That’s my job: work out the next step with you, show it plainly, and let you take it.' };
  if (IDENTITY.test(t)) {
    return {
      kind: 'say',
      title: 'About GO',
      text: 'I’m GO, NBX-go’s assistant. I run on your phone and line up your next step on Hedera — you confirm every one. [[tell me more]]',
      more: [
        'I can [[swap HBAR to SAUCE]], [[send to a contact]], [[stake SAUCE]], [[set a limit order]], check prices, balances and history, and [[read a chart screenshot]] — or a QR code to send or save a contact.',
        'Say “open settings” or “take me to swap” and I’ll open the screen. Ask “what is staking?” and I’ll explain, one step at a time.',
      ],
    };
  }

  return null;
}

/**
 * Open-ended questions GO can explain, first piece only. Checked after the
 * live-data questions (balance, price, history) so "what's my SAUCE
 * balance?" still gets numbers, not an explainer.
 */
export function explain(text: string): Converse | null {
  const t = text.trim();
  if (!QUESTION.test(t) && !/\?\s*$/.test(t)) return null;
  const topic = TOPICS.find((x) => x.re.test(t));
  return topic ? { kind: 'say', title: topic.title, text: topic.parts[0], more: topic.parts.slice(1) } : null;
}

/** An open question GO has no answer for: say so briefly, offer what it knows. */
export function unknownQuestion(text: string): string | null {
  if (!QUESTION.test(text.trim())) return null;
  return 'I don’t know that one — I keep to NBX-go and Hedera. I can explain [[what is staking?]], [[why keep HBAR?]] or [[what is USDT0?]]';
}

/** "Tell me more" — matched before anything else while pieces are left. */
export const isMore = (text: string) => MORE.test(text);

const SEPARATE_TEXT =
  'NBX-go is a separate, independent wallet app — it isn’t NBX itself. It doesn’t hold an NBX account, and NBX support can’t see or recover this wallet; only your recovery phrase can. [[tell me more]]';
const NBX_MORE = [
  'NBX is built on Hedera and was incubated by the NSE, the Nairobi Securities Exchange. NBX-go shares its home chain and its slogan, “The next step”.',
  'In NBX-go your keys stay on your phone, every swap settles on Hedera through SaucerSwap, and I run offline on QVAC.',
];

/** Off-topic questions: a dry one-liner, then something useful. */
export function offTopicReply(): string {
  const quip = pick([
    'Bold question for a Hedera wallet. I stick to markets.',
    'I’d answer that, but my whole personality is tokens on Hedera.',
    'Outside my lane — I’m a trading assistant, not an oracle of everything.',
  ]);
  return `${quip} Try [[check the SAUCE price]] or ask [[what is staking?]]`;
}

// ── Business questions: honest, numerate, short ───────────────

export interface AdviceData {
  token?: string;
  price?: number;
  change24h?: number | null;
  /** 7-day closes, oldest first. */
  week?: number[];
  held?: string;
}

const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const usd = (n: number) => (n < 0.01 ? `$${n.toPrecision(4)}` : `$${n.toLocaleString('en-US', { maximumFractionDigits: n < 1 ? 4 : 2 })}`);

/**
 * GO's answer to a "should I…?" question, built from real data: one short
 * paragraph with a suggestion; the detail comes on "tell me more".
 */
export function adviceReply(d: AdviceData): { text: string; more: string[] } {
  if (!d.token || d.price == null) {
    return {
      text: 'I’m not an advisor, but I can show you the numbers. Which token — HBAR, SAUCE, PLEX, DOVU, DAVINCI or KARATE?',
      more: [],
    };
  }
  let pos = 0.5;
  let week = '';
  if (d.week && d.week.length > 1) {
    const first = d.week[0];
    const last = d.week[d.week.length - 1];
    const hi = Math.max(...d.week);
    const lo = Math.min(...d.week);
    pos = hi > lo ? (last - lo) / (hi - lo) : 0.5;
    week = `7 days: ${pct(((last - first) / first) * 100)}, range ${usd(lo)} – ${usd(hi)}.`;
  }
  const where = pos > 0.7 ? 'near the top of its week' : pos < 0.3 ? 'near the bottom of its week' : 'mid-way through its weekly range';
  const suggestion =
    pos > 0.7
      ? `[[set a buy order for ${d.token} a little lower]]`
      : pos < 0.3
        ? `[[set a buy order for ${d.token} near this level]]`
        : `[[set a limit order for ${d.token}]]`;
  const name = HEDERA_TOKEN_BY_SYMBOL[d.token]?.name;
  return {
    text:
      `Not advice — just numbers. ${d.token} is ${usd(d.price)}` +
      `${d.change24h != null ? ` (${pct(d.change24h)} today)` : ''}, ${where}. A calm ${syn('step')}: ${suggestion}. [[tell me more]]`,
    more: [
      [week, d.held ? `You hold ${d.held} ${d.token}.` : '', name && name !== d.token ? `${d.token} is ${name}.` : ''].filter(Boolean).join(' ') ||
        'That’s all the data I have for it.',
      'Only put in what you can afford to lose — the final step is always yours.',
    ],
  };
}
