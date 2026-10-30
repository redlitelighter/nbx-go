/**
 * ScrambleText — cycles through words with a "decode" effect: each letter
 * flickers through random glyphs and settles left to right into the next
 * word. Used on the start-up screen ("Please wait as NBX is loading").
 */
import React, { useEffect, useRef, useState } from 'react';
import { Text, type TextStyle } from 'react-native';

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+<>/';

export function ScrambleText({
  words,
  style,
  holdMs = 1300,
  frameMs = 40,
}: {
  words: string[];
  style?: TextStyle;
  /** How long each word stays readable. */
  holdMs?: number;
  frameMs?: number;
}) {
  const [shown, setShown] = useState(words[0] ?? '');
  const index = useRef(0);

  useEffect(() => {
    let frame: ReturnType<typeof setInterval> | null = null;
    let hold: ReturnType<typeof setTimeout> | null = null;

    const scrambleTo = (target: string, from: string) => {
      const len = Math.max(target.length, from.length);
      let tick = 0;
      const steps = len * 2 + 6;
      frame = setInterval(() => {
        tick++;
        const settled = Math.floor((tick / steps) * len);
        let out = '';
        for (let i = 0; i < len; i++) {
          if (i < settled) out += target[i] ?? '';
          else if (i < target.length) out += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        }
        setShown(out);
        if (tick >= steps) {
          if (frame) clearInterval(frame);
          setShown(target);
          hold = setTimeout(next, holdMs);
        }
      }, frameMs);
    };

    const next = () => {
      const from = words[index.current] ?? '';
      index.current = (index.current + 1) % words.length;
      scrambleTo(words[index.current], from);
    };

    hold = setTimeout(next, holdMs);
    return () => {
      if (frame) clearInterval(frame);
      if (hold) clearTimeout(hold);
    };
  }, [words, holdMs, frameMs]);

  return <Text style={style}>{shown}</Text>;
}
