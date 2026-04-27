import React, { useState, useEffect, useRef, useCallback } from 'react';
import { processAnsi, getTerminalSessionForDir, setTerminalSessionForDir, stopTerminalForDir } from '../../utils/helpers';

export function MobileTerminal({ workingDir }: { workingDir: string }) {
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const termSessionIdRef = useRef<string | null>(null);
  const [rows, setRows] = useState<string[]>(['']);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState(13);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const isComposingRef = useRef(false);

  // Track visual viewport height to detect keyboard
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

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [rows]);

  const appendOutput = useCallback((raw: string) => {
    const cleaned = processAnsi(raw);
    setRows(prev => {
      const next = [...prev];
      let cur = next[next.length - 1] ?? '';
      let i = 0;
      while (i < cleaned.length) {
        const ch = cleaned[i];
        if (ch === '\r' && cleaned[i + 1] === '\n') {
          next[next.length - 1] = cur; next.push(''); cur = ''; i += 2;
        } else if (ch === '\n') {
          next[next.length - 1] = cur; next.push(''); cur = ''; i++;
        } else if (ch === '\r') {
          cur = ''; i++;
        } else if (ch === '\x08') {
          if (cur.length > 0) cur = cur.slice(0, -1); i++;
        } else if (ch === '\x1b' && cleaned[i + 1] === '[' && cleaned[i + 2] === 'K') {
          cur = ''; i += 3;
        } else {
          cur += ch; i++;
        }
      }
      next[next.length - 1] = cur;
      return next.length > 2000 ? next.slice(-2000) : next;
    });
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
        socket.onclose = () => { if (!disposed) { setConnected(false); wsRef.current = null; appendOutput('\n[Disconnected]\n'); } };
        socket.onerror = () => { if (!disposed) setError('Connection failed'); };
        socket.onmessage = (e) => {
          if (disposed) return;
          if (e.data instanceof ArrayBuffer) {
            const bytes = new Uint8Array(e.data);
            if (bytes[0] === 0x01) {
              try {
                const ctrl = JSON.parse(new TextDecoder().decode(bytes.subarray(1)));
                if (ctrl.t === 'bok') { setConnected(true); setError(null); inputRef.current?.focus(); }
                if (ctrl.t === 'x') appendOutput('\r\n[Process exited]\r\n');
              } catch {}
            }
            return;
          }
          if (typeof e.data === 'string') appendOutput(e.data);
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
  }, [workingDir, appendOutput]);

  // Pinch-to-zoom
  useEffect(() => {
    const el = outputRef.current; if (!el) return;
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

  const sendInput = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(data);
  }, []);

  const lastSentValueRef = useRef('');

  // ── Input handling ──────────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();
    if (isComposingRef.current) return;
    if ((e.nativeEvent as KeyboardEvent).isComposing) return;

    // Ctrl combos
    if (e.ctrlKey && !e.metaKey && e.key.length === 1) {
      const ctrlMap: Record<string, string> = {
        c: '\x03', d: '\x04', l: '\x0c', a: '\x01', e: '\x05',
        k: '\x0b', u: '\x15', w: '\x17', r: '\x12', z: '\x1a',
      };
      if (ctrlMap[e.key.toLowerCase()]) {
        e.preventDefault();
        sendInput(ctrlMap[e.key.toLowerCase()]);
        return;
      }
    }

    // Special keys
    const specialMap: Record<string, string> = {
      Enter: '\r',
      Backspace: '\x7f',
      Delete: '\x1b[3~',
      Tab: '\t',
      Escape: '\x1b',
      ArrowUp: '\x1b[A', ArrowDown: '\x1b[B',
      ArrowLeft: '\x1b[D', ArrowRight: '\x1b[C',
      Home: '\x1b[H', End: '\x1b[F',
      PageUp: '\x1b[5~', PageDown: '\x1b[6~',
    };
    if (specialMap[e.key]) {
      e.preventDefault();
      // Reset tracking so input event doesn't double-fire
      e.currentTarget.value = '';
      lastSentValueRef.current = '';
      sendInput(specialMap[e.key]);
      return;
    }
    // Printable chars: handled by input event only
  }, [sendInput]);

  const handleInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    if (isComposingRef.current) return;
    const target = e.currentTarget;
    const val = target.value;
    if (!val) { lastSentValueRef.current = ''; return; }

    // Only send the NEW characters since last time.
    // lastSentValueRef holds the full textarea value we already processed.
    const prev = lastSentValueRef.current;
    let toSend: string;
    if (val === prev) {
      // iOS restored the exact same value — nothing new to send
      return;
    } else if (val.startsWith(prev)) {
      // Normal accumulation — only send the new suffix
      toSend = val.slice(prev.length);
    } else {
      // Autocorrect / replacement — send the whole new value
      toSend = val;
    }

    if (toSend) {
      sendInput(toSend.replace(/\r\n|\r|\n/g, '\r'));
    }

    // Update tracking to the full current value.
    // If iOS restores the textarea value without firing input, next input event
    // will see val === lastSentValueRef and send nothing (correct).
    lastSentValueRef.current = val;
    // Attempt to clear — if it sticks, next input starts fresh
    target.value = '';
    // Don't reset lastSentValueRef here — keep it as `val` so delta works if iOS restores
  }, [sendInput]);

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback((e: React.CompositionEvent<HTMLTextAreaElement>) => {
    isComposingRef.current = false;
    const target = e.currentTarget;
    const data = e.data || target.value;
    if (data) sendInput(data.replace(/\r\n|\r|\n/g, '\r'));
    target.value = '';
  }, [sendInput]);

  const handleStopTerminal = useCallback(async () => {
    await stopTerminalForDir(workingDir);
    setConnected(false);
    setError(null);
    termSessionIdRef.current = null;
    setRows(['']);
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
    // Outer: full height, flex column, no bottom padding here
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', border: '1px solid var(--border-2)', borderRadius: '8px', overflow: 'hidden' }}>

      {/* Hidden textarea — invisible, positioned off-screen, captures keyboard */}
      <textarea
        ref={inputRef}
        tabIndex={-1}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        data-terminal-hidden-input="true"
        disabled={!connected}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        style={{
          position: 'fixed', left: '-9999px', top: '-9999px',
          width: 1, height: 1, opacity: 0,
          fontSize: 16, // prevent iOS zoom
          border: 'none', outline: 'none', resize: 'none',
          background: 'transparent', color: 'transparent',
          caretColor: 'transparent', padding: 0, margin: 0,
        }}
      />

      {/* Status bar */}
      <div style={{ padding: '4px 12px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--text-4)', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: connected ? 'var(--green)' : error ? 'var(--red)' : 'var(--text-5)' }} />
        <span>{connected ? 'Terminal' : error ?? 'Connecting…'}</span>
      </div>

      {/* Output — shrinks to leave room for quick keys + keyboard */}
      <div
        ref={outputRef}
        onClick={() => inputRef.current?.focus()}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 10px',
          // leave space for quick keys bar + keyboard
          paddingBottom: `${QUICKKEYS_H + keyboardHeight + 8}px`,
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize,
          lineHeight: 1.5,
          color: 'var(--text-2)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
          cursor: 'text',
        } as React.CSSProperties}
      >
        {rows.map((line, i) => (
          <div key={i}>{line || '\u00a0'}</div>
        ))}
      </div>

      {/* Quick keys — fixed above keyboard */}
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
                if ('action' in key) key.action!();
                else sendInput(key.seq!);
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
  );
}
