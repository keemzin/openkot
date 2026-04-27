import React, { useMemo } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-powershell';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-diff';
import type { Part } from '../../types';
import { isDiffTool } from '../../utils/toolCategorization';
import { DiffViewer } from './DiffViewer';

function highlight(code: string, lang: string): string {
  try {
    const grammar = Prism.languages[lang];
    if (grammar) return Prism.highlight(code, grammar, lang);
  } catch {}
  return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function guessLang(output: string, toolName: string): string {
  // Plain text for tree-like or tabular output — don't syntax highlight it
  if (/[├└│─┬┤┼]/.test(output)) return 'none';
  if (/^\s*(Mode|Directory:|d----|a----)/m.test(output)) return 'none';
  if (output.trimStart().startsWith('{') || output.trimStart().startsWith('[')) return 'json';
  if (output.includes('+++') && output.includes('---') && output.includes('@@')) return 'diff';
  if (toolName === 'bash' || toolName === 'shell' || toolName === 'cmd') return 'bash';
  return 'none';
}

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

  const isBash = toolName === 'bash' || toolName === 'shell' || toolName === 'cmd';

  const truncated = outputStr
    ? (outputStr.length > 4000 ? outputStr.slice(0, 4000) + '\n…(truncated)' : outputStr)
    : null;

  const highlighted = useMemo(() => {
    if (!truncated) return null;
    const lang = guessLang(truncated, toolName);
    if (lang === 'none') return truncated.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return highlight(truncated, lang);
  }, [truncated, toolName]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {hasDiff && <DiffViewer oldStr={oldStr} newStr={newStr} filePath={filePath} />}
      {hasWriteDiff && <DiffViewer oldStr="" newStr={writeContent!} filePath={filePath} />}
      {highlighted && (
        <pre className="prism-code" style={{
          margin: 0,
          fontSize: '0.75rem',
          overflowX: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          maxHeight: isBash ? 300 : 200,
          fontFamily: 'var(--font-mono, "Cascadia Code", "Consolas", "Courier New", monospace)',
          background: 'var(--bg-2)',
          padding: '8px 10px',
          borderRadius: 6,
          color: isError ? 'var(--tools-edit-removed)' : 'var(--text-2)',
        }}>
          <code
            className={`language-${guessLang(truncated!, toolName)} prism-code`}
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        </pre>
      )}
    </div>
  );
}
