import React, { useState } from 'react';
import type { Part } from '../../types';
import { getToolDisplayName, getToolIconPath, getToolDescription } from '../../utils/toolPresentation';
import { isDiffTool, isExpandableTool } from '../../utils/toolCategorization';
import { ToolPart } from './ToolPart';
import { Markdown } from './Markdown';

function ToolIcon({ toolName }: { toolName: string }) {
  const d = getToolIconPath(toolName);
  return (
    <svg
      width="13" height="13" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <path d={d} />
    </svg>
  );
}

/** Inline justification text between tool calls */
function JustificationRow({ text, defaultOpen }: { text: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const preview = text.trim().replace(/\s+/g, ' ').slice(0, 120);
  return (
    <div className={`tool-card ${open ? 'expanded' : 'collapsed'}`} style={{ display: 'flex', flexDirection: 'column' }}>
      <div
        role="button"
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', cursor: 'pointer', userSelect: 'none' }}
      >
        <span style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0, background: 'var(--tools-description)' }} />
        {/* refresh/loop icon */}
        <span style={{ color: 'var(--tools-icon)', display: 'inline-flex', alignItems: 'center' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
        </span>
        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--tools-title)', flexShrink: 0 }}>Justification</span>
        {!open && (
          <span style={{ fontSize: '0.8rem', color: 'var(--tools-description)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
            {preview}
          </span>
        )}
        <span className="tool-expand-icon" style={{ color: 'var(--tools-description)', display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </span>
      </div>
        {open && (
          <div style={{ paddingLeft: 20, paddingBottom: 6 }}>
            <Markdown text={text.trim()} />
          </div>
        )}
    </div>
  );
}

function ToolRow({ part }: { part: Part }) {
  const [open, setOpen] = useState(false);
  const toolName = (part.tool as string) || part.type;
  const state = (part.state as any) ?? {};
  const isRunning = state.status === 'running' || state.status === 'pending';
  const isError = state.status === 'error';
  const isDone = state.status === 'completed' || state.status === 'error' || (!state.status && (state.output !== undefined || state.error !== undefined));

  const isQuestion = toolName === 'question';
  const hasExpandableContent = isExpandableTool(toolName);
  const isExpandable = isQuestion || (hasExpandableContent && isDone);

  const label = getToolDisplayName(toolName);
  const desc = getToolDescription(toolName, state);

  const questionData = isQuestion ? (() => {
    const input = state.input ?? {};
    const output = state.output ?? '';
    const questions: Array<{ question: string; header?: string; options?: Array<{ label: string; description?: string }> }> =
      Array.isArray(input.questions) ? input.questions : [];
    const answers: Record<string, string> = {};
    const match = output.match(/User has answered your questions:\s*(.+?)(?:\.\s*You can now|$)/s);
    if (match) {
      const pairRegex = /"([^"]+)"="([^"]*)"/g;
      let m;
      while ((m = pairRegex.exec(match[1])) !== null) answers[m[1]] = m[2];
    }
    return { questions, answers, rawOutput: output };
  })() : null;

  const dotColor = isError ? 'var(--tools-edit-removed)' : isRunning ? 'var(--accent)' : 'var(--tools-description)';

  const displayDesc = isQuestion && questionData?.questions[0]?.question
    ? questionData.questions[0].question.slice(0, 60)
    : desc;

  return (
    <div className={`tool-card ${open ? 'expanded' : 'collapsed'}`} style={{ display: 'flex', flexDirection: 'column' }}>
      <div
        role={isExpandable ? 'button' : undefined}
        onClick={isExpandable ? () => setOpen(o => !o) : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 0',
          cursor: isExpandable ? 'pointer' : 'default',
          userSelect: 'none',
        }}
      >
        <span
          className={isRunning ? 'tool-running' : undefined}
          style={{
            width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
            background: dotColor,
          }}
        />
        <span style={{ color: 'var(--tools-icon)', display: 'inline-flex', alignItems: 'center' }}>
          <ToolIcon toolName={toolName} />
        </span>
        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--tools-title)', flexShrink: 0 }}>
          {label}
        </span>
        {displayDesc && (
          <span style={{
            fontSize: '0.8rem', color: 'var(--tools-description)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            flex: 1, minWidth: 0,
          }} title={displayDesc}>
            {displayDesc}
          </span>
        )}
        {isExpandable && (
          <span className="tool-expand-icon" style={{ color: 'var(--tools-description)', display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </span>
        )}
      </div>

      {open && isQuestion && questionData && (
        <div style={{ paddingLeft: 20, paddingBottom: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {questionData.questions.map((q, i) => {
            const answer = questionData.answers[q.question];
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>Q</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--tools-title)', lineHeight: 1.4 }}>{q.question}</span>
                </div>
                {Array.isArray(q.options) && q.options.length > 0 && (
                  <div style={{ paddingLeft: 16, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {q.options.map((opt, j) => {
                      const isSelected = answer === opt.label;
                      return (
                        <span key={j} style={{
                          fontSize: '0.72rem', padding: '2px 8px', borderRadius: 10,
                          background: isSelected ? 'var(--accent-dim)' : 'var(--bg-4)',
                          color: isSelected ? 'var(--accent)' : 'var(--tools-description)',
                          border: `1px solid ${isSelected ? 'var(--accent)' : 'transparent'}`,
                          fontWeight: isSelected ? 600 : 400,
                        }}>
                          {opt.label}
                        </span>
                      );
                    })}
                  </div>
                )}
                {answer && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, paddingLeft: 0 }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--green)', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>A</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-3)', lineHeight: 1.4 }}>{answer}</span>
                  </div>
                )}
                {!answer && questionData.rawOutput && i === 0 && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--green)', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>A</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-3)', lineHeight: 1.4 }}>{questionData.rawOutput.slice(0, 200)}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {open && !isQuestion && hasExpandableContent && (
        <div style={{ paddingLeft: 12, paddingBottom: 6 }}>
          <ToolPart part={part} />
        </div>
      )}
    </div>
  );
}

export const ToolGroup = React.memo(function ToolGroup({ parts, isStreaming, modelName, providerName }: { parts: Part[]; isStreaming?: boolean; modelName?: string; providerName?: string }) {
  const hasJustifications = parts.some(p => p.type === 'text');
  // While streaming → full view. After load/refresh → justifications only (or hidden if none)
  const [view, setView] = useState<'full' | 'justify' | 'hidden'>(
    isStreaming ? 'full' : (hasJustifications ? 'justify' : 'hidden')
  );
  const [showAllJustifications, setShowAllJustifications] = useState(false);

  // Track streaming state changes
  const prevStreaming = React.useRef(isStreaming);
  const hasJustificationsRef = React.useRef(hasJustifications);
  hasJustificationsRef.current = hasJustifications;

  // Handle streaming state transitions (start/stop)
  React.useEffect(() => {
    // Started streaming
    if (isStreaming && !prevStreaming.current) {
      setView('full');
    }

    // Stopped streaming — auto-collapse after 3s
    if (!isStreaming && prevStreaming.current) {
      const timer = setTimeout(() => {
        setView(hasJustificationsRef.current ? 'justify' : 'hidden');
      }, 3000);

      prevStreaming.current = isStreaming;
      return () => clearTimeout(timer);
    }

    prevStreaming.current = isStreaming;
  }, [isStreaming]);

  const anyRunning = parts.some(p => {
    if (p.type !== 'tool') return false;
    const s = (p.state as any) ?? {};
    return s.status === 'running' || s.status === 'pending';
  });

  const justificationParts = parts.filter(p => p.type === 'text');

  const cycle = () => setView(v => {
    if (v === 'justify') return 'full';
    if (v === 'full') return 'hidden';
    return hasJustifications ? 'justify' : 'full';
  });

  const viewLabel = view === 'full' ? 'Full' : view === 'justify' ? 'Justify' : 'Hidden';
  const toolCount = parts.filter(p => p.type === 'tool').length;
  const gearRotation = view === 'hidden' ? 0 : view === 'justify' ? justificationParts.length * 36 : toolCount * 36;

  return (
    <div style={{ marginBottom: 4 }}>
      <button
        type="button"
        title={`Trail view: ${view}. Click to cycle: Full → Justify → Hidden`}
        onClick={cycle}
        style={{
          position: 'sticky', top: 0, zIndex: 1,
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--bg)', border: 'none', cursor: 'pointer',
          fontFamily: 'inherit', padding: '2px 0', marginBottom: view !== 'hidden' ? 4 : 0,
        }}
      >
        <span style={{ color: 'var(--tools-icon)', display: 'inline-flex', alignItems: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ transform: `rotate(${gearRotation}deg)`, transformOrigin: '50% 50%', transition: 'transform 0.3s ease' }}>
            <circle cx="12" cy="12" r="9" strokeWidth="1.5" opacity="0.25" />
            <line x1="12" y1="12" x2="12" y2="3" strokeWidth="2" strokeLinecap="round" />
            <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
          </svg>
        </span>
        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--tools-title)' }}>Trail</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--tools-description)', marginLeft: 4 }}>{viewLabel}</span>
        {modelName && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            fontSize: '0.75rem', color: 'var(--accent)',
            background: anyRunning ? 'var(--bg-3)' : 'var(--accent-dim)',
            border: `1px solid ${anyRunning ? 'var(--border-2)' : 'rgba(237,180,73,0.25)'}`,
            borderRadius: 4, padding: '1px 6px',
          }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8, flexShrink: 0 }}>
              <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
            </svg>
            {providerName && <span style={{ opacity: 0.6 }}>{providerName}:</span>}
            <span style={{ fontWeight: 600 }}>{modelName}</span>
          </span>
        )}
      </button>

      <div className={`trail-view trail-full ${view === 'full' ? 'active' : ''}`}>
        <div style={{ paddingLeft: 8, borderLeft: '2px solid var(--bg-4)', display: 'flex', flexDirection: 'column', gap: 1 }}>
          {parts.map(p =>
            p.type === 'text'
              ? <JustificationRow key={p.id} text={p.text ?? ''} />
              : <ToolRow key={p.id} part={p} />
          )}
        </div>
      </div>

      {hasJustifications && (
        <div className={`trail-view trail-justify ${view === 'justify' ? 'active' : ''}`}>
          {(() => {
            const COLLAPSE_THRESHOLD = 3;
            const shouldCollapse = justificationParts.length > COLLAPSE_THRESHOLD;
            const visibleParts = shouldCollapse && !showAllJustifications
              ? justificationParts.slice(-COLLAPSE_THRESHOLD)
              : justificationParts;
            const hiddenCount = justificationParts.length - COLLAPSE_THRESHOLD;

            return (
              <div style={{ paddingLeft: 8, borderLeft: '2px solid var(--bg-4)', display: 'flex', flexDirection: 'column', gap: 1 }}>
                {shouldCollapse && !showAllJustifications && (
                  <button
                    onClick={() => setShowAllJustifications(true)}
                    style={{
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      padding: '4px 0', display: 'flex', alignItems: 'center', gap: 6,
                      fontSize: '0.8rem', color: 'var(--tools-description)', fontFamily: 'inherit',
                    }}
                  >
                    <span style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0, background: 'var(--tools-description)', opacity: 0.5 }} />
                    <span>▼ {hiddenCount} earlier steps</span>
                  </button>
                )}
                {visibleParts.map(p =>
                  <JustificationRow key={p.id} text={p.text ?? ''} />
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
});