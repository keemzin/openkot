import { useState } from 'react';
import { UI_FONTS, MONO_FONTS, UiFontId, MonoFontId, loadUiFont, loadMonoFont, getFontStack, usePreferencesStore } from '../../stores/preferencesStore';

export function FontPicker({ onClose }: { onClose: () => void }) {
  const store = usePreferencesStore();
  const uiFont = store.uiFont;
  const monoFont = store.monoFont;
  const setUiFont = store.setUiFont;
  const setMonoFont = store.setMonoFont;

  const [previewUi, setPreviewUi] = useState<UiFontId>(uiFont);
  const [previewMono, setPreviewMono] = useState<MonoFontId>(monoFont);

  const pickUi = (id: UiFontId) => { setPreviewUi(id); setUiFont(id); };
  const pickMono = (id: MonoFontId) => { setPreviewMono(id); setMonoFont(id); };

  const rowStyle = (active: boolean): React.CSSProperties => ({
    width: '100%', textAlign: 'left', padding: '7px 12px',
    background: active ? 'var(--bg-5)' : 'transparent',
    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
    borderLeft: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
    display: 'flex', flexDirection: 'column', gap: 1,
    transition: 'background 0.1s',
  });

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300 }} />
      <div style={{
        position: 'fixed', top: 48, right: 8,
        background: 'var(--bg-3)', border: '1px solid var(--border-2)',
        borderRadius: 10, width: 240,
        boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
        zIndex: 301, overflow: 'hidden',
      }}>
        <div style={{ padding: '8px 12px 4px', fontSize: 10, color: 'var(--text-4)', letterSpacing: '0.07em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>
          UI Font
        </div>
        {UI_FONTS.map(f => (
          <button key={f.id} onClick={() => pickUi(f.id as UiFontId)} style={rowStyle(previewUi === f.id)}
            onMouseEnter={e => { if (previewUi !== f.id) (e.currentTarget as HTMLElement).style.background = 'var(--bg-4)'; }}
            onMouseLeave={e => { if (previewUi !== f.id) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <span style={{ fontSize: 13, color: 'var(--text)', fontFamily: f.stack }}>{f.label}</span>
            <span style={{ fontSize: 10, color: 'var(--text-4)', fontFamily: f.stack }}>The quick brown fox</span>
          </button>
        ))}

        <div style={{ padding: '8px 12px 4px', fontSize: 10, color: 'var(--text-4)', letterSpacing: '0.07em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', borderTop: '1px solid var(--border)', marginTop: 4 }}>
          Code Font
        </div>
        {MONO_FONTS.map(f => (
          <button key={f.id} onClick={() => pickMono(f.id as MonoFontId)} style={rowStyle(previewMono === f.id)}
            onMouseEnter={e => { if (previewMono !== f.id) (e.currentTarget as HTMLElement).style.background = 'var(--bg-4)'; }}
            onMouseLeave={e => { if (previewMono !== f.id) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <span style={{ fontSize: 13, color: 'var(--text)', fontFamily: f.stack }}>{f.label}</span>
            <span style={{ fontSize: 10, color: 'var(--text-4)', fontFamily: f.stack }}>const x = 42;</span>
          </button>
        ))}
      </div>
    </>
  );
}