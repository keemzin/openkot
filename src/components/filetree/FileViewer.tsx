import React, { useState, useEffect, useRef, useCallback } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-diff';
import { getFileExt } from '../../utils/fileUtils';
import { CodeEditor, CodeEditorRef } from '../editor/CodeEditor';
import { Markdown } from '../chat/Markdown';
import { fallbackCopy } from '../../utils/helpers';

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
  json: 'json', css: 'css', html: 'markup', md: 'markdown',
  py: 'python', rs: 'rust', go: 'go', sh: 'bash', bash: 'bash',
  yaml: 'yaml', yml: 'yaml', toml: 'toml', sql: 'sql',
  diff: 'diff', xml: 'markup', svg: 'markup',
};

// Local CodeBlock using Prism (matches original App.tsx logic)
function CodeBlock({ code, ext }: { code: string; ext: string }) {
  const lang = EXT_TO_LANG[ext] ?? 'plain';
  const grammar = Prism.languages[lang];
  const highlighted = grammar
    ? Prism.highlight(code, grammar, lang)
    : code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const lines = highlighted.split('\n');
  const lineCount = lines.length;
  const gutterWidth = String(lineCount).length * 8 + 16;

  const [copied, setCopied] = useState(false);
  const copyCode = () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => fallbackCopy(code, setCopied));
    } else {
      fallbackCopy(code, setCopied);
    }
  };

  return (
    <div className="prism-code code-block-wrap" style={{ fontFamily: "var(--font-mono, 'IBM Plex Mono', 'Consolas', monospace)", fontSize: 13, lineHeight: 1.6, overflowX: 'auto', position: 'relative', color: 'var(--text-2)' }}>
      {/* Copy button */}
      <button
        onClick={copyCode}
        className="copy-btn"
        title="Copy code"
        style={{
          position: 'absolute', top: 6, right: 6,
          background: copied ? '#1a2e1a' : 'var(--bg-3)',
          border: `1px solid ${copied ? '#3a6a3a' : 'var(--border-2)'}`,
          borderRadius: 5, cursor: 'pointer',
          color: copied ? 'var(--green)' : 'var(--text-4)',
          padding: '3px 8px', fontSize: 11,
          display: 'flex', alignItems: 'center', gap: 4,
          transition: 'all 0.15s', zIndex: 2,
          opacity: 0,
        }}
      >
        {copied ? (
          <>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Copied
          </>
        ) : (
          <>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copy
          </>
        )}
      </button>
      <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: gutterWidth }} />
          <col />
        </colgroup>
        <tbody>
          {lines.map((line, i) => (
            <tr key={i} style={{ verticalAlign: 'top' }}>
              <td style={{
                userSelect: 'none', textAlign: 'right', paddingRight: 12, paddingLeft: 8,
                color: 'var(--border-2)', fontSize: 12, lineHeight: 1.6, whiteSpace: 'nowrap',
                borderRight: '1px solid var(--bg-4)',
              }}>
                {i + 1}
              </td>
              <td style={{ paddingLeft: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
                dangerouslySetInnerHTML={{ __html: line || ' ' }}
              />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface Props {
  path: string;
  onClose: () => void;
  workingDir: string;
}

export function FileViewer({ path: filePath, onClose, workingDir }: Props) {
  const [content, setContent] = useState<string | null>(null);
  const [draftContent, setDraftContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [wordWrap, setWordWrap] = useState(true);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<CodeEditorRef>(null);
  const draftRef = useRef('');

  const fileName = filePath.replace(/\\/g, '/').split('/').pop() ?? filePath;
  const ext = getFileExt(fileName);
  const isMarkdown = ext === 'md';
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext);
  
  const isDirty = mode === 'edit' && content !== null && draftContent.replace(/\r\n/g, '\n') !== content.replace(/\r\n/g, '\n');

  useEffect(() => {
    draftRef.current = draftContent;
  }, [draftContent]);

  useEffect(() => {
    setLoading(true); setError(null); setContent(null); setMode('view'); setSaveStatus('idle');
    fetch(`/api/fs/read?path=${encodeURIComponent(filePath)}`)
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.text(); })
      .then(t => { 
        const normalized = t.replace(/\r\n/g, '\n');
        setContent(normalized); 
        setDraftContent(normalized); 
        setLoading(false); 
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [filePath]);

  const save = useCallback(async (text: string) => {
    setSaving(true);
    try {
      const r = await fetch('/api/fs/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, content: text }),
      });
      if (!r.ok) throw new Error('Save failed');
      setContent(text);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
    }
    setSaving(false);
  }, [filePath]);

  const handleChange = (val: string) => {
    setDraftContent(val);
    setSaveStatus('idle');
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => save(draftRef.current), 1000);
  };

  const enterEdit = () => {
    setMode('edit');
    setTimeout(() => {
      const cm = document.querySelector('.cm-content') as HTMLElement;
      cm?.focus();
    }, 50);
  };

  const statusColor = saveStatus === 'saved' ? 'var(--green)' : saveStatus === 'error' ? 'var(--red)' : isDirty ? 'var(--accent)' : 'var(--text-4)';
  const statusText = saving ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : saveStatus === 'error' ? 'Save failed' : isDirty ? 'Unsaved' : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-4)', cursor: 'pointer', fontSize: 13, padding: '0 2px', lineHeight: 1 }}>📁</button>
        <span style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{fileName}</span>
        {statusText && <span style={{ fontSize: 11, color: statusColor, flexShrink: 0 }}>{statusText}</span>}
        
        {/* Editor controls - only in edit mode */}
        {mode === 'edit' && (
          <div style={{ display: 'flex', gap: 4, marginRight: 8, alignItems: 'center' }}>
            <button 
              onClick={() => setWordWrap(!wordWrap)} 
              title="Toggle Word Wrap" 
              style={{ 
                background: wordWrap ? 'var(--accent-dim)' : 'var(--bg-3)', 
                border: `1px solid ${wordWrap ? 'var(--accent)' : 'var(--border-2)'}`, 
                cursor: 'pointer', 
                color: wordWrap ? 'var(--accent)' : 'var(--text-4)', 
                fontSize: 10, 
                padding: '2px 6px', 
                borderRadius: 4,
                fontWeight: 600
              }}
            >
              WRAP
            </button>
            <div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 2px' }} />
            <button onClick={() => editorRef.current?.undo()} title="Undo" style={{ background: 'var(--bg-3)', border: '1px solid var(--border-2)', cursor: 'pointer', color: 'var(--text-2)', fontSize: 11, padding: '2px 8px', borderRadius: 4 }}>↶</button>
            <button onClick={() => editorRef.current?.redo()} title="Redo" style={{ background: 'var(--bg-3)', border: '1px solid var(--border-2)', cursor: 'pointer', color: 'var(--text-2)', fontSize: 11, padding: '2px 8px', borderRadius: 4 }}>↷</button>
            <button 
              onClick={() => {
                console.log('[Editor] Manual save triggered');
                save(draftRef.current);
              }} 
              disabled={saving}
              style={{ 
                background: 'var(--accent)', 
                border: 'none', 
                cursor: saving ? 'not-allowed' : 'pointer', 
                color: 'var(--bg)', 
                fontSize: 11, 
                fontWeight: 600,
                padding: '2px 10px', 
                borderRadius: 4,
                marginLeft: 4,
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
              }}
            >
              {saving ? '...' : 'Save'}
            </button>
          </div>
        )}

        {/* View/Edit toggle - hide for images */}
        {content !== null && !isMarkdown && !isImage && (
          <div style={{ display: 'flex', background: 'var(--bg-2)', borderRadius: 5, padding: 2, gap: 1, flexShrink: 0 }}>
            {(['view', 'edit'] as const).map(m => (
              <button key={m} onClick={() => m === 'edit' ? enterEdit() : setMode('view')}
                style={{ background: mode === m ? 'var(--bg-3)' : 'transparent', border: 'none', cursor: 'pointer', color: mode === m ? 'var(--text)' : 'var(--text-4)', fontSize: 11, padding: '2px 8px', borderRadius: 4, fontFamily: 'inherit' }}>
                {m}
              </button>
            ))}
          </div>
        )}
        {content !== null && isMarkdown && (
          <div style={{ display: 'flex', background: 'var(--bg-2)', borderRadius: 5, padding: 2, gap: 1, flexShrink: 0 }}>
            {(['preview', 'edit'] as const).map(m => (
              <button key={m} onClick={() => m === 'edit' ? enterEdit() : setMode('view')}
                style={{ background: (m === 'edit' ? mode === 'edit' : mode === 'view') ? 'var(--bg-3)' : 'transparent', border: 'none', cursor: 'pointer', color: (m === 'edit' ? mode === 'edit' : mode === 'view') ? 'var(--text)' : 'var(--text-4)', fontSize: 11, padding: '2px 8px', borderRadius: 4, fontFamily: 'inherit' }}>
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, position: 'relative' }}>
        {loading && <div style={{ padding: '12px', color: 'var(--text-4)', fontSize: 12 }}>Loading…</div>}
        {error && <div style={{ padding: '12px', color: 'var(--red)', fontSize: 12 }}>Error: {error}</div>}

        {content !== null && mode === 'edit' && (
          <CodeEditor
            ref={editorRef}
            fileName={fileName}
            value={draftContent || ''}
            onChange={handleChange}
            onSave={() => save(draftRef.current)}
            wordWrap={wordWrap}
          />
        )}

        {content !== null && mode === 'view' && (
          <div style={{ padding: '10px 12px' }} onDoubleClick={enterEdit} title="Double-click to edit">
            {isImage ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300, padding: 20 }}>
                <img 
                  src={`/api/fs/read?path=${encodeURIComponent(filePath)}`} 
                  alt={fileName}
                  style={{ 
                    maxWidth: '100%', 
                    maxHeight: '70vh', 
                    objectFit: 'contain',
                    borderRadius: 4,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                  }}
                />
              </div>
            ) : isMarkdown ? (
              <Markdown text={draftContent} />
            ) : (
              <CodeBlock code={draftContent} ext={ext} />
            )}
          </div>
        )}
      </div>

      {/* Edit hint - hide for images */}
      {mode === 'view' && content !== null && !isImage && (
        <div style={{ padding: '4px 10px', borderTop: '1px solid var(--bg-3)', fontSize: 11, color: 'var(--border-2)', flexShrink: 0 }}>
          Double-click to edit · Ctrl+S to save
        </div>
      )}
    </div>
  );
}
