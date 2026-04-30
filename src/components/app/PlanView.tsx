import React, { useState, useEffect, useCallback } from 'react';
import { Markdown } from '../chat/Markdown';
import { fallbackCopy } from '../../utils/helpers';

type PlanViewProps = {
  planPath: string;
  workingDir: string;
};

export function PlanView({ planPath, workingDir }: PlanViewProps) {
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
        <span style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayPath || 'PLAN.MD'}</span>
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
