import React, { useState, useEffect, useRef, useCallback } from 'react';
import { marked } from 'marked';
import { TokenUsageIndicator } from './components/ui/TokenUsageIndicator';
import { FileViewer } from './components/filetree/FileViewer';
import { uid, getContextUsage, fallbackCopy } from './utils/helpers';
import { gitStatusColor, gitStatusLabel } from './utils/gitUtils';
import type { GitFileStatus, GitStatus } from './utils/gitUtils';
import { fileColor, getFileExt } from './utils/fileUtils';
import { MobileTerminal } from './components/terminal/MobileTerminal';
import { DesktopTerminal } from './components/terminal/DesktopTerminal';
import { ChatMessage } from './components/chat/ChatMessage';
import { ToolGroup } from './components/chat/ToolGroup';
import { GitPanel } from './components/git/GitPanel';
import { FileTreeNode } from './components/filetree/FileTreeNode';
import { ContextMenu } from './components/filetree/ContextMenu';
import { InlineInput } from './components/filetree/InlineInput';
import { Markdown } from './components/chat/Markdown';
import { DirPicker } from './components/app/DirPicker';
import { FontPicker } from './components/app/FontPicker';
import { SettingsDialog } from './components/app/SettingsDialog';
import { usePreferencesStore, UI_FONTS, MONO_FONTS } from './stores/preferencesStore';

function Terminal({ workingDir }: { workingDir: string }) {
  const isMobile = typeof window !== 'undefined' &&
    (window.matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent));
  return isMobile
    ? <MobileTerminal workingDir={workingDir} />
    : <DesktopTerminal workingDir={workingDir} />;
}

// â”€â”€ Theme System â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

import { applyTheme, loadTheme, THEMES, THEME_DEFS, LS_THEME, THEME_COMPAT, type ThemeId, type ThemeDef } from './constants/themes';
import { AgentSelector } from './components/app/AgentSelector';

// Working dir resolved from server at runtime

let _workingDir = '';
const getWorkingDir = () => _workingDir;

// Configure marked
marked.setOptions({ breaks: true, gfm: true } as any);

// â”€â”€ Global file-open event (chat â†’ tree) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type FileOpenListener = (path: string) => void;
const fileOpenListeners = new Set<FileOpenListener>();
const emitOpenFile = (path: string) => fileOpenListeners.forEach(fn => fn(path));
const onOpenFile = (fn: FileOpenListener) => {
  fileOpenListeners.add(fn);
  return () => { fileOpenListeners.delete(fn); };
};

// â”€â”€ Prism theme (matches openchamber dark palette) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const PRISM_CSS = ``;


import { RightPanel, RIGHT_PANEL_MIN, RIGHT_PANEL_MAX, RIGHT_PANEL_DEFAULT, LS_PANEL_WIDTH, getRightPanelDefault } from './components/ui/RightPanel';

// â”€â”€ File Tree â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// â”€â”€ Git status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


function FileTreePanel({ workingDir }: { workingDir: string }) {
  const [rootEntries, setRootEntries] = useState<FsEntry[] | null>(null);

  // Persist open tabs per working directory so they survive panel close/reopen
  const tabsKey = `oc_open_tabs_${workingDir}`;
  const activeKey = `oc_active_tab_${workingDir}`;
  const [openTabs, setOpenTabsRaw] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(tabsKey) || '[]'); } catch { return []; }
  });
  const [activeTab, setActiveTabFileRaw] = useState<string | null>(() => {
    return localStorage.getItem(activeKey) || null;
  });
  const [tab, setTab] = useState<'files' | 'viewer'>(() => {
    const saved = localStorage.getItem(activeKey);
    return saved ? 'viewer' : 'files';
  });

  const setOpenTabs = (updater: string[] | ((prev: string[]) => string[])) => {
    setOpenTabsRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      localStorage.setItem(tabsKey, JSON.stringify(next));
      return next;
    });
  };
  const setActiveTabFile = (val: string | null) => {
    setActiveTabFileRaw(val);
    if (val) localStorage.setItem(activeKey, val);
    else localStorage.removeItem(activeKey);
  };
  const [showHidden, setShowHidden] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [inlineEdit, setInlineEdit] = useState<InlineEdit | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<FsEntry & { relativePath?: string }> | null>(null);
  const [searching, setSearching] = useState(false);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(null), 2500); };

  // Listen for file-open events from chat tool parts
  useEffect(() => {
    return onOpenFile((path: string) => {
      const norm = path.replace(/\\/g, '/');
      openFileTab(norm);
    });
  }, []);

  const openFileTab = (norm: string) => {
    setOpenTabs(prev => prev.includes(norm) ? prev : [...prev, norm]);
    setActiveTabFile(norm);
    setTab('viewer');
    setTimeout(() => {
      const el = scrollContainerRef.current?.querySelector(`[data-filepath="${CSS.escape(norm)}"]`);
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 100);
  };

  const closeFileTab = (norm: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenTabs(prev => {
      const next = prev.filter(t => t !== norm);
      if (activeTab === norm) {
        // Focus adjacent tab or go back to files
        const idx = prev.indexOf(norm);
        const nextActive = next[idx] ?? next[idx - 1] ?? null;
        setActiveTabFile(nextActive);
        if (!nextActive) setTab('files');
      }
      return next;
    });
  };

  const loadRoot = useCallback(async () => {
    if (!workingDir) return;
    try {
      const r = await fetch(`/api/fs/list?path=${encodeURIComponent(workingDir)}`);
      const data = await r.json();
      const entries = (data.entries as FsEntry[])
        .filter(e => showHidden || !e.name.startsWith('.'))
        .sort((a, b) => { if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1; return a.name.localeCompare(b.name); });
      setRootEntries(entries);
    } catch { setRootEntries([]); }
  }, [workingDir, showHidden]);

  const loadGitStatus = useCallback(async () => {
    if (!workingDir) return;
    try {
      const r = await fetch(`/api/git/status?dir=${encodeURIComponent(workingDir)}`);
      setGitStatus(await r.json());
    } catch { setGitStatus({ isRepo: false, files: {} }); }
  }, [workingDir]);

  useEffect(() => { loadRoot(); loadGitStatus(); }, [loadRoot, loadGitStatus]);

  // Refresh git status on window focus and tab visibility change (no polling)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) loadGitStatus();
    };
    const handleFocus = () => { loadGitStatus(); };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadGitStatus]);

  const refresh = () => { loadRoot(); loadGitStatus(); setRefreshKey(k => k + 1); };

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!searchQuery.trim()) { setSearchResults(null); setSearching(false); return; }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/fs/search?dir=${encodeURIComponent(workingDir)}&q=${encodeURIComponent(searchQuery.trim())}`);
        setSearchResults(await r.json());
      } catch { setSearchResults([]); }
      setSearching(false);
    }, 250);
  }, [searchQuery, workingDir]);

  const getFileGitStatus = useCallback((filePath: string): GitFileStatus | undefined => {
    if (!gitStatus?.files) return undefined;
    const norm = filePath.replace(/\\/g, '/');
    const rootNorm = workingDir.replace(/\\/g, '/');
    const normLower = norm.toLowerCase();
    const rootLower = rootNorm.toLowerCase();
    const rel = normLower.startsWith(rootLower + '/') ? norm.slice(rootNorm.length + 1) : norm;
    return gitStatus.files[rel] ?? gitStatus.files[rel.toLowerCase()] ?? undefined;
  }, [gitStatus, workingDir]);

  const getFolderBadge = useCallback((dirPath: string) => {
    if (!gitStatus?.files) return null;
    const norm = dirPath.replace(/\\/g, '/');
    const rootNorm = workingDir.replace(/\\/g, '/');
    const normLower = norm.toLowerCase();
    const rootLower = rootNorm.toLowerCase();
    const relDir = normLower.startsWith(rootLower + '/') ? norm.slice(rootNorm.length + 1) : '';
    let M = 0, A = 0, D = 0;
    for (const [file, s] of Object.entries(gitStatus.files)) {
      if (relDir && !file.startsWith(relDir + '/')) continue;
      const lbl = gitStatusLabel(s);
      if (lbl === 'M' || lbl === 'R') M++;
      else if (lbl === 'A') A++;
      else if (lbl === 'D') D++;
    }
    return (M + A + D) > 0 ? { M, A, D } : null;
  }, [gitStatus, workingDir]);

  const handleFileClick = useCallback((p: string) => { openFileTab(p.replace(/\\/g, '/')); }, [openFileTab]);

  const handleContextMenu = useCallback((e: React.MouseEvent, entry: FsEntry) => {
    e.preventDefault();
    setCtxMenu({ x: Math.min(e.clientX, window.innerWidth - 170), y: Math.min(e.clientY, window.innerHeight - 200), entry });
  }, []);

  const handleCtxAction = async (action: string, entry: FsEntry) => {
    if (action === 'copyPath') { await navigator.clipboard.writeText(entry.path.replace(/\//g, '\\')).catch(() => {}); showToast('Path copied'); return; }
    if (action === 'rename') { setInlineEdit({ entryPath: entry.path, type: 'rename', currentName: entry.name }); return; }
    if (action === 'newFile') { setInlineEdit({ parentPath: entry.path, type: 'newFile' }); return; }
    if (action === 'newFolder') { setInlineEdit({ parentPath: entry.path, type: 'newFolder' }); return; }
    if (action === 'delete') {
      if (!confirm(`Delete "${entry.name}"?`)) return;
      const r = await fetch('/api/fs/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: entry.path }) });
      if (r.ok) { showToast('Deleted'); refresh(); } else showToast('Delete failed');
    }
  };

  const handleInlineConfirm = async (val: string) => {
    if (!val || !inlineEdit) { setInlineEdit(null); return; }
    if (inlineEdit.type === 'rename') {
      const dir = inlineEdit.entryPath.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
      const r = await fetch('/api/fs/rename', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oldPath: inlineEdit.entryPath, newPath: dir + '/' + val }) });
      if (r.ok) { showToast('Renamed'); refresh(); } else showToast('Rename failed');
    }
    if (inlineEdit.type === 'newFile') {
      const r = await fetch('/api/fs/write', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: inlineEdit.parentPath.replace(/\\/g, '/') + '/' + val, content: '' }) });
      if (r.ok) { showToast('File created'); refresh(); } else showToast('Create failed');
    }
    if (inlineEdit.type === 'newFolder') {
      const r = await fetch('/api/fs/mkdir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: inlineEdit.parentPath.replace(/\\/g, '/') + '/' + val }) });
      if (r.ok) { showToast('Folder created'); refresh(); } else showToast('Create failed');
    }
    setInlineEdit(null);
  };

  const initGit = async () => {
    const r = await fetch('/api/git/init', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dir: workingDir }) });
    if (r.ok) { showToast('Git initialized'); loadGitStatus(); } else showToast('git init failed');
  };

  const rootName = workingDir.replace(/\\/g, '/').split('/').pop() ?? workingDir;
  const ib: React.CSSProperties = { background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-4)', padding: '3px 5px', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '5px 8px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <button onClick={() => setTab('files')} style={{ ...ib, fontSize: 11, padding: '3px 8px', color: tab === 'files' ? 'var(--text)' : 'var(--text-4)', background: tab === 'files' ? 'var(--bg-4)' : 'transparent' }}>Files</button>
        {openTabs.length > 0 && (
          <button onClick={() => setTab('viewer')} style={{ ...ib, fontSize: 11, padding: '3px 8px', color: tab === 'viewer' ? 'var(--text)' : 'var(--text-4)', background: tab === 'viewer' ? 'var(--bg-4)' : 'transparent' }}>View</button>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={() => setInlineEdit({ parentPath: workingDir, type: 'newFile' })} title="New file" style={ib}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
        </button>
        <button onClick={() => setInlineEdit({ parentPath: workingDir, type: 'newFolder' })} title="New folder" style={ib}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
        </button>
        <button onClick={() => setShowHidden(h => !h)} title="Toggle hidden files" style={{ ...ib, color: showHidden ? 'var(--accent)' : 'var(--text-4)', background: showHidden ? 'var(--bg-4)' : 'transparent' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
            {!showHidden && <line x1="2" y1="2" x2="22" y2="22"/>}
          </svg>
        </button>
        <button onClick={refresh} title="Refresh" style={ib}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        </button>
      </div>

      {tab === 'files' && (
        <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--bg-3)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', gap: 6 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search files..."
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 12, fontFamily: 'inherit' }} />
            {searchQuery && <button onClick={() => setSearchQuery('')} style={{ background: 'transparent', border: 'none', color: 'var(--text-4)', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}>x</button>}
          </div>
        </div>
      )}

      {tab === 'files' && !searchQuery && gitStatus && !gitStatus.isRepo && (
        <div style={{ padding: '5px 10px', background: 'var(--bg-2)', borderBottom: '1px solid var(--bg-3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: 'var(--text-4)' }}>No git repo</span>
          <button onClick={initGit} style={{ background: 'var(--bg-4)', border: '1px solid var(--border-2)', borderRadius: 4, color: 'var(--accent)', fontSize: 11, padding: '2px 8px', cursor: 'pointer', fontFamily: 'inherit' }}>git init</button>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }} ref={scrollContainerRef}>
        {tab === 'files' && searchQuery.trim() ? (
          <div style={{ paddingTop: 4 }}>
            {searching && <div style={{ padding: '8px 12px', color: 'var(--text-4)', fontSize: 12 }}>Searching...</div>}
            {!searching && searchResults?.length === 0 && <div style={{ padding: '8px 12px', color: 'var(--text-4)', fontSize: 12 }}>No results</div>}
            {!searching && searchResults?.map(e => {
              const gs = getFileGitStatus(e.path);
              const color = gitStatusColor(gs);
              const label = gitStatusLabel(gs);
              const dir = e.relativePath?.split('/').slice(0, -1).join('/');
              return (
                <div key={e.path} onClick={() => handleFileClick(e.path)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', cursor: 'pointer' }}
                  onMouseEnter={e2 => (e2.currentTarget.style.background = 'var(--bg-2)')}
                  onMouseLeave={e2 => (e2.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ fontSize: 10, color: fileColor(e.name), fontFamily: 'monospace', minWidth: 26, textAlign: 'center', background: 'var(--bg-3)', borderRadius: 3, padding: '1px 3px' }}>{getFileExt(e.name).slice(0, 3) || '.'}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ color: 'var(--text)', fontSize: 13 }}>{e.name}</span>
                    {dir && <span style={{ color: 'var(--text-4)', fontSize: 11, marginLeft: 6 }}>{dir}</span>}
                  </span>
                  {label && <span style={{ fontSize: 11, color: color ?? 'var(--text-3)', fontWeight: 700, flexShrink: 0 }}>{label}</span>}
                </div>
              );
            })}
          </div>
        ) : tab === 'files' ? (
          <div style={{ paddingTop: 4 }}>
            <div style={{ padding: '6px 8px 8px 22px', fontSize: 11, color: 'var(--text-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {rootName}
            </div>
            {inlineEdit !== null && 'parentPath' in inlineEdit && inlineEdit.parentPath === workingDir && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px 5px 22px' }}>
                <span style={{ fontSize: 14 }}>{inlineEdit.type === 'newFile' ? 'f' : 'd'}</span>
                <InlineInput defaultValue="" onConfirm={handleInlineConfirm} onCancel={() => setInlineEdit(null)} />
              </div>
            )}
            {rootEntries === null
              ? <div style={{ padding: '8px 12px', color: 'var(--text-4)', fontSize: 12 }}>Loading...</div>
              : rootEntries.map(e => (
                <FileTreeNode key={e.path + refreshKey} entry={e} depth={0}
                  onFileClick={handleFileClick} selectedPath={activeTab}
                  showHidden={showHidden} onContextMenu={handleContextMenu}
                  inlineEdit={inlineEdit} onInlineConfirm={handleInlineConfirm}
                  onInlineCancel={() => setInlineEdit(null)} refreshKey={refreshKey}
                  gitStatus={!e.isDirectory ? getFileGitStatus(e.path) : undefined}
                  folderBadge={e.isDirectory ? getFolderBadge(e.path) : null}
                  getFileGitStatus={getFileGitStatus} getFolderBadge={getFolderBadge}
                />
              ))
            }
          </div>
        ) : tab === 'viewer' && activeTab ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* File tabs bar */}
            <div style={{ display: 'flex', alignItems: 'center', overflowX: 'auto', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--bg-2)' }}>
              {openTabs.map(filePath => {
                const name = filePath.replace(/\\/g, '/').split('/').pop() ?? filePath;
                const isActive = filePath === activeTab;
                return (
                  <div key={filePath}
                    onClick={() => setActiveTabFile(filePath)}
                    title={filePath}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '5px 10px 5px 12px', cursor: 'pointer', flexShrink: 0,
                      borderRight: '1px solid var(--border)',
                      background: isActive ? 'var(--bg)' : 'transparent',
                      borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                      maxWidth: 160,
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-3)'; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{ fontSize: 12, color: isActive ? 'var(--text)' : 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{name}</span>
                    <button
                      onClick={e => closeFileTab(filePath, e)}
                      title="Close tab"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-4)', padding: '0 2px', lineHeight: 1, fontSize: 14, flexShrink: 0, borderRadius: 3 }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-4)')}
                    >×</button>
                  </div>
                );
              })}
            </div>
            {/* Active file content */}
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <FileViewer path={activeTab} onClose={() => closeFileTab(activeTab, { stopPropagation: () => {} } as any)} workingDir={workingDir} />
            </div>
          </div>
        ) : (
          <div style={{ padding: '16px 12px', color: 'var(--text-4)', fontSize: 12 }}>Click a file to view it</div>
        )}
      </div>

      {ctxMenu && <ContextMenu menu={ctxMenu} onClose={() => setCtxMenu(null)} onAction={handleCtxAction} />}
      {toastMsg && (
        <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-4)', border: '1px solid var(--border-2)', borderRadius: 6, padding: '5px 12px', fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap', zIndex: 100 }}>
          {toastMsg}
        </div>
      )}
    </div>
  );
}

// â”€â”€ MCP Form â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


// ─── Session Item ──────────────────────────────────────────────────────────────────────────────

function SessionItem({
  session, active, busy, onClick, onRename, onDelete, isSubSession,
}: {
  session: SessionInfo; active: boolean; busy: boolean;
  onClick: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  isSubSession?: boolean;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const title = session.title || `Session ${session.id.slice(0, 6)}`;
  const cleanTitle = title.replace(/^New session\s*-\s*\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/i, 'New session');
  const isFork = cleanTitle.toLowerCase().includes('fork');
  const time = session.time?.updated ?? session.time?.created;
  const timeStr = (() => {
    if (!time) return '';
    const d = new Date(time < 1e12 ? time * 1000 : time);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();
    const timeOnly = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) return timeOnly;
    if (isYesterday) return `Yesterday ${timeOnly}`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + timeOnly;
  })();

  // Close menu on outside click
  useEffect(() => {
    if (!menuPos) return;
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuPos(null); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [menuPos]);

  const startRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuPos(null);
    setDraft(title);
    setRenaming(true);
    setTimeout(() => { inputRef.current?.select(); }, 30);
  };

  const confirmRename = () => {
    const val = draft.trim();
    if (val && val !== title) onRename(session.id, val);
    setRenaming(false);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuPos(null);
    if (confirm(`Delete "${title}"?`)) onDelete(session.id);
  };

  return (
    <div style={{ position: 'relative' }}>
      <div
        onClick={renaming ? undefined : onClick}
        onDoubleClick={startRename}
        onContextMenu={e => { e.preventDefault(); setMenuPos({ x: Math.min(e.clientX, window.innerWidth - 150), y: Math.min(e.clientY, window.innerHeight - 100) }); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px 9px 12px',
          background: active ? 'var(--bg-4)' : 'transparent',
          borderLeft: `3px solid ${active ? 'var(--accent)' : 'transparent'}`,
          cursor: renaming ? 'default' : 'pointer',
        }}
        onMouseEnter={e => { if (!active && !renaming) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-2)'; }}
        onMouseLeave={e => { if (!active) (e.currentTarget as HTMLDivElement).style.background = active ? 'var(--bg-4)' : 'transparent'; }}
      >
        {/* Busy indicator */}
        <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: busy ? 'var(--accent)' : 'transparent', boxShadow: busy ? '0 0 5px var(--accent)' : 'none', animation: busy ? 'pulse 1.5s ease-in-out infinite' : 'none' }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          {renaming ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') setRenaming(false); }}
              onBlur={confirmRename}
              onClick={e => e.stopPropagation()}
              style={{ width: '100%', background: 'var(--bg-4)', border: '1px solid var(--accent)', borderRadius: 4, color: 'var(--text)', fontSize: 13, padding: '1px 6px', fontFamily: 'inherit', outline: 'none' }}
              autoFocus
            />
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
              {isSubSession ? (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#98c379" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
                </svg>
              ) : isFork ? (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#61afef" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>
                </svg>
              ) : null}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: isSubSession ? 13 : 14, color: active ? 'var(--text)' : isSubSession ? 'var(--text-4)' : 'var(--text-3)' }}>{cleanTitle}</span>
            </span>
          )}
          {timeStr && !renaming && <span style={{ fontSize: 12, color: 'var(--text-5)' }}>{timeStr}</span>}
        </div>

        {/* â‹¯ menu button */}
        {!renaming && (
          <button
            onClick={e => { e.stopPropagation(); setMenuPos({ x: e.clientX, y: e.clientY }); }}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-5)', cursor: 'pointer', padding: '0 2px', fontSize: 14, lineHeight: 1, opacity: 0, transition: 'opacity 0.1s' }}
            className="session-menu-btn"
          >…</button>
        )}
      </div>

      {/* Context menu */}
      {menuPos && (
        <div ref={menuRef} style={{ position: 'fixed', top: menuPos.y, left: menuPos.x, zIndex: 9999, background: 'var(--bg-4)', border: '1px solid var(--border-2)', borderRadius: 8, minWidth: 140, boxShadow: '0 8px 24px rgba(0,0,0,0.6)', padding: '4px 0' }}>
          <button onClick={startRename} style={{ width: '100%', textAlign: 'left', padding: '6px 14px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, color: 'var(--text-2)' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#2e2c2c')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            Rename
          </button>
          <div style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />
          <button onClick={handleDelete} style={{ width: '100%', textAlign: 'left', padding: '6px 14px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, color: 'var(--red)' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#2e2c2c')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// â”€â”€ Plan Mode â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const PLAN_FILENAME = 'PLAN.md';

// Detect plan file path from tool parts” watches for write/edit to PLAN.md
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

function PlanView({ planPath, workingDir }: { planPath: string; workingDir: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'preview' | 'raw'>('preview');
  const [copied, setCopied] = useState(false);

  const displayPath = planPath.replace(workingDir.replace(/\\/g, '/') + '/', '');

  const load = useCallback(() => {
    fetch(`/api/fs/read?path=${encodeURIComponent(planPath)}`)
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.text(); })
      .then(t => { setContent(t); setLoading(false); setError(null); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [planPath]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const copyContent = () => {
    if (!content) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(content).then(() => {
        setCopied(true); setTimeout(() => setCopied(false), 2000);
      }).catch(() => fallbackCopy(content, setCopied));
    } else {
      fallbackCopy(content, setCopied);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--bg-2)' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#edb449" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>
        </svg>
        <span style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayPath || PLAN_FILENAME}</span>
        {/* Refresh */}
        <button onClick={load} title="Refresh" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-4)', padding: '2px 4px', flexShrink: 0 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        </button>
        {/* Mode toggle */}
        <div style={{ display: 'flex', background: 'var(--bg-4)', borderRadius: 5, padding: 2, gap: 1, flexShrink: 0 }}>
          {(['preview', 'raw'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              background: mode === m ? 'var(--border-2)' : 'transparent', border: 'none',
              color: mode === m ? 'var(--text)' : 'var(--text-4)', cursor: 'pointer',
              fontSize: 11, padding: '2px 8px', borderRadius: 4, fontFamily: 'inherit',
            }}>{m === 'preview' ? 'Preview' : 'Raw'}</button>
          ))}
        </div>
        {/* Copy */}
        <button onClick={copyContent} title="Copy plan" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: copied ? 'var(--green)' : 'var(--text-4)', padding: '2px 4px', flexShrink: 0 }}>
          {copied
            ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          }
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {loading && <div style={{ padding: 20, color: 'var(--text-4)', fontSize: 13 }}>Loading plan</div>}
        {error && (
          <div style={{ padding: 20, color: 'var(--red)', fontSize: 13 }}>
            Could not load plan file.<br />
            <span style={{ fontSize: 11, color: 'var(--text-4)', fontFamily: 'monospace' }}>{planPath}</span>
          </div>
        )}
        {!loading && !error && content !== null && (
          mode === 'preview'
            ? <div style={{ padding: '16px 20px' }}><Markdown text={content} /></div>
            : <pre style={{ margin: 0, padding: '16px 20px', fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)", fontSize: 13, lineHeight: 1.6, color: 'var(--text-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{content}</pre>
        )}
      </div>
    </div>
  );
}

// â”€â”€ Right Panel Content (Git + Files tabs) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function RightPanelContent({ workingDir }: { workingDir: string }) {
  const [tab, setTab] = useState<'files' | 'git'>('files');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {(['files', 'git'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '8px 0', background: 'transparent', border: 'none',
            cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
            color: tab === t ? 'var(--text)' : 'var(--text-4)',
            fontWeight: tab === t ? 600 : 400,
            borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}>
            {t === 'files' ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>
              </svg>
            )}
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {/* Content */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {tab === 'files' ? <FileTreePanel workingDir={workingDir} /> : <GitPanel workingDir={workingDir} />}
      </div>
    </div>
  );
}

// â”€â”€ App â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

// â”€â”€ Permission Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function PermissionCard({ permission, onReply }: {
  permission: PermissionRequest;
  onReply: (requestID: string, response: 'once' | 'always' | 'reject') => Promise<void>;
}) {
  const [isResponding, setIsResponding] = useState(false);

  const handleResponse = async (response: 'once' | 'always' | 'reject') => {
    setIsResponding(true);
    try {
      await onReply(permission.id, response);
    } catch { /* ignore */ }
    setIsResponding(false);
  };

  const tool = permission.permission.toLowerCase();
  const meta = permission.metadata || {};
  
  // Simplified rendering for opencode-gui
  const renderContent = () => {
    if (tool === 'bash' || tool === 'shell' || tool === 'cmd') {
      const cmd = meta.command || meta.cmd || meta.script;
      return <pre style={{ fontSize: 12, padding: 8, background: 'var(--bg-1)', borderRadius: 4, overflowX: 'auto', margin: '4px 0' }}>{cmd}</pre>;
    }
    if (tool === 'write' || tool === 'edit') {
      const path = meta.path || meta.file_path || meta.filePath;
      return <div style={{ fontSize: 12, color: 'var(--text-3)' }}>File: <code style={{ color: 'var(--accent)' }}>{path}</code></div>;
    }
    if (tool === 'read' || tool === 'readfile') {
      const path = meta.path || meta.file_path || meta.filePath || meta.filename;
      if (path) return <div style={{ fontSize: 12, color: 'var(--text-3)' }}>File: <code style={{ color: 'var(--accent)' }}>{path}</code></div>;
    }
    if (Object.keys(meta).length === 0) return null;
    return <pre style={{ fontSize: 11, padding: 6, background: 'var(--bg-1)', borderRadius: 4 }}>{JSON.stringify(meta, null, 2)}</pre>;
  };

  return (
    <div style={{ border: '1px solid var(--accent)', borderRadius: 8, padding: 12, marginBottom: 8, background: 'var(--bg-2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><circle cx="12" cy="12" r="3"/>
        </svg>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>Permission Required</span>
        <span style={{ fontSize: 12, color: 'var(--text-4)', marginLeft: 'auto', fontFamily: 'monospace' }}>{permission.permission}</span>
      </div>

      <div style={{ marginBottom: 10 }}>
        {renderContent()}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={() => handleResponse('once')}
          disabled={isResponding}
          style={{
            padding: '5px 10px', fontSize: 12, border: 'none', borderRadius: 4,
            background: 'var(--green)', color: '#fff', cursor: 'pointer', opacity: isResponding ? 0.6 : 1
          }}
        >Allow</button>
        <button
          onClick={() => handleResponse('always')}
          disabled={isResponding}
          style={{
            padding: '5px 10px', fontSize: 12, border: '1px solid var(--border-2)', borderRadius: 4,
            background: 'var(--bg-3)', color: 'var(--text-2)', cursor: 'pointer', opacity: isResponding ? 0.6 : 1
          }}
        >Always</button>
        <button
          onClick={() => handleResponse('reject')}
          disabled={isResponding}
          style={{
            padding: '5px 10px', fontSize: 12, border: 'none', borderRadius: 4,
            background: 'var(--red)', color: '#fff', cursor: 'pointer', opacity: isResponding ? 0.6 : 1
          }}
        >Deny</button>
      </div>
    </div>
  );
}

// â”€â”€ Question Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function QuestionCard({ question, onReply, onReject }: {
  question: QuestionRequest;
  onReply: (requestID: string, answers: string[][]) => Promise<void>;
  onReject: (requestID: string) => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState<Record<number, string[]>>({});
  const [customMode, setCustomMode] = useState<Record<number, boolean>>({});
  const [customText, setCustomText] = useState<Record<number, string>>({});
  const [isResponding, setIsResponding] = useState(false);

  const questions = question.questions ?? [];
  const activeQuestion = questions[activeTab];

  const toggleOption = (qIdx: number, label: string) => {
    const isMultiple = questions[qIdx]?.multiple ?? false;
    console.log('[QuestionCard] toggleOption called:', { qIdx, label, isMultiple });
    setCustomMode(prev => ({ ...prev, [qIdx]: false }));
    setSelectedOptions(prev => {
      const current = prev[qIdx] ?? [];
      if (isMultiple) {
        const exists = current.includes(label);
        const next = exists ? current.filter(item => item !== label) : [...current, label];
        console.log('[QuestionCard] toggleOption multiple:', { current, next });
        return { ...prev, [qIdx]: next };
      }
      console.log('[QuestionCard] toggleOption single:', { current, next: [label] });
      return { ...prev, [qIdx]: [label] };
    });
  };

  const handleSelectCustom = (qIdx: number) => {
    console.log('[QuestionCard] handleSelectCustom called:', qIdx);
    setCustomMode(prev => ({ ...prev, [qIdx]: true }));
    setSelectedOptions(prev => ({ ...prev, [qIdx]: [] }));
  };

  const buildAnswers = (): string[][] => {
    const answers: string[][] = [];
    for (let i = 0; i < questions.length; i++) {
      const isCustom = customMode[i] ?? false;
      if (isCustom) {
        const value = (customText[i] ?? '').trim();
        answers.push(value ? [value] : []);
      } else {
        answers.push(selectedOptions[i] ?? []);
      }
    }
    console.log('[QuestionCard] buildAnswers:', answers);
    return answers;
  };

  const unansweredIndexes = questions
    .map((_, idx) => {
      const isCustom = customMode[idx] ?? false;
      if (isCustom) return (customText[idx] ?? '').trim() ? -1 : idx;
      return (selectedOptions[idx] ?? []).length > 0 ? -1 : idx;
    })
    .filter(idx => idx >= 0);

  const canSubmit = unansweredIndexes.length === 0 && questions.length > 0;

  const handleConfirm = async () => {
    console.log('[QuestionCard] handleConfirm called, canSubmit:', canSubmit);
    if (!canSubmit) return;
    setIsResponding(true);
    try {
      const answers = buildAnswers();
      console.log('[QuestionCard] Calling onReply with:', { requestID: question.id, answers });
      await onReply(question.id, answers);
      console.log('[QuestionCard] onReply succeeded');
    } catch (e) {
      console.error('[QuestionCard] reply error:', e);
    } finally {
      setIsResponding(false);
    }
  };

  const handleDismiss = async () => {
    console.log('[QuestionCard] handleDismiss called');
    setIsResponding(true);
    try {
      await onReject(question.id);
      console.log('[QuestionCard] onReject succeeded');
    } catch (e) {
      console.error('[QuestionCard] reject error:', e);
    } finally {
      setIsResponding(false);
    }
  };

  const handleNext = () => {
    console.log('[QuestionCard] handleNext called, unansweredIndexes:', unansweredIndexes);
    if (unansweredIndexes.length > 0) {
      const nextIdx = unansweredIndexes.find(idx => idx > activeTab) ?? unansweredIndexes[0];
      setActiveTab(nextIdx);
    }
  };

  if (!activeQuestion) return null;

  const isMultiple = activeQuestion.multiple ?? false;
  const selectedForActive = selectedOptions[activeTab] ?? [];
  const isCustomActive = customMode[activeTab] ?? false;

  return (
    <div style={{ border: '1px solid #edb449', borderRadius: 8, padding: 12, marginBottom: 8, background: 'var(--bg-2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#edb449' }}> Input needed</span>
        {questions.length > 1 && (
          <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
            {questions.map((q, idx) => (
              <button
                key={idx}
                onClick={() => setActiveTab(idx)}
                style={{
                  padding: '4px 8px',
                  fontSize: 12,
                  border: 'none',
                  borderRadius: 4,
                  background: activeTab === idx ? '#edb449' : 'var(--bg-3)',
                  color: activeTab === idx ? '#000' : 'var(--text-2)',
                  cursor: 'pointer'
                }}
              >
                {q.header || `Q${idx + 1}`}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{activeQuestion.question}</div>
        {isMultiple && <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>Select multiple</div>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
        {activeQuestion.options.map((option, idx) => {
          const selected = selectedForActive.includes(option.label);
          return (
            <button
              key={idx}
              onClick={() => toggleOption(activeTab, option.label)}
              disabled={isResponding}
              style={{
                padding: 8,
                textAlign: 'left',
                border: '1px solid var(--bg-4)',
                borderRadius: 4,
                background: selected ? 'rgba(237, 180, 73, 0.1)' : 'var(--bg-3)',
                cursor: isResponding ? 'not-allowed' : 'pointer',
                opacity: isResponding ? 0.6 : 1
              }}
            >
              <div style={{ display: 'flex', alignItems: 'start', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={selected}
                  readOnly
                  style={{ marginTop: 2 }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: selected ? 500 : 400 }}>{option.label}</div>
                  {option.description && (
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{option.description}</div>
                  )}
                </div>
              </div>
            </button>
          );
        })}

        <button
          onClick={() => handleSelectCustom(activeTab)}
          disabled={isResponding}
          style={{
            padding: 8,
            textAlign: 'left',
            border: '1px solid var(--bg-4)',
            borderRadius: 4,
            background: isCustomActive ? 'rgba(237, 180, 73, 0.1)' : 'var(--bg-3)',
            cursor: isResponding ? 'not-allowed' : 'pointer',
            opacity: isResponding ? 0.6 : 1
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13 }}>Other</span>
          </div>
        </button>

        {isCustomActive && (
          <textarea
            value={customText[activeTab] ?? ''}
            onChange={(e) => setCustomText(prev => ({ ...prev, [activeTab]: e.target.value }))}
            placeholder="Your answer"
            disabled={isResponding}
            rows={2}
            style={{
              width: '100%',
              padding: 8,
              fontSize: 13,
              border: '1px solid var(--bg-4)',
              borderRadius: 4,
              background: 'var(--bg-1)',
              color: 'var(--text-1)',
              resize: 'vertical',
              fontFamily: 'inherit'
            }}
            autoFocus
          />
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={canSubmit ? handleConfirm : handleNext}
          disabled={isResponding}
          style={{
            padding: '6px 12px',
            fontSize: 13,
            fontWeight: 500,
            border: 'none',
            borderRadius: 4,
            background: '#4a9d5f',
            color: '#fff',
            cursor: isResponding ? 'not-allowed' : 'pointer',
            opacity: isResponding ? 0.6 : 1
          }}
        >
          {canSubmit ? 'Submit' : 'Next'}
        </button>

        <button
          onClick={handleDismiss}
          disabled={isResponding}
          style={{
            padding: '6px 12px',
            fontSize: 13,
            fontWeight: 500,
            border: 'none',
            borderRadius: 4,
            background: '#d9534f',
            color: '#fff',
            cursor: isResponding ? 'not-allowed' : 'pointer',
            opacity: isResponding ? 0.6 : 1
          }}
        >
          ✕ Dismiss
        </button>

        {isResponding && (
          <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)' }}>
            Sending...
          </div>
        )}
      </div>
    </div>
  );
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
  const sidebarResizing = useRef(false);
  const sidebarStartX = useRef(0);
  const sidebarStartW = useRef(isMobile ? Math.min(window.innerWidth * 0.85, 320) : 320);
  const sidebarRef = useRef<HTMLDivElement>(null);
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
  const eventSourceRef = useRef<EventSource | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  // Keep ref in sync with state so callbacks always see latest value
  useEffect(() => {
    sessionIdRef.current = sessionId;
    (window as any).__opencode_session_id__ = sessionId ?? '';
  }, [sessionId]);

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
  useEffect(() => {
    if (!workingDir) return; // wait for config to load first
    fetch('/api/command').then(r => r.json()).then((cmds: any[]) => {
      setCommands(cmds.map(c => ({ name: c.name, description: c.description, template: c.template })));
    }).catch(() => {});
  }, [workingDir]);

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

  // Load models ” wait for workingDir so opencode is ready before hitting /api/provider
  useEffect(() => {
    if (!workingDir) return;
    fetch('/api/provider').then(r => r.json()).then(data => {
      const connected = new Set(data.connected);
      const defaults = data.default ?? {};
      const list: ModelInfo[] = [];
      for (const provider of data.all) {
        if (!connected.has(provider.id)) continue;
        for (const model of Object.values(provider.models) as any[]) {
          const isDefault = defaults[provider.id] === model.id;
          const isFree = (model.cost?.input ?? 1) === 0 && (model.cost?.output ?? 1) === 0;
          list.push({ id: model.id, name: model.name || model.id, providerId: provider.id, providerName: provider.name || provider.id, isDefault, isFree });
        }
      }
      list.sort((a, b) => { if (a.isFree !== b.isFree) return a.isFree ? -1 : 1; if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1; return a.name.localeCompare(b.name); });
      setModels(list); setSelectedModel(list[0] ?? null);
    }).catch(() => {});
  }, [workingDir]);

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
        if (eventSourceRef.current) { eventSourceRef.current.close(); eventSourceRef.current = null; }
        setIsLoading(false); setError(null); setStreamingMsgId(null);
        setSessionId(forked.id); setMessages([]); setPartsMap({});
        await loadSessionMessages(forked.id);
      }
    } catch { /* ignore */ }
  }, [loadSessions, loadSessionMessages]);

  const listenToSession = useCallback((sid: string, tempAssistantId: string, isOngoing: boolean = false) => {
    if (eventSourceRef.current) eventSourceRef.current.close();
    const dir = getWorkingDir();
    const es = new EventSource(`/api/event?directory=${encodeURIComponent(dir)}`);
    eventSourceRef.current = es;

    // Mark this session as busy immediately (only for new sends, not ongoing)
    if (!isOngoing) {
      setBusySessions(prev => new Set(prev).add(sid));
    }

    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        const type = payload?.type;
        const evtSid = payload?.properties?.part?.sessionID ?? payload?.properties?.info?.sessionID ?? payload?.properties?.sessionID;
        if (evtSid && evtSid !== sid) return;

        if (type === 'message.part.updated') {
          const part: Part = payload?.properties?.part;
          if (!part?.id) return;
          // Log all parts to understand structure
          console.log('[part]', part.type, JSON.stringify(part).slice(0, 300));
          const msgId = (part as any).messageID ?? tempAssistantId;
          // Replace temp placeholder with real server message id
          setMessages(prev => {
            if (prev.some(m => m.id === msgId)) return prev;
            // swap temp id for real id
            return prev.map(m => m.id === tempAssistantId ? { ...m, id: msgId } : m);
          });
          setStreamingMsgId(msgId);
          setPartsMap(prev => {
            // migrate parts from temp id to real id
            const base = (prev as Record<string, Part[]>)[msgId] ?? (prev as Record<string, Part[]>)[tempAssistantId] ?? [];
            const existing = base;
            const idx = existing.findIndex(p => p.id === part.id);
            const next = [...existing];
            if (idx >= 0) next[idx] = part; else next.push(part);
            const updated: Record<string, Part[]> = { ...prev, [msgId]: next };
            if (msgId !== tempAssistantId) delete updated[tempAssistantId];
            return updated;
          });
        }

        if (type === 'message.updated') {
          const info = payload?.properties?.info;
          if (!info?.id) return;
          setMessages(prev => {
            if (prev.some(m => m.id === info.id)) {
              // Update token/cost data on existing message
              if (info.role === 'assistant' && (info.tokens || info.cost || info.model)) {
                return prev.map(m => m.id === info.id ? {
                  ...m,
                  tokens: info.tokens,
                  cost: info.cost,
                  model: info.model,
                } : m);
              }
              return prev;
            }
            if (info.role === 'user') {
              // replace temp user placeholder
              if (prev.some(m => m.id.startsWith('temp_user_'))) {
                const tempId = prev.find(m => m.id.startsWith('temp_user_'))?.id;
                if (tempId) {
                  // migrate parts from temp id to real id
                  setPartsMap((pm: Record<string, Part[]>) => {
                    if (!pm[tempId]) return pm;
                    const next: Record<string, Part[]> = { ...pm, [info.id]: pm[tempId] };
                    delete next[tempId];
                    return next;
                  });
                }
                return prev.map(m => m.id.startsWith('temp_user_') ? { id: info.id, role: info.role, content: '' } : m);
              }
            }
            if (info.role === 'assistant') {
              // replace temp assistant placeholder
              if (prev.some(m => m.id === tempAssistantId)) {
                return prev.map(m => m.id === tempAssistantId ? { id: info.id, role: info.role, content: '' } : m);
              }
            }
            return [...prev, { id: info.id, role: info.role, content: '' }];
          });
          if (info.role === 'assistant') setStreamingMsgId(info.id);
        }

        if (type === 'session.idle') {
          setIsLoading(false); setStreamingMsgId(null);
          setBusySessions(prev => { const next = new Set(prev); next.delete(sid); return next; });
          es.close(); eventSourceRef.current = null; loadSessions();
        }

        if (type === 'session.error') {
          setError(payload?.properties?.error?.message ?? 'Unknown error');
          setIsLoading(false); setStreamingMsgId(null);
          setBusySessions(prev => { const next = new Set(prev); next.delete(sid); return next; });
          es.close(); eventSourceRef.current = null;
        }

        if (type === 'question.asked') {
          console.log('[SSE] question.asked event received:', payload);
          const question = payload?.properties as QuestionRequest;
          if (question?.id && question.sessionID) {
            console.log('[SSE] Adding question to state:', { id: question.id, sessionID: question.sessionID, questions: question.questions });
            setQuestions(prev => {
              const sessionQuestions = prev[question.sessionID] ?? [];
              const idx = sessionQuestions.findIndex(q => q.id === question.id);
              const next = [...sessionQuestions];
              if (idx >= 0) next[idx] = question;
              else next.push(question);
              console.log('[SSE] Updated questions state:', { ...prev, [question.sessionID]: next });
              return { ...prev, [question.sessionID]: next };
            });
          } else {
            console.warn('[SSE] question.asked: missing id or sessionID:', question);
          }
        }

        if (type === 'question.replied' || type === 'question.rejected') {
          console.log('[SSE] question reply/reject event received:', type, payload);
          const props = payload?.properties as { sessionID?: string; requestID?: string };
          if (props.sessionID && props.requestID) {
            console.log('[SSE] Removing question from state:', { sessionID: props.sessionID, requestID: props.requestID });
            setQuestions(prev => {
              const sessionQuestions = prev[props.sessionID!] ?? [];
              const filtered = sessionQuestions.filter(q => q.id !== props.requestID);
              if (filtered.length === 0) {
                const next = { ...prev };
                delete next[props.sessionID!];
                return next;
              }
              return { ...prev, [props.sessionID!]: filtered };
            });
          }
        }

        if (type === 'permission.asked') {
          console.log('[SSE] permission.asked event received:', payload);
          const permission = payload?.properties as PermissionRequest;
          if (permission?.id && permission.sessionID) {
            // If autopilot is on, auto-approve without showing the card
            if (autopilotRef.current) {
              console.log('[SSE] autopilot on — auto-approving permission:', permission.id);
              const dir = getWorkingDir();
              fetch('/api/permission/reply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionID: permission.sessionID, requestID: permission.id, reply: 'always', directory: dir }),
              }).catch(e => console.error('[autopilot] permission auto-reply failed:', e));
            } else {
              setPermissions(prev => {
                const sessionPermissions = prev[permission.sessionID] ?? [];
                const idx = sessionPermissions.findIndex(p => p.id === permission.id);
                const next = [...sessionPermissions];
                if (idx >= 0) next[idx] = permission;
                else next.push(permission);
                return { ...prev, [permission.sessionID]: next };
              });
            }
          }
        }

        if (type === 'permission.replied' || type === 'permission.rejected') {
          console.log('[SSE] permission reply/reject event received:', type, payload);
          const props = payload?.properties as { sessionID?: string; requestID?: string };
          if (props.sessionID && props.requestID) {
            setPermissions(prev => {
              const sessionPermissions = prev[props.sessionID!] ?? [];
              const filtered = sessionPermissions.filter(p => p.id !== props.requestID);
              if (filtered.length === 0) {
                const next = { ...prev };
                delete next[props.sessionID!];
                return next;
              }
              return { ...prev, [props.sessionID!]: filtered };
            });
          }
        }
      } catch {}
    };

    es.onerror = () => {
      setIsLoading(false); setStreamingMsgId(null);
      setBusySessions(prev => { const next = new Set(prev); next.delete(sid); return next; });
      es.close(); eventSourceRef.current = null;
    };
  }, [loadSessions]);

  const switchSession = useCallback(async (sid: string) => {
    if (eventSourceRef.current) { eventSourceRef.current.close(); eventSourceRef.current = null; }
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
  }, [loadSessionMessages, sessionModelSelections, models, loadSessionStatus, busySessions, listenToSession, workingDir, saveLastSession]);

  const newSession = useCallback(() => {
    if (eventSourceRef.current) { eventSourceRef.current.close(); eventSourceRef.current = null; }
    setIsLoading(false); setError(null); setStreamingMsgId(null);
    setSessionId(null); setMessages([]); setPartsMap({});
  }, []);

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
    console.log('sendMessage called, text:', text, 'agent:', selectedAgent);
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
      console.log('session:', sid, 'agent:', selectedAgent);
      listenToSession(sid, tempAssistantId);
      const dir = getWorkingDir();
      console.log('sending to:', `/api/session/${encodeURIComponent(sid)}/prompt_async`);
      const r = await fetch(`/api/session/${encodeURIComponent(sid)}/prompt_async?directory=${encodeURIComponent(dir)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          model: { providerID: selectedModel.providerId, modelID: selectedModel.id },
          parts: [{ type: 'text', text: finalText }],
          agent: selectedAgent, // Send agent field to OpenCode
          autopilot: autopilot // Send autopilot toggle to OpenCode
          }),

      });
      console.log('response:', r.status);
      if (!r.ok) { const d = await r.text().catch(() => ''); throw new Error(`Prompt error: ${r.status}${d ? ` - ${d}` : ''}`); }
    } catch (err) {
      console.log('error:', err);
      setMessages(prev => prev.filter(m => m.id !== tempAssistantId && m.id !== tempUserMsgId));
      setIsLoading(false); setStreamingMsgId(null);
      if (eventSourceRef.current) { eventSourceRef.current.close(); eventSourceRef.current = null; }
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
    if (eventSourceRef.current) { eventSourceRef.current.close(); eventSourceRef.current = null; }

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
    console.log('[App] replyToQuestion called:', { requestID, answers });
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
    console.log('[App] replyToQuestion: sending to API:', { sessionID: sid, requestID, answers, directory: dir });
    
    try {
      const res = await fetch(`/api/question/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionID: sid, requestID, answers, directory: dir })
      });
      console.log('[App] replyToQuestion: response status:', res.status);
      
      // Check if response is JSON
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.warn('[App] replyToQuestion: response is not JSON (OpenCode v1.14.18 may not support this endpoint)');
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
      console.log('[App] replyToQuestion: success:', data);
    } catch (error) {
      console.warn('[App] replyToQuestion: API call failed, but question removed optimistically:', error);
      // Don't throw - question already removed
    }
  };

  const rejectQuestion = async (requestID: string) => {
    console.log('[App] rejectQuestion called:', { requestID });
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
    console.log('[App] rejectQuestion: sending to API:', { sessionID: sid, requestID, directory: dir });
    
    try {
      const res = await fetch(`/api/question/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionID: sid, requestID, directory: dir })
      });
      console.log('[App] rejectQuestion: response status:', res.status);
      
      // Check if response is JSON
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.warn('[App] rejectQuestion: response is not JSON (OpenCode v1.14.18 may not support this endpoint)');
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
      console.log('[App] rejectQuestion: success:', data);
    } catch (error) {
      console.warn('[App] rejectQuestion: API call failed, but question removed optimistically:', error);
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
      console.log('show dropdown:', commands.length, 'filter:', filter);
    } else {
      setShowCmdDropdown(false);
    }
  };

  return (
    <div style={{ height: '100dvh', display: 'flex', background: 'var(--bg)', color: 'var(--text-2)', fontFamily: "var(--font-ui, 'IBM Plex Sans', system-ui, sans-serif)", fontSize: 15 }}>

      {/* Sidebar ” overlay */}
      {sidebarOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setSidebarOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 200 }}
          />

          {/* Panel */}
          <div
            ref={sidebarRef}
            style={{
              position: 'fixed', top: 0, left: 0, bottom: 0,
              width: typeof window !== 'undefined' && window.innerWidth < 768 
                ? Math.min(window.innerWidth * 0.85, 320) 
                : sidebarWidth,
              display: 'flex', flexDirection: 'column',
              borderRight: '1px solid var(--border)',
              background: 'var(--bg-2)',
              zIndex: 201,
              boxShadow: `8px 0 32px var(--shadow)`,
            }}
          >
            {/* Resize handle ” hide on mobile */}
            {typeof window !== 'undefined' && window.innerWidth >= 768 && (
              <div
                onPointerDown={e => {
                  e.preventDefault();
                  sidebarResizing.current = true;
                  sidebarStartX.current = e.clientX;
                  sidebarStartW.current = sidebarWidth;
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                }}
                onPointerMove={e => {
                  if (!sidebarResizing.current) return;
                  const next = Math.min(600, Math.max(280, sidebarStartW.current + (e.clientX - sidebarStartX.current)));
                  setSidebarWidth(next);
                  if (sidebarRef.current) sidebarRef.current.style.width = next + 'px';
                }}
                onPointerUp={e => { sidebarResizing.current = false; (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); }}
                onPointerCancel={_e => { sidebarResizing.current = false; }}
                style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 4, cursor: 'col-resize', zIndex: 10, background: 'transparent', transition: 'background 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#edb44944')}
                onMouseLeave={e => { if (!sidebarResizing.current) e.currentTarget.style.background = 'transparent'; }}
              />
            )}

            {/* Header */}
            <div style={{ padding: '10px 10px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <svg width="15" height="15" viewBox="0 0 100 100" fill="none">
                  <path d="M50 50 L8.432 26 L8.432 74 L50 98 Z" fill="rgba(255,255,255,0.08)" stroke="#CECDC3" strokeWidth="2.5" strokeLinejoin="round"/>
                  <path d="M50 50 L91.568 26 L91.568 74 L50 98 Z" fill="rgba(255,255,255,0.08)" stroke="#CECDC3" strokeWidth="2.5" strokeLinejoin="round"/>
                  <path d="M50 2 L8.432 26 L50 50 L91.568 26 Z" fill="none" stroke="#CECDC3" strokeWidth="2.5" strokeLinejoin="round"/>
                </svg>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', letterSpacing: '0.03em' }}>Sessions</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button onClick={newSession} style={{ background: 'var(--accent)', border: 'none', borderRadius: 8, color: 'var(--bg)', padding: '6px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>+ New</button>
                <button onClick={() => setSidebarOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-4)', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1 }}>✕</button>
              </div>
            </div>

            <button onClick={() => { setDirPickerOpen(true); setSidebarOpen(false); }} style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '8px 12px', background: 'transparent', border: 'none',
              borderBottom: '1px solid var(--bg-3)', cursor: 'pointer', textAlign: 'left',
            }}>
              <span style={{ fontSize: 14 }}>📁</span>
              <span style={{ fontSize: 12, color: 'var(--accent)', fontFamily: 'monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {workingDir.replace(/\\\\/g, '/').split('/').pop() || 'Select directory'}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-4)', flexShrink: 0 }}>change</span>
            </button>

            {/* Search */}
            <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--bg-3)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', gap: 5 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--text-5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input
                  value={sessionSearch}
                  onChange={e => setSessionSearch(e.target.value)}
                  placeholder="Search sessions"
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit' }}
                />
                {sessionSearch && <button onClick={() => setSessionSearch('')} style={{ background: 'transparent', border: 'none', color: 'var(--text-5)', cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1 }}>✕</button>}
              </div>
            </div>

            {/* Session list */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {/* Recent dirs ” all top 5, current dir highlighted */}
              {recentDirs.length > 0 && !sessionSearch && (
                <div style={{ borderBottom: '1px solid var(--bg-3)', paddingBottom: 4 }}>
                  <div style={{ padding: '8px 12px 4px', fontSize: 10, color: 'var(--text-5)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Recent Projects</div>
                  {recentDirs.map(dir => {
                    const parts = dir.replace(/\\/g, '/').split('/').filter(Boolean);
                    const folderName = parts[parts.length - 1] || dir;
                    const parentPath = parts.slice(-3, -1).join('/');
                    const count = dirSessionsMap[dir]?.length ?? 0;
                    const isCurrent = dir === workingDir;
                    return (
                      <button key={dir} onClick={() => { if (!isCurrent) { switchDirectory(dir); setSidebarOpen(false); } }}
                        title={dir}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 12px', background: isCurrent ? 'var(--bg-4)' : 'transparent', border: 'none', cursor: isCurrent ? 'default' : 'pointer', textAlign: 'left', gap: 6, borderLeft: isCurrent ? '3px solid var(--accent)' : '3px solid transparent' }}
                        onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.background = 'var(--bg-3)'; }}
                        onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                          <span style={{ fontSize: 13, color: isCurrent ? 'var(--text)' : 'var(--text-2)', fontWeight: isCurrent ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {folderName}
                          </span>
                          {parentPath && <span style={{ fontSize: 11, color: 'var(--text-5)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{parentPath}</span>}
                        </span>
                        {count > 0 && (
                          <span style={{ fontSize: 11, color: isCurrent ? 'var(--accent)' : 'var(--text-4)', background: 'var(--bg-4)', borderRadius: 10, padding: '2px 7px', flexShrink: 0, fontWeight: 600 }}>
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              {/* Current dir sessions */}
              {(() => {
                // Filter sessions based on search
                const filtered = sessionSearch.trim()
                  ? sessions.filter(s => (s.title || '').toLowerCase().includes(sessionSearch.toLowerCase()) || s.id.startsWith(sessionSearch))
                  : sessions;
                
                // Separate parent sessions and sub-sessions
                const parentSessions = filtered.filter(s => !s.parentID);
                const subSessionsMap = new Map<string, SessionInfo[]>();
                
                filtered.forEach(s => {
                  if (s.parentID) {
                    const existing = subSessionsMap.get(s.parentID) || [];
                    existing.push(s);
                    subSessionsMap.set(s.parentID, existing);
                  }
                });
                
                if (parentSessions.length === 0 && subSessionsMap.size === 0)
                  return <div style={{ padding: '14px 12px', color: 'var(--text-5)', fontSize: 13 }}>{sessionSearch ? 'No matches' : 'No sessions yet'}</div>;
                
                return parentSessions.map(s => (
                  <div key={s.id}>
                    <SessionItem
                      session={s}
                      active={s.id === sessionId}
                      busy={busySessions.has(s.id)}
                      onClick={() => { switchSession(s.id); setSidebarOpen(false); }}
                      onRename={renameSession}
                      onDelete={deleteSession}
                    />
                    {/* Render sub-sessions (indented) */}
                    {subSessionsMap.get(s.id)?.map(sub => (
                      <div key={sub.id} style={{ paddingLeft: 20 }}>
                        <SessionItem
                          session={sub}
                          active={sub.id === sessionId}
                          busy={busySessions.has(sub.id)}
                          onClick={() => { switchSession(sub.id); setSidebarOpen(false); }}
                          onRename={renameSession}
                          onDelete={deleteSession}
                          isSubSession={true}
                        />
                      </div>
                    ))}
                  </div>
                ));
              })()}
            </div>
          </div>
        </>
      )}

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
          <Terminal workingDir={workingDir} />
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
                return <ChatMessage key={msg.id} msg={msg} parts={partsMap[msg.id]} isStreaming={msg.id === streamingMsgId} onFork={forkSession} />;
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

                {/* Model chip */}
                <div style={{ position: 'relative' }} onMouseDown={e => e.stopPropagation()}>
                  <button
                    onClick={() => setModelOpen(o => !o)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      background: modelOpen ? 'var(--bg-5)' : 'transparent',
                      border: 'none', cursor: 'pointer',
                      padding: '3px 6px', borderRadius: 6,
                      color: selectedModel?.isFree ? 'var(--accent)' : 'var(--text-2)',
                      fontSize: 12, fontFamily: 'inherit',
                      minWidth: 0, // Allow button to shrink
                      maxWidth: isMobile ? 140 : 180, // Limit width on mobile
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7, flexShrink: 0 }}>
                      <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
                    </svg>
                    <span style={{ 
                      overflow: 'hidden', 
                      textOverflow: 'ellipsis', 
                      whiteSpace: 'nowrap',
                      minWidth: 0, // Allow text to shrink
                      flex: 1,
                    }}>
                      {selectedModel?.name ?? 'Select model'}
                    </span>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, flexShrink: 0 }}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>

                  {modelOpen && (
                    <div
                      onMouseDown={e => e.stopPropagation()}
                      style={isMobile ? {
                        position: 'fixed',
                        bottom: 70,
                        left: 12,
                        right: 12,
                        background: 'var(--bg-4)',
                        border: '1px solid var(--border-2)',
                        borderRadius: 10,
                        maxHeight: '60vh',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 -4px 32px rgba(0,0,0,0.7)',
                        zIndex: 9999,
                      } : {
                        position: 'absolute',
                        bottom: '100%',
                        right: 0,
                        marginBottom: 6,
                        background: 'var(--bg-4)',
                        border: '1px solid var(--border-2)',
                        borderRadius: 10,
                        width: 320,
                        maxWidth: 400,
                        maxHeight: 420,
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 -4px 32px rgba(0,0,0,0.7)',
                        zIndex: 9999,
                      }}
                    >
                      {/* Search input */}
                      <div style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
                        <div style={{ position: 'relative' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>
                            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                          </svg>
                          <input
                            type="text"
                            value={modelSearch}
                            onChange={e => setModelSearch(e.target.value)}
                            placeholder="Search models..."
                            autoFocus
                            style={{
                              width: '100%',
                              padding: '8px 10px 8px 34px',
                              background: 'var(--bg-5)',
                              border: '1px solid var(--border)',
                              borderRadius: 6,
                              color: 'var(--text)',
                              fontSize: 13,
                              fontFamily: 'inherit',
                              outline: 'none',
                            }}
                            onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                            onBlur={e => e.target.style.borderColor = 'var(--border)'}
                          />
                          {modelSearch && (
                            <button
                              onClick={() => setModelSearch('')}
                              style={{
                                position: 'absolute',
                                right: 8,
                                top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                padding: 4,
                                display: 'flex',
                                alignItems: 'center',
                                color: 'var(--text-3)',
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Models list */}
                      <div style={{ overflowY: 'auto', flex: 1 }}>
                        {(() => {
                          const searchLower = modelSearch.toLowerCase().trim();
                          const filteredModels = models.filter(m => 
                            !searchLower || 
                            m.name.toLowerCase().includes(searchLower) || 
                            m.id.toLowerCase().includes(searchLower)
                          );

                          if (filteredModels.length === 0) {
                            return (
                              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                                No models match your search
                              </div>
                            );
                          }

                          return filteredModels.map(m => (
                            <button
                              key={m.id}
                              onClick={() => { 
                                setSelectedModel(m); 
                                setModelOpen(false);
                                setModelSearch('');
                                // Save model selection for current session
                                if (sessionId) {
                                  setSessionModelSelections(prev => ({ ...prev, [sessionId]: m.id }));
                                }
                              }}
                              style={{
                                width: '100%', textAlign: 'left', padding: '10px 12px',
                                background: m.id === selectedModel?.id ? 'var(--bg-3)' : 'transparent',
                                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                                borderLeft: m.id === selectedModel?.id ? '2px solid var(--accent)' : '2px solid transparent',
                                minWidth: 0, // Allow flex item to shrink
                              }}
                              onMouseEnter={e => { if (m.id !== selectedModel?.id) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-5)'; }}
                              onMouseLeave={e => { if (m.id !== selectedModel?.id) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                            >
                              <span style={{ 
                                fontSize: 14, 
                                color: 'var(--text)', 
                                overflow: 'hidden', 
                                textOverflow: 'ellipsis', 
                                whiteSpace: 'nowrap', 
                                flex: 1,
                                minWidth: 0, // Allow text to shrink
                              }}>
                                {m.name}
                              </span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                {m.isFree && (
                                  <span style={{ fontSize: 10, color: 'var(--accent)', background: 'var(--accent-dim)', border: '1px solid rgba(237,180,73,0.3)', padding: '1px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>Free</span>
                                )}
                                {m.isDefault && (
                                  <span style={{ fontSize: 10, color: 'var(--text-3)', background: 'var(--border)', border: '1px solid var(--border-2)', padding: '1px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>Default</span>
                                )}
                              </div>
                            </button>
                          ));
                        })()}
                      </div>
                    </div>
                  )}
                </div>

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

