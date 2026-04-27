import React, { useState, useEffect } from 'react';

export function GitDiffViewer({ file, workingDir }: { file: string; workingDir: string }) {
  const [diff, setDiff] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true); setError(false); setDiff(null);
    fetch(`/api/git/diff?dir=${encodeURIComponent(workingDir)}&file=${encodeURIComponent(file)}`)
      .then(r => r.ok ? r.text() : Promise.reject())
      .then(text => { setDiff(text); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [file, workingDir]);

  if (loading) return <div style={{ padding: '8px 12px', color: 'var(--text-4)', fontSize: 12 }}>Loading diff…</div>;
  if (error) return <div style={{ padding: '8px 12px', color: 'var(--red)', fontSize: 12 }}>Failed to load diff</div>;
  if (!diff?.trim()) {
    return (
      <div style={{ padding: '8px 12px', color: 'var(--text-4)', fontSize: 12 }}>
        No diff — file is untracked or has no staged changes. Stage the file to see changes.
      </div>
    );
  }

  // Parse unified diff into lines
  const lines = diff.split('\n');
  return (
    <div style={{ borderTop: '1px solid var(--bg-4)', overflowX: 'hidden', maxHeight: 280, overflowY: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontFamily: 'var(--font-mono, monospace)', fontSize: 11 }}>
        <tbody>
          {lines.map((line, i) => {
            const isAdd = line.startsWith('+') && !line.startsWith('+++');
            const isDel = line.startsWith('-') && !line.startsWith('---');
            const isHunk = line.startsWith('@@');
            const isMeta = line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++');
            if (isMeta) return null;
            return (
              <tr key={i} style={{
                background: isAdd ? 'rgba(152,195,121,0.12)' : isDel ? 'rgba(224,108,117,0.12)' : isHunk ? 'rgba(97,175,239,0.08)' : 'transparent',
              }}>
                <td style={{
                  width: 14, paddingLeft: 8, paddingRight: 4,
                  color: isAdd ? 'var(--green)' : isDel ? 'var(--red)' : isHunk ? 'var(--blue)' : 'var(--border-2)',
                  userSelect: 'none', verticalAlign: 'top', lineHeight: '18px', flexShrink: 0,
                }}>
                  {isAdd ? '+' : isDel ? '−' : isHunk ? '⋯' : ' '}
                </td>
                <td style={{
                  padding: '0 8px 0 0', lineHeight: '18px',
                  color: isAdd ? 'var(--green)' : isDel ? 'var(--red)' : isHunk ? 'var(--blue)' : 'var(--text-3)',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                }}>
                  {isHunk ? line.match(/@@[^@]*@@/)?.[0] ?? line : line.slice(1)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}