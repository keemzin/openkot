import React, { useRef } from 'react';
import type { SessionInfo } from '../types';
import { SessionItem } from './app/SessionItem';

interface SidebarProps {
  // State
  isOpen: boolean;
  sessions: SessionInfo[];
  recentDirs: string[];
  dirSessionsMap: Record<string, SessionInfo[]>;
  sessionId: string | null;
  workingDir: string;
  busySessions: Set<string>;
  sidebarWidth: number;
  sessionSearch: string;
  
  // Setters
  setSidebarOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setSidebarWidth: (width: number | ((prev: number) => number)) => void;
  setSessionSearch: (search: string | ((prev: string) => string)) => void;
  setDirPickerOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  
  // Callbacks
  newSession: () => void;
  switchSession: (id: string) => void;
  switchDirectory: (dir: string) => void;
  renameSession: (id: string, title: string) => void;
  deleteSession: (id: string) => void;
}

export function Sidebar({
  isOpen,
  sessions,
  recentDirs,
  dirSessionsMap,
  sessionId,
  workingDir,
  busySessions,
  sidebarWidth,
  sessionSearch,
  setSidebarOpen,
  setSidebarWidth,
  setSessionSearch,
  setDirPickerOpen,
  newSession,
  switchSession,
  switchDirectory,
  renameSession,
  deleteSession,
}: SidebarProps) {
  const sidebarRef = useRef<HTMLDivElement>(null);
  const sidebarResizing = useRef(false);
  const sidebarStartX = useRef(0);
  const sidebarStartW = useRef(sidebarWidth);

  if (!isOpen) return null;

  return (
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
        {/* Resize handle - hide on mobile */}
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
            {workingDir.replace(/\\/g, '/').split('/').pop() || 'Select directory'}
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
          {/* Recent dirs - all top 5, current dir highlighted */}
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
  );
}
