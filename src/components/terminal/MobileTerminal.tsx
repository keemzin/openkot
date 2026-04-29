import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { getTerminalSessionForDir, setTerminalSessionForDir, stopTerminalForDir } from '../../utils/helpers';

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

const QUICKKEYS_H = 44;
const STATUS_BAR_H = 26;

export function MobileTerminal({ workingDir }: { workingDir: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const termSessionIdRef = useRef<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState(13);

  // availableH = visual viewport height minus this component's top offset.
  // This correctly accounts for the app header + tab bar above us.
  const [availableH, setAvailableH] = useState(400);

  useEffect(() => {
    const measure = () => {
      const vv = window.visualViewport;
      const vpH = vv ? vv.height : window.innerHeight;
      const el = rootRef.current;
      if (!el) { setAvailableH(vpH); return; }
      // getBoundingClientRect().top gives us how far down the page this element starts
      const top = el.getBoundingClientRect().top;
      setAvailableH(Math.max(200, vpH - top));
    };

    measure();

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', measure);
      vv.addEventListener('scroll', measure);
    }
    window.addEventListener('resize', measure);

    return () => {
      if (vv) {
        vv.removeEventListener('resize', measure);
        vv.removeEventListener('scroll', measure);
      }
      window.removeEventListener('resize', measure);
    };
  }, []);

  // Re-fit xterm whenever available height changes
  useEffect(() => {
    requestAnimationFrame(() => { try { fitAddonRef.current?.fit(); } catch {} });
  }, [availableH]);

  const sendInput = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(data);
  }, []);

  // Pinch-to-zoom
  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    let lastDist = 0, pinching = false;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onTS = (e: TouchEvent) => { if (e.touches.length === 2) { pinching = true; lastDist = dist(e.touches); } else pinching = false; };
    const onTM = (e: TouchEvent) => {
      if (!pinching || e.touches.length !== 2) return;
      e.preventDefault();
      const d = dist(e.touches); const delta = d - lastDist; lastDist = d;
      if (Math.abs(delta) > 1) setFontSize(p => Math.min(24, Math.max(9, p + delta * 0.04)));
    };
    const onTE = () => { pinching = false; };
    el.addEventListener('touchstart', onTS, { passive: true });
    el.addEventListener('touchmove', onTM, { passive: false });
    el.addEventListener('touchend', onTE);
    return () => { el.removeEventListener('touchstart', onTS); el.removeEventListener('touchmove', onTM); el.removeEventListener('touchend', onTE); };
  }, []);

  // Single-finger scroll → xterm.scrollLines
  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    let startY = 0, accumulated = 0;
    const onTS = (e: TouchEvent) => { if (e.touches.length === 1) { startY = e.touches[0].clientY; accumulated = 0; } };
    const onTM = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const term = terminalRef.current; if (!term) return;
      const dy = startY - e.touches[0].clientY;
      startY = e.touches[0].clientY;
      accumulated += dy;
      const lineH = (term.options.fontSize ?? 13) * 1.2;
      const lines = Math.round(accumulated / lineH);
      if (lines !== 0) { accumulated -= lines * lineH; term.scrollLines(lines); }
      e.preventDefault();
    };
    el.addEventListener('touchstart', onTS, { passive: true });
    el.addEventListener('touchmove', onTM, { passive: false });
    return () => { el.removeEventListener('touchstart', onTS); el.removeEventListener('touchmove', onTM); };
  }, []);

  // WebSocket
  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | null = null;
    const init = async () => {
      try {
        let termId = getTerminalSessionForDir(workingDir);
        if (!termId) {
          const res = await fetch('/api/terminal/create', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cols: 80, rows: 24, cwd: workingDir }),
          });
          if (!res.ok) throw new Error('Failed to create session');
          const { sessionId } = await res.json();
          termId = sessionId;
          setTerminalSessionForDir(workingDir, termId!);
        }
        if (disposed) return;
        termSessionIdRef.current = termId;
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        socket = new WebSocket(`${protocol}//${window.location.host}/api/terminal/ws`);
        socket.binaryType = 'arraybuffer';
        wsRef.current = socket;
        const sendBind = () => {
          const json = JSON.stringify({ t: 'b', s: termId, v: 2 });
          const jsonBytes = new TextEncoder().encode(json);
          const frame = new Uint8Array(jsonBytes.length + 1);
          frame[0] = 0x01; frame.set(jsonBytes, 1);
          socket!.send(frame);
        };
        socket.onopen = () => { if (!disposed) sendBind(); };
        socket.onclose = () => { if (!disposed) { setConnected(false); wsRef.current = null; terminalRef.current?.write('\r\n[Disconnected]\r\n'); } };
        socket.onerror = () => { if (!disposed) setError('Connection failed'); };
        socket.onmessage = (e) => {
          if (disposed) return;
          if (e.data instanceof ArrayBuffer) {
            const bytes = new Uint8Array(e.data);
            if (bytes[0] === 0x01) {
              try {
                const ctrl = JSON.parse(new TextDecoder().decode(bytes.subarray(1)));
                if (ctrl.t === 'bok') { setConnected(true); setError(null); }
                if (ctrl.t === 'x') terminalRef.current?.write('\r\n[Process exited]\r\n');
              } catch {}
            }
            return;
          }
          if (typeof e.data === 'string') terminalRef.current?.write(e.data);
        };
      } catch (e) { if (!disposed) setError(e instanceof Error ? e.message : 'Failed'); }
    };
    init();
    return () => { disposed = true; socket?.close(); wsRef.current = null; termSessionIdRef.current = null; };
  }, [workingDir]);

  // xterm init
  useEffect(() => {
    const container = containerRef.current; if (!container) return;
    const terminal = new Terminal({
      cursorBlink: true, fontSize,
      fontFamily: '"IBM Plex Mono", monospace',
      scrollback: 10_000, theme: getTheme(),
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(container);
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    try { fitAddon.fit(); } catch {}
    return () => { terminal.dispose(); terminalRef.current = null; fitAddonRef.current = null; };
  }, [sendInput]);

  useEffect(() => {
    if (terminalRef.current) { terminalRef.current.options.fontSize = fontSize; fitAddonRef.current?.fit(); }
  }, [fontSize]);

  const handleStopTerminal = useCallback(async () => {
    await stopTerminalForDir(workingDir);
    setConnected(false); setError(null);
    termSessionIdRef.current = null;
    terminalRef.current?.reset();
  }, [workingDir]);

  const mobileKeys = [
    { label: '↑', seq: '\x1b[A' },
    { label: '↓', seq: '\x1b[B' },
    { label: 'Tab', seq: '\t' },
    { label: 'Ctrl+C', seq: '\x03' },
    { label: 'Ctrl+R', seq: '\x12' },
    { label: 'Stop', action: handleStopTerminal },
  ];

  // xterm output height = total available - status bar - quickkeys
  const xtermH = Math.max(100, availableH - STATUS_BAR_H - QUICKKEYS_H);

  return (
    <div
      ref={rootRef}
      style={{
        // Exact pixel height = visual viewport minus our top offset
        height: availableH,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--bg)',
      }}
    >
      {/* Hidden textarea for keyboard capture */}
      <textarea
        ref={inputRef}
        tabIndex={-1}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        data-terminal-hidden-input="true"
        disabled={!connected}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') { e.preventDefault(); sendInput('\r'); e.currentTarget.value = ''; return; }
          if (e.key === 'Backspace') { e.preventDefault(); sendInput('\x7f'); return; }
          if (e.key.length === 1) { e.preventDefault(); sendInput(e.key); }
        }}
        onInput={(e) => {
          const val = e.currentTarget.value;
          if (val) { sendInput(val.replace(/\r\n|\r|\n/g, '\r')); e.currentTarget.value = ''; }
        }}
        style={{
          position: 'fixed', left: '-9999px', top: '-9999px',
          width: 1, height: 1, opacity: 0, fontSize: 16,
          border: 'none', outline: 'none', resize: 'none',
          background: 'transparent', color: 'transparent',
          caretColor: 'transparent', padding: 0, margin: 0,
        }}
      />

      {/* Status bar */}
      <div style={{
        height: STATUS_BAR_H,
        padding: '0 12px',
        borderBottom: '1px solid var(--border)',
        fontSize: 11, color: 'var(--text-4)',
        display: 'flex', alignItems: 'center', gap: 6,
        flexShrink: 0,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: connected ? 'var(--green)' : error ? 'var(--red)' : 'var(--text-5)' }} />
        <span>{connected ? 'Terminal' : error ?? 'Connecting…'}</span>
      </div>

      {/* xterm output — explicit pixel height, never overflows into quickkeys */}
      <div
        ref={containerRef}
        onClick={() => inputRef.current?.focus()}
        style={{
          height: xtermH,
          flexShrink: 0,
          cursor: 'text',
          overflow: 'hidden',
        }}
      />

      {/* Quickkeys — pinned at bottom, always visible above keyboard */}
      <div style={{
        height: QUICKKEYS_H,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '0 10px',
        background: 'var(--bg-2)',
        borderTop: '1px solid var(--border)',
        overflowX: 'auto',
        flexShrink: 0,
        scrollbarWidth: 'none' as any,
      }}>
        {mobileKeys.map((key) => (
          <button
            key={key.label}
            onPointerDown={(e) => {
              e.preventDefault();
              if ('action' in key) key.action();
              else sendInput(key.seq);
              inputRef.current?.focus();
            }}
            style={{
              flexShrink: 0,
              padding: '6px 14px',
              borderRadius: 6,
              background: 'var(--bg-3)',
              border: '1px solid var(--border-2)',
              color: 'var(--text-2)',
              fontSize: 13, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'monospace',
            }}
          >
            {key.label}
          </button>
        ))}
      </div>
    </div>
  );
}
