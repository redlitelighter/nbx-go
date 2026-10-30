/**
 * src/config/qvacModels.ts
 *
 * On-device models for GO (NBX-go's assistant), from the QVAC SDK's built-in
 * registry (each exported descriptor carries the registry name, source and
 * expected size — sizes below are those values). Three kinds, each with a
 * phone-sized default and bigger, smarter options the user can switch to on
 * the Models page:
 *
 *   Text   — Qwen3 0.6B (382 MB) · Llama 3.2 1B (773 MB) · Qwen3 1.7B (1.06 GB)
 *   Vision — SmolVLM2 500M (546 MB) · Qwen3.5 0.8B (650 MB) · Qwen3-VL 2B (1.55 GB)
 *   Speech — Whisper tiny.en (44 MB) · base.en (82 MB) · small.en (264 MB)
 *
 * All run through QVAC's llama.cpp / whisper.cpp plugins (qvac.config.json).
 */
import {
  QWEN3_600M_INST_Q4,
  LLAMA_3_2_1B_INST_Q4_0,
  QWEN3_1_7B_INST_Q4,
  SMOLVLM2_500M_MULTIMODAL_Q8_0,
  MMPROJ_SMOLVLM2_500M_MULTIMODAL_Q8_0,
  QWEN3_5_0_8B_MULTIMODAL_Q4_K_M,
  MMPROJ_QWEN3_5_0_8B_MULTIMODAL_Q8_0,
  QWEN3VL_2B_MULTIMODAL_Q4_K,
  MMPROJ_QWEN3VL_2B_MULTIMODAL_Q4_K,
  WHISPER_EN_TINY_Q8_0,
  WHISPER_EN_BASE_Q8_0,
  WHISPER_EN_SMALL_Q8_0,
} from '@qvac/sdk';
import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

export type QvacModelRole = 'llm' | 'vision' | 'speech';

/** A registry model descriptor as exported by @qvac/sdk. */
type Descriptor = { readonly name: string; readonly expectedSize: number };

export interface QvacModelDef {
  /** Stable id for the saved choice. */
  id: string;
  role: QvacModelRole;
  /** Shown in the Models UI. */
  name: string;
  /** What GO uses it for. */
  purpose: string;
  /** Short trade-off note on the Models page. */
  note: string;
  model: Descriptor;
  /** Extra files the model needs (vision projector), downloaded with it. */
  companions?: Descriptor[];
  modelConfig?: Record<string, unknown>;
}

export const MODEL_OPTIONS: Record<QvacModelRole, QvacModelDef[]> = {
  llm: [
    {
      id: 'qwen3-0.6b', role: 'llm', name: 'Qwen3 0.6B', purpose: 'Understands your requests and replies',
      note: 'Fastest · default', model: QWEN3_600M_INST_Q4, modelConfig: { ctx_size: 2048 },
    },
    {
      id: 'llama3.2-1b', role: 'llm', name: 'Llama 3.2 1B', purpose: 'Understands your requests and replies',
      note: 'Better phrasing · ~2× slower', model: LLAMA_3_2_1B_INST_Q4_0, modelConfig: { ctx_size: 2048 },
    },
    {
      id: 'qwen3-1.7b', role: 'llm', name: 'Qwen3 1.7B', purpose: 'Understands your requests and replies',
      note: 'Smartest · needs a recent phone', model: QWEN3_1_7B_INST_Q4, modelConfig: { ctx_size: 2048 },
    },
  ],
  vision: [
    {
      id: 'smolvlm2-500m', role: 'vision', name: 'SmolVLM2 500M', purpose: 'Reads chart screenshots',
      note: 'Fastest · default', model: SMOLVLM2_500M_MULTIMODAL_Q8_0, companions: [MMPROJ_SMOLVLM2_500M_MULTIMODAL_Q8_0],
      modelConfig: { ctx_size: 1024, projectionModelSrc: MMPROJ_SMOLVLM2_500M_MULTIMODAL_Q8_0 },
    },
    {
      id: 'qwen3.5-0.8b-vl', role: 'vision', name: 'Qwen3.5 0.8B Vision', purpose: 'Reads chart screenshots',
      note: 'Sharper chart reading', model: QWEN3_5_0_8B_MULTIMODAL_Q4_K_M, companions: [MMPROJ_QWEN3_5_0_8B_MULTIMODAL_Q8_0],
      modelConfig: { ctx_size: 2048, projectionModelSrc: MMPROJ_QWEN3_5_0_8B_MULTIMODAL_Q8_0 },
    },
    {
      id: 'qwen3-vl-2b', role: 'vision', name: 'Qwen3-VL 2B', purpose: 'Reads chart screenshots',
      note: 'Best pattern spotting · large', model: QWEN3VL_2B_MULTIMODAL_Q4_K, companions: [MMPROJ_QWEN3VL_2B_MULTIMODAL_Q4_K],
      modelConfig: { ctx_size: 2048, projectionModelSrc: MMPROJ_QWEN3VL_2B_MULTIMODAL_Q4_K },
    },
  ],
  speech: [
    { id: 'whisper-tiny-en', role: 'speech', name: 'Whisper tiny.en', purpose: 'Turns voice notes into text', note: 'Fastest · default', model: WHISPER_EN_TINY_Q8_0 },
    { id: 'whisper-base-en', role: 'speech', name: 'Whisper base.en', purpose: 'Turns voice notes into text', note: 'Fewer mistakes', model: WHISPER_EN_BASE_Q8_0 },
    { id: 'whisper-small-en', role: 'speech', name: 'Whisper small.en', purpose: 'Turns voice notes into text', note: 'Most accurate · slower', model: WHISPER_EN_SMALL_Q8_0 },
  ],
};

export const ROLE_TITLE: Record<QvacModelRole, string> = { llm: 'Text', vision: 'Vision', speech: 'Speech' };

/** Every model kind the Models page lists. */
export const ALL_ROLES: QvacModelRole[] = ['llm', 'vision', 'speech'];

/**
 * GO only needs the text model to chat. Vision (chart screenshots) and
 * speech (voice) are optional: GO offers them when first used.
 */
export const XC_REQUIRED_ROLES: QvacModelRole[] = ['llm'];

export function modelSize(def: QvacModelDef): number {
  return def.model.expectedSize + (def.companions ?? []).reduce((s, c) => s + c.expectedSize, 0);
}

// ── The user's chosen model per kind (persisted) ──────────────

const KEY = 'qvac.models.v1';

interface ModelPrefs {
  selected: Record<QvacModelRole, string>;
  loaded: boolean;
  load: () => Promise<void>;
  select: (role: QvacModelRole, id: string) => Promise<void>;
}

const DEFAULTS: Record<QvacModelRole, string> = { llm: MODEL_OPTIONS.llm[0].id, vision: MODEL_OPTIONS.vision[0].id, speech: MODEL_OPTIONS.speech[0].id };

export const useModelPrefs = create<ModelPrefs>((set, get) => ({
  selected: DEFAULTS,
  loaded: false,
  load: async () => {
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      set({ selected: { ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) }, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  select: async (role, id) => {
    const selected = { ...get().selected, [role]: id };
    set({ selected });
    await SecureStore.setItemAsync(KEY, JSON.stringify(selected));
  },
}));

/** The model GO uses for `role` right now. */
export function activeModel(role: QvacModelRole): QvacModelDef {
  const id = useModelPrefs.getState().selected[role];
  return MODEL_OPTIONS[role].find((m) => m.id === id) ?? MODEL_OPTIONS[role][0];
}

/** @deprecated defaults only — use activeModel(role). */
export const QVAC_MODELS: Record<QvacModelRole, QvacModelDef> = {
  llm: MODEL_OPTIONS.llm[0],
  vision: MODEL_OPTIONS.vision[0],
  speech: MODEL_OPTIONS.speech[0],
};
