import fs from 'fs';
import express from 'express';
import {
  getPtyProvider, spawnPtyWithFallback, wireSession, sanitizeTerminalEnv,
  terminalSessions, terminalWsConnections, sendControl,
  setupTerminalWebSocketServer,
  readTerminalWsControlFrame,
  createReplayBuffer, replayChunksSince, normalizeToText,
  terminalTransportCapabilities, terminalRuntimeName,
  TERMINAL_CONSTANTS, TERMINAL_WS_PATH,
} from '../lib/terminal.js';
import { getState } from '../lib/opencode-process.js';

const {
  MAX_TERMINAL_SESSIONS, TERMINAL_IDLE_TIMEOUT,
  TERMINAL_INPUT_WS_HEARTBEAT_INTERVAL_MS,
  TERMINAL_INPUT_WS_REBIND_WINDOW_MS, TERMINAL_INPUT_WS_MAX_REBINDS_PER_WINDOW,
} = TERMINAL_CONSTANTS;

export default function registerTerminalRoutes(app) {
  const terminalWss = setupTerminalWebSocketServer();

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
        if (ctrl.t === 'p') { sendControl(socket, { t: 'po', v: 2 }); return; }
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
          const since = conn.replayCursorBySession.get(conn.boundSessionId) ?? 0;
          for (const c of replayChunksSince(session.replayBuffer, since)) {
            try { socket.send(c.data); conn.replayCursorBySession.set(conn.boundSessionId, c.id); } catch { break; }
          }
          return;
        }
        sendControl(socket, { t: 'e', c: 'BAD_FRAME', f: false });
        return;
      }

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

  app.post('/api/terminal/create', express.json(), async (req, res) => {
    try {
      if (terminalSessions.size >= MAX_TERMINAL_SESSIONS)
        return res.status(429).json({ error: 'Maximum terminal sessions reached' });

      const { cols, rows, cwd } = req.body || {};
      const { currentWorkingDir } = getState();
      const terminalCwd = cwd || currentWorkingDir;

      if (!terminalCwd) return res.status(400).json({ error: 'cwd is required' });
      try { await fs.promises.access(terminalCwd); }
      catch { return res.status(400).json({ error: 'Invalid working directory' }); }

      const sessionId = Math.random().toString(36).substring(2, 15) +
                        Math.random().toString(36).substring(2, 15);
      const resolvedEnv = sanitizeTerminalEnv({ ...process.env });
      const ptyProvider = await getPtyProvider();
      const { ptyProcess, shell } = spawnPtyWithFallback(ptyProvider, {
        cols, rows, cwd: terminalCwd, env: resolvedEnv,
      });

      const session = {
        ptyProcess, ptyBackend: ptyProvider.backend,
        cwd: terminalCwd, lastActivity: Date.now(),
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

  app.post('/api/terminal/:sessionId/input', express.text({ type: '*/*' }), (req, res) => {
    const session = terminalSessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    try { session.ptyProcess.write(req.body); session.lastActivity = Date.now(); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/terminal/:sessionId/resize', express.json(), (req, res) => {
    const session = terminalSessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const { cols, rows } = req.body;
    try { session.ptyProcess.resize(cols, rows); session.lastActivity = Date.now(); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.delete('/api/terminal/:sessionId', (req, res) => {
    const session = terminalSessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    try { session.ptyProcess.kill(); terminalSessions.delete(req.params.sessionId); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  return terminalWss;
}
