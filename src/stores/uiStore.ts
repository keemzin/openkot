import { create } from 'zustand';

type ThemeId = 'dark' | 'light';
type ActiveTab = 'chat' | 'plan' | 'terminal';

const getInitialSidebarOpen = () => {
  if (typeof window === 'undefined') return true;
  return !window.matchMedia('(pointer: coarse)').matches && !/Android|iPhone|iPad/i.test(navigator.userAgent);
};

const getInitialSidebarWidth = () => {
  if (typeof window === 'undefined') return 320;
  return window.innerWidth < 768 ? Math.min(window.innerWidth * 0.85, 320) : 320;
};

interface UiState {
  sidebarOpen: boolean;
  sidebarWidth: number;
  rightPanelOpen: boolean;
  activeTab: ActiveTab;
  theme: ThemeId;
  fontPickerOpen: boolean;
  settingsOpen: boolean;
  dirPickerOpen: boolean;
  
  setSidebarOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setSidebarWidth: (width: number) => void;
  setRightPanelOpen: (open: boolean) => void;
  setActiveTab: (tab: ActiveTab) => void;
  setTheme: (theme: ThemeId) => void;
  setFontPickerOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setDirPickerOpen: (open: boolean) => void;
  toggleTheme: () => void;
}

const LS_THEME = 'oc_theme';

function loadTheme(): ThemeId {
  return (localStorage.getItem(LS_THEME) as ThemeId) || 'dark';
}

function saveTheme(theme: ThemeId) {
  localStorage.setItem(LS_THEME, theme);
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: getInitialSidebarOpen(),
  sidebarWidth: getInitialSidebarWidth(),
  rightPanelOpen: false,
  activeTab: 'chat',
  theme: loadTheme(),
  fontPickerOpen: false,
  settingsOpen: false,
  dirPickerOpen: false,

  setSidebarOpen: (open) => set((state) => ({ 
    sidebarOpen: typeof open === 'function' ? open(state.sidebarOpen) : open 
  })),
  setSidebarWidth: (width) => set({ sidebarWidth: width }),
  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setTheme: (theme) => { saveTheme(theme); set({ theme }); },
  setFontPickerOpen: (open) => set({ fontPickerOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setDirPickerOpen: (open) => set({ dirPickerOpen: open }),
  toggleTheme: () => set((state) => {
    const next = state.theme === 'dark' ? 'light' : 'dark';
    saveTheme(next);
    return { theme: next };
  })
}));