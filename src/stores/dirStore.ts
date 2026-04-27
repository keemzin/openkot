import { create } from 'zustand';
import type { SessionInfo } from '../types';

interface DirState {
  workingDir: string;
  rootDir: string;
  recentDirs: string[];
  dirSessionsMap: Record<string, SessionInfo[]>;
  
  setWorkingDir: (dir: string) => void;
  setRootDir: (dir: string) => void;
  setRecentDirs: (dirs: string[]) => void;
  setDirSessionsMap: (map: Record<string, SessionInfo[]>) => void;
  addRecentDir: (dir: string) => void;
}

const LS_RECENT_DIRS = 'opencode_recent_dirs';

function loadRecentDirs(): string[] {
  try {
    const raw = localStorage.getItem(LS_RECENT_DIRS);
    return raw ? JSON.parse(raw) as string[] : [];
  } catch {
    return [];
  }
}

function saveRecentDirs(dirs: string[]) {
  localStorage.setItem(LS_RECENT_DIRS, JSON.stringify(dirs.slice(0, 5)));
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase();
}

function isAbsolutePath(p: string): boolean {
  return /^[A-Za-z]:[\\\/]/.test(p) || p.startsWith('/');
}

export const useDirStore = create<DirState>((set, get) => ({
  workingDir: '',
  rootDir: '',
  recentDirs: [],
  dirSessionsMap: {},

  setWorkingDir: (dir) => set({ workingDir: dir }),
  setRootDir: (dir) => set({ rootDir: dir }),
  setRecentDirs: (dirs) => {
    saveRecentDirs(dirs);
    set({ recentDirs: dirs });
  },
  setDirSessionsMap: (map) => set({ dirSessionsMap: map }),
  
  addRecentDir: (dir) => {
    const current = get().recentDirs;
    const normalized = normalizePath(dir);
    const merged = [dir, ...current.filter(d => normalizePath(d) !== normalized)]
      .filter(isAbsolutePath)
      .slice(0, 5);
    saveRecentDirs(merged);
    set({ recentDirs: merged });
  }
}));