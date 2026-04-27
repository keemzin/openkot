import React, { useState, useEffect, useRef } from 'react';

export function InlineInput({ defaultValue, onConfirm, onCancel }: { defaultValue: string; onConfirm: (v: string) => void; onCancel: () => void }) {
  const [val, setVal] = useState(defaultValue);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    input.focus();
    // Select only the name part, not the extension
    const dotIdx = defaultValue.lastIndexOf('.');
    const end = dotIdx > 0 ? dotIdx : defaultValue.length;
    input.setSelectionRange(0, end);
  }, [defaultValue]);
  return (
    <input ref={ref} value={val} onChange={e => setVal(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onConfirm(val.trim()); } if (e.key === 'Escape') onCancel(); }}
      onBlur={() => onConfirm(val.trim())}
      style={{ width: '100%', background: 'var(--bg-2)', border: '1px solid var(--accent)', borderRadius: 4, color: 'var(--text)', fontSize: 12, padding: '2px 6px', fontFamily: 'inherit', outline: 'none' }}
    />
  );
}