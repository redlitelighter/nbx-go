/**
 * Models — GO's on-device QVAC models. One card per kind (Text — required,
 * Vision — chart reading, Speech — voice). The active model is chosen in a
 * Popover anchored to the card's "Active model" button: every option with
 * its size, trade-off, a "Downloaded" badge and a check on the active one.
 * The card itself shows status and one action (Download & load / Load now /
 * Delete). While anything downloads or loads, a banner asks the user to keep
 * NBX-go open. Everything runs on the phone; nothing leaves it.
 */
import React, { useEffect, useState } from 'react';
import { View, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { MessageSquare, LineChart, AudioLines, Check, Cpu, TriangleAlert, Trash2, ChevronDown, HardDriveDownload } from 'lucide-react-native';
import { Screen, ScreenHeader, Text, Button, Tap, Popover } from '@/components';
import { useTheme } from '@/theme';
import { ALL_ROLES, MODEL_OPTIONS, ROLE_TITLE, modelSize, useModelPrefs, type QvacModelDef, type QvacModelRole } from '@/config/qvacModels';
import { allInstalled, ensureLoaded, isModelCached, probeQvac, refreshStatus, removeModel, switchModel, useQvac } from '@/services/qvacService';

const ROLE_ICON: Record<QvacModelRole, React.ElementType> = { llm: MessageSquare, vision: LineChart, speech: AudioLines };
const ROLE_BLURB: Record<QvacModelRole, string> = {
  llm: 'Required · understands what you ask',
  vision: 'Optional · reads charts and spots patterns',
  speech: 'Optional · turns voice notes into text',
};

function mb(bytes: number) {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(2)} GB` : `${Math.round(bytes / 1e6)} MB`;
}

export default function ModelsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const states = useQvac((s) => s.states);
  const loadedIds = useQvac((s) => s.loaded);
  const selected = useModelPrefs((s) => s.selected);
  const ready = allInstalled(states);
  const [warming, setWarming] = useState<Partial<Record<QvacModelRole, boolean>>>({});
  // Which options are already on the phone (for the popover's badges).
  const [cached, setCached] = useState<Record<string, boolean>>({});
  const busy = ALL_ROLES.some((r) => states[r].kind === 'downloading' || warming[r]);

  useEffect(() => {
    probeQvac();
    refreshStatus();
  }, []);
  // Re-check badges after any status change (download finished, delete…).
  const statusKey = ALL_ROLES.map((r) => states[r].kind).join(',');
  useEffect(() => {
    let alive = true;
    (async () => {
      const entries = await Promise.all(
        ALL_ROLES.flatMap((r) => MODEL_OPTIONS[r]).map(async (m) => [m.id, await isModelCached(m).catch(() => false)] as const),
      );
      if (alive) setCached(Object.fromEntries(entries));
    })();
    return () => {
      alive = false;
    };
  }, [statusKey, selected]);

  const load = async (role: QvacModelRole) => {
    setWarming((w) => ({ ...w, [role]: true }));
    try {
      await ensureLoaded(role);
    } catch {
      // the state carries the error
    } finally {
      setWarming((w) => ({ ...w, [role]: false }));
    }
  };

  const remove = (role: QvacModelRole, def: QvacModelDef) =>
    Alert.alert('Delete model', `Delete ${def.name} from this phone? GO can't use it until it's downloaded again.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeModel(role).catch(() => {}) },
    ]);

  const pick = (role: QvacModelRole, def: QvacModelDef, close: () => void) => {
    close();
    if (def.id === selected[role]) return;
    if (states[role].kind === 'downloading' || warming[role]) {
      return Alert.alert('Still loading', 'Wait for the current model to finish before switching.');
    }
    switchModel(role, def.id).catch(() => {});
  };

  return (
    <Screen scroll edges={['top', 'bottom']}>
      <View className="page-models">
        <ScreenHeader title="Models" onBack={() => router.back()} />

        {busy ? (
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, borderRadius: 16, backgroundColor: theme.colors.brandTint, marginBottom: 12 }}>
            <TriangleAlert size={20} color={theme.colors.brand} />
            <View style={{ flex: 1 }}>
              <Text variant="body" style={{ fontWeight: '600' }}>Keep NBX-go open</Text>
              <Text variant="small" color="textSecondary">
                A model is downloading or loading. Leaving the app or locking the phone can stop it — stay on this screen until it finishes.
              </Text>
            </View>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, borderRadius: 16, backgroundColor: ready ? theme.colors.successTint : theme.colors.bgSecondary }}>
          <Cpu size={20} color={ready ? theme.colors.success : theme.colors.brand} />
          <View style={{ flex: 1 }}>
            <Text variant="body" style={{ fontWeight: '600' }}>{ready ? 'GO is ready' : 'GO needs a text model'}</Text>
            <Text variant="small" color="textSecondary">Runs offline on QVAC — nothing leaves your phone. Use Wi-Fi to download.</Text>
          </View>
        </View>

        <View style={{ gap: 14, marginTop: 18 }}>
          {ALL_ROLES.map((role) => {
            const Icon = ROLE_ICON[role];
            const st = states[role];
            const def = MODEL_OPTIONS[role].find((m) => m.id === selected[role]) ?? MODEL_OPTIONS[role][0];
            const inMemory = !!loadedIds[role];
            const loading = st.kind === 'downloading' || !!warming[role];
            return (
              <View key={role} style={{ padding: 16, borderRadius: 22, backgroundColor: theme.colors.bgSecondary, gap: 14 }}>
                {/* Header: kind + popover picker */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: theme.colors.brandTint, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={20} color={theme.colors.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="tokenName">{ROLE_TITLE[role]}</Text>
                    <Text variant="small" color="textSecondary">{ROLE_BLURB[role]}</Text>
                  </View>
                </View>

                <Popover
                  title={`Choose the ${ROLE_TITLE[role].toLowerCase()} model`}
                  trigger={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: theme.colors.bgTertiary }}>
                      <View style={{ flex: 1 }}>
                        <Text variant="small" color="textSecondary">Active model</Text>
                        <Text variant="body" style={{ fontWeight: '600' }}>{def.name}</Text>
                      </View>
                      <Text variant="small" color="textSecondary">{mb(modelSize(def))}</Text>
                      <ChevronDown size={18} color={theme.colors.textSecondary} />
                    </View>
                  }
                >
                  {(close) => (
                    <View style={{ gap: 6 }}>
                      {MODEL_OPTIONS[role].map((m) => {
                        const active = m.id === def.id;
                        return (
                          <Tap
                            key={m.id}
                            onPress={() => pick(role, m, close)}
                            pressedColor={theme.colors.pressed}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 10,
                              padding: 12,
                              borderRadius: 14,
                              backgroundColor: active ? theme.colors.brandTint : theme.colors.bgTertiary,
                            }}
                          >
                            <View style={{ flex: 1 }}>
                              <Text variant="body" style={{ fontWeight: '600' }}>{m.name}</Text>
                              <Text variant="small" color="textSecondary">{m.note} · {mb(modelSize(m))}</Text>
                              {cached[m.id] ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                  <HardDriveDownload size={12} color={theme.colors.success} />
                                  <Text variant="small" color="success">Downloaded</Text>
                                </View>
                              ) : null}
                            </View>
                            {active ? <Check size={18} color={theme.colors.brand} /> : null}
                          </Tap>
                        );
                      })}
                      <Text variant="small" color="textDisabled" style={{ paddingHorizontal: 4, marginTop: 4 }}>
                        Bigger models answer better but download more and run slower. Switching keeps the old one on the phone.
                      </Text>
                    </View>
                  )}
                </Popover>

                {/* Status + action */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {st.kind === 'installed' ? <Check size={16} color={theme.colors.success} /> : null}
                  <Text
                    variant="small"
                    color={st.kind === 'installed' ? 'success' : st.kind === 'error' ? 'error' : 'textSecondary'}
                    style={{ flex: 1, fontWeight: '600' }}
                  >
                    {st.kind === 'downloading'
                      ? `Downloading… ${Math.round(st.progress)}%`
                      : warming[role]
                        ? 'Loading into memory…'
                        : st.kind === 'installed'
                          ? inMemory ? 'Loaded — ready to use' : 'Downloaded'
                          : st.kind === 'error'
                            ? 'Failed'
                            : st.kind === 'unknown'
                              ? 'Checking…'
                              : 'Not downloaded'}
                  </Text>
                  {st.kind === 'installed' && !loading ? (
                    <Tap onPress={() => remove(role, def)} hitSlop={8} accessibilityLabel={`Delete ${def.name}`}>
                      <Trash2 size={16} color={theme.colors.error} />
                    </Tap>
                  ) : null}
                </View>
                {st.kind === 'downloading' ? (
                  <View style={{ height: 4, borderRadius: 2, backgroundColor: theme.colors.bgTertiary, overflow: 'hidden' }}>
                    <View style={{ width: `${Math.max(2, st.progress)}%`, height: 4, backgroundColor: theme.colors.brand }} />
                  </View>
                ) : null}
                {st.kind === 'error' ? <Text variant="small" color="error">{st.message}</Text> : null}

                {!(st.kind === 'installed' && inMemory) ? (
                  // "Checking…" must not block: if the status check hangs, this still works.
                  <Button
                    label={st.kind === 'installed' ? 'Load now' : st.kind === 'error' ? 'Retry download' : 'Download & load'}
                    variant={role === 'llm' && st.kind !== 'installed' ? 'primary' : 'tinted'}
                    onPress={() => load(role)}
                    loading={loading}
                    disabled={loading}
                  />
                ) : null}
              </View>
            );
          })}
        </View>

        {ready ? (
          <View style={{ marginTop: 22 }}>
            <Button label="Open GO" onPress={() => (router.canGoBack() ? router.back() : router.push('/xc-chat'))} />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
