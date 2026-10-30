/**
 * src/services/qvacService.ts — thin wrapper over @qvac/sdk for GO.
 *
 * - Status: getModelInfo({ name }).isCached (vision also needs its projector).
 * - Install: loadModel downloads (with progress) and loads.
 * - Delete: unloadModel({ clearStorage: true }) removes the files.
 * - Run: completion() for text and image (SmolVLM attachments), transcribe()
 *   for speech.
 *
 * Loaded model ids are kept for the app session so each model loads once.
 */
import { cancel, completion, getModelInfo, heartbeat, loadModel, subscribeServerLogs, transcribe, unloadModel } from '@qvac/sdk';
import { create } from 'zustand';
import { ALL_ROLES, XC_REQUIRED_ROLES, activeModel, useModelPrefs, type QvacModelRole } from '@/config/qvacModels';

export type ModelState =
  | { kind: 'unknown' }
  | { kind: 'missing' }
  | { kind: 'downloading'; progress: number }
  | { kind: 'installed' }
  | { kind: 'error'; message: string };

interface QvacState {
  states: Record<QvacModelRole, ModelState>;
  loaded: Partial<Record<QvacModelRole, string>>;
  set: (role: QvacModelRole, s: ModelState) => void;
}

export const useQvac = create<QvacState>((set) => ({
  states: { llm: { kind: 'unknown' }, vision: { kind: 'unknown' }, speech: { kind: 'unknown' } },
  loaded: {},
  set: (role, s) => set((st) => ({ states: { ...st.states, [role]: s } })),
}));

const setState = (role: QvacModelRole, s: ModelState) => useQvac.getState().set(role, s);

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)),
  ]);
}

async function cached(name: string): Promise<boolean> {
  try {
    return (await withTimeout(getModelInfo({ name }), 10_000, `getModelInfo(${name})`)).isCached;
  } catch (e: any) {
    // A hung or failing QVAC worker must not block the page: treat as not
    // installed so Download stays available, and log why.
    console.warn('[qvac]', e?.message ?? e);
    return false;
  }
}

/** Whether every file of a model (and its projector) is already on the phone. */
export async function isModelCached(def: { model: { name: string }; companions?: { name: string }[] }): Promise<boolean> {
  const parts = [def.model, ...(def.companions ?? [])];
  return (await Promise.all(parts.map((p) => cached(p.name)))).every(Boolean);
}

/** Logs whether QVAC's worker answers at all (diagnostics for the Models page). */
let logsSubscribed = false;

export async function probeQvac(): Promise<void> {
  // Mirror the worker's own logs into Metro (dev diagnostics only). This is
  // how the dev-reload cache-lock issue was found: after a JS reload the old
  // QVAC worker in the same process keeps `.qvac/.cache.lock`, so the new
  // worker's calls block until a cold start.
  if (__DEV__ && !logsSubscribed) {
    logsSubscribed = true;
    try {
      subscribeServerLogs((log: any) => console.log(`[qvac worker] [${log.level}] ${log.namespace ?? ''}: ${String(log.message).slice(0, 300)}`));
    } catch (e: any) {
      console.warn('[qvac] subscribeServerLogs failed:', e?.message ?? e);
    }
  }
  const started = Date.now();
  try {
    const r = await withTimeout(heartbeat(), 15_000, 'heartbeat');
    console.log('[qvac] heartbeat ok in', Date.now() - started, 'ms', JSON.stringify(r).slice(0, 200));
  } catch (e: any) {
    console.warn('[qvac] heartbeat failed:', e?.message ?? e);
  }
}

export async function refreshStatus(): Promise<void> {
  if (!useModelPrefs.getState().loaded) await useModelPrefs.getState().load();
  await Promise.all(
    ALL_ROLES.map(async (role) => {
      const def = activeModel(role);
      const parts = [def.model, ...(def.companions ?? [])];
      const all = (await Promise.all(parts.map((p) => cached(p.name)))).every(Boolean);
      const cur = useQvac.getState().states[role];
      if (cur.kind !== 'downloading') setState(role, { kind: all ? 'installed' : 'missing' });
    }),
  );
}

/** Downloads (if needed) and loads a model; returns its loaded id. */
export async function ensureLoaded(role: QvacModelRole): Promise<string> {
  const existing = useQvac.getState().loaded[role];
  if (existing) return existing;
  const def = activeModel(role);
  setState(role, { kind: 'downloading', progress: 0 });
  try {
    const id = await loadModel({
      modelSrc: def.model as any,
      ...(def.modelConfig ? { modelConfig: def.modelConfig as any } : {}),
      onProgress: (p: unknown) => {
        const pct = (p as { percentage?: number }).percentage;
        if (typeof pct === 'number') setState(role, { kind: 'downloading', progress: Math.min(pct, 100) });
      },
    } as any);
    useQvac.setState((st) => ({ loaded: { ...st.loaded, [role]: id } }));
    setState(role, { kind: 'installed' });
    return id;
  } catch (e: any) {
    setState(role, { kind: 'error', message: e?.message ?? 'Download failed' });
    throw e;
  }
}

/** Unloads the model and deletes its files from the device. */
export async function removeModel(role: QvacModelRole): Promise<void> {
  const id = useQvac.getState().loaded[role] ?? (await ensureLoaded(role));
  await unloadModel({ modelId: id, clearStorage: true } as any);
  useQvac.setState((st) => {
    const loaded = { ...st.loaded };
    delete loaded[role];
    return { loaded };
  });
  setState(role, { kind: 'missing' });
}

/**
 * Switches GO to another model of the same kind. The old one is unloaded
 * from memory but its files stay (switching back is instant); the new one
 * downloads on first use or from the Models page.
 */
export async function switchModel(role: QvacModelRole, id: string): Promise<void> {
  const current = useQvac.getState().loaded[role];
  if (current) await unloadModel({ modelId: current } as any).catch(() => {});
  useQvac.setState((st) => {
    const loaded = { ...st.loaded };
    delete loaded[role];
    return { loaded };
  });
  await useModelPrefs.getState().select(role, id);
  setState(role, { kind: 'unknown' });
  await refreshStatus();
}

export function allInstalled(states: Record<QvacModelRole, ModelState>): boolean {
  return XC_REQUIRED_ROLES.every((r) => states[r].kind === 'installed');
}

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
  attachments?: { path: string }[];
}

export interface CompletionOptions {
  /** Grammar-constrained output, e.g. { type: 'json_schema', json_schema: { name, schema } }. */
  responseFormat?: Record<string, unknown>;
  /** Token budget for the reply. */
  predict?: number;
  /** Receives a function that stops this completion (the chat's stop button). */
  onCancelable?: (stop: () => Promise<void>) => void;
}

/** Runs a completion and streams text deltas to `onDelta`; resolves to the full text. */
export async function runCompletion(
  role: 'llm' | 'vision',
  history: ChatTurn[],
  onDelta?: (text: string) => void,
  opts: CompletionOptions = {},
): Promise<string> {
  const modelId = await ensureLoaded(role);
  const run = completion({
    modelId,
    history: history as any,
    stream: true,
    captureThinking: false,
    ...(opts.responseFormat ? { responseFormat: opts.responseFormat } : {}),
    ...(opts.predict ? { generationParams: { predict: opts.predict } } : {}),
  } as any) as any;
  opts.onCancelable?.(() => cancel({ requestId: run.requestId } as any).catch(() => {}));
  let full = '';
  for await (const event of run.events) {
    if (event.type === 'contentDelta') {
      full += event.text;
      onDelta?.(full);
    }
  }
  const final = await run.final;
  const text = typeof final?.text === 'string' && final.text.trim() ? final.text.trim() : full;
  return text;
}

export async function transcribeAudio(path: string): Promise<string> {
  const modelId = await ensureLoaded('speech');
  return await transcribe({ modelId, audioChunk: path });
}
