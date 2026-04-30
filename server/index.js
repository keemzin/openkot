import express from 'express';
import { createServer } from 'http';
import { createConnection } from 'net';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { spawn } from 'child_process';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// ── Load .env ──────────────────────────────────────────────────────────────
const envPath = path.join(PROJECT_ROOT, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = val; // don't override shell env
  }
}

// ── Config ─────────────────────────────────────────────────────────────────
const PORT          = parseInt(process.env.PORT          || '3000', 10);
const OPENCODE_PORT = parseInt(process.env.OPENCODE_PORT || '4088', 10);
const OPENCODE_HOST = process.env.OPENCODE_HOST || '127.0.0.1';

// Binary path — default to local vendor binary, override via env
const DEFAULT_BINARY = process.platform === 'win32'
  ? path.join(PROJECT_ROOT, 'vendor', 'opencode', 'opencode.exe')
  : path.join(PROJECT_ROOT, 'vendor', 'opencode', 'opencode');
const VENDOR_OPENCODE = process.env.OPENCODE_BINARY 
  ? path.resolve(process.env.OPENCODE_BINARY)
  : DEFAULT_BINARY;

// Default working directory - use relative path from project root
const WORKING_DIR = process.env.WORKING_DIR
  ? (path.isAbsolute(process.env.WORKING_DIR) 
      ? process.env.WORKING_DIR 
      : path.join(PROJECT_ROOT, process.env.WORKING_DIR))
  : path.join(PROJECT_ROOT, 'WORKSPACE');

let opencodeProcess = null;
let currentWorkingDir = WORKING_DIR;
let isOpenCodeReady = false;
let currentRestartPromise = null; // guard against concurrent restarts
let lastOpenCodeError = null;

// ── Helpers ────────────────────────────────────────────────────────────────

const hasProcessExited = (proc) => !proc || proc.exitCode !== null || proc.signalCode !== null;

const waitForProcessClose = (proc, timeoutMs) => new Promise((resolve) => {
  if (!proc || hasProcessExited(proc)) { resolve(true); return; }
  let done = false;
  const finish = (closed) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    proc.off('close', onClose);
    proc.off('error', onError);
    resolve(closed);
  };
  const onClose = () => finish(true);
  const onError = () => finish(hasProcessExited(proc));
  const timer = setTimeout(() => finish(hasProcessExited(proc)), timeoutMs);
  proc.once('close', onClose);
  proc.once('error', onError);
});

async function killOpenCode() {
  console.log('[OpenCode] Stopping previous instance...');
  isOpenCodeReady = false;

  const proc = opencodeProcess?._child ?? null;
  const pid  = opencodeProcess?.pid ?? null;
  opencodeProcess = null;

  if (!pid) return;

  // Try graceful kill first
  try { if (proc) proc.kill('SIGTERM'); } catch {}

  if (proc && await waitForProcessClose(proc, 2500)) {
    console.log('[OpenCode] Process exited cleanly.');
    return;
  }

  // Windows: escalate through taskkill /T then /F
  if (process.platform === 'win32') {
    for (const flags of [['/pid', String(pid), '/t'], ['/pid', String(pid), '/f', '/t']]) {
      try {
        const { spawnSync } = await import('child_process');
        spawnSync('taskkill', flags, { stdio: 'ignore', timeout: 5000, windowsHide: true });
      } catch {}
      if (!proc || hasProcessExited(proc)) break;
      if (proc) await waitForProcessClose(proc, 1500);
    }
  } else {
    try { if (proc) proc.kill('SIGKILL'); } catch {}
    if (proc) await waitForProcessClose(proc, 1000);
  }

  console.log('[OpenCode] Kill sequence complete.');
}

async function waitForPortFree(port, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const inUse = await new Promise((resolve) => {
      const sock = createConnection({ port, host: OPENCODE_HOST });
      const t = setTimeout(() => { sock.destroy(); resolve(false); }, 400);
      sock.once('connect', () => { clearTimeout(t); sock.destroy(); resolve(true); });
      sock.once('error', () => { clearTimeout(t); resolve(false); });
    });
    if (!inUse) { console.log(`[OpenCode] Port ${port} is free.`); return; }
    console.log(`[OpenCode] Waiting for port ${port} to be released...`);
    await new Promise(r => setTimeout(r, 200));
  }
  console.warn(`[OpenCode] Timed out waiting for port ${port} to free — proceeding anyway.`);
}

// Wait for OpenCode API to actually respond (not just the process to start)
async function waitForOpenCodeReady(timeoutMs = 20000) {
  const base = `http://${OPENCODE_HOST}:${OPENCODE_PORT}`;
  const deadline = Date.now() + timeoutMs;
  let lastErr = null;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/session`, { signal: AbortSignal.timeout(2000) });
      if (res.ok || res.status === 401 || res.status === 404) {
        isOpenCodeReady = true;
        lastOpenCodeError = null;
        console.log('[OpenCode] API is ready.');
        return;
      }
    } catch (e) {
      lastErr = e;
    }
    await new Promise(r => setTimeout(r, 400));
  }

  const msg = `Timed out waiting for OpenCode API to respond. Last error: ${lastErr?.message ?? 'unknown'}`;
  lastOpenCodeError = msg;
  throw new Error(msg);
}

async function spawnOpenCode(dir) {
  console.log(`[OpenCode] Spawning in ${dir}...`);
  console.log(`[OpenCode] Binary: ${VENDOR_OPENCODE}`);

  const proc = Bun.spawn({
    cmd: [VENDOR_OPENCODE, 'serve', '--port', String(OPENCODE_PORT), '--hostname', OPENCODE_HOST],
    cwd: dir,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  console.log('[OpenCode] Started with PID:', proc.pid);

  // Attach a native child_process handle for kill signalling
  // Bun.spawn returns a Bun process — wrap it so waitForProcessClose works
  const bunProc = proc;
  const fakeChild = {
    pid: proc.pid,
    exitCode: null,
    signalCode: null,
    kill: (sig) => proc.kill(sig),
    off: () => {},
    once: (event, cb) => {
      if (event === 'close' || event === 'exit') {
        bunProc.exited.then(() => { fakeChild.exitCode = bunProc.exitCode ?? 0; cb(); }).catch(() => cb());
      }
    },
  };

  opencodeProcess = { kill: (sig) => proc.kill(sig), pid: proc.pid, _child: fakeChild };

  // Wait for the "listening" line in stdout/stderr
  await new Promise((resolve, reject) => {
    let stdoutBuf = '';
    let stderrBuf = '';
    const dec = new TextDecoder();
    let done = false;

    const finish = (fn, val) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      fn(val);
    };

    const checkReady = (text) => {
      if (text.includes('opencode server listening') || text.includes('kilo server listening') || text.includes('listening')) {
        finish(resolve, text);
        return true;
      }
      return false;
    };

    const timer = setTimeout(() => {
      proc.kill();
      finish(reject, new Error(`Timeout waiting for OpenCode to start.\nstdout: ${stdoutBuf}\nstderr: ${stderrBuf}`));
    }, 30000);

    (async () => {
      for await (const chunk of proc.stdout) {
        stdoutBuf += dec.decode(chunk);
        if (checkReady(stdoutBuf)) return;
      }
    })().catch(() => {});

    (async () => {
      for await (const chunk of proc.stderr) {
        stderrBuf += dec.decode(chunk);
        if (checkReady(stderrBuf)) return;
      }
    })().catch(() => {});

    proc.exited.then((code) => {
      finish(reject, new Error(`OpenCode exited with code ${code}.\nstdout: ${stdoutBuf}\nstderr: ${stderrBuf}`));
    }).catch((e) => finish(reject, e));
  });

  console.log('[OpenCode] Process signalled ready, verifying API...');
}

async function startOpenCode(cwd) {
  const dir = cwd || currentWorkingDir;
  await killOpenCode();
  await waitForPortFree(OPENCODE_PORT, 10000);
  currentWorkingDir = dir;

  try {
    await spawnOpenCode(dir);
    await waitForOpenCodeReady(20000);
    console.log('[OpenCode] Fully ready!');
  } catch (e) {
    console.error('[OpenCode] Start error:', e.message);
    isOpenCodeReady = false;
    lastOpenCodeError = e.message;
    throw e;
  }
}

async function restartOpenCode(cwd) {
  // Deduplicate concurrent restart calls
  if (currentRestartPromise) {
    console.log('[OpenCode] Restart already in progress, waiting...');
    return currentRestartPromise;
  }

  currentRestartPromise = (async () => {
    isOpenCodeReady = false;
    try {
      await startOpenCode(cwd || currentWorkingDir);
    } finally {
      currentRestartPromise = null;
    }
  })();

  return currentRestartPromise;
}

function directoryResolver(req, res, next) {
  // Check header first, then query param (GET requests), then body field (POST requests)
  const headerDirectory = req.get('x-opencode-directory');
  const queryDirectory = typeof req.query?.directory === 'string' ? req.query.directory : null;
  req.opencodeDirectory = headerDirectory || queryDirectory || currentWorkingDir;
  // Only log in debug mode to reduce noise
  if (process.env.DEBUG_PROXY) {
    console.log(`[proxy] ${req.method} ${req.path} → dir: ${req.opencodeDirectory}`);
  }
  next();
}

function setupProxy(app) {
  app.use('/api', directoryResolver);
  const apiProxy = createProxyMiddleware({
    target: `http://${OPENCODE_HOST}:${OPENCODE_PORT}`,
    changeOrigin: true,
    pathRewrite: { '^/api': '' },
    pathFilter: (path) => !path.startsWith('/api/terminal'),
    on: {
      proxyReq: (proxyReq, req) => {
        if (req.opencodeDirectory) {
          proxyReq.setHeader('x-opencode-directory', req.opencodeDirectory);
        }
      },
    },
  });
  app.use('/api', apiProxy);
}

async function start() {
  const app = express();

  // Health check — exposes feature flags and opencode readiness
  app.get('/health', (_req, res) => {
    const planMode = process.env.PLAN_MODE === '1' || process.env.PLAN_MODE === 'true';
    res.json({
      ok: true,
      planModeExperimentalEnabled: planMode,
      isOpenCodeReady: isOpenCodeReady,
      isRestarting: currentRestartPromise !== null,
      lastError: lastOpenCodeError ?? null,
    });
  });
  // Expose server config to the frontend before the proxy
  app.get('/config', (_req, res) => {
    res.json({ workingDir: currentWorkingDir, rootDir: WORKING_DIR });
  });

  const jsonBody = express.json();

  // Switch working directory — NO RESTART, just update currentWorkingDir
  app.post('/switch-dir', jsonBody, async (req, res) => {
    const { dir } = req.body;
    if (!dir || typeof dir !== 'string') return res.status(400).json({ error: 'dir required' });
    const resolved = path.resolve(dir);
    // Validate it exists
    try { await fs.promises.access(resolved); } catch { return res.status(400).json({ error: 'Directory not found' }); }

    // Just update the current working directory in memory
    currentWorkingDir = resolved;

    // No need to poll, opencode is already running
    res.json({ workingDir: resolved.replace(/\\\\/g, '/') });
  });

  // Restart server — stops and restarts opencode
  // Responds immediately; client polls /health for isOpenCodeReady
  app.post('/restart', (_req, res) => {
    res.json({ ok: true, message: 'Restart initiated' });
    // Fire-and-forget restart so the HTTP response is not blocked
    restartOpenCode(currentWorkingDir).catch(err => {
      console.error('[restart] Failed:', err.message);
      lastOpenCodeError = err.message;
    });
  });

  // ── Terminal — copied from openchamber ──────────────────────────────────────
  // Protocol constants (openchamber terminal-ws-protocol.js)
  const TERMINAL_WS_PATH = '/api/terminal/ws';
  const TERMINAL_WS_CONTROL_TAG_JSON = 0x01;
  const TERMINAL_WS_MAX_PAYLOAD_BYTES = 64 * 1024;
  const TERMINAL_INPUT_WS_HEARTBEAT_INTERVAL_MS = 20000;
  const TERMINAL_INPUT_WS_REBIND_WINDOW_MS = 10000;
  const TERMINAL_INPUT_WS_MAX_REBINDS_PER_WINDOW = 20;
  const TERMINAL_OUTPUT_REPLAY_MAX_BYTES = 64 * 1024;
  const MAX_TERMINAL_SESSIONS = 20;
  const TERMINAL_IDLE_TIMEOUT = 30 * 60 * 1000;

  const createTerminalWsControlFrame = (payload) => {
    const jsonBytes = Buffer.from(JSON.stringify(payload), 'utf8');
    return Buffer.concat([Buffer.from([TERMINAL_WS_CONTROL_TAG_JSON]), jsonBytes]);
  };

  const readTerminalWsControlFrame = (rawData) => {
    const buffer = Buffer.isBuffer(rawData) ? rawData : Buffer.from(rawData);
    if (buffer.length < 2 || buffer[0] !== TERMINAL_WS_CONTROL_TAG_JSON) return null;
    try {
      const parsed = JSON.parse(buffer.subarray(1).toString('utf8'));
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch { return null; }
  };

  const normalizeToText = (rawData) => {
    if (typeof rawData === 'string') return rawData;
    const buf = Buffer.isBuffer(rawData) ? rawData : Array.isArray(rawData) ? Buffer.concat(rawData) : Buffer.from(rawData);
    return buf.toString('utf8');
  };

  // Output replay buffer (openchamber output-replay-buffer.js)
  const createReplayBuffer = () => ({ chunks: [], totalBytes: 0, nextId: 1 });
  const appendReplayChunk = (buf, data) => {
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
  const replayChunksSince = (buf, lastId = 0) => buf.chunks.filter(c => c.id > lastId);

  // PTY provider
  let ptyProviderPromise = null;
  const getPtyProvider = async () => {
    if (ptyProviderPromise) return ptyProviderPromise;
    ptyProviderPromise = (async () => {
      // On Windows, prefer node-pty as bun-pty may have compatibility issues
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

  // Shell resolution (openchamber approach — try candidates in order)
  const getShellCandidates = () => {
    if (process.platform === 'win32') {
      return [
        process.env.OPENCHAMBER_TERMINAL_SHELL,
        process.env.SHELL,
        // Try PowerShell first on Windows for better PTY compatibility
        path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
        'pwsh.exe', 'powershell.exe',
        // cmd.exe as fallback
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

  const spawnPtyWithFallback = (ptyProvider, { cols, rows, cwd, env }) => {
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

  const terminalSessions = new Map();
  const terminalWsConnections = new Set();
  const terminalRuntimeName = typeof globalThis.Bun === 'undefined' ? 'node' : 'bun';

  const sanitizeTerminalEnv = (env) => {
    const next = { ...env };
    delete next.BASH_XTRACEFD;
    delete next.BASH_ENV;
    delete next.ENV;
    return next;
  };

  const terminalTransportCapabilities = {
    input:  { preferred: 'ws', transports: ['http', 'ws'], ws: { path: TERMINAL_WS_PATH, v: 2 } },
    stream: { preferred: 'ws', transports: ['sse',  'ws'], ws: { path: TERMINAL_WS_PATH, v: 2 } },
  };

  const sendControl = (socket, payload) => {
    if (!socket || socket.readyState !== 1) return;
    try { socket.send(createTerminalWsControlFrame(payload), { binary: true }); } catch {}
  };

  // Wire PTY output → all bound WS connections (openchamber wireTerminalSession)
  const wireSession = (sessionId, session) => {
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

  // WebSocket server — single shared connection, session binding via control frames
  const terminalWss = new WebSocketServer({ noServer: true, maxPayload: TERMINAL_WS_MAX_PAYLOAD_BYTES });

  terminalWss.on('connection', (socket) => {
    const conn = {
      socket,
      boundSessionId: null,
      rebindTimestamps: [],
      replayCursorBySession: new Map(),
      lastActivityAt: Date.now(),
    };
    terminalWsConnections.add(conn);

    sendControl(socket, { t: 'ok', v: 2 });

    const heartbeat = setInterval(() => {
      if (socket.readyState === 1) try { socket.ping(); } catch {}
    }, TERMINAL_INPUT_WS_HEARTBEAT_INTERVAL_MS);

    socket.on('pong', () => { conn.lastActivityAt = Date.now(); });

    socket.on('message', (message, isBinary) => {
      conn.lastActivityAt = Date.now();

      if (isBinary) {
        const ctrl = readTerminalWsControlFrame(message);
        if (!ctrl || typeof ctrl.t !== 'string') {
          sendControl(socket, { t: 'e', c: 'BAD_FRAME', f: false });
          return;
        }
        // Ping
        if (ctrl.t === 'p') { sendControl(socket, { t: 'po', v: 2 }); return; }
        // Bind to session
        if (ctrl.t === 'b' && typeof ctrl.s === 'string') {
          const now = Date.now();
          conn.rebindTimestamps = conn.rebindTimestamps.filter(t => now - t < TERMINAL_INPUT_WS_REBIND_WINDOW_MS);
          if (conn.rebindTimestamps.length >= TERMINAL_INPUT_WS_MAX_REBINDS_PER_WINDOW) {
            sendControl(socket, { t: 'e', c: 'RATE_LIMIT', f: false }); return;
          }
          const session = terminalSessions.get(ctrl.s.trim());
          if (!session) {
            conn.boundSessionId = null;
            sendControl(socket, { t: 'e', c: 'SESSION_NOT_FOUND', f: false }); return;
          }
          conn.rebindTimestamps.push(now);
          conn.boundSessionId = ctrl.s.trim();
          sendControl(socket, { t: 'bok', v: 2, s: conn.boundSessionId, runtime: terminalRuntimeName, ptyBackend: session.ptyBackend });
          // Replay buffered output
          const since = conn.replayCursorBySession.get(conn.boundSessionId) ?? 0;
          for (const c of replayChunksSince(session.replayBuffer, since)) {
            try { socket.send(c.data); conn.replayCursorBySession.set(conn.boundSessionId, c.id); } catch { break; }
          }
          return;
        }
        sendControl(socket, { t: 'e', c: 'BAD_FRAME', f: false });
        return;
      }

      // Text frame = PTY input
      const data = normalizeToText(message);
      if (!data) return;
      if (!conn.boundSessionId) { sendControl(socket, { t: 'e', c: 'NOT_BOUND', f: false }); return; }
      const session = terminalSessions.get(conn.boundSessionId);
      if (!session) { conn.boundSessionId = null; sendControl(socket, { t: 'e', c: 'SESSION_NOT_FOUND', f: false }); return; }
      try { session.ptyProcess.write(data); session.lastActivity = Date.now(); }
      catch { sendControl(socket, { t: 'e', c: 'WRITE_FAIL', f: false }); }
    });

    socket.on('close', () => {
      clearInterval(heartbeat);
      conn.boundSessionId = null;
      terminalWsConnections.delete(conn);
    });
    socket.on('error', () => {});
  });

  // Idle sweep
  setInterval(() => {
    const now = Date.now();
    for (const [id, session] of terminalSessions) {
      if (now - session.lastActivity > TERMINAL_IDLE_TIMEOUT) {
        console.log(`[Terminal] Sweeping idle session ${id}`);
        try { session.ptyProcess.kill(); } catch {}
        terminalSessions.delete(id);
      }
    }
  }, 5 * 60 * 1000);

  // POST /api/terminal/create
  app.post('/api/terminal/create', jsonBody, async (req, res) => {
    try {
      if (terminalSessions.size >= MAX_TERMINAL_SESSIONS)
        return res.status(429).json({ error: 'Maximum terminal sessions reached' });

      const { cols, rows, cwd } = req.body || {};
      const terminalCwd = cwd || currentWorkingDir;

      if (!terminalCwd) {
        return res.status(400).json({ error: 'cwd is required' });
      }

      try {
        await fs.promises.access(terminalCwd);
      } catch {
        return res.status(400).json({ error: 'Invalid working directory' });
      }



      const sessionId = Math.random().toString(36).substring(2, 15) +
                        Math.random().toString(36).substring(2, 15);

      const resolvedEnv = sanitizeTerminalEnv({ ...process.env });

      const ptyProvider = await getPtyProvider();
      const { ptyProcess, shell } = spawnPtyWithFallback(ptyProvider, {
        cols, rows, cwd: terminalCwd,
        env: resolvedEnv,
      });

      const session = {
        ptyProcess,
        ptyBackend: ptyProvider.backend,
        cwd: terminalCwd,
        lastActivity: Date.now(),
        replayBuffer: createReplayBuffer(),
      };
      terminalSessions.set(sessionId, session);
      wireSession(sessionId, session);

      console.log(`[Terminal] Created session ${sessionId} for directory ${terminalCwd} using shell ${shell}`);
      res.json({ sessionId, cols: cols || 80, rows: rows || 24, capabilities: terminalTransportCapabilities });
    } catch (err) {
      console.error('[Terminal] Create failed:', err);
      res.status(500).json({ error: err.message || 'Failed to create terminal session' });
    }
  });

  // POST /api/terminal/:sessionId/input  (HTTP fallback)
  app.post('/api/terminal/:sessionId/input', express.text({ type: '*/*' }), (req, res) => {
    const session = terminalSessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    try { session.ptyProcess.write(req.body); session.lastActivity = Date.now(); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  // POST /api/terminal/:sessionId/resize
  app.post('/api/terminal/:sessionId/resize', jsonBody, (req, res) => {
    const session = terminalSessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const { cols, rows } = req.body;
    try { session.ptyProcess.resize(cols, rows); session.lastActivity = Date.now(); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  // DELETE /api/terminal/:sessionId
  app.delete('/api/terminal/:sessionId', (req, res) => {
    const session = terminalSessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    try { session.ptyProcess.kill(); terminalSessions.delete(req.params.sessionId); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Filesystem API — list directory and read file
  app.get('/api/fs/list', async (req, res) => {
    try {
      const rawPath = typeof req.query.path === 'string' ? req.query.path : WORKING_DIR;
      const targetPath = path.resolve(rawPath);
      const entries = await fs.promises.readdir(targetPath, { withFileTypes: true });
      const result = entries
        .filter(e => !['node_modules', '.git'].includes(e.name))
        .map(e => ({
          name: e.name,
          path: path.join(targetPath, e.name).replace(/\\/g, '/'),
          isDirectory: e.isDirectory(),
          isFile: e.isFile(),
        }));
      res.json({ directory: targetPath.replace(/\\/g, '/'), entries: result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/fs/read', async (req, res) => {
    try {
      const rawPath = typeof req.query.path === 'string' ? req.query.path : '';
      if (!rawPath) return res.status(400).json({ error: 'path required' });
      
      // Resolve to absolute path
      const targetPath = path.resolve(rawPath);
      
      // Check if it's an image file
      const ext = targetPath.split('.').pop()?.toLowerCase();
      const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'];
      
      if (ext && imageExts.includes(ext)) {
        // Serve as binary with proper content-type
        const content = await fs.promises.readFile(targetPath);
        const mimeTypes = {
          png: 'image/png',
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          gif: 'image/gif',
          svg: 'image/svg+xml',
          webp: 'image/webp',
          bmp: 'image/bmp',
          ico: 'image/x-icon'
        };
        res.type(mimeTypes[ext] || 'application/octet-stream').send(content);
      } else {
        // Serve as text
        const content = await fs.promises.readFile(targetPath, 'utf8');
        res.type('text/plain').send(content);
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/fs/rename', jsonBody, async (req, res) => {
    try {
      const { oldPath, newPath } = req.body;
      if (!oldPath || !newPath) return res.status(400).json({ error: 'oldPath and newPath required' });
      await fs.promises.rename(oldPath, newPath);
      res.json({ success: true, path: newPath.replace(/\\/g, '/') });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/fs/delete', jsonBody, async (req, res) => {
    try {
      const { path: targetPath } = req.body;
      if (!targetPath) return res.status(400).json({ error: 'path required' });
      const stat = await fs.promises.stat(targetPath);
      if (stat.isDirectory()) {
        await fs.promises.rm(targetPath, { recursive: true, force: true });
      } else {
        await fs.promises.unlink(targetPath);
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/fs/write', jsonBody, async (req, res) => {
    try {
      const { path: rawPath, content = '' } = req.body;
      if (!rawPath) return res.status(400).json({ error: 'path required' });
      const targetPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(WORKING_DIR, rawPath);
      console.log('[fs/write] writing to:', targetPath);
      fs.writeFileSync(targetPath, content, 'utf8');
      console.log('[fs/write] written successfully');
      res.json({ success: true, path: targetPath.replace(/\\/g, '/') });
    } catch (err) {
      console.log('[fs/write] error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/fs/mkdir', jsonBody, async (req, res) => {
    try {
      const { path: targetPath } = req.body;
      if (!targetPath) return res.status(400).json({ error: 'path required' });
      await fs.promises.mkdir(targetPath, { recursive: true });
      res.json({ success: true, path: targetPath.replace(/\\/g, '/') });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Quick-save endpoint — saves response to Quick-save folder
  app.post('/api/fs/quick-save', jsonBody, async (req, res) => {
    try {
      const { content, filename } = req.body;
      if (!content || !filename) return res.status(400).json({ error: 'content and filename required' });
      
      const quickSaveDir = path.join(currentWorkingDir, 'Quick-save');
      
      // Create Quick-save folder if it doesn't exist
      await fs.promises.mkdir(quickSaveDir, { recursive: true });
      
      // Save the file
      const filePath = path.join(quickSaveDir, filename);
      await fs.promises.writeFile(filePath, content, 'utf8');
      
      res.json({ success: true, path: filePath.replace(/\\/g, '/') });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Git status — returns modified/added/deleted files relative to working dir
  app.get('/api/git/status', async (req, res) => {
    const dir = typeof req.query.dir === 'string' ? req.query.dir : WORKING_DIR;
    try {
      const result = await new Promise((resolve, reject) => {
        const proc = spawn('git', ['status', '--porcelain', '-u'], { cwd: dir });
        let out = '';
        proc.stdout.on('data', d => { out += d.toString(); });
        proc.stderr.on('data', () => {});
        proc.on('close', code => {
          if (code !== 0 && code !== 1) return reject(new Error('git not available or not a repo'));
          resolve(out);
        });
        proc.on('error', reject);
      });
      // Parse porcelain output: "XY filename"
      const files = {};
      for (const line of result.trim().split('\n')) {
        if (!line.trim()) continue;
        // Get first 2 chars for status XY
        const xy = line.slice(0, 2);
        // Get everything after the first 2 chars and any leading whitespace
        let file = line.slice(2).trim().replace(/^"(.*)"$/, '$1');
        const index = xy[0].trim();
        const workdir = xy[1].trim();
        // Normalize path separators
        const normFile = file.replace(/\\/g, '/');
        files[normFile] = { index: index || ' ', workdir: workdir || ' ' };
      }
      res.json({ isRepo: true, files });
    } catch {
      res.json({ isRepo: false, files: {} });
    }
  });

  // Git init
  app.post('/api/git/init', jsonBody, async (req, res) => {
    const { dir } = req.body;
    const targetDir = dir || WORKING_DIR;
    try {
      await new Promise((resolve, reject) => {
        const proc = spawn('git', ['init'], { cwd: targetDir });
        proc.on('close', code => code === 0 ? resolve() : reject(new Error('git init failed')));
        proc.on('error', reject);
      });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Git branch — current branch name
  app.get('/api/git/branch', async (req, res) => {
    const dir = typeof req.query.dir === 'string' ? req.query.dir : WORKING_DIR;
    try {
      const branch = await new Promise((resolve, reject) => {
        const proc = spawn('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: dir });
        let out = '';
        proc.stdout.on('data', d => { out += d.toString(); });
        proc.on('close', code => code === 0 ? resolve(out.trim()) : reject(new Error('not a repo')));
        proc.on('error', reject);
      });
      res.json({ branch });
    } catch { res.json({ branch: null }); }
  });

  // Git log — recent commits
  app.get('/api/git/log', async (req, res) => {
    const dir = typeof req.query.dir === 'string' ? req.query.dir : WORKING_DIR;
    const n = parseInt(req.query.n) || 10;
    try {
      const out = await new Promise((resolve, reject) => {
        const proc = spawn('git', ['log', `--max-count=${n}`, '--pretty=format:%H|%s|%an|%ar'], { cwd: dir });
        let data = '';
        proc.stdout.on('data', d => { data += d.toString(); });
        proc.on('close', code => code === 0 ? resolve(data) : reject(new Error('git log failed')));
        proc.on('error', reject);
      });
      const commits = out.trim().split('\n').filter(Boolean).map(line => {
        const [hash, subject, author, date] = line.split('|');
        return { hash, subject, author, date };
      });
      res.json(commits);
    } catch { res.json([]); }
  });

  // Git stage file
  app.post('/api/git/stage', jsonBody, async (req, res) => {
    const { dir, file } = req.body;
    const targetDir = dir || WORKING_DIR;
    try {
      await new Promise((resolve, reject) => {
        const proc = spawn('git', ['add', file], { cwd: targetDir });
        proc.on('close', code => code === 0 ? resolve() : reject(new Error('git add failed')));
        proc.on('error', reject);
      });
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Git unstage file
  app.post('/api/git/unstage', jsonBody, async (req, res) => {
    const { dir, file } = req.body;
    const targetDir = dir || WORKING_DIR;
    try {
      await new Promise((resolve, reject) => {
        const proc = spawn('git', ['restore', '--staged', file], { cwd: targetDir });
        proc.on('close', code => code === 0 ? resolve() : reject(new Error('git restore failed')));
        proc.on('error', reject);
      });
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Git revert file (discard changes)
  app.post('/api/git/revert', jsonBody, async (req, res) => {
    const { dir, file } = req.body;
    const targetDir = dir || WORKING_DIR;
    try {
      await new Promise((resolve, reject) => {
        const proc = spawn('git', ['restore', file], { cwd: targetDir });
        proc.on('close', code => code === 0 ? resolve() : reject(new Error('git restore failed')));
        proc.on('error', reject);
      });
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Git config — get/set user identity
  app.get('/api/git/config', async (req, res) => {
    const dir = typeof req.query.dir === 'string' ? req.query.dir : WORKING_DIR;
    const getVal = (key) => new Promise(resolve => {
      const proc = spawn('git', ['config', key], { cwd: dir });
      let out = '';
      proc.stdout.on('data', d => { out += d.toString(); });
      proc.on('close', () => resolve(out.trim() || null));
      proc.on('error', () => resolve(null));
    });
    const [name, email] = await Promise.all([getVal('user.name'), getVal('user.email')]);
    res.json({ name, email });
  });

  app.post('/api/git/config', jsonBody, async (req, res) => {
    const { dir, name, email, global: isGlobal } = req.body;
    const targetDir = dir || WORKING_DIR;
    const scope = isGlobal ? ['--global'] : [];
    try {
      if (name) await new Promise((resolve, reject) => {
        const proc = spawn('git', [...scope, 'config', 'user.name', name], { cwd: targetDir });
        proc.on('close', code => code === 0 ? resolve() : reject(new Error('failed')));
        proc.on('error', reject);
      });
      if (email) await new Promise((resolve, reject) => {
        const proc = spawn('git', [...scope, 'config', 'user.email', email], { cwd: targetDir });
        proc.on('close', code => code === 0 ? resolve() : reject(new Error('failed')));
        proc.on('error', reject);
      });
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Git commit
  app.post('/api/git/commit', jsonBody, async (req, res) => {
    const { dir, message, authorName, authorEmail } = req.body;
    const targetDir = dir || WORKING_DIR;
    if (!message) return res.status(400).json({ error: 'message required' });
    try {
      const output = await new Promise((resolve, reject) => {
        const env = { ...process.env };
        if (authorName) env.GIT_AUTHOR_NAME = env.GIT_COMMITTER_NAME = authorName;
        if (authorEmail) env.GIT_AUTHOR_EMAIL = env.GIT_COMMITTER_EMAIL = authorEmail;
        const proc = spawn('git', ['commit', '-m', message], { cwd: targetDir, env });
        let out = '', err = '';
        proc.stdout.on('data', d => { out += d.toString(); });
        proc.stderr.on('data', d => { err += d.toString(); });
        proc.on('close', code => code === 0 ? resolve(out) : reject(new Error(err || out || 'git commit failed')));
        proc.on('error', reject);
      });
      res.json({ success: true, output });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Git push
  app.post('/api/git/push', jsonBody, async (req, res) => {
    const { dir } = req.body;
    const targetDir = dir || WORKING_DIR;
    try {
      const out = await new Promise((resolve, reject) => {
        const proc = spawn('git', ['push'], { cwd: targetDir });
        let data = '';
        proc.stderr.on('data', d => { data += d.toString(); });
        proc.stdout.on('data', d => { data += d.toString(); });
        proc.on('close', code => code === 0 ? resolve(data) : reject(new Error(data || 'git push failed')));
        proc.on('error', reject);
      });
      res.json({ success: true, output: out });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Git pull
  app.post('/api/git/pull', jsonBody, async (req, res) => {
    const { dir } = req.body;
    const targetDir = dir || WORKING_DIR;
    try {
      const out = await new Promise((resolve, reject) => {
        const proc = spawn('git', ['pull'], { cwd: targetDir });
        let data = '';
        proc.stderr.on('data', d => { data += d.toString(); });
        proc.stdout.on('data', d => { data += d.toString(); });
        proc.on('close', code => code === 0 ? resolve(data) : reject(new Error(data || 'git pull failed')));
        proc.on('error', reject);
      });
      res.json({ success: true, output: out });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Git diff stat for a file — returns additions/deletions count
  app.get('/api/git/diffstat', async (req, res) => {
    const dir = typeof req.query.dir === 'string' ? req.query.dir : WORKING_DIR;
    const file = typeof req.query.file === 'string' ? req.query.file : '';
    if (!file) return res.status(400).json({ error: 'file required' });
    try {
      const out = await new Promise((resolve, reject) => {
        const proc = spawn('git', ['diff', '--numstat', 'HEAD', '--', file], { cwd: dir });
        let data = '';
        proc.stdout.on('data', d => { data += d.toString(); });
        proc.on('close', () => resolve(data));
        proc.on('error', reject);
      });
      // Output format: "additions\t deletions\tfilename"
      const match = out.trim().match(/^(\d+|-)\s+(\d+|-)\s+/);
      if (match) {
        const additions = match[1] === '-' ? 0 : parseInt(match[1], 10);
        const deletions = match[2] === '-' ? 0 : parseInt(match[2], 10);
        res.json({ additions, deletions });
      } else {
        res.json({ additions: 0, deletions: 0 });
      }
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Git diff for a file
  app.get('/api/git/diff', async (req, res) => {
    const dir = typeof req.query.dir === 'string' ? req.query.dir : WORKING_DIR;
    const file = typeof req.query.file === 'string' ? req.query.file : '';
    if (!file) return res.status(400).json({ error: 'file required' });
    try {
      const out = await new Promise((resolve, reject) => {
        const proc = spawn('git', ['diff', 'HEAD', '--', file], { cwd: dir });
        let data = '';
        proc.stdout.on('data', d => { data += d.toString(); });
        proc.on('close', () => resolve(data));
        proc.on('error', reject);
      });
      res.type('text/plain').send(out);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // File search — recursive find matching name pattern
  app.get('/api/fs/search', async (req, res) => {
    const dir = typeof req.query.dir === 'string' ? req.query.dir : WORKING_DIR;
    const query = typeof req.query.q === 'string' ? req.query.q.toLowerCase() : '';
    if (!query) return res.json([]);

    const IGNORED = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__']);
    const results = [];
    const MAX = 50;

    async function walk(dirPath, depth) {
      if (depth > 8 || results.length >= MAX) return;
      let entries;
      try { entries = await fs.promises.readdir(dirPath, { withFileTypes: true }); }
      catch { return; }
      for (const e of entries) {
        if (results.length >= MAX) break;
        if (IGNORED.has(e.name)) continue;
        const fullPath = path.join(dirPath, e.name).replace(/\\/g, '/');
        if (e.isDirectory()) {
          await walk(fullPath, depth + 1);
        } else if (e.name.toLowerCase().includes(query)) {
          const rel = fullPath.replace(dir.replace(/\\/g, '/') + '/', '');
          results.push({ name: e.name, path: fullPath, relativePath: rel });
        }
      }
    }

    await walk(dir, 0);
    res.json(results);
  });

  // Question API endpoints - call OpenCode with correct path format
  // OpenCode expects: POST /question/:requestID/reply with body { answers: [[...]] }
  app.post('/api/question/reply', jsonBody, async (req, res) => {
    try {
      const { sessionID, requestID, answers, directory } = req.body;
      console.log('[question/reply] Received:', { sessionID, requestID, answers, directory });
      
      if (!requestID || !answers) {
        return res.status(400).json({ error: 'Missing requestID or answers' });
      }
      
      // OpenCode endpoint: /question/:requestID/reply
      const url = `http://${OPENCODE_HOST}:${OPENCODE_PORT}/question/${requestID}/reply`;
      console.log('[question/reply] Calling:', url);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(directory ? { 'x-opencode-directory': directory } : {})
        },
        body: JSON.stringify({ answers })
      });
      
      console.log('[question/reply] Response status:', response.status);
      const text = await response.text();
      console.log('[question/reply] Response:', text.substring(0, 500));
      
      if (response.ok) {
        try {
          const data = JSON.parse(text);
          return res.json(data);
        } catch {
          // Return success even if response isn't JSON
          return res.json({ success: true });
        }
      } else {
        console.error('[question/reply] Error response:', text);
        return res.status(response.status).json({ error: text });
      }
    } catch (error) {
      console.error('[question/reply] error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/question/reject', jsonBody, async (req, res) => {
    try {
      const { sessionID, requestID, directory } = req.body;
      console.log('[question/reject] Received:', { sessionID, requestID, directory });
      
      if (!requestID) {
        return res.status(400).json({ error: 'Missing requestID' });
      }
      
      // OpenCode endpoint: /question/:requestID/reject
      const url = `http://${OPENCODE_HOST}:${OPENCODE_PORT}/question/${requestID}/reject`;
      console.log('[question/reject] Calling:', url);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(directory ? { 'x-opencode-directory': directory } : {})
        },
        body: JSON.stringify({})
      });
      
      console.log('[question/reject] Response status:', response.status);
      const text = await response.text();
      console.log('[question/reject] Response:', text.substring(0, 500));
      
      if (response.ok) {
        try {
          const data = JSON.parse(text);
          return res.json(data);
        } catch {
          // Return success even if response isn't JSON
          return res.json({ success: true });
        }
      } else {
        console.error('[question/reject] Error response:', text);
        return res.status(response.status).json({ error: text });
      }
    } catch (error) {
      console.error('[question/reject] error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Permission API endpoints
  app.post('/api/permission/reply', jsonBody, async (req, res) => {
    try {
      const { sessionID, requestID, reply, directory } = req.body;
      console.log('[permission/reply] Received:', { sessionID, requestID, reply, directory });

      if (!requestID || !reply) {
        return res.status(400).json({ error: 'requestID and reply required' });
      }

      // OpenCode endpoint: /permission/:requestID/reply
      const url = `http://${OPENCODE_HOST}:${OPENCODE_PORT}/permission/${requestID}/reply`;
      console.log('[permission/reply] Calling:', url);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(directory ? { 'x-opencode-directory': directory } : {})
        },
        body: JSON.stringify({ reply })
      });

      console.log('[permission/reply] Response status:', response.status);
      const text = await response.text();

      if (response.ok) {
        try {
          res.json(text ? JSON.parse(text) : { success: true });
        } catch {
          res.json({ success: true });
        }
      } else {
        res.status(response.status).send(text);
      }
    } catch (error) {
      console.error('[permission/reply] error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Config routes — handle locally before proxy
  const CONFIG_PATH = path.join(PROJECT_ROOT, '.opencode', 'opencode.jsonc');

  function parseJsonc(content) {
    return JSON.parse(content);
  }

  function readConfig() {
    try {
      if (!fs.existsSync(CONFIG_PATH)) {
        console.log('Config file not found at:', CONFIG_PATH);
        return {};
      }
      const content = fs.readFileSync(CONFIG_PATH, 'utf8');
      return parseJsonc(content);
    } catch (e) {
      console.log('Read config error:', e.message, 'at:', CONFIG_PATH);
      return {};
    }
  }

  async function writeConfig(data) {
    try {
      // Use async writeFile to avoid Bun sync bug on Windows
      const json = JSON.stringify(data, null, 2);
      await fs.promises.writeFile(CONFIG_PATH, json, 'utf8');
      console.log('[Config] Successfully wrote config');
    } catch (error) {
      console.error('Failed to write config:', error);
      throw error;
    }
  }

  app.get('/api/config/mcp', (req, res) => {
    console.log('[API] GET /api/config/mcp');
    const config = readConfig();
    console.log('[API] Config loaded:', config);
    const mcp = config.mcp || {};
    const servers = Object.entries(mcp).map(([name, cfg]) => ({ name, ...cfg }));
    console.log('[API] MCP servers:', servers);
    res.json(servers);
  });

  // MCP status — proxy to OpenCode
  app.get('/api/mcp/status', async (req, res) => {
    try {
      const response = await fetch(`http://${OPENCODE_HOST}:${OPENCODE_PORT}/mcp`, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to get MCP status' });
      }
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error('[MCP status] Error:', error);
      res.status(500).json({ error: error.message || 'Failed to get MCP status' });
    }
  });

  // MCP connect — proxy to OpenCode
  app.post('/api/mcp/:name/connect', async (req, res) => {
    try {
      const { name } = req.params;
      const response = await fetch(`http://${OPENCODE_HOST}:${OPENCODE_PORT}/mcp/${name}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Connection failed' }));
        return res.status(response.status).json(error);
      }
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error(`[MCP connect] Error for ${req.params.name}:`, error);
      res.status(500).json({ error: error.message || 'Connection failed' });
    }
  });

  // MCP disconnect — proxy to OpenCode
  app.post('/api/mcp/:name/disconnect', async (req, res) => {
    try {
      const { name } = req.params;
      const response = await fetch(`http://${OPENCODE_HOST}:${OPENCODE_PORT}/mcp/${name}/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Disconnect failed' }));
        return res.status(response.status).json(error);
      }
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error(`[MCP disconnect] Error for ${req.params.name}:`, error);
      res.status(500).json({ error: error.message || 'Disconnect failed' });
    }
  });

  app.get('/api/config/mcp/:name', (req, res) => {
    const { name } = req.params;
    const config = readConfig();
    const server = config.mcp?.[name];
    if (server) {
      res.json({ name, ...server });
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  });

  app.post('/api/config/mcp/:name', jsonBody, async (req, res) => {
    try {
      const { name } = req.params;
      const config = readConfig();
      config.mcp = config.mcp || {};
      const { name: _, ...serverConfig } = req.body;
      config.mcp[name] = serverConfig;
      await writeConfig(config);
      // Reload MCP servers without disrupting UI
      fetch(`http://localhost:${OPENCODE_PORT}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mcp: config.mcp }),
      }).catch(err => console.error('[MCP reload] Failed to reload MCP:', err));
      res.json({ success: true });
    } catch (error) {
      console.error('[API] POST /api/config/mcp error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.patch('/api/config/mcp/:name', jsonBody, async (req, res) => {
    try {
      const { name } = req.params;
      console.log('[API] PATCH /api/config/mcp/' + name, req.body);
      const config = readConfig();
      if (config.mcp?.[name]) {
        // Remove 'name' field from body before merging (name is the key, not a field)
        const { name: _, ...updates } = req.body;
        const updated = { ...config.mcp[name], ...updates };
        console.log('[API] Updated MCP:', updated);
        config.mcp[name] = updated;
        await writeConfig(config);
        // Reload MCP servers without disrupting UI
        fetch(`http://localhost:${OPENCODE_PORT}/mcp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mcp: config.mcp }),
        }).catch(err => console.error('[MCP reload] Failed to reload MCP:', err));
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'Not found' });
      }
    } catch (error) {
      console.error('[API] PATCH /api/config/mcp error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/config/mcp/:name', async (req, res) => {
    try {
      const { name } = req.params;
      const config = readConfig();
      if (config.mcp?.[name]) {
        delete config.mcp[name];
        await writeConfig(config);
        // Reload MCP servers without disrupting UI
        fetch(`http://localhost:${OPENCODE_PORT}/mcp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mcp: config.mcp }),
        }).catch(err => console.error('[MCP reload] Failed to reload MCP:', err));
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'Not found' });
      }
    } catch (error) {
      console.error('[API] DELETE /api/config/mcp error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/config/providers', (req, res) => {
    // Return default providers
    res.json([
      { id: 'openai', name: 'OpenAI', type: 'openai' },
      { id: 'anthropic', name: 'Anthropic', type: 'anthropic' },
      { id: 'ollama', name: 'Ollama', type: 'ollama' },
    ]);
  });

  // Commands management
  app.get('/api/config/commands', (req, res) => {
    try {
      const commandsDir = path.join(PROJECT_ROOT, '.opencode', 'commands');
      if (!fs.existsSync(commandsDir)) return res.json([]);
      const files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.md'));
      const commands = files.map(f => {
        const content = fs.readFileSync(path.join(commandsDir, f), 'utf8');
        const lines = content.split('\n');
        const frontmatter = {};
        let inFrontmatter = false;
        let bodyStart = 0;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.trim() === '---') {
            if (!inFrontmatter) {
              inFrontmatter = true;
            } else {
              bodyStart = i + 1;
              break;
            }
          } else if (inFrontmatter) {
            const colon = line.indexOf(':');
            if (colon > 0) {
              const key = line.slice(0, colon).trim();
              const value = line.slice(colon + 1).trim();
              frontmatter[key] = value;
            }
          }
        }
        return {
          file: f,
          name: frontmatter.name || f.replace('.md', ''),
          description: frontmatter.description || '',
          agent: frontmatter.agent || 'build',
          content: lines.slice(bodyStart).join('\n').trim(),
        };
      });
      res.json(commands);
    } catch (e) {
      res.json([]);
    }
  });

  app.post('/api/config/commands/:file', jsonBody, async (req, res) => {
    try {
      const { file } = req.params;
      const { name, description, agent, content } = req.body;
      const commandsDir = path.join(PROJECT_ROOT, '.opencode', 'commands');
      if (!fs.existsSync(commandsDir)) fs.mkdirSync(commandsDir, { recursive: true });
      const filePath = path.join(commandsDir, file);
      const frontmatter = `---
name: ${name}
description: ${description}
agent: ${agent}
---

${content}`;
      fs.writeFileSync(filePath, frontmatter, 'utf8');
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/config/commands/:file', async (req, res) => {
    try {
      const { file } = req.params;
      const commandsDir = path.join(PROJECT_ROOT, '.opencode', 'commands');
      const filePath = path.join(commandsDir, file);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Custom providers CRUD — stored in opencode.jsonc under "provider" key
  app.get('/api/config/providers/custom', (req, res) => {
    try {
      const config = readConfig();
      const provider = config.provider || {};
      const list = Object.entries(provider).map(([id, cfg]) => ({
        name: id,
        displayName: cfg.name || id,
        npm: cfg.npm || '@ai-sdk/openai-compatible',
        baseUrl: cfg.options?.baseURL || '',
        apiKey: cfg.options?.apiKey || '',
        models: Object.keys(cfg.models || {}),
        environment: cfg.environment || {},
      }));
      res.json(list);
    } catch (e) {
      res.json([]);
    }
  });

  app.post('/api/config/providers/custom/:name', jsonBody, async (req, res) => {
    try {
      const { name } = req.params;
      const { displayName, npm, baseUrl, apiKey, models, environment } = req.body;
      const config = readConfig();
      config.provider = config.provider || {};

      // Build models object: { "model-id": { "name": "model-id" } }
      const modelsObj = {};
      if (Array.isArray(models)) {
        for (const m of models) {
          modelsObj[m] = { name: m };
        }
      }

      const entry = {
        name: displayName || name,
        npm: npm || '@ai-sdk/openai-compatible',
        options: { baseURL: baseUrl, ...(apiKey ? { apiKey } : {}) },
        models: modelsObj,
        ...(environment && Object.keys(environment).length > 0 ? { environment } : {}),
      };

      config.provider[name] = entry;
      await writeConfig(config);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/config/providers/custom/:name', async (req, res) => {
    try {
      const { name } = req.params;
      const config = readConfig();
      if (config.provider?.[name]) {
        delete config.provider[name];
        if (Object.keys(config.provider).length === 0) delete config.provider;
        await writeConfig(config);
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });



  // Do NOT use express.json() before the proxy — it consumes the request body
  // and the proxy can no longer forward it, causing "Malformed JSON" errors upstream.
  // Body parsing is only needed for routes that don't go through the proxy.

  setupProxy(app);

  // Serve built frontend in production (when dist/ exists)
  const distPath = path.join(PROJECT_ROOT, 'dist');
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    // SPA fallback — serve index.html for all non-API routes
    app.get('/{*path}', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/health') || req.path.startsWith('/config')) return next();
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  try {
    await startOpenCode();
    console.log('OpenCode started');
  } catch (error) {
    console.error('Failed to start OpenCode:', error);
    process.exit(1);
  }

  const server = createServer(app);
  console.log('Created server, about to listen on port', PORT);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server at http://0.0.0.0:${PORT}`);
  });
  
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} already in use. Kill existing process or change PORT in .env`);
    } else {
      console.error('Server error:', err);
    }
  });

  // Handle WebSocket upgrade after server is created
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname === TERMINAL_WS_PATH) {
      terminalWss.handleUpgrade(request, socket, head, (ws) => {
        terminalWss.emit('connection', ws, request);
      });
    }
  });
}

start();