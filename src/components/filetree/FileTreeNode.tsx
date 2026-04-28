import React, { useState, useEffect, useCallback } from 'react';
import type { FsEntry, InlineEdit, GitFileStatus } from '../../types';
import { gitStatusColor, gitStatusLabel } from '../../utils/gitUtils';
import { fileColor, getFileExt } from '../../utils/fileUtils';
import { InlineInput } from './InlineInput';

export const FileTreeNode = React.memo(function FileTreeNode({ entry, depth, onFileClick, selectedPath, showHidden, onContextMenu, inlineEdit, onInlineConfirm, onInlineCancel, refreshKey, gitStatus, folderBadge, getFileGitStatus, getFolderBadge }: {
  entry: FsEntry; depth: number; onFileClick: (p: string) => void; selectedPath: string | null;
  showHidden: boolean; onContextMenu: (e: React.MouseEvent, entry: FsEntry) => void;
  inlineEdit: InlineEdit | null; onInlineConfirm: (v: string) => void; onInlineCancel: () => void;
  refreshKey: number;
  gitStatus?: GitFileStatus;
  folderBadge?: { M: number; A: number; D: number } | null;
  getFileGitStatus: (path: string) => GitFileStatus | undefined;
  getFolderBadge: (path: string) => { M: number; A: number; D: number } | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FsEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  const loadChildren = useCallback(async (dir: string) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/fs/list?path=${encodeURIComponent(dir)}`);
      const data = await r.json();
      const entries = (data.entries as FsEntry[])
        .filter(e => showHidden || !e.name.startsWith('.'))
        .sort((a, b) => { if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1; return a.name.localeCompare(b.name); });
      setChildren(entries);
    } catch { setChildren([]); }
    setLoading(false);
  }, [showHidden]);

  // Reload when refreshKey changes and we're expanded
  useEffect(() => {
    if (expanded) loadChildren(entry.path);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!entry.isDirectory) { onFileClick(entry.path); return; }
    if (!expanded && children === null) await loadChildren(entry.path);
    setExpanded(o => !o);
  };

  const isSelected = !entry.isDirectory && entry.path === selectedPath;
  const isRenaming = inlineEdit !== null && 'entryPath' in inlineEdit && inlineEdit.entryPath === entry.path;
  const newEditInside = inlineEdit !== null && 'parentPath' in inlineEdit && inlineEdit.parentPath === entry.path;

  const gsColor = !entry.isDirectory ? gitStatusColor(gitStatus) : null;
  const gsLabel = !entry.isDirectory ? gitStatusLabel(gitStatus) : null;

  return (
    <div>
      <div
        onClick={toggle}
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onContextMenu(e, entry); }}
        data-filepath={!entry.isDirectory ? entry.path.replace(/\\/g, '/') : undefined}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: `5px 8px 5px ${8 + depth * 16}px`, cursor: 'pointer', userSelect: 'none', background: isSelected ? 'var(--bg-4)' : 'transparent', borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent' }}
        onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-2)'; }}
        onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
      >
        <span style={{ width: 14, flexShrink: 0, color: 'var(--text-4)', fontSize: 10, textAlign: 'center' }}>
          {entry.isDirectory ? (expanded ? '▼' : '▶') : ''}
        </span>
        {entry.isDirectory
          ? (expanded
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-4)' }}><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H5a2 2 0 0 0-2-2z"/><path d="M8 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2H8V5z"/></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-4)' }}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            )
          : <span style={{ fontSize: 11, color: fileColor(entry.name), fontFamily: 'monospace', minWidth: 26, textAlign: 'center', background: 'var(--bg-3)', borderRadius: 3, padding: '1px 3px', letterSpacing: '-0.5px' }}>{getFileExt(entry.name).slice(0, 3) || '·'}</span>
        }
        {isRenaming
          ? <InlineInput defaultValue={entry.name} onConfirm={onInlineConfirm} onCancel={onInlineCancel} />
          : <span style={{ fontSize: 14, color: isSelected ? 'var(--text)' : 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{entry.name}</span>
        }
        {/* Git status for files */}
        {!entry.isDirectory && gsLabel && (
          <span style={{ fontSize: 11, color: gsColor ?? 'var(--text-3)', fontWeight: 700, flexShrink: 0 }}>{gsLabel}</span>
        )}
        {/* Git badge for folders */}
        {entry.isDirectory && folderBadge && (folderBadge.M + folderBadge.A + folderBadge.D) > 0 && (
          <span style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
            {folderBadge.M > 0 && <span style={{ fontSize: 10, color: 'var(--orange)', fontWeight: 700 }}>{folderBadge.M}M</span>}
            {folderBadge.A > 0 && <span style={{ fontSize: 10, color: 'var(--green)', fontWeight: 700 }}>{folderBadge.A}A</span>}
            {folderBadge.D > 0 && <span style={{ fontSize: 10, color: 'var(--red)', fontWeight: 700 }}>{folderBadge.D}D</span>}
          </span>
        )}
        {loading && <span style={{ color: 'var(--text-5)', fontSize: 10, marginLeft: 'auto' }}>…</span>}
      </div>

      {expanded && (
        <div style={{ position: 'relative' }}>
          {/* Indent guide */}
          <div style={{ position: 'absolute', left: 8 + depth * 16 + 16, top: 0, bottom: 0, width: 1, background: 'var(--bg-4)', pointerEvents: 'none' }} />

          {/* New file/folder inline input */}
          {newEditInside && inlineEdit && 'parentPath' in inlineEdit && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: `5px 8px 5px ${8 + (depth + 1) * 16 + 20}px` }}>
              <span style={{ fontSize: 14 }}>{inlineEdit.type === 'newFile' ? '📄' : '📁'}</span>
              <InlineInput defaultValue="" onConfirm={onInlineConfirm} onCancel={onInlineCancel} />
            </div>
          )}

          {children?.map(c => (
            <FileTreeNode key={c.path} entry={c} depth={depth + 1} onFileClick={onFileClick} selectedPath={selectedPath}
              showHidden={showHidden} onContextMenu={onContextMenu} inlineEdit={inlineEdit}
              onInlineConfirm={onInlineConfirm} onInlineCancel={onInlineCancel} refreshKey={refreshKey}
              gitStatus={!c.isDirectory ? getFileGitStatus(c.path) : undefined}
              folderBadge={c.isDirectory ? getFolderBadge(c.path) : null}
              getFileGitStatus={getFileGitStatus} getFolderBadge={getFolderBadge}
            />
          ))}
        </div>
      )}
    </div>
  );
});