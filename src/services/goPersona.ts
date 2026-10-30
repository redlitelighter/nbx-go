/**
 * src/services/goPersona.ts — who GO is and how it talks.
 *
 * GO is NBX-go's on-device assistant: professional and informative first,
 * with a dry one-liner when a question is off-topic, and always a concrete
 * suggestion. NBX's slogan is "The next step", so GO talks in steps.
 *
 * Markup: text inside [[double brackets]] is an action or suggestion — the
 * chat renders it in NBX orange between the plain (white) commentary.
 *
 * Questions about GO/NBX, greetings, chart-pattern questions and "should
 * I…?" business questions are answered here from fixed facts and live data
 * — never from the 0.6B model (it would make facts up).
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

// ── Time-aware greeting ───────────────────────────────────────

export function timeOfDay(d = new Date()): 'morning' | 'afternoon' | 'evening' | 'night' {
  const h = d.getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 22) return 'evening';
  return 'night';
}

const SUGGESTIONS: Record<ReturnType<typeof timeOfDay>, string[]> = {
  morning: ['[[check the SAUCE price]]', '[[see my balance]]', '[[what moved overnight?]]'],
  afternoon: ['[[buy 25 USDT of SAUCE]]', '[[stake my SAUCE]]', '[[check the HBAR price]]'],
  evening: ['[[set a buy order for SAUCE at 0.009]]', '[[see my balance]]', '[[what is NBX?]]'],
  night: ['[[set a limit order]] and sleep on it', '[[see my balance]]', '[[read a chart screenshot]]'],
};

export function greeting(d = new Date()): string {
  const tod = timeOfDay(d);
  const open =
    tod === 'morning' ? pick(['Good morning.', 'Morning — markets never sleep, but you did.', 'Good morning, early stepper.'])
    : tod === 'afternoon' ? pick(['Good afternoon.', 'Afternoon. Hedera’s busy, so are you.'])
    : tod === 'evening' ? pick(['Good evening.', 'Evening — time for a calm next step.'])
    : pick(['Up late? So is the market.', 'Burning the midnight oil. I’m on-device, so I don’t sleep either.']);
  const s = SUGGESTIONS[tod];
  return `${open} I’m GO, your ${syn('step')} on Hedera. Try ${s[0]}, ${s[1]} or ${s[2]}.`;
}

const GREETING = /^\s*(hi|hello|hey|yo|hiya|howdy|sup|good (morning|afternoon|evening|day)|morning|evening|habari|sasa|mambo)\b[\s!.,?]*$/i;

// ── Persona detection ─────────────────────────────────────────

const IDENTITY = /\b(who are you|what are you|what('?s| is) (go|your name)|what do you do|what can you do|help me|how do you work|introduce yourself|your purpose)\b/i;
const ABOUT_NBX = /\b(what('?s| is) nbx|about nbx|nbx-?go|who (made|built|created|owns) (you|nbx|this)|who('?s| is) behind|nse|nairobi securities exchange|incubat|is this (safe|legit)|why hedera|built on)\b/i;
const SLOGAN = /\b(slogan|tagline|motto)\b/i;
const ADVICE =
  /\b(should i|is it (a )?good (time|idea|investment)|worth (buying|investing)|good investment|will (it|the price|\w+) (go up|go down|pump|moon|rise|fall)|what (should|would) (i|you) (buy|do|invest)|business decision|invest(ing)? in|make (me )?money|best (coin|token|investment)|recommend|predict)\b/i;

export type PersonaKind = 'greeting' | 'identity' | 'nbx' | 'slogan' | 'advice' | 'pattern';

export function detectPersona(text: string): PersonaKind | null {
  if (GREETING.test(text)) return 'greeting';
  if (findPattern(text) && (PATTERN_QUESTION.test(text) || text.trim().split(/\s+/).length <= 4)) return 'pattern';
  if (ADVICE.test(text)) return 'advice';
  if (ABOUT_NBX.test(text)) return 'nbx';
  if (SLOGAN.test(text)) return 'slogan';
  if (IDENTITY.test(text)) return 'identity';
  return null;
}

export function personaReply(kind: Exclude<PersonaKind, 'advice'>, text = ''): string {
  switch (kind) {
    case 'greeting':
      return greeting();
    case 'identity':
      return (
        'I’m GO — NBX-go’s assistant, and I run entirely on your phone, so nothing you tell me leaves it. ' +
        'I line up your next step on Hedera: I can [[buy, sell or swap on SaucerSwap]], [[send to an address or a contact]], ' +
        '[[stake SAUCE]], [[set a buy or sell order at your price]], check prices and balances, and [[read a chart screenshot]] for patterns. ' +
        'I propose; you confirm every step.'
      );
    case 'nbx':
      return (
        'NBX is built on Hedera — fast, low-fee and carbon-negative — and was incubated by the NSE, the Nairobi Securities Exchange. ' +
        'NBX-go is its self-custodial wallet: your keys stay on your phone, every swap settles on Hedera through SaucerSwap, ' +
        'and I run offline on QVAC. Its slogan is “The next step”. Curious? [[See my balance]] or [[check the SAUCE price]].'
      );
    case 'slogan':
      return 'NBX’s slogan is “The next step”. That’s the job: work out the next step with you, show it plainly, and let you take it. [[Try one]].';
    case 'pattern': {
      const p = findPattern(text);
      return p ? explainPattern(p) : 'Name a pattern — Head & Shoulders, Double Top, flags, pennants, triangles, wedges — and I’ll walk you through it.';
    }
  }
}

/** Off-topic questions: a dry one-liner, then something useful. */
export function offTopicReply(): string {
  const quip = pick([
    'Bold question for a Hedera wallet. I’m flattered, but I stick to markets.',
    'I’d answer that, but my entire personality is tokens on Hedera.',
    'That one’s outside my lane — I’m a trading assistant, not an oracle of everything.',
    'I could guess, but guessing is how portfolios get hurt. Let’s stay on topic.',
  ]);
  return `${quip} I can [[check the SAUCE price]], [[see my balance]], [[swap HBAR to PLEX]] or [[set a limit order]].`;
}

// ── Business questions: honest, numerate, a little theatrical ─

const ADVICE_OPENERS = [
  'I’m not a professional advisor — but let me crunch my numbers… summoning the gods of code.',
  'Not financial advice — I’m an assistant, not an advisor — but hold on, calculating steps and consulting the gods of code.',
  'I can’t make the decision for you — I’m not a licensed advisor — but I can crunch the numbers. Stepping foot into the data…',
];

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

/** GO's in-character answer to a "should I…?" question, built from real data. */
export function adviceReply(d: AdviceData): string {
  const opener = pick(ADVICE_OPENERS);
  if (!d.token || d.price == null) {
    return `${opener}\n\nTell me which token you’re weighing up — HBAR, SAUCE, PLEX, DOVU, DAVINCI or KARATE — and I’ll lay out its numbers: price, the last 24 hours, the 7-day trend, and what you hold. The final step is always yours.`;
  }
  const lines = [`• Price: ${usd(d.price)}`];
  if (d.change24h != null) lines.push(`• 24h: ${pct(d.change24h)}`);
  let pos = 0.5;
  if (d.week && d.week.length > 1) {
    const first = d.week[0];
    const last = d.week[d.week.length - 1];
    const hi = Math.max(...d.week);
    const lo = Math.min(...d.week);
    lines.push(`• 7 days: ${pct(((last - first) / first) * 100)} (range ${usd(lo)} – ${usd(hi)})`);
    pos = hi > lo ? (last - lo) / (hi - lo) : 0.5;
    lines.push(`• Sitting ${pos > 0.7 ? 'near the top' : pos < 0.3 ? 'near the bottom' : 'mid-way'} of its weekly range`);
  }
  if (d.held) lines.push(`• You hold: ${d.held} ${d.token}`);
  const name = HEDERA_TOKEN_BY_SYMBOL[d.token]?.name;
  const suggestion =
    pos > 0.7
      ? `[[set a buy order for ${d.token} a little lower]] instead of chasing the top`
      : pos < 0.3
        ? `[[set a buy order for ${d.token} near this level]] and let the price come to you`
        : `[[set a limit order for ${d.token}]] at a price you’re happy with`;
  return (
    `${opener}\n\n${d.token}${name && name !== d.token ? ` (${name})` : ''} by the numbers:\n${lines.join('\n')}\n\n` +
    `The gods of code have spoken — in numbers, not prophecies. If you want a calmer ${syn('step')}, ${suggestion}. ` +
    'Only put in what you can afford to lose. This is information, not financial advice.'
  );
}
