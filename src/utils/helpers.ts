import type { Message, SessionContextUsage } from '../types';

// ── Global Terminal Manager ────────────────────
// Maintains one terminal session per working directory
const globalTerminalSessions = new Map<string, { sessionId: string; lastUsed: number }>();

export function getTerminalSessionForDir(workingDir: string): string | null {
  const entry = globalTerminalSessions.get(workingDir);
  if (entry) {
    entry.lastUsed = Date.now();
    return entry.sessionId;
  }
  return null;
}

export function setTerminalSessionForDir(workingDir: string, sessionId: string): void {
  globalTerminalSessions.set(workingDir, { sessionId, lastUsed: Date.now() });
}

export function removeTerminalSessionForDir(workingDir: string): void {
  const entry = globalTerminalSessions.get(workingDir);
  if (entry) {
    // Delete from server
    fetch(`/api/terminal/${entry.sessionId}`, { method: 'DELETE' }).catch(() => {});
    globalTerminalSessions.delete(workingDir);
  }
}

export async function stopTerminalForDir(workingDir: string): Promise<void> {
  removeTerminalSessionForDir(workingDir);
}

// Clean up old sessions (older than 5 minutes)
export function cleanupOldTerminalSessions(): void {
  const now = Date.now();
  const cutoff = now - 5 * 60 * 1000; // 5 minutes
  for (const [dir, entry] of globalTerminalSessions.entries()) {
    if (entry.lastUsed < cutoff) {
      // Delete from server
      fetch(`/api/terminal/${entry.sessionId}`, { method: 'DELETE' }).catch(() => {});
      globalTerminalSessions.delete(dir);
    }
  }
}

// Run cleanup every minute
if (typeof window !== 'undefined') {
  setInterval(cleanupOldTerminalSessions, 60 * 1000);
}

export function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function getContextUsage(messages: Message[], contextLimit: number): SessionContextUsage | null {
  if (messages.length === 0) return null;

  // Find last assistant message with token data
  type AssistantTokens = { input?: number; output?: number; reasoning?: number; cache_read?: number; cache_write?: number };
  let lastTokens: AssistantTokens | undefined;
  let lastMessageId: string | undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role !== "assistant" || msg.id.startsWith('temp_')) continue
    const tokens = msg.tokens
    if (!tokens || (!tokens.input && !tokens.output)) continue
    lastTokens = tokens
    lastMessageId = msg.id
    break
  }

  if (!lastTokens) return null;

  const totalTokens = (lastTokens.input ?? 0) + (lastTokens.output ?? 0) + (lastTokens.reasoning ?? 0) + (lastTokens.cache_read ?? lastTokens.cache?.read ?? 0) + (lastTokens.cache_write ?? lastTokens.cache?.write ?? 0);
  const thresholdLimit = contextLimit > 0 ? contextLimit : 200000;
  const percentage = contextLimit > 0 ? (totalTokens / contextLimit) * 100 : 0;

  return {
    totalTokens,
    percentage,
    contextLimit: contextLimit || 0,
    outputLimit: undefined, // Not used in current implementation
    normalizedOutput: undefined,
    thresholdLimit,
    lastMessageId,
  };
}

// Clipboard fallback for mobile (HTTP) where navigator.clipboard is unavailable
export function fallbackCopy(text: string, onDone?: (v: boolean) => void) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    if (onDone) { onDone(true); setTimeout(() => onDone(false), 2000); }
  } catch {
    if (onDone) onDone(false);
  }
}

// Handles \r, \b and key ANSI sequences shells use for line editing.
export function processAnsi(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return raw
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')   // OSC — remove
    .replace(/\x1b\[[0-2]?K/g, '\x1b[K')                  // erase-line → sentinel
    .replace(/\x1b\[(?:1)?G/g, '\r')                       // move-to-col-1 → \r
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')                // remaining CSI
    .replace(/\x1b[()][AB012]/g, '')
    .replace(/\x1b[=>]/g, '')
    .replace(/\x1b[A-Za-z]/g, '');
  // \r and \x08 (backspace) kept — appendOutput handles them
}