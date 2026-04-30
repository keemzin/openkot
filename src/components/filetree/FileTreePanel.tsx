import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FileViewer } from './FileViewer';
import { FileTreeNode } from './FileTreeNode';
import { ContextMenu } from './ContextMenu';
import { InlineInput } from './InlineInput';
import { GitPanel } from '../git/GitPanel';
import { onOpenFile } from '../../utils/fileOpenListener';
import type { FsEntry, CtxMenu, InlineEdit, GitStatus, GitFileStatus } from '../../types';
import { gitStatusColor, gitStatusLabel } from '../../utils/gitUtils';
import { fileColor, getFileExt } from '../../utils/fileUtils';

type FileTreePanelProps = {
  workingDir: string;
};

export function FileTreePanel({ workingDir }: FileTreePanelProps) {
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
