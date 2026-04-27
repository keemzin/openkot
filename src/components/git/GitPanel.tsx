import React, { useState, useEffect, useCallback } from 'react';
import type { GitStatus, GitFileStatus } from '../../types';
import { gitStatusColor, gitStatusLabel } from '../../utils/gitUtils';
import { GitDiffViewer } from './GitDiffViewer';

export function GitPanel({ workingDir }: { workingDir: string }) {
  const [status, setStatus] = useState<GitStatus>({ isRepo: false, files: {} });
  const [branch, setBranch] = useState<string | null>(null);
  const [staged, setStaged] = useState<Set<string>>(new Set());
  const [commitMsg, setCommitMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [opMsg, setOpMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [gitUser, setGitUser] = useState<{ name: string | null; email: string | null }>({ name: null, email: null });
  const [showIdentity, setShowIdentity] = useState(false);
  const [identityName, setIdentityName] = useState('');
  const [identityEmail, setIdentityEmail] = useState('');
  const [expandedDiff, setExpandedDiff] = useState<string | null>(null);
  const [diffStats, setDiffStats] = useState<Record<string, { additions: number; deletions: number }>>({});

  const showMsg = (text: string, ok = true) => { setOpMsg({ text, ok }); setTimeout(() => setOpMsg(null), 5000); };

  const fetchDiffStats = async (file: string) => {
    if (diffStats[file]) return;
    try {
      const r = await fetch(`/api/git/diffstat?dir=${encodeURIComponent(workingDir)}&file=${encodeURIComponent(file)}`);
      const stats = await r.json();
      setDiffStats(prev => ({ ...prev, [file]: stats }));
    } catch { /* ignore */ }
  };

  const refresh = useCallback(async (keepStaged?: Set<string>) => {
    if (!workingDir) return;
    const [s, b, cfg] = await Promise.all([
      fetch(`/api/git/status?dir=${encodeURIComponent(workingDir)}`).then(r => r.json()).catch(() => ({ isRepo: false, files: {} })),
      fetch(`/api/git/branch?dir=${encodeURIComponent(workingDir)}`).then(r => r.json()).catch(() => ({ branch: null })),
      fetch(`/api/git/config?dir=${encodeURIComponent(workingDir)}`).then(r => r.json()).catch(() => ({ name: null, email: null })),
    ]);
    setStatus(s);
    setBranch(b.branch);
    setGitUser(cfg);
    if (!cfg.name || !cfg.email) { setIdentityName(cfg.name ?? ''); setIdentityEmail(cfg.email ?? ''); }
    // Sync staged set from git index, but respect explicit user choices (keepStaged)
    if (s.files) {
      setStaged(prev => {
        // If keepStaged is provided, use it as the authoritative set (post-toggle)
        if (keepStaged !== undefined) return keepStaged;
        const next = new Set(prev);
        for (const [file, fs] of Object.entries(s.files as Record<string, GitFileStatus>)) {
          if (fs.index !== ' ' && fs.index !== '?' && fs.index !== '') {
            next.add(file);
          }
        }
        return next;
      });
      // Clear diff stats when status changes
      setDiffStats({});
    }
  }, [workingDir]);

  useEffect(() => { refresh(); }, [refresh]);

  // Fetch diff stats for all changed files when status loads
  useEffect(() => {
    if (!workingDir || !status.files) return;
    const files = Object.keys(status.files);
    files.forEach(file => {
      if (!diffStats[file]) fetchDiffStats(file);
    });
  }, [status.files, workingDir]);

  const changedFiles = Object.entries(status.files);

  const toggleStage = async (file: string, isStaged: boolean) => {
    const endpoint = isStaged ? '/api/git/unstage' : '/api/git/stage';
    await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dir: workingDir, file }) });
    // Compute the new staged set and pass it to refresh so it won't be overwritten
    const newStaged = new Set(staged);
    isStaged ? newStaged.delete(file) : newStaged.add(file);
    setStaged(newStaged);
    refresh(newStaged);
  };

  const stageAll = async () => {
    await fetch('/api/git/stage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dir: workingDir, file: '.' }) });
    const allStaged = new Set(changedFiles.map(([f]) => f));
    setStaged(allStaged);
    refresh(allStaged);
  };

  const revertFile = async (file: string) => {
    if (!confirm(`Discard changes to ${file}?`)) return;
    await fetch('/api/git/revert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dir: workingDir, file }) });
    refresh();
  };

  const saveIdentity = async () => {
    const r = await fetch('/api/git/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dir: workingDir, name: identityName, email: identityEmail, global: true }) });
    const d = await r.json();
    if (d.success) { showMsg('Identity saved'); setShowIdentity(false); refresh(); }
    else showMsg(d.error || 'Failed to save identity', false);
  };

  const commit = async () => {
    if (!commitMsg.trim()) return;
    if (staged.size === 0) { showMsg('No files selected to commit', false); return; }
    setLoading(true);
    try {
      // Stage all checked files first — ensures git index matches UI selection
      // First unstage everything, then stage only what's checked
      await fetch('/api/git/stage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dir: workingDir, file: '.' }) });
      // Unstage files that are NOT checked
      const allFiles = Object.keys(status.files);
      const toUnstage = allFiles.filter(f => !staged.has(f));
      await Promise.all(toUnstage.map(f =>
        fetch('/api/git/unstage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dir: workingDir, file: f }) })
      ));
      const body: any = { dir: workingDir, message: commitMsg };
      if (!gitUser.name) body.authorName = identityName;
      if (!gitUser.email) body.authorEmail = identityEmail;
      const r = await fetch('/api/git/commit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json();
      if (d.success) { setCommitMsg(''); setStaged(new Set()); showMsg('Committed ✓'); refresh(); }
      else showMsg(d.error || 'Commit failed', false);
    } catch (e: any) { showMsg(e.message || 'Commit failed', false); }
    setLoading(false);
  };

  const push = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/git/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dir: workingDir }) });
      const d = await r.json();
      if (d.success) showMsg('Pushed ✓'); else showMsg(d.error || 'Push failed', false);
    } catch (e: any) { showMsg(e.message || 'Push failed', false); }
    setLoading(false);
  };

  const pull = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/git/pull', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dir: workingDir }) });
      const d = await r.json();
      if (d.success) { showMsg('Pulled ✓'); refresh(); } else showMsg(d.error || 'Pull failed', false);
    } catch (e: any) { showMsg(e.message || 'Pull failed', false); }
    setLoading(false);
  };

  if (!status.isRepo) return (
    <div style={{ padding: 16, color: 'var(--text-4)', fontSize: 13 }}>
      <div style={{ marginBottom: 8 }}>Not a git repository.</div>
      <button onClick={async () => { await fetch('/api/git/init', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dir: workingDir }) }); refresh(); }}
        style={{ background: 'var(--bg-4)', border: '1px solid var(--border-2)', borderRadius: 6, color: 'var(--accent)', cursor: 'pointer', padding: '5px 12px', fontSize: 12, fontFamily: 'inherit' }}>
        git init
      </button>
    </div>
  );

  const needsIdentity = !gitUser.name || !gitUser.email;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Branch + actions */}
      <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#edb449" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>
          </svg>
          <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600, flex: 1 }}>{branch ?? '—'}</span>
          <button onClick={() => setShowIdentity(o => !o)} title="Git identity" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: needsIdentity ? 'var(--red)' : 'var(--text-4)', padding: 2 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </button>
          <button onClick={() => refresh()} title="Refresh" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-4)', padding: 2 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          </button>
        </div>

        {/* Identity form */}
        {showIdentity && (
          <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: needsIdentity ? 'var(--red)' : 'var(--text-4)', marginBottom: 6 }}>
              {needsIdentity ? '⚠ Git identity not set — required to commit' : `${gitUser.name} <${gitUser.email}>`}
            </div>
            <input value={identityName} onChange={e => setIdentityName(e.target.value)} placeholder="Your name"
              style={{ width: '100%', background: 'var(--bg-4)', border: '1px solid var(--border-2)', borderRadius: 4, color: 'var(--text)', fontSize: 12, padding: '4px 8px', fontFamily: 'inherit', outline: 'none', marginBottom: 4, boxSizing: 'border-box' }} />
            <input value={identityEmail} onChange={e => setIdentityEmail(e.target.value)} placeholder="your@email.com"
              style={{ width: '100%', background: 'var(--bg-4)', border: '1px solid var(--border-2)', borderRadius: 4, color: 'var(--text)', fontSize: 12, padding: '4px 8px', fontFamily: 'inherit', outline: 'none', marginBottom: 6, boxSizing: 'border-box' }} />
            <button onClick={saveIdentity} style={{ background: 'var(--accent)', border: 'none', borderRadius: 4, color: 'var(--bg)', cursor: 'pointer', padding: '4px 10px', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>Save globally</button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={pull} disabled={loading} style={{ flex: 1, background: 'var(--bg-4)', border: '1px solid var(--border-2)', borderRadius: 6, color: 'var(--text-2)', cursor: 'pointer', padding: '5px 0', fontSize: 12, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
            Pull
          </button>
          <button onClick={push} disabled={loading} style={{ flex: 1, background: 'var(--bg-4)', border: '1px solid var(--border-2)', borderRadius: 6, color: 'var(--text-2)', cursor: 'pointer', padding: '5px 0', fontSize: 12, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
            Push
          </button>
        </div>
      </div>

      {/* Status/error message */}
      {opMsg && (
        <div style={{ padding: '6px 12px', background: opMsg.ok ? 'rgba(152,195,121,0.1)' : 'rgba(224,108,117,0.1)', color: opMsg.ok ? 'var(--green)' : 'var(--red)', fontSize: 12, flexShrink: 0, wordBreak: 'break-word' }}>
          {opMsg.text}
        </div>
      )}

      {/* Changed files */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {changedFiles.length === 0 ? (
          <div style={{ padding: '16px 12px', color: 'var(--text-4)', fontSize: 13 }}>No changes</div>
        ) : (
          <>
            {/* Header with count and actions */}
            <div style={{ padding: '12px 12px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>Changes</span>
                {staged.size > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-2)', borderRadius: 6, padding: '2px 8px' }}>
                    <button onClick={stageAll} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-4)', padding: 0, display: 'flex', alignItems: 'center' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    </button>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{staged.size}/{changedFiles.length}</span>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {staged.size === 0 && (
                  <button onClick={stageAll} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 11, fontFamily: 'inherit', padding: '2px 6px', fontWeight: 500 }}>
                    Stage all
                  </button>
                )}
                <button 
                  onClick={async () => {
                    if (!confirm(`Discard all changes to ${changedFiles.length} file${changedFiles.length === 1 ? '' : 's'}?`)) return;
                    await Promise.all(changedFiles.map(([file]) => 
                      fetch('/api/git/revert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dir: workingDir, file }) })
                    ));
                    refresh();
                  }}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 11, fontFamily: 'inherit', padding: '2px 6px', fontWeight: 500 }}
                >
                  Revert all
                </button>
              </div>
            </div>

            {/* File list */}
            <div>
              {changedFiles.map(([file, s], index) => {
                const isStaged = staged.has(file);
                const lastSlash = file.lastIndexOf('/');
                const fileName = lastSlash === -1 ? file : file.slice(lastSlash + 1);
                const dirPath = lastSlash === -1 ? '' : file.slice(0, lastSlash);
                const sColor = gitStatusColor(s);
                const sLabel = gitStatusLabel(s);
                const diffOpen = expandedDiff === file;
                const stats = diffStats[file];
                
                return (
                  <div key={file}>
                    <div
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 8, 
                        padding: '8px 12px', 
                        cursor: 'pointer',
                        background: diffOpen ? 'var(--bg-2)' : 'transparent',
                        borderTop: index > 0 ? '1px solid var(--bg-2)' : 'none',
                      }}
                      onMouseEnter={e => { if (!diffOpen) e.currentTarget.style.background = 'var(--bg-2)'; }}
                      onMouseLeave={e => { if (!diffOpen) e.currentTarget.style.background = 'transparent'; }}
                      onClick={() => { if (!diffOpen) fetchDiffStats(file); setExpandedDiff(diffOpen ? null : file); }}
                    >
                      {/* Checkbox */}
                      <button 
                        onClick={e => { e.stopPropagation(); toggleStage(file, isStaged); }} 
                        style={{
                          width: 16, 
                          height: 16, 
                          borderRadius: 3, 
                          flexShrink: 0, 
                          cursor: 'pointer',
                          background: isStaged ? 'var(--accent)' : 'transparent',
                          border: `1.5px solid ${isStaged ? 'var(--accent)' : 'var(--border-2)'}`,
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          padding: 0,
                        }}
                      >
                        {isStaged && (
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#151313" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                      </button>

                      {/* Status badge */}
                      <span style={{ 
                        fontSize: 11, 
                        color: sColor, 
                        fontWeight: 700, 
                        flexShrink: 0, 
                        width: 14, 
                        textAlign: 'center', 
                        fontFamily: 'monospace' 
                      }}>
                        {sLabel}
                      </span>

                      {/* File icon placeholder */}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>
                      </svg>

                      {/* File path */}
                      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                        {dirPath ? (
                          <div style={{ display: 'flex', alignItems: 'baseline', overflow: 'hidden' }}>
                            <span style={{ 
                              fontSize: 13, 
                              color: 'var(--text-4)', 
                              overflow: 'hidden', 
                              textOverflow: 'ellipsis', 
                              whiteSpace: 'nowrap',
                              direction: 'rtl',
                              textAlign: 'left',
                            }}>
                              {dirPath}
                            </span>
                            <span style={{ fontSize: 13, color: 'var(--text)', flexShrink: 0 }}>
                              <span style={{ color: 'var(--text-4)' }}>/</span>{fileName}
                            </span>
                          </div>
                        ) : (
                          <span style={{ fontSize: 13, color: 'var(--text)' }}>{fileName}</span>
                        )}
                      </div>

                      {/* Diff stats */}
                      {stats && (stats.additions > 0 || stats.deletions > 0) && (
                        <span style={{ fontSize: 11, fontFamily: 'monospace', flexShrink: 0 }}>
                          <span style={{ color: 'var(--green)' }}>+{stats.additions}</span>
                          <span style={{ color: 'var(--text-4)', margin: '0 2px' }}>/</span>
                          <span style={{ color: 'var(--red)' }}>-{stats.deletions}</span>
                        </span>
                      )}

                      {/* Revert button */}
                      <button 
                        onClick={e => { e.stopPropagation(); revertFile(file); }} 
                        title="Revert changes" 
                        style={{
                          background: 'transparent', 
                          border: 'none', 
                          cursor: 'pointer',
                          color: 'var(--text-4)', 
                          padding: 4, 
                          flexShrink: 0,
                          display: 'flex', 
                          alignItems: 'center',
                          borderRadius: 4,
                        }}
                        onMouseEnter={e => { 
                          e.currentTarget.style.color = 'var(--red)'; 
                          e.currentTarget.style.background = 'var(--bg-3)';
                        }}
                        onMouseLeave={e => { 
                          e.currentTarget.style.color = 'var(--text-4)';
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/>
                        </svg>
                      </button>
                    </div>
                    
                    {/* Inline diff */}
                    {diffOpen && <GitDiffViewer file={file} workingDir={workingDir} />}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Commit area */}
      <div style={{ padding: '8px 12px 10px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        {needsIdentity && !showIdentity && (
          <div style={{ fontSize: 11, color: 'var(--red)', marginBottom: 6 }}>
            ⚠ Set git identity before committing —{' '}
            <button onClick={() => setShowIdentity(true)} style={{ background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 11, padding: 0, fontFamily: 'inherit', textDecoration: 'underline' }}>configure</button>
          </div>
        )}
        <textarea
          value={commitMsg}
          onChange={e => setCommitMsg(e.target.value)}
          placeholder="Commit message…"
          rows={2}
          style={{
            width: '100%', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6,
            color: 'var(--text)', fontSize: 13, padding: '7px 10px', fontFamily: 'inherit',
            resize: 'none', outline: 'none', boxSizing: 'border-box', marginBottom: 6,
          }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={commit} disabled={!commitMsg.trim() || loading} style={{
            flex: 1, background: commitMsg.trim() ? 'var(--accent)' : 'var(--bg-4)', border: 'none', borderRadius: 6,
            color: commitMsg.trim() ? 'var(--bg)' : 'var(--text-5)', cursor: commitMsg.trim() ? 'pointer' : 'not-allowed',
            padding: '7px 0', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><line x1="1.05" y1="12" x2="7" y2="12"/><line x1="17.01" y1="12" x2="22.96" y2="12"/></svg>
            Commit
          </button>
          <button onClick={push} disabled={loading} style={{
            background: 'var(--bg-4)', border: '1px solid var(--border-2)', borderRadius: 6,
            color: 'var(--text-2)', cursor: 'pointer', padding: '7px 14px', fontSize: 13, fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
            Push
          </button>
        </div>
      </div>
    </div>
  );
}