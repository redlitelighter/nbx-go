import React, { useRef } from 'react';
import { View, TextInput, StyleSheet, Pressable } from 'react-native';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { useTheme } from '@/theme';
import { useResponsive } from '@/theme/responsive';
import { Text } from './Text';

const WORDS = new Set(wordlist);

/** True when `word` is in the BIP39 English list (empty counts as not-yet-wrong). */
export function isSeedWord(word: string): boolean {
  return WORDS.has(word.trim().toLowerCase());
}

interface SeedWordInputGridProps {
  count: 12 | 24;
  words: string[];
  onChangeWords: (words: string[]) => void;
  /** Fired from the keyboard's "Done" key on the last box. */
  onSubmit?: () => void;
}

/**
 * Editable 2-column grid of numbered recovery-phrase word inputs — matches
 * the prototype's `.grid2` + `.fld.seed-word` combination.
 *
 * TWO distinct input behaviors, handled separately and deliberately:
 *
 * 1. PASTE (multiple whitespace-separated words land in one box at once —
 *    the raw text has 2+ words in a single onChangeText call): distribute
 *    across this box and the following ones.
 *
 * 2. TYPING one word at a time: auto-advance to the next box ONLY when the
 *    raw text ends with a trailing space — i.e. the person just pressed
 *    space to signal "done with this word." An earlier version advanced
 *    focus whenever the box's content was "a single word with no
 *    whitespace" — but that's true after EVERY keystroke while typing any
 *    word ("t", "th", "thi", "this" are all "one word, no whitespace"), so
 *    it fired on every letter and scattered a typed word one character per
 *    box across the grid. Checking for the trailing space specifically is
 *    what distinguishes "still typing this word" from "just finished it."
 *
 * The keyboard's Next key also advances (Done on the last box submits), and
 * each finished word is checked against the BIP39 list so a typo shows up
 * on the box itself, not only as a failed import.
 */
export function SeedWordInputGrid({ count, words, onChangeWords, onSubmit }: SeedWordInputGridProps) {
  const theme = useTheme();
  const { moderateScale } = useResponsive();
  const inputRefs = useRef<Array<TextInput | null>>([]);
  const [focused, setFocused] = React.useState<number | null>(null);

  const gap = moderateScale(8);

  const focusBox = (i: number) => inputRefs.current[i]?.focus();

  const handleChange = (index: number, rawText: string) => {
    const parts = rawText.trim().toLowerCase().split(/\s+/).filter(Boolean);

    if (parts.length > 1) {
      // Pasted a full phrase into this box — distribute across boxes.
      const next = [...words];
      for (let i = 0; i < parts.length && index + i < count; i++) {
        next[index + i] = parts[i];
      }
      onChangeWords(next);
      const lastFilled = Math.min(index + parts.length, count) - 1;
      if (lastFilled < count - 1) focusBox(lastFilled + 1);
      else inputRefs.current[lastFilled]?.blur();
      return;
    }

    // Single word, still being typed (or empty) — store the TRIMMED value
    // always, but only advance focus if the raw text had a trailing space,
    // meaning the person just finished typing this word.
    const endsWithSpace = /\s$/.test(rawText);
    const value = parts[0] ?? '';
    const next = [...words];
    next[index] = value;
    onChangeWords(next);

    if (endsWithSpace && value.length > 0 && index < count - 1) focusBox(index + 1);
  };

  return (
    <View style={[styles.grid, { gap, marginVertical: moderateScale(14) }]}>
      {Array.from({ length: count }).map((_, i) => {
        const value = words[i] ?? '';
        // Only flag a word once the person has moved on from it.
        const invalid = value.length > 0 && focused !== i && !isSeedWord(value);
        const borderColor = invalid
          ? theme.colors.error
          : focused === i
            ? theme.colors.brand
            : theme.colors.border;
        const isLast = i === count - 1;

        return (
          <Pressable
            key={i}
            onPress={() => focusBox(i)}
            // One flat object: NativeWind's Pressable wrapper is unreliable with style arrays.
            style={StyleSheet.flatten([
              styles.item,
              {
                borderRadius: theme.radii.sm,
                backgroundColor: theme.colors.bgSecondary,
                borderColor,
                paddingHorizontal: moderateScale(10),
                height: moderateScale(46),
              },
            ])}
          >
            <Text variant="small" color="textSecondary" style={{ width: moderateScale(22) }}>
              {i + 1}
            </Text>
            <TextInput
              ref={(el) => { inputRefs.current[i] = el; }}
              value={value}
              onChangeText={(text) => handleChange(i, text)}
              onFocus={() => setFocused(i)}
              onBlur={() => setFocused((f) => (f === i ? null : f))}
              returnKeyType={isLast ? 'done' : 'next'}
              submitBehavior={isLast ? 'blurAndSubmit' : 'submit'}
              onSubmitEditing={() => (isLast ? onSubmit?.() : focusBox(i + 1))}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              importantForAutofill="no"
              spellCheck={false}
              keyboardType="visible-password" // Android: no suggestion strip, so the phrase isn't learned by the keyboard
              secureTextEntry={false}
              style={{
                flex: 1,
                color: theme.colors.textPrimary,
                fontSize: moderateScale(16),
                paddingVertical: 0,
                textAlignVertical: 'center',
              }}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  item: { flexBasis: '47%', flexGrow: 1, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center' },
});
