import { create } from 'zustand';
import type { Message, Part, SessionInfo } from '../types';

interface SessionState {
  sessionId: string | null;
  messages: Message[];
  partsMap: Record<string, Part[]>;
  streamingMsgId: string | null;
  sessions: SessionInfo[];
  busySessions: Set<string>;
  isLoading: boolean;
  error: string | null;
  
  setSessionId: (id: string | null) => void;
  setMessages: (messages: Message[]) => void;
  setPartsMap: (parts: Record<string, Part[]>) => void;
  setStreamingMsgId: (id: string | null) => void;
  setSessions: (sessions: SessionInfo[]) => void;
  setBusySessions: (sessions: Set<string>) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  
  addMessage: (message: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  setParts: (messageId: string, parts: Part[]) => void;
  appendPart: (messageId: string, part: Part) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessionId: null,
  messages: [],
  partsMap: {},
  streamingMsgId: null,
  sessions: [],
  busySessions: new Set(),
  isLoading: false,
  error: null,

  setSessionId: (id) => set({ sessionId: id }),
  setMessages: (messages) => set({ messages }),
  setPartsMap: (parts) => set({ partsMap: parts }),
  setStreamingMsgId: (id) => set({ streamingMsgId: id }),
  setSessions: (sessions) => set({ sessions }),
  setBusySessions: (sessions) => set({ busySessions: sessions }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),

  addMessage: (message) => set((state) => ({
    messages: [...state.messages, message]
  })),
  
  updateMessage: (id, updates) => set((state) => ({
    messages: state.messages.map((m) => 
      m.id === id ? { ...m, ...updates } : m
    )
  })),
  
  setParts: (messageId, parts) => set((state) => ({
    partsMap: { ...state.partsMap, [messageId]: parts }
  })),
  
  appendPart: (messageId, part) => set((state) => ({
    partsMap: {
      ...state.partsMap,
      [messageId]: [...(state.partsMap[messageId] || []), part]
    }
  })),
  
  clearSession: () => set({
    sessionId: null,
    messages: [],
    partsMap: {},
    streamingMsgId: null,
    isLoading: false,
    error: null
  })
}));