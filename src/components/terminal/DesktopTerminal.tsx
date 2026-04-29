import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Ghostty, Terminal, FitAddon } from 'ghostty-web';
import { getTerminalSessionForDir, setTerminalSessionForDir, stopTerminalForDir } from '../../utils/helpers';

export function DesktopTerminal({ workingDir }: { workingDir: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const termSessionIdRef = useRef<string | null>(null);
  const pendingWriteRef = useRef('');
  const writeScheduledRef = useRef<number | null>(null);
  const isWritingRef = useRef(false);
  const lastThemeRef = useRef<string | null>(localStorage.getItem('oc_theme'));
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getTheme = () => {
    const s = getComputedStyle(document.documentElement);
    const v = (k: string, fb: string) => s.getPropertyValue(k).trim() || fb;
    return {
      background: v('--bg','#1a1a1a'), foreground: v('--text-2','#e0e0e0'),
      cursor: v('--accent','#7c6af7'), cursorAccent: v('--bg','#1a1a1a'),
      selectionBackground: v('--accent','#7c6af7'),
      black: v('--text-5','#444'), red: v('--red','#f87171'),
      green: v('--green','#4ade80'), yellow: v('--yellow','#facc15'),
      blue: v('--blue','#60a5fa'), magenta: v('--accent','#7c6af7'),
      cyan: '#22d3ee', white: v('--text-2','#e0e0e0'),
      brightBlack: v('--text-4','#666'), brightRed: v('--red','#f87171'),
      brightGreen: v('--green','#4ade80'), brightYellow: v('--yellow','#facc15'),
      brightBlue: v('--blue','#60a5fa'), brightMagenta: v('--accent','#7c6af7'),
      brightCyan: '#67e8f9', brightWhite: '#ffffff',
    };
  };

  const flushWrites = useCallback(() => {
    if (isWritingRef.current) return;
    const term = terminalRef.current;
    if (!term || !pendingWriteRef.current) return;
    const chunk = pendingWriteRef.current;
    pendingWriteRef.current = '';
    isWritingRef.current = true;
    term.write(chunk, () => {
      isWritingRef.current = false;
      if (pendingWriteRef.current) {
        writeScheduledRef.current = requestAnimationFrame(() => { writeScheduledRef.current = null; flushWrites(); });
      }
    });
  }, []);

  const enqueueWrite = useCallback((data: string) => {
    if (!data) return;
    pendingWriteRef.current += data;
    if (writeScheduledRef.current === null) {
      writeScheduledRef.current = requestAnimationFrame(() => { writeScheduledRef.current = null; flushWrites(); });
    }
  }, [flushWrites]);

  const fitTerminal = useCallback(() => {
    const fit = fitAddonRef.current;
    const term = terminalRef.current;
    const container = containerRef.current;
    if (!fit || !term || !container) return;
    const { width, height } = container.getBoundingClientRect();
    if (width < 24 || height < 24) return;
    try {
      fit.fit();
      const id = termSessionIdRef.current;
      if (id) fetch(`/api/terminal/${id}/resize`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cols: term.cols, rows: term.rows }),
      }).catch(() => {});
    } catch { /* ignored */ }
  }, []);

  // Update theme when it changes
  useEffect(() => {
    const updateTheme = () => {
      if (terminalRef.current) {
        const newTheme = getTheme();
        terminalRef.current.options.theme = newTheme;
      }
    };

    const interval = setInterval(() => {
      const stored = localStorage.getItem('oc_theme');
      if (stored !== lastThemeRef.current) {
        lastThemeRef.current = stored;
        updateTheme();
      }
    }, 500);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let socket: WebSocket | null = null;

    const initialize = async () => {
      try {
        if (disposed) return;

        // Check if we already have a session for this directory
        let termId = getTerminalSessionForDir(workingDir);

        if (!termId) {
          // Create new session
          const createRes = await fetch('/api/terminal/create', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cols: 80, rows: 24, cwd: workingDir }),
          });
          if (!createRes.ok) throw new Error('Failed to create session');
          const { sessionId } = await createRes.json();
          termId = sessionId;
          setTerminalSessionForDir(workingDir, termId);
        }

        if (disposed) return;

        termSessionIdRef.current = termId;

        const ghostty = await Ghostty.load();

        const terminal = new Terminal({
          cursorBlink: true,
          fontSize: 13,
          fontFamily: '"IBM Plex Mono","JetBrainsMonoNL Nerd Font","FiraCode Nerd Font","JetBrains Mono","Fira Code",monospace',
          scrollback: 10_000,
          theme: getTheme(),
          ghostty,
        });
        const fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);
        terminal.open(container);
        terminalRef.current = terminal;
        fitAddonRef.current = fitAddon;

        try { fitAddon.fit(); } catch {}
        await new Promise(r => window.setTimeout(r, 0));
        try { fitAddon.fit(); } catch {}
        const ro = new ResizeObserver(() => fitTerminal());
        ro.observe(container);
        terminal.onData((data: string) => {
          if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(data);
        });
        container.addEventListener('mouseup', () => {
          const selection = terminal.getSelection();
          if (selection) navigator.clipboard.writeText(selection).catch(() => {});
        });

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        socket = new WebSocket(`${protocol}//${window.location.host}/api/terminal/ws`);
        socket.binaryType = 'arraybuffer';
        wsRef.current = socket;

        // openchamber protocol: send binary bind frame on open
        const sendBind = () => {
          const json = JSON.stringify({ t: 'b', s: termId, v: 2 });
          const jsonBytes = new TextEncoder().encode(json);
          const frame = new Uint8Array(jsonBytes.length + 1);
          frame[0] = 0x01;
          frame.set(jsonBytes, 1);
          socket!.send(frame);
        };

        socket.onopen = () => { if (!disposed) sendBind(); };
        socket.onclose = () => { if (!disposed) { setConnected(false); wsRef.current = null; enqueueWrite('\r\n\x1b[31m[Disconnected]\x1b[0m\r\n'); } };
        socket.onerror = () => { if (!disposed) setError('Connection failed'); };
        socket.onmessage = (e) => {
          if (disposed) return;
          if (e.data instanceof ArrayBuffer) {
            const bytes = new Uint8Array(e.data);
            if (bytes[0] === 0x01) {
              try {
                const ctrl = JSON.parse(new TextDecoder().decode(bytes.subarray(1)));
                if (ctrl.t === 'bok') { setConnected(true); setError(null); terminal.focus(); }
                if (ctrl.t === 'x') enqueueWrite('\r\n\x1b[31m[Process exited]\x1b[0m\r\n');
              } catch {}
            }
            return;
          }
          enqueueWrite(typeof e.data === 'string' ? e.data : '');
        };
        return () => ro.disconnect();
      } catch (e) {
        if (!disposed) setError(e instanceof Error ? e.message : 'Failed to start terminal');
      }
    };

    initialize();
    return () => {
      disposed = true;
      if (writeScheduledRef.current !== null) cancelAnimationFrame(writeScheduledRef.current);
      socket?.close();
      wsRef.current = null;
      terminalRef.current?.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      // Don't delete server session on unmount - let it persist for reuse
      // Only clear local references
      termSessionIdRef.current = null;
      pendingWriteRef.current = '';
      isWritingRef.current = false;
    };
  }, [workingDir, enqueueWrite, fitTerminal]);

  const handleStopTerminal = useCallback(async () => {
    if (termSessionIdRef.current) {
      await stopTerminalForDir(workingDir);
      // Reset local state
      setConnected(false);
      setError(null);
      termSessionIdRef.current = null;
    }
  }, [workingDir]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', padding: '16px', border: '1px solid var(--border-2)', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
      <div style={{ padding: '5px 12px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text-4)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: connected ? 'var(--green)' : error ? 'var(--red)' : 'var(--text-5)', boxShadow: connected ? '0 0 5px var(--green)' : 'none' }} />
        <span style={{ flex: 1 }}>{connected ? 'Terminal' : error ?? 'Connecting…'}</span>
        {connected && (
          <button
            onClick={handleStopTerminal}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-2)',
              color: 'var(--text-4)',
              padding: '2px 6px',
              borderRadius: 4,
              fontSize: 10,
              cursor: 'pointer',
              opacity: 0.7,
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
            title="Stop terminal"
          >
            ✕
          </button>
        )}
      </div>
      <div ref={containerRef} style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' }} />
    </div>
  );
}