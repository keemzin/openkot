import React from 'react';
import type { Part } from '../../types';
import { isDiffTool } from '../../utils/toolCategorization';
import { DiffViewer } from './DiffViewer';

/** Renders the expanded content for a tool (diff, output, etc.) — no header */
export function ToolPart({ part }: { part: Part }) {
  const toolName = (part.tool as string) || part.type;
  const state = (part.state as any) ?? {};
  const input = state.input ?? {};
  const outputStr: string | null = state.output ?? state.error ?? null;
  const isError = state.status === 'error';

  const isDiff = isDiffTool(toolName);
  const oldStr = input.oldString ?? input.old_string ?? null;
  const newStr = input.newString ?? input.new_string ?? null;
  const hasDiff = isDiff && oldStr !== null && newStr !== null;
  const filePath: string | undefined = input.filePath ?? input.file_path ?? input.path;
  const writeContent: string | null = typeof input.content === 'string' ? input.content : null;
  const hasWriteDiff = isDiff && !hasDiff && writeContent !== null;

  // For bash/shell: just show output
  const isBash = toolName === 'bash' || toolName === 'shell' || toolName === 'cmd';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {hasDiff && <DiffViewer oldStr={oldStr} newStr={newStr} filePath={filePath} />}
      {hasWriteDiff && <DiffViewer oldStr="" newStr={writeContent!} filePath={filePath} />}
      {outputStr && (
        <pre style={{
          margin: 0,
          color: isError ? 'var(--tools-edit-removed)' : 'var(--tools-title)',
          fontSize: '0.75rem',
          overflowX: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          maxHeight: isBash ? 300 : 200,
          fontFamily: 'monospace',
          background: 'var(--bg-2)',
          padding: '8px 10px',
          borderRadius: 6,
        }}>
          {outputStr.length > 4000 ? outputStr.slice(0, 4000) + '\n…(truncated)' : outputStr}
        </pre>
      )}
    </div>
  );
}
