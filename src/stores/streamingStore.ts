import { create } from 'zustand';
import type { Part } from '../types';

interface StreamingState {
  partsMap: Record<string, Part[]>;
  streamingMsgId: string | null;
  setPartsMap: (updater: Record<string, Part[]> | ((prev: Record<string, Part[]>) => Record<string, Part[]>)) => void;
  setStreamingMsgId: (id: string | null) => void;
  applyDeltaBatch: (deltas: Map<string, Map<string, string>>) => void;
}

export const useStreamingStore = create<StreamingState>((set) => ({
  partsMap: {},
  streamingMsgId: null,
  setPartsMap: (updater) => {
    set(state => ({
      partsMap: typeof updater === 'function' ? updater(state.partsMap) : updater,
    }));
  },
  setStreamingMsgId: (id) => set({ streamingMsgId: id }),
  applyDeltaBatch: (deltas) => {
    if (deltas.size === 0) return;
    set(state => {
      const next = { ...state.partsMap };
      for (const [msgId, partDeltas] of deltas) {
        const existing = next[msgId] ? [...next[msgId]] : [];
        for (const [partId, deltaText] of partDeltas) {
          const idx = existing.findIndex(p => p.id === partId);
          if (idx >= 0) {
            existing[idx] = { ...existing[idx], text: ((existing[idx].text as string) ?? '') + deltaText };
          } else {
            existing.push({ id: partId, type: 'text', text: deltaText } as Part);
          }
        }
        next[msgId] = existing;
      }
      return { partsMap: next };
    });
  },
}));
