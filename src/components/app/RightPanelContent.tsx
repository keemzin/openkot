import React, { useState } from 'react';
import { FileTreePanel } from '../filetree/FileTreePanel';
import { GitPanel } from '../git/GitPanel';

type RightPanelContentProps = {
  workingDir: string;
};

export function RightPanelContent({ workingDir }: RightPanelContentProps) {
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
