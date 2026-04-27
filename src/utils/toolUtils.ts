import type { Part } from '../types';
import { normalizeToolName, DIFF_TOOLS, getGroupLabel, isDiffTool } from './toolCategorization';

export type ToolState = {
  status: 'pending' | 'running' | 'completed' | 'error';
  input?: Record<string, unknown>;
  output?: string;
  error?: string;
};

export { getGroupLabel, isDiffTool, DIFF_TOOLS };

export function getToolSummary(toolName: string, state: ToolState): string {
  const input = state?.input;
  if (!input) return toolName;

  if (toolName === 'bash' || toolName === 'execute_bash') {
    const cmd = input.command ?? input.cmd;
    if (typeof cmd === 'string') return cmd.split('\n')[0].slice(0, 100);
  }
  if (toolName === 'grep') {
    const pattern = input.pattern;
    if (typeof pattern === 'string') return `grep ${pattern.slice(0, 50)}`;
  }
  if (toolName === 'glob') {
    const pattern = input.pattern;
    if (typeof pattern === 'string') return `glob ${pattern.slice(0, 50)}`;
  }
  if (toolName === 'read') {
    const path = input.filePath ?? input.path;
    if (typeof path === 'string') return path.replace(/\\/g, '/').split('/').pop() ?? path;
  }
  if (toolName === 'write' || toolName === 'edit') {
    const path = input.filePath ?? input.path;
    if (typeof path === 'string') return path.replace(/\\/g, '/').split('/').pop() ?? path;
  }
  return toolName;
}

export function getToolOneliner(toolName: string, part: Part): string {
  const state = (part.state as any) ?? {};
  const input = state.input ?? {};
  if (toolName === 'grep' || toolName === 'searxng_searxng_web_search' || toolName === 'websearch' || toolName === 'codesearch') {
    const q = input.pattern ?? input.query ?? input.q ?? '';
    return typeof q === 'string' ? q.slice(0, 80) : '';
  }
  if (toolName === 'glob') {
    const p = input.pattern ?? input.glob ?? '';
    return typeof p === 'string' ? p.slice(0, 80) : '';
  }
  if (toolName === 'read') {
    const f = input.file_path ?? input.filePath ?? input.path ?? '';
    return typeof f === 'string' ? f.replace(/\\/g, '/').split('/').pop() ?? f : '';
  }
  if (toolName === 'bash') {
    const cmd = input.command ?? input.cmd ?? '';
    return typeof cmd === 'string' ? cmd.split('\n')[0].slice(0, 80) : '';
  }
  return getToolSummary(toolName, state);
}

export function computeDiff(oldText: string, newText: string): Array<{ type: 'same' | 'remove' | 'add'; line: string }> {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const result: Array<{ type: 'same' | 'remove' | 'add'; line: string }> = [];

  let i = 0, j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      result.push({ type: 'same', line: oldLines[i] });
      i++; j++;
    } else if (i < oldLines.length && (j >= newLines.length || oldLines[i] !== newLines[j])) {
      result.push({ type: 'remove', line: oldLines[i] });
      i++;
    } else if (j < newLines.length) {
      result.push({ type: 'add', line: newLines[j] });
      j++;
    }
  }
  return result;
}