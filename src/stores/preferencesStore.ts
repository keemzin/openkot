import { create } from 'zustand';

export const UI_FONTS = [
  { id: 'inter',        label: 'Inter',         stack: '"Inter", system-ui, sans-serif' },
  { id: 'ibm-plex',    label: 'IBM Plex Sans',  stack: '"IBM Plex Sans", system-ui, sans-serif' },
  { id: 'geist',       label: 'Geist',         stack: '"Geist", system-ui, sans-serif' },
  { id: 'system',      label: 'System UI',     stack: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
] as const;

export const MONO_FONTS = [
  { id: 'ibm-plex-mono',  label: 'IBM Plex Mono',   stack: '"IBM Plex Mono", monospace' },
  { id: 'jetbrains-mono', label: 'JetBrains Mono',  stack: '"JetBrains Mono", monospace' },
  { id: 'fira-code',     label: 'Fira Code',        stack: '"Fira Code", monospace' },
  { id: 'geist-mono',   label: 'Geist Mono',       stack: '"Geist Mono", monospace' },
] as const;

export type UiFontId = typeof UI_FONTS[number]['id'];
export type MonoFontId = typeof MONO_FONTS[number]['id'];

const LS_UI_FONT = 'oc_ui_font';
const LS_MONO_FONT = 'oc_mono_font';

export function loadUiFont(): UiFontId {
  if (typeof window === 'undefined') return 'inter';
  return (localStorage.getItem(LS_UI_FONT) as UiFontId) || 'inter';
}

export function loadMonoFont(): MonoFontId {
  if (typeof window === 'undefined') return 'ibm-plex-mono';
  return (localStorage.getItem(LS_MONO_FONT) as MonoFontId) || 'ibm-plex-mono';
}

export function getFontStack(id: UiFontId | MonoFontId, list: readonly { id: string; stack: string }[]): string {
  return list.find(f => f.id === id)?.stack ?? list[0].stack;
}

export function applyFonts(ui: UiFontId, mono: MonoFontId) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LS_UI_FONT, ui);
  localStorage.setItem(LS_MONO_FONT, mono);
  document.documentElement.style.setProperty('--font-ui', getFontStack(ui, UI_FONTS));
  document.documentElement.style.setProperty('--font-mono', getFontStack(mono, MONO_FONTS));
}

interface PreferencesState {
  uiFont: UiFontId;
  monoFont: MonoFontId;
  setUiFont: (id: UiFontId) => void;
  setMonoFont: (id: MonoFontId) => void;
}

export const usePreferencesStore = create<PreferencesState>((set) => ({
  uiFont: loadUiFont(),
  monoFont: loadMonoFont(),
  
  setUiFont: (id) => {
    applyFonts(id, loadMonoFont());
    set({ uiFont: id });
  },
  
  setMonoFont: (id) => {
    applyFonts(loadUiFont(), id);
    set({ monoFont: id });
  },
}));

// Initialize fonts on module load (only in browser, only once)
if (typeof window !== 'undefined') {
  const savedUi = localStorage.getItem(LS_UI_FONT) as UiFontId;
  const savedMono = localStorage.getItem(LS_MONO_FONT) as MonoFontId;
  const ui = savedUi || 'inter';
  const mono = savedMono || 'ibm-plex-mono';
  document.documentElement.style.setProperty('--font-ui', getFontStack(ui, UI_FONTS));
  document.documentElement.style.setProperty('--font-mono', getFontStack(mono, MONO_FONTS));
}