import path from 'path';
import process from 'process';
import { WebSocketServer } from 'ws';

// Protocol constants
export const TERMINAL_WS_PATH = '/api/terminal/ws';
const TERMINAL_WS_CONTROL_TAG_JSON = 0x01;
const TERMINAL_WS_MAX_PAYLOAD_BYTES = 64 * 1024;
const TERMINAL_OUTPUT_REPLAY_MAX_BYTES = 64 * 1024;
const MAX_TERMINAL_SESSIONS = 20;
const TERMINAL_IDLE_TIMEOUT = 30 * 60 * 1000;
const TERMINAL_INPUT_WS_HEARTBEAT_INTERVAL_MS = 20000;
const TERMINAL_INPUT_WS_REBIND_WINDOW_MS = 10000;
const TERMINAL_INPUT_WS_MAX_REBINDS_PER_WINDOW = 20;

export const TERMINAL_CONSTANTS = {
  TERMINAL_WS_CONTROL_TAG_JSON,
  TERMINAL_WS_MAX_PAYLOAD_BYTES,
  TERMINAL_OUTPUT_REPLAY_MAX_BYTES,
  MAX_TERMINAL_SESSIONS,
  TERMINAL_IDLE_TIMEOUT,
  TERMINAL_INPUT_WS_HEARTBEAT_INTERVAL_MS,
  TERMINAL_INPUT_WS_REBIND_WINDOW_MS,
  TERMINAL_INPUT_WS_MAX_REBINDS_PER_WINDOW,
};

export const createTerminalWsControlFrame = (payload) => {
  const jsonBytes = Buffer.from(JSON.stringify(payload), 'utf8');
  return Buffer.concat([Buffer.from([TERMINAL_WS_CONTROL_TAG_JSON]), jsonBytes]);
};

export const readTerminalWsControlFrame = (rawData) => {
  const buffer = Buffer.isBuffer(rawData) ? rawData : Buffer.from(rawData);
  if (buffer.length < 2 || buffer[0] !== TERMINAL_WS_CONTROL_TAG_JSON) return null;
  try {
    const parsed = JSON.parse(buffer.subarray(1).toString('utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch { return null; }
};

export const normalizeToText = (rawData) => {
  if (typeof rawData === 'string') return rawData;
  const buf = Buffer.isBuffer(rawData) ? rawData : Array.isArray(rawData) ? Buffer.concat(rawData) : Buffer.from(rawData);
  return buf.toString('utf8');
};

export const createReplayBuffer = () => ({ chunks: [], totalBytes: 0, nextId: 1 });

export const appendReplayChunk = (buf, data) => {
  if (!data) return null;
  const bytes = Buffer.byteLength(data, 'utf8');
  const chunk = { id: buf.nextId++, data, bytes };
  buf.chunks.push(chunk);
  buf.totalBytes += bytes;
  while (buf.totalBytes > TERMINAL_OUTPUT_REPLAY_MAX_BYTES && buf.chunks.length > 1) {
    buf.totalBytes -= buf.chunks.shift().bytes;
  }
  return chunk;
};

export const replayChunksSince = (buf, lastId = 0) => buf.chunks.filter(c => c.id > lastId);

export const terminalTransportCapabilities = {
  input:  { preferred: 'ws', transports: ['http', 'ws'], ws: { path: TERMINAL_WS_PATH, v: 2 } },
  stream: { preferred: 'ws', transports: ['sse',  'ws'], ws: { path: TERMINAL_WS_PATH, v: 2 } },
};

export const terminalRuntimeName = typeof globalThis.Bun === 'undefined' ? 'node' : 'bun';

// PTY provider — lazy singleton
let ptyProviderPromise = null;
export const getPtyProvider = async () => {
  if (ptyProviderPromise) return ptyProviderPromise;
  ptyProviderPromise = (async () => {
    if (process.platform === 'win32') {
      try {
        const m = await import('node-pty');
        console.log('[Terminal] Using node-pty (preferred on Windows)');
        return { spawn: m.spawn, backend: 'node-pty' };
      } catch { console.warn('[Terminal] node-pty unavailable, trying bun-pty'); }
    }
    if (typeof globalThis.Bun !== 'undefined') {
      try {
        const m = await import('bun-pty');
        console.log('[Terminal] Using bun-pty');
        return { spawn: m.spawn, backend: 'bun-pty' };
      } catch { console.warn('[Terminal] bun-pty unavailable, trying node-pty'); }
    }
    const m = await import('node-pty');
    console.log('[Terminal] Using node-pty');
    return { spawn: m.spawn, backend: 'node-pty' };
  })();
  return ptyProviderPromise;
};

export const getShellCandidates = () => {
  if (process.platform === 'win32') {
    return [
      process.env.OPENCHAMBER_TERMINAL_SHELL,
      process.env.SHELL,
      path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      'pwsh.exe', 'powershell.exe',
      process.env.ComSpec,
      path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe'),
      'cmd.exe',
    ].filter(Boolean);
  }
  return [
    process.env.OPENCHAMBER_TERMINAL_SHELL,
    process.env.SHELL,
    '/bin/zsh', '/bin/bash', '/bin/sh',
    'zsh', 'bash', 'sh',
  ].filter(Boolean);
};

export const spawnPtyWithFallback = (ptyProvider, { cols, rows, cwd, env }) => {
  for (const shell of getShellCandidates()) {
    try {
      const ptyOptions = {
        name: 'xterm-256color',
        cols: cols || 80,
        rows: rows || 24,
        cwd,
        env: { ...env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
      };

      if (process.platform === 'win32') {
        ptyOptions.useConpty = true;
      }

      const ptyProcess = ptyProvider.spawn(shell, [], ptyOptions);
      return { ptyProcess, shell };
    } catch (e) {
      console.warn(`[Terminal] Failed to spawn with ${shell}:`, e.message);
    }
  }
  throw new Error('No working shell found for terminal');
};

export const sanitizeTerminalEnv = (env) => {
  const next = { ...env };
  delete next.BASH_XTRACEFD;
  delete next.BASH_ENV;
  delete next.ENV;
  return next;
};

// Session state management
export const terminalSessions = new Map();
export const terminalWsConnections = new Set();
export let terminalWss = null;

export function setupTerminalWebSocketServer() {
  terminalWss = new WebSocketServer({ noServer: true, maxPayload: TERMINAL_WS_MAX_PAYLOAD_BYTES });
  return terminalWss;
}

export const sendControl = (socket, payload) => {
  if (!socket || socket.readyState !== 1) return;
  try { socket.send(createTerminalWsControlFrame(payload), { binary: true }); } catch {}
};

export const wireSession = (sessionId, session) => {
  session.ptyProcess.onData((data) => {
    session.lastActivity = Date.now();
    const chunk = appendReplayChunk(session.replayBuffer, data);
    for (const conn of terminalWsConnections) {
      if (conn.boundSessionId !== sessionId || !conn.socket || conn.socket.readyState !== 1) continue;
      try {
        conn.socket.send(data);
        if (chunk) conn.replayCursorBySession.set(sessionId, chunk.id);
      } catch {}
    }
  });
  session.ptyProcess.onExit(({ exitCode, signal }) => {
    console.log(`[Terminal] Session ${sessionId} exited (code=${exitCode})`);
    for (const conn of terminalWsConnections) {
      if (conn.boundSessionId !== sessionId) continue;
      conn.boundSessionId = null;
      conn.replayCursorBySession.delete(sessionId);
      sendControl(conn.socket, { t: 'x', v: 2, s: sessionId, exitCode, signal });
    }
    terminalSessions.delete(sessionId);
  });
};
