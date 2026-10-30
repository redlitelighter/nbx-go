/**
 * src/config/chartPatterns.ts — the classic chart patterns GO knows.
 *
 * Used two ways: (1) the vision prompt asks the on-device model to name one
 * of these if it sees it; GO then explains it from here, so the small model
 * only has to recognise, not explain; (2) "what is a bull flag?" questions
 * are answered straight from here. Standard technical-analysis readings;
 * patterns are probabilities, not promises.
 */
export type PatternSignal = 'reversal' | 'continuation' | 'either';

export interface ChartPattern {
  name: string;
  /** Words the model or user might use for it. */
  aliases: string[];
  signal: PatternSignal;
  /** Which way it usually resolves. */
  bias: 'bullish' | 'bearish' | 'depends on the breakout';
  looks: string;
  confirms: string;
}

export const CHART_PATTERNS: ChartPattern[] = [
  {
    name: 'Head & Shoulders',
    aliases: ['head and shoulders', 'head & shoulders', 'h&s'],
    signal: 'reversal',
    bias: 'bearish',
    looks: 'three peaks after an uptrend — a higher middle "head" between two lower "shoulders", sitting on a neckline',
    confirms: 'a close below the neckline; the usual target is the head-to-neckline height projected down',
  },
  {
    name: 'Inverse Head & Shoulders',
    aliases: ['inverse head and shoulders', 'inverted head and shoulders', 'reverse head and shoulders'],
    signal: 'reversal',
    bias: 'bullish',
    looks: 'three troughs after a downtrend, the middle one deepest, under a neckline',
    confirms: 'a close above the neckline',
  },
  {
    name: 'Double Top',
    aliases: ['double top', 'm pattern', 'm-pattern'],
    signal: 'reversal',
    bias: 'bearish',
    looks: 'two peaks at about the same price with a dip between them — an "M"',
    confirms: 'a break below the dip between the peaks',
  },
  {
    name: 'Double Bottom',
    aliases: ['double bottom', 'w pattern', 'w-pattern'],
    signal: 'reversal',
    bias: 'bullish',
    looks: 'two troughs at about the same price with a bounce between — a "W"',
    confirms: 'a break above the bounce between the troughs',
  },
  {
    name: 'Bull Flag',
    aliases: ['bull flag', 'bullish flag', 'flag'],
    signal: 'continuation',
    bias: 'bullish',
    looks: 'a sharp rise (the pole) followed by a short, gently down-sloping channel (the flag)',
    confirms: 'a break up out of the flag, ideally on rising volume',
  },
  {
    name: 'Bear Flag',
    aliases: ['bear flag', 'bearish flag'],
    signal: 'continuation',
    bias: 'bearish',
    looks: 'a sharp drop followed by a short, gently up-sloping channel',
    confirms: 'a break down out of the flag',
  },
  {
    name: 'Pennant',
    aliases: ['pennant', 'bull pennant', 'bear pennant'],
    signal: 'continuation',
    bias: 'depends on the breakout',
    looks: 'a sharp move followed by a small symmetrical triangle of converging highs and lows',
    confirms: 'a breakout in the direction of the move before it',
  },
  {
    name: 'Ascending Triangle',
    aliases: ['ascending triangle'],
    signal: 'continuation',
    bias: 'bullish',
    looks: 'flat resistance on top with rising lows underneath',
    confirms: 'a close above the flat resistance',
  },
  {
    name: 'Descending Triangle',
    aliases: ['descending triangle'],
    signal: 'continuation',
    bias: 'bearish',
    looks: 'flat support underneath with falling highs above',
    confirms: 'a close below the flat support',
  },
  {
    name: 'Symmetrical Triangle',
    aliases: ['symmetrical triangle', 'triangle'],
    signal: 'either',
    bias: 'depends on the breakout',
    looks: 'lower highs and higher lows converging to a point',
    confirms: 'whichever side breaks first, usually in the direction of the prior trend',
  },
  {
    name: 'Rising Wedge',
    aliases: ['rising wedge', 'ascending wedge'],
    signal: 'reversal',
    bias: 'bearish',
    looks: 'price climbing inside two up-sloping lines that converge — momentum fading',
    confirms: 'a break below the lower line',
  },
  {
    name: 'Falling Wedge',
    aliases: ['falling wedge', 'descending wedge', 'wedge'],
    signal: 'reversal',
    bias: 'bullish',
    looks: 'price falling inside two down-sloping lines that converge — selling pressure fading',
    confirms: 'a break above the upper line',
  },
];

/** The vision model's pattern vocabulary, for its prompt. */
export const PATTERN_NAMES = CHART_PATTERNS.map((p) => p.name).join(', ');

/** Finds a pattern named in free text (longest alias first, so "inverse head and shoulders" wins). */
export function findPattern(text: string): ChartPattern | null {
  const t = text.toLowerCase();
  const hits = CHART_PATTERNS.flatMap((p) => p.aliases.map((a) => ({ p, a }))).filter(({ a }) => t.includes(a));
  hits.sort((x, y) => y.a.length - x.a.length);
  return hits[0]?.p ?? null;
}

/** One-paragraph explanation, with actions marked [[like this]] for GO's orange highlight. */
export function explainPattern(p: ChartPattern): string {
  const kind = p.signal === 'either' ? 'can break either way' : `is a ${p.signal} pattern`;
  return (
    `${p.name} ${kind} — usually ${p.bias}. It looks like ${p.looks}. ` +
    `It’s confirmed by ${p.confirms}. Until then it’s a possibility, not a signal — ` +
    `[[set a limit order at the breakout level]] rather than guessing early.`
  );
}

export const PATTERN_QUESTION = /\b(what('?s| is| are)|explain|tell me about|how (do|does) .* work|meaning of)\b/i;
