import React, { useState } from 'react';
import type { Message, Part } from '../../types';
import { fallbackCopy } from '../../utils/helpers';
import { Markdown } from './Markdown';
import { ToolGroup } from './ToolGroup';
import { usePreferencesStore } from '../../stores/preferencesStore';

export const ChatMessage = React.memo(function ChatMessage({ msg, parts, isStreaming, onFork, onRevert, hideTools }: {
  msg: Message; parts?: Part[]; isStreaming?: boolean;
  onFork?: (messageId: string) => void;
  onRevert?: (messageId: string) => void;
  hideTools?: boolean;
}) {
  const isUser = msg.role === 'user';
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const streamingMode = usePreferencesStore(s => s.streamingMode);

  const textContent = parts
    ? parts.filter(p => p.type === 'text').map(p => p.text ?? '').join('')
    : msg.content;

  const toolParts = parts?.filter(p => p.type === 'tool') ?? [];
  const hasContent = textContent.trim().length > 0;
  const hasTools = toolParts.length > 0;

  if (!hasContent && !hasTools && !isStreaming) return null;

  const copyText = () => {
    const text = textContent;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => fallbackCopy(text, setCopied));
    } else {
      fallbackCopy(text, setCopied);
    }
  };

  const saveResponse = async () => {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `response-${timestamp}.md`;
      
      const response = await fetch('/api/fs/quick-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: textContent, filename }),
      });
      
      if (response.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (err) {
      console.error('Failed to save:', err);
    }
  };

  // Action buttons — always visible, no hover required
  const actionBtns = !isStreaming && hasContent ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <button onClick={copyText} title="Copy message" style={{
        width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: 4,
        color: copied ? 'var(--green)' : 'var(--border-2)', transition: 'color 0.1s',
      }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-3)')}
        onMouseLeave={e => (e.currentTarget.style.color = copied ? 'var(--green)' : 'var(--border-2)')}
      >
        {copied
          ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        }
      </button>
      <button onClick={saveResponse} title="Save to Quick-save folder" style={{
        width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: 4,
        color: saved ? 'var(--green)' : 'var(--border-2)', transition: 'color 0.1s',
      }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-3)')}
        onMouseLeave={e => (e.currentTarget.style.color = saved ? 'var(--green)' : 'var(--border-2)')}
      >
        {saved
          ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        }
      </button>
      {onFork && !msg.id.startsWith('temp_') && (
        <button onClick={() => onFork(msg.id)} title="Fork session from here" style={{
          width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: 4,
          color: 'var(--border-2)', transition: 'color 0.1s',
        }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--blue)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--border-2)')}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>
        </button>
      )}
      {onRevert && !msg.id.startsWith('temp_') && (
        <button onClick={() => onRevert(msg.id)} title="Revert to this message (undo all changes after)" style={{
          width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: 4,
          color: 'var(--border-2)', transition: 'color 0.1s',
        }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--red, #e06c75)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--border-2)')}
        >
          {/* undo/revert arrow */}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M3 13C5.33 7.67 10.67 4 17 4a9 9 0 0 1 0 18H3"/></svg>
        </button>
      )}      {msg.role === 'assistant' && !isStreaming && msg.tokens && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {msg.tokens.input != null && (
            <span style={{ fontSize: 10, color: 'var(--text-5)' }}>↑ {msg.tokens.input.toLocaleString()} in</span>
          )}
          {msg.tokens.output != null && (
            <span style={{ fontSize: 10, color: 'var(--text-5)' }}>↓ {msg.tokens.output.toLocaleString()} out</span>
          )}
          {((msg.tokens.cache_read ?? 0) > 0 || (msg.tokens.cache?.read ?? 0) > 0) && (
            <span style={{ fontSize: 10, color: 'var(--text-5)' }}>⚡ {(msg.tokens.cache?.read ?? msg.tokens.cache_read ?? 0).toLocaleString()} cached</span>
          )}
        </div>
      )}
    </div>
  ) : null;

  const LINE_THRESHOLD = 7;
  const userLines = isUser ? textContent.split('\n') : [];
  const userIsLong = userLines.length > LINE_THRESHOLD;
  const [userExpanded, setUserExpanded] = useState(false);
  const displayedText = isUser && userIsLong && !userExpanded
    ? userLines.slice(0, LINE_THRESHOLD).join('\n')
    : textContent;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', gap: 2 }}>
      {isUser && hasContent && (
        <div style={{
          maxWidth: '85%', padding: '9px 13px',
          borderRadius: '18px 18px 4px 18px',
          background: 'var(--bg-4)', border: '1px solid var(--border-2)',
          fontSize: 15, lineHeight: 1.6, color: 'var(--text)',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {displayedText}
          {userIsLong && (
            <div
              onClick={() => setUserExpanded(e => !e)}
              style={{ marginTop: 6, fontSize: 12, color: 'var(--accent)', cursor: 'pointer', userSelect: 'none' }}
            >
              {userExpanded ? '▲ Show less' : `▼ Show ${userLines.length - LINE_THRESHOLD} more lines`}
            </div>
          )}
        </div>
      )}

      {!isUser && (
        <div style={{ width: '100%' }}>
          {/* Reasoning/thinking hidden — too noisy */}
          {hasTools && !hideTools && (
            <div style={{ marginBottom: hasContent ? 6 : 0 }}>
              <ToolGroup parts={toolParts} />
            </div>
          )}
          {(hasContent || isStreaming) && (
            <div style={{
              fontSize: 15, lineHeight: 1.75, color: 'var(--text-2)',
              wordBreak: 'break-word',
            }}>
              {hasContent
                ? (isStreaming && streamingMode
                    // During streaming: plain pre-wrap text — no Markdown parsing overhead
                    ? <span style={{ whiteSpace: 'pre-wrap' }}>{textContent}</span>
                    // Done or streaming mode off: full Markdown render
                    : <Markdown text={textContent} />
                  )
                : <span style={{ color: 'var(--text-4)', fontStyle: 'italic' }}>Thinking…</span>
              }
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      {actionBtns && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 2px' }}>
          {actionBtns}
        </div>
      )}
    </div>
  );
});