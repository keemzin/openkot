import React, { useState, useRef, useEffect } from 'react';

export type SessionInfo = {
  id: string;
  title?: string;
  time?: { created?: number; updated?: number };
  parentID?: string | null;
};

type SessionItemProps = {
  session: SessionInfo;
  active: boolean;
  busy: boolean;
  onClick: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  isSubSession?: boolean;
  pinned?: boolean;
  onPin?: (id: string) => void;
};

export function SessionItem({ session, active, busy, onClick, onRename, onDelete, isSubSession, pinned, onPin }: SessionItemProps) {
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
              {pinned && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="var(--accent)" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.8 }}>
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              )}
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
        </div>

        {timeStr && !renaming && <span style={{ fontSize: 12, color: 'var(--text-5)' }}>{timeStr}</span>}
      </div>

      {/* ⋯ menu button */}
      {!renaming && (
        <button
          onClick={e => { e.stopPropagation(); setMenuPos({ x: e.clientX, y: e.clientY }); }}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-5)', cursor: 'pointer', padding: '0 2px', fontSize: 14, lineHeight: 1, opacity: 0, transition: 'opacity 0.1s' }}
          className="session-menu-btn"
        >…</button>
      )}

      {/* Context menu */}
      {menuPos && (
        <div ref={menuRef} style={{ position: 'fixed', top: menuPos.y, left: menuPos.x, zIndex: 9999, background: 'var(--bg-4)', border: '1px solid var(--border-2)', borderRadius: 8, minWidth: 140, boxShadow: '0 8px 24px rgba(0,0,0,0.6)', padding: '4px 0' }}>
          {onPin && (
            <button onClick={e => { e.stopPropagation(); setMenuPos(null); onPin(session.id); }} style={{ width: '100%', textAlign: 'left', padding: '6px 14px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, color: 'var(--text-2)' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#2e2c2c')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              {pinned ? '📌 Unpin' : '📌 Pin'}
            </button>
          )}
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
