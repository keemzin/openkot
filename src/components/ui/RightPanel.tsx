import React, { useState, useRef } from 'react';

export const RIGHT_PANEL_MIN = 320;
export const RIGHT_PANEL_MAX = 900;
export const RIGHT_PANEL_DEFAULT = 480;
export const LS_PANEL_WIDTH = 'oc_panel_width';

function getRightPanelDefault() {
  if (typeof window === 'undefined' || window.innerWidth < 768) return window.innerWidth;
  const saved = localStorage.getItem(LS_PANEL_WIDTH);
  if (saved) { const n = parseInt(saved, 10); if (n >= RIGHT_PANEL_MIN && n <= RIGHT_PANEL_MAX) return n; }
  return RIGHT_PANEL_DEFAULT;
}

export { getRightPanelDefault };

export function RightPanel({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const [width, setWidth] = useState(getRightPanelDefault);
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(width);
  const panelRef = useRef<HTMLDivElement>(null);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    isResizing.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isResizing.current) return;
    const delta = startX.current - e.clientX;
    const next = Math.min(RIGHT_PANEL_MAX, Math.max(RIGHT_PANEL_MIN, startWidth.current + delta));
    setWidth(next);
    if (panelRef.current) panelRef.current.style.width = next + 'px';
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!isResizing.current) return;
    isResizing.current = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    if (!isMobile) localStorage.setItem(LS_PANEL_WIDTH, String(panelRef.current ? parseInt(panelRef.current.style.width) || width : width));
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.35)',
          zIndex: 200,
        }}
      />
      <div
        ref={panelRef}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width,
          display: 'flex', flexDirection: 'column',
          borderLeft: '1px solid var(--border)',
          background: 'var(--bg)',
          zIndex: 201,
          boxShadow: '-8px 0 32px var(--shadow)',
        }}
      >
        {!isMobile && (
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{
              position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
              cursor: 'col-resize', zIndex: 10,
              background: 'transparent',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#edb44944')}
            onMouseLeave={e => { if (!isResizing.current) e.currentTarget.style.background = 'transparent'; }}
          />
        )}
        <div style={{ padding: '10px 12px 8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Explorer</span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-4)', cursor: 'pointer', fontSize: 15, padding: '0 2px', lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {children}
        </div>
      </div>
    </>
  );
}