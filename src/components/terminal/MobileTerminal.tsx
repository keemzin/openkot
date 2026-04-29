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

export function MobileTerminal({ workingDir }: { workingDir: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const termSessionIdRef = useRef<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [fontSize, setFontSize] = useState(13);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const hidden = window.innerHeight - vv.height - vv.offsetTop;
      setKeyboardHeight(Math.max(0, hidden));
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); };
  }, []);

  const sendInput = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(data);
  }, []);

  // Pinch-to-zoom for terminal font size
  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    let lastDist = 0, pinching = false;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onTS = (e: TouchEvent) => { if (e.touches.length === 2) { pinching = true; lastDist = dist(e.touches); } else pinching = false; };
    const onTM = (e: TouchEvent) => { if (!pinching || e.touches.length !== 2) return; e.preventDefault(); const d = dist(e.touches); const delta = d - lastDist; lastDist = d; if (Math.abs(delta) > 1) setFontSize(p => Math.min(24, Math.max(9, p + delta * 0.04))); };
    const onTE = () => { pinching = false; };
    el.addEventListener('touchstart', onTS, { passive: true });
    el.addEventListener('touchmove', onTM, { passive: false });
    el.addEventListener('touchend', onTE);
    return () => { el.removeEventListener('touchstart', onTS); el.removeEventListener('touchmove', onTM); el.removeEventListener('touchend', onTE); };
  }, []);

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
    return () => {
      disposed = true;
      socket?.close();
      wsRef.current = null;
      termSessionIdRef.current = null;
    };
  }, [workingDir]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const terminal = new Terminal({
      cursorBlink: true,
      fontSize,
      fontFamily: '"IBM Plex Mono", monospace',
      scrollback: 10_000,
      theme: getTheme(),
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(container);
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    try { fitAddon.fit(); } catch {}
    return () => {
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sendInput]);

  // Update font size
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.fontSize = fontSize;
      fitAddonRef.current?.fit();
    }
  }, [fontSize]);

  const handleStopTerminal = useCallback(async () => {
    await stopTerminalForDir(workingDir);
    setConnected(false);
    setError(null);
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

  const QUICKKEYS_H = 44;

  return (
    <div style={{ height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'stretch', background: 'var(--bg)', padding: '16px' }}>
      <div style={{ maxWidth: '800px', width: '100%', display: 'flex', flexDirection: 'column', border: '1px solid var(--border-2)', borderRadius: '8px', overflow: 'hidden' }}>
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
          if (e.key === 'Enter') {
            e.preventDefault();
            sendInput('\r');
            e.currentTarget.value = '';
            return;
          }
          if (e.key === 'Backspace') {
            e.preventDefault();
            sendInput('\x7f');
            return;
          }
          if (e.key.length === 1) {
            e.preventDefault();
            sendInput(e.key);
          }
        }}
        onInput={(e) => {
          const val = e.currentTarget.value;
          if (val) {
            sendInput(val.replace(/\r\n|\r|\n/g, '\r'));
            e.currentTarget.value = '';
          }
        }}
        style={{
          position: 'fixed', left: '-9999px', top: '-9999px',
          width: 1, height: 1, opacity: 0,
          fontSize: 16,
          border: 'none', outline: 'none', resize: 'none',
          background: 'transparent', color: 'transparent',
          caretColor: 'transparent', padding: 0, margin: 0,
        }}
      />
      <div style={{ padding: '4px 12px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--text-4)', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: connected ? 'var(--green)' : error ? 'var(--red)' : 'var(--text-5)' }} />
        <span>{connected ? 'Terminal' : error ?? 'Connecting…'}</span>
      </div>
      <div
        ref={containerRef}
        onClick={() => inputRef.current?.focus()}
        style={{
          height: `calc(100% - ${QUICKKEYS_H + keyboardHeight + 8}px)`,
          minWidth: 0,
          cursor: 'text',
        }}
      />
      {connected && (
        <div style={{
          position: 'fixed',
          bottom: keyboardHeight,
          left: 0, right: 0,
          height: QUICKKEYS_H,
          display: 'flex', alignItems: 'center',
          gap: 6, padding: '0 10px',
          background: 'var(--bg-2)',
          borderTop: '1px solid var(--border)',
          overflowX: 'auto',
          zIndex: 100,
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
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'monospace',
              }}
            >
              {key.label}
            </button>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}