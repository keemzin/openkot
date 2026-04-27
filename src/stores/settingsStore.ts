import { create } from 'zustand';
import type { ModelInfo } from '../types';

interface SettingsState {
  models: ModelInfo[];
  selectedModel: ModelInfo | null;
  selectedAgent: 'build' | 'plan';
  autopilot: boolean;
  sessionModelSelections: Record<string, string>;
  
  setModels: (models: ModelInfo[]) => void;
  setSelectedModel: (model: ModelInfo | null) => void;
  setSelectedAgent: (agent: 'build' | 'plan') => void;
  setAutopilot: (autopilot: boolean) => void;
  setSessionModelSelections: (selections: Record<string, string>) => void;
  getModelForSession: (sessionId: string | null) => ModelInfo | null;
  setModelForSession: (sessionId: string, modelId: string) => void;
}

const LS_SESSION_MODEL_SELECTIONS = 'opencode_session_model_selections';

function loadSessionModelSelections(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LS_SESSION_MODEL_SELECTIONS);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSessionModelSelections(selections: Record<string, string>) {
  localStorage.setItem(LS_SESSION_MODEL_SELECTIONS, JSON.stringify(selections));
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  models: [],
  selectedModel: null,
  selectedAgent: 'build',
  autopilot: true,
  sessionModelSelections: loadSessionModelSelections(),

  setModels: (models) => set({ models, selectedModel: models[0] ?? null }),
  setSelectedModel: (model) => set({ selectedModel: model }),
  setSelectedAgent: (agent) => set({ selectedAgent: agent }),
  setAutopilot: (autopilot) => set({ autopilot }),
  setSessionModelSelections: (selections) => {
    saveSessionModelSelections(selections);
    set({ sessionModelSelections: selections });
  },
  
  getModelForSession: (sessionId) => {
    if (!sessionId) return get().selectedModel;
    const selections = get().sessionModelSelections;
    const modelId = selections[sessionId];
    if (modelId) {
      const model = get().models.find(m => m.id === modelId);
      if (model) return model;
    }
    return get().selectedModel;
  },
  
  setModelForSession: (sessionId, modelId) => {
    if (!sessionId) return;
    const selections = { ...get().sessionModelSelections, [sessionId]: modelId };
    saveSessionModelSelections(selections);
    set({ sessionModelSelections: selections });
  }
}));