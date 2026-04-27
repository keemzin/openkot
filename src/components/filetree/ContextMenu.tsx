import React, { useRef, useEffect } from 'react';
import type { FsEntry, CtxMenu } from '../../types';

export function ContextMenu({ menu, onClose, onAction }: {
  menu: CtxMenu;
  onClose: () => void;
  onAction: (action: string, entry: FsEntry) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  const items = menu.entry.isDirectory
    ? [{ id: 'newFile', label: '+ New File' }, { id: 'newFolder', label: '+ New Folder' }, null, { id: 'rename', label: 'Rename' }, { id: 'copyPath', label: 'Copy Path' }, null, { id: 'delete', label: 'Delete', danger: true }]
    : [{ id: 'rename', label: 'Rename' }, { id: 'copyPath', label: 'Copy Path' }, null, { id: 'delete', label: 'Delete', danger: true }];

  return (
    <div ref={ref} style={{ position: 'fixed', top: menu.y, left: menu.x, zIndex: 9999, background: 'var(--bg-4)', border: '1px solid var(--border-2)', borderRadius: 8, minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.6)', padding: '4px 0' }}>
      {items.map((item, i) => item === null
        ? <div key={i} style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />
        : <button key={item.id} onClick={() => { onAction(item.id, menu.entry); onClose(); }}
            style={{ width: '100%', textAlign: 'left', padding: '6px 14px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, color: (item as any).danger ? 'var(--red)' : 'var(--text-2)' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#2e2c2c')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >{item.label}</button>
      )}
    </div>
  );
}