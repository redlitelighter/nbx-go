import React, { useState } from 'react';
import { View, Pressable, Keyboard } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { ClipboardPaste, Eraser } from 'lucide-react-native';
import { Screen, ScreenHeader, Text, Button, Pill, SeedWordInputGrid } from '@/components';
import { isSeedWord } from '@/components/SeedWordInputGrid';
import { useTheme } from '@/theme';
import { useWalletActions } from '@/wdk/hooks/useWalletActions';

/**
 * Import recovery phrase. Matches the prototype's `seed-import` screen: a
 * 2-column grid of numbered word boxes (not one paste-all field), a
 * bottom-pinned "Import wallet" button.
 *
 * Word count: the prototype only shows a fixed 12-box grid, but WDK supports
 * 12 or 24-word mnemonics — same 12/24 toggle pattern as seed-hidden, so a
 * 24-word phrase can actually be imported, not just previewed.
 *
 * The button lives in Screen's `footer`, which is pinned above the keyboard
 * — it used to sit at the end of the scroll view and was hidden behind the
 * keyboard on Android while typing.
 *
 * Flow: import wallet HERE (restore + unlock via WDK) -> push to password
 * (mode=import, which sets up the app password vault but does NOT call
 * importWallet again, since it's already done) -> cloud-backup. This mirrors
 * exactly how password.tsx already expects the import flow to work.
 */
export default function Import() {
  const router = useRouter();
  const theme = useTheme();
  const { importWallet } = useWalletActions();
  const [wordCount, setWordCount] = useState<12 | 24>(12);
  const [words, setWords] = useState<string[]>(Array(24).fill(''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = words.slice(0, wordCount).map((w) => w.trim().toLowerCase());
  const filled = active.filter((w) => w.length > 0).length;
  const unknown = active.filter((w) => w.length > 0 && !isSeedWord(w)).length;
  const complete = filled === wordCount && unknown === 0;
  // Full BIP39 check, including the checksum word.
  const checksumOk = complete && validateMnemonic(active.join(' '), wordlist);

  const setCount = (n: 12 | 24) => {
    setWordCount(n);
    setError(null);
  };

  const onPaste = async () => {
    const text = (await Clipboard.getStringAsync()).trim().toLowerCase();
    const parts = text.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return;
    if (parts.length === 24) setWordCount(24);
    else if (parts.length === 12) setWordCount(12);
    const next = Array(24).fill('');
    parts.slice(0, 24).forEach((w, i) => (next[i] = w));
    setWords(next);
    setError(null);
    Keyboard.dismiss();
  };

  const onClear = () => {
    setWords(Array(24).fill(''));
    setError(null);
  };

  const onImport = async () => {
    if (!checksumOk) return;
    Keyboard.dismiss();
    setError(null);
    setBusy(true);
    try {
      await importWallet(active.join(' '));
      router.push('/(onboarding)/password?mode=import');
    } catch (e: any) {
      setError(e?.message ?? 'Could not import wallet. Check your recovery phrase and try again.');
    } finally {
      setBusy(false);
    }
  };

  const status = unknown > 0
    ? { text: `${unknown} word${unknown > 1 ? 's' : ''} not in the recovery word list`, color: 'error' as const }
    : complete && !checksumOk
      ? { text: 'These words don’t form a valid recovery phrase — check the order', color: 'error' as const }
      : checksumOk
        ? { text: 'Recovery phrase looks valid', color: 'success' as const }
        : { text: `${filled} of ${wordCount} words`, color: 'textSecondary' as const };

  return (
    <Screen
      scroll
      footer={
        <Button
          label="Import wallet"
          onPress={onImport}
          loading={busy}
          disabled={!checksumOk || busy}
        />
      }
    >
      <ScreenHeader backStyle="plain" step="Step 1 of 3" onBack={() => router.back()} />
      <Text variant="h1">Enter recovery phrase</Text>
      <Text variant="body" color="textSecondary">
        Type or paste your {wordCount}-word recovery phrase. Press space or Next to move to the next word.
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <Pill label="12 words" active={wordCount === 12} onPress={() => setCount(12)} />
        <Pill label="24 words" active={wordCount === 24} onPress={() => setCount(24)} />
        <View style={{ flex: 1 }} />
        <ToolButton icon={<ClipboardPaste size={16} color={theme.colors.brand} />} label="Paste" onPress={onPaste} />
        {filled > 0 ? (
          <ToolButton icon={<Eraser size={16} color={theme.colors.textSecondary} />} label="Clear" onPress={onClear} />
        ) : null}
      </View>

      <SeedWordInputGrid count={wordCount} words={words} onChangeWords={setWords} onSubmit={onImport} />

      <Text variant="small" color={status.color}>{status.text}</Text>
      {error ? (
        <Text variant="small" color="error" style={{ marginTop: 6 }}>{error}</Text>
      ) : null}
    </Screen>
  );
}

function ToolButton({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 6 }}
    >
      {icon}
      <Text variant="small" style={{ fontWeight: '500' }}>{label}</Text>
    </Pressable>
  );
}
