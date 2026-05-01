import React, { useState, useEffect, useRef, useCallback } from 'react';
import { marked } from 'marked';
import { TokenUsageIndicator } from './components/ui/TokenUsageIndicator';
import { uid, getContextUsage, fallbackCopy } from './utils/helpers';
import { useSessionEvents } from './hooks/useSessionEvents';
import { MobileTerminal } from './components/terminal/MobileTerminal';
import { DesktopTerminal } from './components/terminal/DesktopTerminal';
import { ChatMessage } from './components/chat/ChatMessage';
import { ToolGroup } from './components/chat/ToolGroup';
import { Markdown } from './components/chat/Markdown';
import { DirPicker } from './components/app/DirPicker';
import { FontPicker } from './components/app/FontPicker';
import { SettingsDialog } from './components/app/SettingsDialog';
import { Sidebar } from './components/Sidebar';
import { ModelSelector } from './components/ModelSelector';
import { usePreferencesStore } from './stores/preferencesStore';
import type { Message, Part, ModelInfo, MessageRecord } from './types';

function Terminal({ workingDir }: { workingDir: string }) {
  const isMobile = typeof window !== 'undefined' &&
    (window.matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent));
  return isMobile
    ? <MobileTerminal workingDir={workingDir} />
    : <DesktopTerminal workingDir={workingDir} />;
}

// Theme System â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

import { applyTheme, loadTheme, THEMES, THEME_DEFS, THEME_COMPAT, type ThemeId } from './constants/themes';
import { AgentSelector } from './components/app/AgentSelector';

// Working dir resolved from server at runtime

let _workingDir = '';
const getWorkingDir = () => _workingDir;

// Configure marked
marked.setOptions({ breaks: true, gfm: true } as any);

import { onOpenFile, emitOpenFile } from './utils/fileOpenListener';

// Prism theme (matches openchamber dark palette)

const PRISM_CSS = ``;


import { RightPanel } from './components/ui/RightPanel';

// File Tree

// Git status


import { QuestionCard, type QuestionRequest } from './components/app/QuestionCard';
import { PermissionCard, type PermissionRequest } from './components/app/PermissionCard';
import { SessionItem, type SessionInfo } from './components/app/SessionItem';
import { PlanView } from './components/app/PlanView';
import { RightPanelContent } from './components/app/RightPanelContent';

const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

function extractPlanPathFromParts(parts: Part[]): string | null {
  for (const part of parts) {
    const state = (part.state as any) ?? {};
    const input = state.input ?? (part.input as any) ?? {};
    const filePath: string = input?.filePath ?? input?.file_path ?? input?.path ?? '';
    if (filePath && filePath.replace(/\\/g, '/').toUpperCase().endsWith('PLAN.MD')) {
      return filePath.replace(/\\/g, '/');
    }
  }
  return null;
}

function App() {
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [partsMap, setPartsMap] = useState<Record<string, Part[]>>({});
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [busySessions, setBusySessions] = useState<Set<string>>(new Set());
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelInfo | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<'build' | 'plan'>('build');
  const [agentOpen, setAgentOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [autopilot, setAutopilot] = useState(true);
  const autopilotRef = useRef(true);
  useEffect(() => { autopilotRef.current = autopilot; }, [autopilot]);
  const [permissions, setPermissions] = useState<Record<string, PermissionRequest[]>>({});
  
  // Per-session model selections (sessionId -> modelId) - persisted to localStorage
  const LS_SESSION_MODEL_SELECTIONS = 'opencode_session_model_selections';
  
  // Last active session (for auto-restore on refresh)
  const LS_LAST_SESSION = 'oc_last_session';
  const LS_LAST_DIR = 'oc_last_dir';
  
  // Save last active session
  const saveLastSession = (dir: string, sid: string) => {
    localStorage.setItem(LS_LAST_DIR, dir);
    localStorage.setItem(LS_LAST_SESSION, sid);
  };
  
  // Load last active session
  const loadLastSession = (): { dir: string; sid: string } | null => {
    const dir = localStorage.getItem(LS_LAST_DIR);
    const sid = localStorage.getItem(LS_LAST_SESSION);
    return dir && sid ? { dir, sid } : null;
  };
  
  const loadSessionModelSelections = (): Record<string, string> => {
    try {
      const raw = localStorage.getItem(LS_SESSION_MODEL_SELECTIONS);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  };
  const [sessionModelSelections, setSessionModelSelections] = useState<Record<string, string>>(loadSessionModelSelections);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [sidebarWidth, setSidebarWidth] = useState(isMobile ? Math.min(window.innerWidth * 0.85, 320) : 320);
  const [sessionSearch, setSessionSearch] = useState('');
  // Recent dirs state: last visited dirs across dirs
  const LS_RECENT_DIRS = 'opencode_recent_dirs';
  const [recentDirs, setRecentDirs] = useState<string[]>([]); // populated after /config loads, stale entries purged
  const [dirSessionsMap, setDirSessionsMap] = useState<Record<string, SessionInfo[]>>({});
  function loadRecentDirs(): string[] {
    try { const raw = localStorage.getItem(LS_RECENT_DIRS); return raw ? JSON.parse(raw) as string[] : []; } catch { return []; }
  }
  function saveRecentDirs(dirs: string[]) { localStorage.setItem(LS_RECENT_DIRS, JSON.stringify(dirs.slice(0,5))); }
  const [error, setError] = useState<string | null>(null);
  const [workingDir, setWorkingDir] = useState('');
  const rootDirRef = useRef(''); // fixed at initial load, never changes
  const [modelOpen, setModelOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [dirPickerOpen, setDirPickerOpen] = useState(false);
  const [fontPickerOpen, setFontPickerOpen] = useState(false);
  const [ctxPopoverOpen, setCtxPopoverOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeId>(loadTheme);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [revertConfirm, setRevertConfirm] = useState<{ messageId: string; affectedFiles: string[] } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const toggleTheme = () => {
    // Toggle variant within same theme family
    const current = THEME_COMPAT[theme] ?? theme;
    const def = THEME_DEFS[current];
    const nextVariant = def?.variant === 'dark' ? 'light' : 'dark';
    const baseName = current.replace(/-dark$|-light$/, '');
    const next = `${baseName}-${nextVariant}`;
    const target = THEMES[next] ? next : (nextVariant === 'light' ? 'flexoki-light' : 'flexoki-dark');
    applyTheme(target);
    setTheme(target);
  };

  const [activeTab, setActiveTab] = useState<'chat' | 'plan' | 'terminal'>('chat');
  const [sessionPlanPaths, setSessionPlanPaths] = useState<Record<string, string>>({});
  const [commands, setCommands] = useState<{ name: string; description: string; template: string }[]>([]);
  const [showCmdDropdown, setShowCmdDropdown] = useState(false);
  const [cmdFilter, setCmdFilter] = useState('');
  const [cmdSelectedIndex, setCmdSelectedIndex] = useState(0);
  const [questions, setQuestions] = useState<Record<string, QuestionRequest[]>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sessionIdRef = useRef<string | null>(null);

  // Keep ref in sync with state so callbacks always see latest value
  useEffect(() => {
    sessionIdRef.current = sessionId;
    (window as any).__opencode_session_id__ = sessionId ?? '';
  }, [sessionId]);

  // Session events hook (extracted from App.tsx for better maintainability)
  const { listenToSession, stopListening } = useSessionEvents({
    autopilotRef,
    getWorkingDir,
    onMessageUpdate: (updater) => setMessages(updater),
    onPartsUpdate: (updater) => setPartsMap(updater),
    onStreamingMsgId: (id) => setStreamingMsgId(id),
    onBusySessions: (updater) => setBusySessions(updater),
    onError: (error) => setError(error),
    onLoading: (loading) => setIsLoading(loading),
    onQuestionsUpdate: (updater) => setQuestions(updater),
    onPermissionsUpdate: (updater) => setPermissions(updater),
    onSessionIdle: () => loadSessions(),
  });

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, partsMap]);

  // Close model dropdown on outside click
  useEffect(() => {
    if (!modelOpen) return;
    const handler = () => {
      setModelOpen(false);
      setModelSearch(''); // Clear search when closing
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [modelOpen]);

  // Auto-open right panel when a file is clicked from chat
  useEffect(() => {
    return onOpenFile(() => {
      setRightPanelOpen(true);
    });
  }, []);


  // Persist session model selections to localStorage
  useEffect(() => {
    localStorage.setItem(LS_SESSION_MODEL_SELECTIONS, JSON.stringify(sessionModelSelections));
  }, [sessionModelSelections]);

  // Fetch commands on mount ” wait until opencode is ready


  // Check feature flags from server
  useEffect(() => {
    fetch('/health').then(r => r.json()).then((d: any) => {
      const raw = d.planModeExperimentalEnabled;
      // kept for future use
      void raw;
    }).catch(() => {});
  }, []);

  // Detect plan file path from tool parts ” watches for write/edit to PLAN.md
  useEffect(() => {
    if (!sessionId) return;
    if (sessionPlanPaths[sessionId]) return;
    for (const parts of Object.values(partsMap)) {
      const found = extractPlanPathFromParts(parts as Part[]);
      if (found) {
        setSessionPlanPaths(prev => ({ ...prev, [sessionId]: found }));
        return;
      }
    }
  }, [sessionId, partsMap, sessionPlanPaths]);
  // Main startup effect: load config, then wait for opencode to be ready
  useEffect(() => {
    // 1. Load basic server config (workingDir)
    fetch('/config').then(r => r.json()).then(d => {
      _workingDir = d.workingDir;
      (window as any).__opencode_dir__ = d.workingDir;
      setWorkingDir(d.workingDir);
      const root = d.rootDir || d.workingDir;
      if (!rootDirRef.current) rootDirRef.current = root;

      // Purge stale recent dirs that don't belong to this root
      const normRoot = root.replace(/\\/g, '/').toLowerCase();
      const fresh = loadRecentDirs().filter(p => p.replace(/\\/g, '/').toLowerCase().startsWith(normRoot));
      setRecentDirs(fresh);
      saveRecentDirs(fresh);

      // 2. Wait for opencode binary to be ready via /health endpoint
      const waitForOpenCodeReady = async () => {
        for (let i = 0; i < 50; i++) { // Max 10s (50 * 200ms)
          try {
            const r = await fetch('/health').then(res => res.json());
            if (r.isOpenCodeReady) return true;
          } catch {} // ignore errors while polling
          await new Promise(res => setTimeout(res, 200));
        }
        return false; // Timed out
      };

      waitForOpenCodeReady().then(ready => {
        if (!ready) console.warn('OpenCode binary not ready after 10s timeout.');

        // 3. Once opencode is ready, trigger other initial loads
        // Recent dirs (only absolute paths, filter junk)
        // Windows paths start with drive letter (C:\), Unix paths start with /
        const isAbsolutePath = (p: string) => /^[A-Za-z]:[\\\/]/.test(p) || p.startsWith('/');
        const normalizePath = (p: string) => p.replace(/\\/g, '/').toLowerCase();
        const recents = loadRecentDirs().filter(isAbsolutePath);
        // Deduplicate by normalized path
        const seen = new Set<string>();
        const uniqueRecents = recents.filter(p => {
          const norm = normalizePath(p);
          if (seen.has(norm)) return false;
          seen.add(norm);
          return true;
        });
        const workingNorm = normalizePath(d.workingDir);
        const merged = [d.workingDir, ...uniqueRecents.filter(x => normalizePath(x) !== workingNorm)].slice(0, 5);
        setRecentDirs(merged);
        saveRecentDirs(merged);

        // Preload session counts sequentially (NOT parallel) to avoid flooding the server
        (async () => {
          const map: Record<string, SessionInfo[]> = {};
          for (const dir of merged) {
            try {
              const r = await fetch(`/api/session?directory=${encodeURIComponent(dir)}`);
              if (!r.ok) continue;
              const data = await r.json();
              const list: SessionInfo[] = (Array.isArray(data) ? data : []).map((s: any) => ({
                id: s.id, title: s.title, time: { created: s.time?.created, updated: s.time?.updated },
              }));
              list.sort((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0));
              map[dir] = list;
            } catch {}
          }
          setDirSessionsMap({ ...map });
        })();

        // Fetch commands and models
        fetch('/api/command').then(r => r.json()).then((cmds: any[]) => {
          setCommands(cmds.map(c => ({ name: c.name, description: c.description, template: c.template })));
        }).catch(() => {});
        // Load models ” wait for workingDir so opencode is ready before hitting /api/provider
        fetch('/api/provider').then(r => r.json()).then(data => {
          const connected = new Set(data.connected);
          const defaults = data.default ?? {};
          const list: ModelInfo[] = [];
          for (const provider of data.all) {
            if (!connected.has(provider.id)) continue;
            for (const model of Object.values(provider.models) as any[]) {
              const isDefault = defaults[provider.id] === model.id;
              const isFree = (model.cost?.input ?? 1) === 0 && (model.cost?.output ?? 1) === 0;
              list.push({ id: model.id, name: model.name || model.id, providerId: provider.id, providerName: provider.name || provider.id, isDefault, isFree, contextLimit: model.limit?.context });
            }
          }
          list.sort((a, b) => { if (a.isFree !== b.isFree) return a.isFree ? -1 : 1; if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1; return a.name.localeCompare(b.name); });
          setModels(list); setSelectedModel(list[0] ?? null);
        }).catch(() => {});
      });
    }).catch(() => {});
  }, []);

  const loadSessionStatus = useCallback(async () => {
    const dir = getWorkingDir(); if (!dir) return;
    try {
      const statusRes = await fetch(`/api/session/status?directory=${encodeURIComponent(dir)}`);
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        const busySet = new Set<string>();
        let currentSessionBusy = false;

        for (const [sid, status] of Object.entries(statusData) as [string, any][]) {
          // Status is { type: 'idle' | 'busy' | 'retry', ... }
          const isBusy = status?.type === 'busy';
          if (isBusy) {
            busySet.add(sid);
            if (sid === sessionId) currentSessionBusy = true;
          }
        }

        setBusySessions(busySet);
        // If current session is busy, set loading state to show stop button
        if (currentSessionBusy && !isLoading) {
          setIsLoading(true);
        } else if (!currentSessionBusy && isLoading) {
          // Only clear loading if we're sure it's not busy (but don't clear if we're currently sending)
          setIsLoading(false);
        }
      }
    } catch {}
  }, [sessionId, isLoading]);

  const loadSessions = useCallback(async () => {
    const dir = getWorkingDir(); if (!dir) return;
    try {
      const r = await fetch(`/api/session?directory=${encodeURIComponent(dir)}`);
      if (!r.ok) return;
      const data = await r.json();
      const list: SessionInfo[] = (Array.isArray(data) ? data : []).map((s: any) => ({
        id: s.id,
        title: s.title,
        time: { created: s.time?.created, updated: s.time?.updated },
        parentID: s.parentID ?? null // Include parentID for sub-sessions
      }));
      list.sort((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0));
      setSessions(list);

      // Also load status
      await loadSessionStatus();
    } catch {}
  }, [loadSessionStatus]);

  useEffect(() => { if (workingDir) loadSessions(); }, [loadSessions, workingDir]);
  
  // Auto-restore last session after initial load (runs once when workingDir is ready)
  const hasRestoredRef = useRef(false);
  useEffect(() => {
    if (hasRestoredRef.current || !workingDir) return;
    const last = loadLastSession();
    if (!last) return;
    
    hasRestoredRef.current = true;
    
    // Use setTimeout to defer until next tick (when all callbacks are defined)
    setTimeout(() => {
      const normCurrent = workingDir.replace(/\\/g, '/').toLowerCase();
      const normLast = last.dir.replace(/\\/g, '/').toLowerCase();
      if (normCurrent === normLast) {
        switchSession(last.sid);
      }
    }, 100);
  }, [workingDir]);

  const switchDirectory = useCallback(async (newDir: string) => {
    if (!newDir.trim()) return;
    const norm = newDir.trim().replace(/\\/g, '/').replace(/\/+$/, '');
    setDirPickerOpen(false);
    // Read latest recents directly from localStorage (avoids stale closure)
    const isAbsolutePath = (p: string) => /^[A-Za-z]:[\\\/]/.test(p) || p.startsWith('/');
    const normalizePath = (p: string) => p.replace(/\\/g, '/').toLowerCase();
    const current = loadRecentDirs().filter(isAbsolutePath);
    // Deduplicate by normalized path
    const seen = new Set<string>();
    const uniqueCurrent = current.filter(p => {
      const normalized = normalizePath(p);
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
    const normNew = normalizePath(norm);
    const merged = [norm, ...uniqueCurrent.filter(d => normalizePath(d) !== normNew)].slice(0, 5);
    saveRecentDirs(merged);
    // Restart opencode with new cwd, then reload browser
    try {
      await fetch('/switch-dir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dir: norm }),
      });
    } catch { /* ignore */ }
    window.location.reload();
  }, []);

  const loadSessionMessages = useCallback(async (sid: string) => {
    const dir = getWorkingDir(); if (!dir) return;
    try {
      const r = await fetch(`/api/session/${encodeURIComponent(sid)}/message?directory=${encodeURIComponent(dir)}`);
      if (!r.ok) return;
      const records: MessageRecord[] = await r.json();
      const msgs: Message[] = [];
      const pm: Record<string, Part[]> = {};
      for (const rec of records) {
        if (!rec?.info?.id) continue;
        msgs.push({ id: rec.info.id, role: rec.info.role, content: '', tokens: rec.info.tokens });
        pm[rec.info.id] = rec.parts ?? [];
      }
      setMessages(msgs); setPartsMap(pm);
    } catch {}
  }, []);

  const renameSession = useCallback(async (id: string, title: string) => {
    const dir = getWorkingDir();
    await fetch(`/api/session/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-opencode-directory': dir },
      body: JSON.stringify({ title }),
    }).catch(() => {});
    await loadSessions();
  }, [loadSessions]);

  const deleteSession = useCallback(async (id: string) => {
    const dir = getWorkingDir();
    await fetch(`/api/session/${encodeURIComponent(id)}?directory=${encodeURIComponent(dir)}`, {
      method: 'DELETE',
    }).catch(() => {});
    if (sessionId === id) { setSessionId(null); setMessages([]); setPartsMap({}); }
    await loadSessions();
  }, [loadSessions, sessionId]);

  const forkSession = useCallback(async (messageId: string) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    const dir = getWorkingDir();
    try {
      const r = await fetch(
        `/api/session/${encodeURIComponent(sid)}/fork?directory=${encodeURIComponent(dir)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageID: messageId }),
        }
      );
      if (!r.ok) return;
      const forked = await r.json();
      if (forked?.id) {
        await loadSessions();
        // Switch to the forked session
        stopListening();
        setIsLoading(false); setError(null); setStreamingMsgId(null);
        setSessionId(forked.id); setMessages([]); setPartsMap({});
        await loadSessionMessages(forked.id);
      }
    } catch { /* ignore */ }
  }, [loadSessions, loadSessionMessages]);

  const revertSession = useCallback(async (messageId: string) => {
    // Collect files touched by messages after the revert point
    const idx = messages.findIndex(m => m.id === messageId);
    const affectedMsgs = idx >= 0 ? messages.slice(idx) : [];
    const fileSet = new Set<string>();
    for (const m of affectedMsgs) {
      const parts = partsMap[m.id] ?? [];
      for (const p of parts) {
        const toolName = (p.tool as string) || p.type;
        const isFileWrite = toolName === 'write' || toolName === 'edit' || toolName === 'patch';
        if (isFileWrite) {
          // File path lives inside state.input (same as ToolPart.tsx reads it)
          const input = (p.state as any)?.input ?? p.input ?? {};
          const filePath = (input as any).filePath ?? (input as any).file_path ?? (input as any).path;
          if (filePath) fileSet.add(filePath);
        }
      }
    }
    setRevertConfirm({ messageId, affectedFiles: Array.from(fileSet) });
  }, [messages, partsMap]);

  const doRevert = useCallback(async (messageId: string) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    const dir = getWorkingDir();
    // Optimistically remove messages at and after the revert point — do NOT reload after
    setMessages(prev => {
      const idx = prev.findIndex(m => m.id === messageId);
      return idx >= 0 ? prev.slice(0, idx) : prev;
    });
    setPartsMap(prev => {
      // Remove parts for messages at/after revert point
      const keepIds = new Set(messages.slice(0, messages.findIndex(m => m.id === messageId)).map(m => m.id));
      const next: Record<string, Part[]> = {};
      for (const k of Object.keys(prev)) {
        if (keepIds.has(k)) next[k] = prev[k];
      }
      return next;
    });
    try {
      await fetch(
        `/api/session/${encodeURIComponent(sid)}/revert?directory=${encodeURIComponent(dir)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageID: messageId }),
        }
      );
      // Don't reload — keep optimistic state. Server marks them reverted but still returns them.
    } catch { /* ignore — optimistic state already applied */ }
  }, [messages, loadSessionMessages]);

  const switchSession = useCallback(async (sid: string) => {
    stopListening();
    setIsLoading(false); setError(null); setStreamingMsgId(null);
    setSessionId(sid); setMessages([]); setPartsMap({});
    setActiveTab('chat');

    // Restore model selection for this session
    const savedModelId = sessionModelSelections[sid];
    if (savedModelId && models.length > 0) {
      const model = models.find(m => m.id === savedModelId);
      if (model) setSelectedModel(model);
    }

    await loadSessionMessages(sid);
    // Check if this session is busy
    await loadSessionStatus();
    // If this session is busy, listen for ongoing updates
    if (busySessions.has(sid)) {
      listenToSession(sid, '', true);
    }
    
    // Save last active session for auto-restore on refresh
    saveLastSession(workingDir, sid);
  }, [loadSessionMessages, sessionModelSelections, models, loadSessionStatus, busySessions, stopListening, listenToSession, workingDir, saveLastSession]);

  const newSession = useCallback(() => {
    stopListening();
    setIsLoading(false); setError(null); setStreamingMsgId(null);
    setSessionId(null); setMessages([]); setPartsMap({});
  }, [stopListening]);

  const getOrCreateSession = useCallback(async (): Promise<string> => {
    // Use ref to always get the latest sessionId, not a stale closure value
    const currentSessionId = sessionIdRef.current;
    if (currentSessionId) return currentSessionId;
    const dir = getWorkingDir();
    // Pass directory as query param so the proxy can read it (body isn't parsed for proxied routes)
    const r = await fetch(`/api/session?directory=${encodeURIComponent(dir)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directory: dir }),
    });
    if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error(`Session error: ${r.status}${t ? ` - ${t}` : ''}`); }
    const s = await r.json();
    setSessionId(s.id); await loadSessions(); return s.id;
  }, [loadSessions]);



  const sendMessage = async () => {
    const text = inputText.trim();
    if (!text || isLoading || !selectedModel || !workingDir) return;
    setError(null);

    // Handle slash commands
    let finalText = text;
    const firstLine = text.split('\n')[0];
    const cmdMatch = firstLine.match(/^\/(\w+)\s*(.*)$/);
    if (cmdMatch) {
      const [, cmdName, cmdArgs] = cmdMatch;
      const cmd = commands.find(c => c.name === cmdName);
      if (cmd) {
        finalText = cmd.template.replace('$ARGUMENTS', cmdArgs || '(no arguments)');
        // If there's more content after the first line, append it
        const rest = text.split('\n').slice(1).join('\n');
        if (rest) finalText += '\n\n' + rest;
      }
    }

    // NO PREFIX - OpenCode handles agent natively via the agent field

    // Optimistic user message ” temp ID, will be replaced by server's real ID via SSE
    const tempUserMsgId = `temp_user_${uid()}`;
    setMessages(prev => [...prev, { id: tempUserMsgId, role: 'user', content: text }]);
    setPartsMap(prev => ({ ...prev, [tempUserMsgId]: [{ id: uid(), type: 'text', text }] }));
    setInputText('');
    setShowCmdDropdown(false);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setIsLoading(true);

    // Placeholder for "Thinking" ” will be replaced by real assistant message via SSE
    const tempAssistantId = `temp_asst_${uid()}`;
    setMessages(prev => [...prev, { id: tempAssistantId, role: 'assistant', content: '' }]);
    setStreamingMsgId(tempAssistantId);

    try {
      const sid = await getOrCreateSession();
      listenToSession(sid, tempAssistantId);
      const dir = getWorkingDir();
      const r = await fetch(`/api/session/${encodeURIComponent(sid)}/prompt_async?directory=${encodeURIComponent(dir)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          model: { providerID: selectedModel.providerId, modelID: selectedModel.id },
          parts: [{ type: 'text', text: finalText }],
          agent: selectedAgent, // Send agent field to OpenCode
          autopilot: autopilot // Send autopilot toggle to OpenCode
          }),
        
      });
      if (!r.ok) { const d = await r.text().catch(() => ''); throw new Error(`Prompt error: ${r.status}${d ? ` - ${d}` : ''}`); }
    } catch (err) {
      setMessages(prev => prev.filter(m => m.id !== tempAssistantId && m.id !== tempUserMsgId));
      setIsLoading(false); setStreamingMsgId(null);
      stopListening();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (showCmdDropdown) {
        const filtered = commands.filter(c => c && c.name && c.description && (!cmdFilter || c.name.toLowerCase().includes(cmdFilter) || c.description.toLowerCase().includes(cmdFilter)));
        if (filtered[cmdSelectedIndex]) {
          e.preventDefault();
          const lines = inputText.split('\n');
          lines[lines.length - 1] = `/${filtered[cmdSelectedIndex].name} `;
          setInputText(lines.join('\n'));
          setShowCmdDropdown(false);
          textareaRef.current?.focus();
          return;
        }
      }
      e.preventDefault();
      sendMessage();
    }
    if (showCmdDropdown) {
      const filtered = commands.filter(c => c && c.name && c.description && (!cmdFilter || c.name.toLowerCase().includes(cmdFilter) || c.description.toLowerCase().includes(cmdFilter)));
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCmdSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCmdSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Escape') {
        setShowCmdDropdown(false);
      }
    }
  };

  const stopGeneration = async () => {
    // Close SSE locally
    stopListening();

    // Mark the streaming message as stopped
    const stoppedId = streamingMsgId;
    setIsLoading(false);
    setStreamingMsgId(null);

    if (stoppedId) {
      setPartsMap(prev => {
        const existing = prev[stoppedId] ?? [];
        // If no text content yet, add a stopped indicator
        const hasText = existing.some(p => p.type === 'text' && (p.text ?? '').trim().length > 0);
        if (!hasText) {
          return { ...prev, [stoppedId]: [...existing, { id: 'stopped', type: 'text', text: '*(stopped)*' }] };
        }
        return prev;
      });
    }

    // Abort server-side run
    const sid = sessionIdRef.current;
    if (sid) {
      const dir = getWorkingDir();
      fetch(`/api/session/${encodeURIComponent(sid)}/abort?directory=${encodeURIComponent(dir)}`, {
        method: 'POST',
      }).catch(() => {});
    }
  };

  const replyToPermission = async (requestID: string, response: 'once' | 'always' | 'reject') => {
    const sid = sessionIdRef.current;
    if (!sid) return;

    // Optimistically remove from UI
    setPermissions(prev => {
      const sessionPermissions = prev[sid] ?? [];
      const filtered = sessionPermissions.filter(p => p.id !== requestID);
      if (filtered.length === 0) {
        const next = { ...prev };
        delete next[sid];
        return next;
      }
      return { ...prev, [sid]: filtered };
    });

    const dir = getWorkingDir();
    try {
      await fetch(`/api/permission/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionID: sid, requestID, reply: response, directory: dir })
      });
    } catch { /* ignore */ }
  };

  const replyToQuestion = async (requestID: string, answers: string[][]) => {
    const sid = sessionIdRef.current;
    if (!sid) {
      console.error('[App] replyToQuestion: no session ID');
      return;
    }
    
    // Optimistically remove question from UI
    setQuestions(prev => {
      const sessionQuestions = prev[sid] ?? [];
      const filtered = sessionQuestions.filter(q => q.id !== requestID);
      if (filtered.length === 0) {
        const next = { ...prev };
        delete next[sid];
        return next;
      }
      return { ...prev, [sid]: filtered };
    });
    
    const dir = getWorkingDir();
    
    try {
      const res = await fetch(`/api/question/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionID: sid, requestID, answers, directory: dir })
      });
      
      // Check if response is JSON
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        // Question already removed optimistically, just return
        return;
      }
      
      if (!res.ok) {
        const text = await res.text();
        console.error('[App] replyToQuestion: error response:', text);
        // Don't throw - question already removed optimistically
        return;
      }
      const data = await res.json();
    } catch (error) {
      // Don't throw - question already removed
    }
  };

  const rejectQuestion = async (requestID: string) => {
    const sid = sessionIdRef.current;
    if (!sid) {
      console.error('[App] rejectQuestion: no session ID');
      return;
    }
    
    // Optimistically remove question from UI
    setQuestions(prev => {
      const sessionQuestions = prev[sid] ?? [];
      const filtered = sessionQuestions.filter(q => q.id !== requestID);
      if (filtered.length === 0) {
        const next = { ...prev };
        delete next[sid];
        return next;
      }
      return { ...prev, [sid]: filtered };
    });
    
    const dir = getWorkingDir();
    
    try {
      const res = await fetch(`/api/question/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionID: sid, requestID, directory: dir })
      });
      
      // Check if response is JSON
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        // Question already removed optimistically, just return
        return;
      }
      
      if (!res.ok) {
        const text = await res.text();
        console.error('[App] rejectQuestion: error response:', text);
        // Don't throw - question already removed optimistically
        return;
      }
      const data = await res.json();
    } catch (error) {
      // Don't throw - question already removed
    }
  };

  const iconBtnStyle: React.CSSProperties = {
    background: 'transparent', border: 'none', cursor: 'pointer',
    color: 'var(--text-4)', padding: '4px 5px', borderRadius: 6, display: 'flex',
    alignItems: 'center', justifyContent: 'center',
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
    
    // Detect slash command - show immediately on /, filter on more chars
    const lastLine = val.split('\n').pop() || '';
    if (lastLine.startsWith('/')) {
      const filter = lastLine.slice(1).toLowerCase();
      setCmdFilter(filter);
      setShowCmdDropdown(true);
      setCmdSelectedIndex(0);
    } else {
      setShowCmdDropdown(false);
    }
  };

  return (
    <div style={{ height: '100dvh', display: 'flex', background: 'var(--bg)', color: 'var(--text-2)', fontFamily: "var(--font-ui, 'IBM Plex Sans', system-ui, sans-serif)", fontSize: 15 }}>

      {/* Sidebar ” overlay */}
      <Sidebar
        isOpen={sidebarOpen}
        sessions={sessions}
        recentDirs={recentDirs}
        dirSessionsMap={dirSessionsMap}
        sessionId={sessionId}
        workingDir={workingDir}
        busySessions={busySessions}
        sidebarWidth={sidebarWidth}
        sessionSearch={sessionSearch}
        setSidebarOpen={setSidebarOpen}
        setSidebarWidth={setSidebarWidth}
        setSessionSearch={setSessionSearch}
        setDirPickerOpen={setDirPickerOpen}
        newSession={newSession}
        switchSession={switchSession}
        switchDirectory={switchDirectory}
        renameSession={renameSession}
        deleteSession={deleteSession}
      />

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Header */}
        <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)', flexShrink: 0 }}>
          {/* Main header row */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', gap: 4 }}>
            <button onClick={() => setSidebarOpen(o => !o)} style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: '4px 6px', fontSize: 19, lineHeight: 1, flexShrink: 0 }}>📁</button>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
              {sessionId ? (sessions.find(s => s.id === sessionId)?.title || `Session ${sessionId.slice(0, 8)}`) : 'New Session'}
            </span>
            {/* Context usage indicator */}
            {(() => {
              const contextLimit = selectedModel?.contextLimit || 200000;
              const contextUsage = getContextUsage(messages, contextLimit);
              if (!contextUsage) return null;
              const totalOut = messages.reduce((s, m) => s + (m.tokens?.output ?? 0), 0);
              const modelName = selectedModel?.name || 'Unknown';
              const pct = contextUsage.percentage;
              const barColor = pct >= 90 ? 'var(--red)' : pct >= 75 ? 'var(--orange)' : 'var(--green)';
              return (
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <button
                    onClick={() => setCtxPopoverOpen(o => !o)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontSize: 'inherit', color: 'inherit' }}
                  >
                    <TokenUsageIndicator contextUsage={contextUsage} />
                  </button>
                  {ctxPopoverOpen && (
                    <>
                      <div onClick={() => setCtxPopoverOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 299 }} />
                      <div style={{
                        position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 300,
                        background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
                        padding: '12px 14px', width: 220, maxWidth: 'calc(100vw - 24px)',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Context Usage</div>
                        {/* Progress bar */}
                        <div style={{ background: 'var(--bg-3)', borderRadius: 4, height: 6, marginBottom: 10, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: barColor, borderRadius: 4, transition: 'width 0.3s' }} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
                          <div>
                            <div style={{ fontSize: 10, color: 'var(--text-4)' }}>Model</div>
                            <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500, wordBreak: 'break-word' }}>{modelName}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: 'var(--text-4)' }}>Usage</div>
                            <div style={{ fontSize: 12, color: barColor, fontWeight: 600 }}>{pct.toFixed(1)}%</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: 'var(--text-4)' }}>Tokens used</div>
                            <div style={{ fontSize: 12, color: 'var(--text)' }}>{contextUsage.totalTokens.toLocaleString()}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: 'var(--text-4)' }}>Limit</div>
                            <div style={{ fontSize: 12, color: 'var(--text)' }}>{(contextLimit / 1000).toFixed(0)}k</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: 'var(--text-4)' }}>Output tokens</div>
                            <div style={{ fontSize: 12, color: 'var(--text)' }}>{totalOut.toLocaleString()}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: 'var(--text-4)' }}>Remaining</div>
                            <div style={{ fontSize: 12, color: 'var(--text)' }}>{(contextLimit - contextUsage.totalTokens).toLocaleString()}</div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })()}
            {/* Theme picker */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <button onClick={() => setThemePickerOpen(o => !o)} title="Change theme"
                style={{ background: 'transparent', border: 'none', color: themePickerOpen ? 'var(--accent)' : 'var(--text-3)', cursor: 'pointer', padding: '4px 6px', borderRadius: 6, lineHeight: 1 }}>
                {(THEME_DEFS[THEME_COMPAT[theme] ?? theme]?.variant ?? 'dark') === 'dark'
                  ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                  : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                }
              </button>
              {themePickerOpen && (() => {
                const currentId = THEME_COMPAT[theme] ?? theme;
                const currentDef = THEME_DEFS[currentId];
                // Group themes by name
                const groups: Record<string, string[]> = {};
                for (const [id, def] of Object.entries(THEME_DEFS)) {
                  if (!groups[def.name]) groups[def.name] = [];
                  groups[def.name].push(id);
                }
                return (
                  <>
                    <div onClick={() => setThemePickerOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 299 }} />
                    <div style={{
                      position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 300,
                      background: 'var(--bg-2)', border: '1px solid var(--border-2)', borderRadius: 10,
                      padding: '8px 0', minWidth: 200, boxShadow: '0 8px 24px var(--shadow)',
                    }}>
                      {/* Variant toggle */}
                      <div style={{ display: 'flex', gap: 4, padding: '4px 10px 8px', borderBottom: '1px solid var(--border)' }}>
                        {(['dark', 'light'] as const).map(v => {
                          const active = currentDef?.variant === v;
                          return (
                            <button key={v} onClick={() => {
                              const base = currentId.replace(/-dark$|-light$/, '');
                              const next = `${base}-${v}`;
                              const target = THEMES[next] ? next : (v === 'dark' ? 'flexoki-dark' : 'flexoki-light');
                              applyTheme(target); setTheme(target);
                            }} style={{
                              flex: 1, padding: '4px 0', borderRadius: 6, border: 'none', cursor: 'pointer',
                              background: active ? 'var(--accent)' : 'var(--bg-4)',
                              color: active ? 'var(--bg)' : 'var(--text-3)',
                              fontSize: 12, fontWeight: active ? 700 : 400, fontFamily: 'inherit',
                            }}>{v === 'dark' ? '🌙 Dark' : '☀️ Light'}</button>
                          );
                        })}
                      </div>
                      {/* Theme list */}
                      {Object.entries(groups).map(([name, ids]) => {
                        const variant = currentDef?.variant ?? 'dark';
                        const matchId = ids.find(id => id.endsWith(`-${variant}`)) ?? ids[0];
                        const isActive = ids.includes(currentId);
                        const accentColor = THEME_DEFS[matchId]?.vars['--accent'] ?? '#888';
                        const bgColor = THEME_DEFS[matchId]?.vars['--bg'] ?? '#222';
                        return (
                          <button key={name} onClick={() => {
                            applyTheme(matchId); setTheme(matchId); setThemePickerOpen(false);
                          }} style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                            padding: '7px 12px', background: isActive ? 'var(--bg-4)' : 'transparent',
                            border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                          }}
                            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-3)'; }}
                            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                          >
                            {/* Color swatch */}
                            <span style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                              <span style={{ width: 12, height: 12, borderRadius: '50%', background: bgColor, border: '1px solid var(--border-2)' }} />
                              <span style={{ width: 12, height: 12, borderRadius: '50%', background: accentColor }} />
                            </span>
                            <span style={{ fontSize: 13, color: isActive ? 'var(--text)' : 'var(--text-2)', fontWeight: isActive ? 600 : 400 }}>{name}</span>
                            {isActive && <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--accent)' }}>✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </div>
            {/* Font picker */}
            <button onClick={() => setFontPickerOpen(o => !o)} title="Font preferences"
              style={{ background: 'transparent', border: 'none', color: fontPickerOpen ? 'var(--accent)' : 'var(--text-3)', cursor: 'pointer', padding: '4px 6px', borderRadius: 6, lineHeight: 1, flexShrink: 0 }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>
              </svg>
            </button>
            {fontPickerOpen && <FontPicker onClose={() => setFontPickerOpen(false)} />}
            {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} models={models} />}
            {/* File tree toggle */}
            <button onClick={() => setRightPanelOpen(o => !o)} title="Toggle file tree"
              style={{ background: 'transparent', border: 'none', color: rightPanelOpen ? 'var(--accent)' : 'var(--text-3)', cursor: 'pointer', padding: '4px 6px', borderRadius: 6, lineHeight: 1, flexShrink: 0 }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
            </button>
            {/* Settings */}
            <button onClick={() => setSettingsOpen(o => !o)} title="Settings"
              style={{ background: 'transparent', border: 'none', color: settingsOpen ? 'var(--accent)' : 'var(--text-3)', cursor: 'pointer', padding: '4px 6px', borderRadius: 6, lineHeight: 1, flexShrink: 0 }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1 1.51V3a2 2 0 0 1-2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>

          </div>

          {/* Plan/Terminal tab row */}
          {workingDir && (
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px 6px', gap: 4 }}>
              {(['chat', 'plan', 'terminal'] as const).map(tab => {
                if (tab === 'plan' && sessionId && !sessionPlanPaths[sessionId]) return null;
                return (
                <button key={tab} onClick={() => setActiveTab(tab)} style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: activeTab === tab ? 'var(--accent)' : 'var(--text-3)',
                  fontSize: 14, padding: '4px 10px', borderRadius: 6,
                  fontFamily: 'inherit', fontWeight: activeTab === tab ? 700 : 500,
                  borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  {tab === 'plan' && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                    </svg>
                  )}
                  {tab === 'terminal' && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
                    </svg>
                  )}
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Persistent terminal ” always mounted when workingDir exists */}
        {workingDir && activeTab === 'terminal' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            <Terminal workingDir={workingDir} />
          </div>
        )}

        {/* Messages or Plan view */}
        {activeTab === 'plan' && sessionId && sessionPlanPaths[sessionId] ? (
          <PlanView planPath={sessionPlanPaths[sessionId]} workingDir={workingDir} />
        ) : activeTab !== 'terminal' && (
          /* Chat view ” shown when chat tab is active */
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            <div style={{ width: '100%', maxWidth: 760, margin: '0 auto', padding: '12px 16px 8px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
              {messages.length === 0 && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-4)', gap: 8, paddingTop: 80 }}>
              <svg width="40" height="40" viewBox="0 0 100 100" fill="none" opacity={0.3}>
                <path d="M50 50 L8.432 26 L8.432 74 L50 98 Z" fill="rgba(255,255,255,0.08)" stroke="#CECDC3" strokeWidth="2.5" strokeLinejoin="round"/>
                <path d="M50 50 L91.568 26 L91.568 74 L50 98 Z" fill="rgba(255,255,255,0.08)" stroke="#CECDC3" strokeWidth="2.5" strokeLinejoin="round"/>
                <path d="M50 2 L8.432 26 L50 50 L91.568 26 Z" fill="none" stroke="#CECDC3" strokeWidth="2.5" strokeLinejoin="round"/>
              </svg>
              <span style={{ fontSize: 14 }}>Start a conversation</span>
            </div>
          )}

          {(() => {
            // Group consecutive assistant messages into turns.
            // Each turn = one Trail (all tools) + all text responses.
            // User messages break turns.
            type Turn = { msgs: typeof messages };
            const turns: Turn[] = [];
            for (const msg of messages) {
              if (msg.role === 'user') {
                turns.push({ msgs: [msg] });
              } else {
                const last = turns[turns.length - 1];
                if (last && last.msgs[0].role === 'assistant') {
                  last.msgs.push(msg);
                } else {
                  turns.push({ msgs: [msg] });
                }
              }
            }
            return turns.map((turn, ti) => {
              if (turn.msgs[0].role === 'user') {
                const msg = turn.msgs[0];
                const isLastTurn = ti === turns.length - 1;
                return <ChatMessage key={msg.id} msg={msg} parts={partsMap[msg.id]} isStreaming={msg.id === streamingMsgId} onFork={forkSession} onRevert={!isLastTurn ? revertSession : undefined} />;
              }
              // Assistant turn — ONE Trail for all tool activity, ONE final text response
              // Collect all trail parts (tools + interleaved justification text) across all messages
              const SKIP_TOOLS = new Set(['step-start', 'step_start', 'reasoning', 'thinking', 'snapshot']);
              const allTrailParts: any[] = [];
              let finalTextMsg: any = null;
              let finalTailTextParts: any[] = [];

              for (const m of turn.msgs) {
                const mParts = partsMap[m.id] ?? [];
                const lastToolIdx = mParts.reduce((acc: number, p: any, i: number) =>
                  (p.type === 'tool' && !SKIP_TOOLS.has((p.tool ?? p.toolName ?? '').toLowerCase())) ? i : acc, -1);

                if (lastToolIdx >= 0) {
                  // Everything up to and including last real tool → Trail
                  const trailSlice = mParts.slice(0, lastToolIdx + 1).filter((p: any) => {
                    if (p.type === 'tool') return !SKIP_TOOLS.has((p.tool ?? p.toolName ?? '').toLowerCase());
                    return p.type === 'text'; // keep interleaved text as justification
                  });
                  allTrailParts.push(...trailSlice);
                  // Text after last tool = candidate final response
                  const tail = mParts.slice(lastToolIdx + 1).filter((p: any) => p.type === 'text');
                  if (tail.length > 0) { finalTailTextParts = tail; finalTextMsg = m; }
                } else {
                  // No tools in this message — it's a pure text response
                  const textParts = mParts.filter((p: any) => p.type === 'text');
                  const text = textParts.map((p: any) => p.text ?? '').join('') || m.content;
                  if (text.trim().length > 0 || m.id === streamingMsgId) {
                    finalTailTextParts = textParts.length > 0 ? textParts : [];
                    finalTextMsg = m;
                  }
                }
              }
              // streaming message with no parts yet
              if (!finalTextMsg && turn.msgs.length > 0) {
                const last = turn.msgs[turn.msgs.length - 1];
                if (last.id === streamingMsgId) { finalTextMsg = last; finalTailTextParts = []; }
              }
              return (
                <div key={`turn-${ti}`} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {allTrailParts.length > 0 && (
                    <div style={{ marginBottom: finalTextMsg ? 6 : 0 }}>
                      <ToolGroup parts={allTrailParts} isStreaming={turn.msgs.some((m: any) => m.id === streamingMsgId)} />
                    </div>
                  )}
                  {finalTextMsg && (
                    <ChatMessage msg={finalTextMsg} parts={finalTailTextParts.length > 0 ? finalTailTextParts : (partsMap[finalTextMsg.id] ?? []).filter((p: any) => p.type === 'text')} isStreaming={finalTextMsg.id === streamingMsgId} onFork={forkSession} hideTools />
                  )}
                </div>
              );
            });
          })()}

          {/* Render pending questions for current session */}
          {sessionId && questions[sessionId]?.map(q => (
            <QuestionCard key={q.id} question={q} onReply={replyToQuestion} onReject={rejectQuestion} />
          ))}

          {/* Render pending permissions for current session */}
          {sessionId && permissions[sessionId]?.map(p => (
            <PermissionCard key={p.id} permission={p} onReply={replyToPermission} />
          ))}
          {error && (
            <div style={{ padding: '8px 12px', background: '#2a1a1a', border: '1px solid #5a2a2a', borderRadius: 8, color: 'var(--red)', fontSize: 13 }}>{error}</div>
          )}
              <div ref={messagesEndRef} />
            </div>{/* end max-width wrapper */}
          </div>
        )}

        {/* Input ” hidden when on plan/terminal tab */}
        {activeTab !== 'plan' && activeTab !== 'terminal' && (
        <div style={{ padding: '8px 12px calc(12px + env(safe-area-inset-bottom, 0px))', background: 'var(--bg)', flexShrink: 0 }}>
          <div style={{ maxWidth: 760, margin: '0 auto', position: 'relative' }}><div style={{
            background: 'var(--bg-3)',
            border: `1px solid ${isLoading ? 'var(--accent)' : 'var(--border-2)'}`,
            borderRadius: 16,
            transition: 'border-color 0.15s',
            overflow: 'visible',
          }}>
            {/* Textarea row */}
            <div style={{ padding: '10px 14px 4px', position: 'relative' }}>
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder="How can I help you today? Type / for commands"
                rows={1}
                style={{
                  width: '100%', background: 'transparent', border: 'none', outline: 'none',
                  color: 'var(--text)', fontSize: 15, lineHeight: 1.5, resize: 'none',
                  fontFamily: 'inherit', minHeight: 24, maxHeight: 200,
                  display: 'block',
                }}
              />
            </div>

            {/* Command dropdown */}
            {showCmdDropdown && (
              <div style={{
                position: 'absolute', 
                bottom: '100%', 
                left: 0, 
                right: 0,
                marginBottom: 4,
                background: 'var(--bg-3)', 
                border: '1px solid var(--border-2)',
                borderRadius: 8, 
                maxHeight: 200, 
                overflowY: 'auto',
                boxShadow: '0 -4px 20px rgba(0,0,0,0.15)', 
                zIndex: 250,
              }}>
                {commands.filter(c => 
                  c && c.name && c.description && (!cmdFilter || c.name.toLowerCase().includes(cmdFilter) || c.description.toLowerCase().includes(cmdFilter))
                ).map((c, idx) => {
                  const isSelected = idx === cmdSelectedIndex;
                  return (
                  <button
                    key={c.name}
                    onClick={() => {
                      const lines = inputText.split('\n');
                      lines[lines.length - 1] = `/${c.name} `;
                      setInputText(lines.join('\n'));
                      setShowCmdDropdown(false);
                      textareaRef.current?.focus();
                    }}
                    style={{
                      display: 'block', width: '100%', padding: '10px 14px',
                      background: isSelected ? 'var(--accent)' : 'transparent', border: 'none', textAlign: 'left',
                      cursor: 'pointer', color: isSelected ? 'var(--bg)' : 'var(--text)',
                    }}
                    onMouseEnter={() => setCmdSelectedIndex(idx)}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'monospace' }}>/{c.name}</div>
                    <div style={{ fontSize: 11, color: isSelected ? 'var(--bg)' : 'var(--text-4)' }}>{c.description}</div>
                  </button>
                );})}
              </div>
            )}

            {/* Bottom toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '4px 10px 8px' }}>
              {/* Right: agent selector + model selector + send */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {/* Autopilot toggle */}
                <button
                  onClick={() => setAutopilot(!autopilot)}
                  title={autopilot ? "Autopilot: executes tools automatically" : "Permission: asks before executing tools"}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    background: autopilot ? 'rgba(74, 157, 95, 0.1)' : 'transparent',
                    border: autopilot ? '1px solid rgba(74, 157, 95, 0.2)' : '1px solid var(--border-2)',
                    cursor: 'pointer',
                    padding: '3px 8px', borderRadius: 6,
                    color: autopilot ? '#4a9d5f' : 'var(--text-4)',
                    fontSize: 11, fontFamily: 'inherit', fontWeight: 500,
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}>
                    {autopilot ? (
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    ) : (
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M12 8v4 M12 16h.01" />
                    )}
                  </svg>
                  {autopilot ? 'Autopilot' : 'Permission'}
                </button>

                {/* Agent selector */}
                <AgentSelector
                  selectedAgent={selectedAgent}
                  setSelectedAgent={setSelectedAgent}
                  agentOpen={agentOpen}
                  setAgentOpen={setAgentOpen}
                />

                {/* Model selector */}
                <ModelSelector
                  models={models}
                  selectedModel={selectedModel}
                  modelOpen={modelOpen}
                  modelSearch={modelSearch}
                  sessionId={sessionId}
                  isMobile={isMobile}
                  setSelectedModel={setSelectedModel}
                  setModelOpen={setModelOpen}
                  setModelSearch={setModelSearch}
                  setSessionModelSelections={setSessionModelSelections}
                />

                {/* Send / Stop button */}
                <button
                  onClick={isLoading ? stopGeneration : sendMessage}
                  disabled={!isLoading && !inputText.trim()}
                  style={{
                    background: isLoading ? 'transparent' : (!inputText.trim() ? 'transparent' : 'var(--accent)'),
                    border: 'none',
                    borderRadius: '50%',
                    width: 32, height: 32,
                    cursor: (!isLoading && !inputText.trim()) ? 'not-allowed' : 'pointer',
                    color: isLoading ? 'var(--red)' : (!inputText.trim() ? 'var(--text-5)' : 'var(--bg)'),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'all 0.15s',
                  }}
                >
                  {isLoading ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div></div>{/* end max-width wrapper */}
        </div>
        )} {/* end activeTab !== 'plan' */}
      </div>

      {/* Right panel ” file tree, resizable */}
      {rightPanelOpen && (
        <RightPanel onClose={() => setRightPanelOpen(false)}>
          <RightPanelContent workingDir={workingDir} />
        </RightPanel>
      )}

      {dirPickerOpen && <DirPicker current={workingDir} rootDir={rootDirRef.current || workingDir} onSwitch={switchDirectory} onClose={() => setDirPickerOpen(false)} />}

      {/* Revert confirmation dialog */}
      {revertConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)' }}
          onClick={() => setRevertConfirm(null)}>
          <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '24px 28px', maxWidth: 420, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--red, #e06c75)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7v6h6"/><path d="M3 13C5.33 7.67 10.67 4 17 4a9 9 0 0 1 0 18H3"/>
              </svg>
              <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>Revert to this message?</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 16px', lineHeight: 1.6 }}>
              All messages and file changes after this point will be undone.
            </p>
            {revertConfirm.affectedFiles.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 12, color: 'var(--text-4)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Files that will be reverted
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
                  {revertConfirm.affectedFiles.map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', background: 'var(--bg-3)', borderRadius: 6, fontSize: 12, fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-2)' }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--yellow, #e5c07b)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      {f.replace(/\\/g, '/').split('/').pop()}
                      <span style={{ color: 'var(--text-5)', fontSize: 10, marginLeft: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{f.replace(/\\/g, '/')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {revertConfirm.affectedFiles.length === 0 && (
              <div style={{ marginBottom: 18, fontSize: 12, color: 'var(--text-4)', fontStyle: 'italic' }}>
                No file changes detected after this message.
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setRevertConfirm(null)} style={{
                padding: '7px 16px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent',
                color: 'var(--text-3)', cursor: 'pointer', fontSize: 13,
              }}>Cancel</button>
              <button onClick={() => { const id = revertConfirm.messageId; setRevertConfirm(null); doRevert(id); }} style={{
                padding: '7px 16px', borderRadius: 7, border: 'none', background: 'var(--red, #e06c75)',
                color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              }}>Revert</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        .session-menu-btn { opacity: 0 !important; }
        div:hover > div > .session-menu-btn,
        div:hover .session-menu-btn { opacity: 1 !important; }
        .code-block-wrap:hover .copy-btn { opacity: 1 !important; }
        .copy-btn:hover { color: #CECDC3 !important; border-color: #575653 !important; }
        ${PRISM_CSS}
        .md { font-size: 15px; line-height: 1.75; color: var(--text); }
        .md p { margin: 0 0 8px; }
        .md p:last-child { margin-bottom: 0; }
        .md h1,.md h2,.md h3,.md h4 { color: var(--text); margin: 12px 0 6px; font-weight: 600; }
        .md h1 { font-size: 20px; } .md h2 { font-size: 17px; } .md h3 { font-size: 15px; }
        .md code { background: var(--bg-4); color: var(--accent); padding: 1px 5px; border-radius: 3px; font-family: var(--font-mono, monospace); font-size: 13px; }
        .md pre { background: var(--bg-3); border: 1px solid var(--border-2); border-radius: 6px; padding: 10px 12px; overflow-x: auto; margin: 8px 0; font-family: var(--font-mono, monospace); }
        .md pre code { background: none; color: var(--text-2); padding: 0; font-size: 13px; }
        /* Prism tokens must override the plain pre code color */
        .md pre code.prism-code .token { color: inherit; }
        .md pre code.prism-code { color: var(--text-2); }
        .md ul,.md ol { margin: 4px 0 8px; padding-left: 20px; }
        .md li { margin-bottom: 2px; }
        .md blockquote { border-left: 3px solid var(--border-2); margin: 8px 0; padding: 4px 12px; color: var(--text-3); }
        .md table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 13px; }
        .md th { background: var(--bg-4); color: var(--text); padding: 6px 10px; text-align: left; border: 1px solid var(--border-2); }
        .md td { padding: 5px 10px; border: 1px solid var(--border); color: var(--text-2); }
        .md tr:nth-child(even) td { background: var(--bg-2); }
        .md a { color: var(--accent); text-decoration: none; }
        .md a:hover { text-decoration: underline; }
        .md hr { border: none; border-top: 1px solid var(--border); margin: 12px 0; }
        select option { background: var(--bg-4); }
      `}</style>
    </div>
  );
}

export default App;

