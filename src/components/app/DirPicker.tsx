import { useState, useEffect, useCallback } from 'react';

interface DirPickerProps {
  current: string;
  rootDir: string;
  onSwitch: (d: string) => void;
  onClose: () => void;
}

export function DirPicker({ current, rootDir, onSwitch, onClose }: DirPickerProps) {
  const [browsePath, setBrowsePath] = useState(current);
  const [entries, setEntries] = useState<Array<{ name: string; path: string; isDirectory: boolean }>>([]);
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const normRoot = rootDir.replace(/\\/g, '/').toLowerCase();
  const isAtRoot = browsePath.replace(/\\/g, '/').toLowerCase() === normRoot;

  const toRelative = (absPath: string) => {
    const norm = absPath.replace(/\\/g, '/');
    const rootNorm = rootDir.replace(/\\/g, '/');
    if (norm === rootNorm) return 'WORKSPACE';
    return norm.startsWith(rootNorm) ? norm.slice(rootNorm.length).replace(/^\//, '') : norm;
  };

  const loadDir = useCallback(async (dir: string) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/fs/list?path=${encodeURIComponent(dir)}`);
      const data = await r.json();
      setEntries((data.entries as any[]).filter(e => e.isDirectory).sort((a: any, b: any) => a.name.localeCompare(b.name)));
      setBrowsePath(dir);
    } catch { setEntries([]); }
    setLoading(false);
  }, []);

  useEffect(() => { 
    loadDir(current);
  }, [current, loadDir]);

  const goUp = () => {
    if (isAtRoot) return;
    const norm = browsePath.replace(/\\/g, '/');
    const parent = norm.split('/').slice(0, -1).join('/');
    if (!parent || !parent.toLowerCase().startsWith(normRoot)) return;
    loadDir(parent);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: 'var(--bg-3)',
        border: '1px solid var(--border-2)',
        borderRadius: isMobile ? 0 : 12,
        width: isMobile ? '100%' : 480,
        maxHeight: isMobile ? '100%' : '70vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: isMobile ? 'none' : '0 16px 48px rgba(0,0,0,0.7)'
      }}>
        <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Switch Directory</span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-4)', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--bg-4)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border-2)', borderRadius: 6, color: 'var(--text)', fontSize: 13, padding: '8px 10px', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {toRelative(browsePath)}
            </div>
            <button onClick={() => onSwitch(browsePath)} style={{ background: 'var(--accent)', border: 'none', borderRadius: 6, color: 'var(--bg)', fontSize: 14, padding: '8px 18px', cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit', flexShrink: 0 }}>Open</button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-5)', marginTop: 4 }}>Root: WORKSPACE</div>
        </div>

        <div style={{ padding: '6px 8px 4px', borderBottom: '1px solid var(--bg-4)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={goUp} title="Go up" disabled={isAtRoot}
            style={{ background: 'transparent', border: 'none', color: isAtRoot ? 'var(--bg-5)' : 'var(--text-3)', cursor: isAtRoot ? 'not-allowed' : 'pointer', fontSize: isMobile ? 18 : 14, padding: isMobile ? '4px 10px' : '2px 6px' }}>⤴️</button>
          <span style={{ fontSize: isMobile ? 13 : 11, color: 'var(--text-3)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{toRelative(browsePath)}</span>
          {loading && <span style={{ fontSize: 11, color: 'var(--text-5)' }}>…</span>}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {entries.map(e => {
            return (
              <div key={e.path}
                onClick={() => { loadDir(e.path); }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: isMobile ? '12px 16px' : '8px 16px', cursor: 'pointer' }}
                onMouseEnter={el => (el.currentTarget.style.background = 'var(--bg-4)')}
                onMouseLeave={el => (el.currentTarget.style.background = 'transparent')}
              >
                <span style={{ fontSize: isMobile ? 20 : 16 }}>📁</span>
                <span style={{ fontSize: isMobile ? 15 : 13, color: 'var(--text-2)', fontWeight: 500 }}>{e.name}</span>
              </div>
            );
          })}
          {!loading && entries.length === 0 && <div style={{ padding: '12px 16px', color: 'var(--text-5)', fontSize: 12 }}>No subdirectories</div>}
        </div>
      </div>
    </div>
  );
}