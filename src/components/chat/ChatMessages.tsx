import React, { useRef, useEffect, useCallback } from 'react';
import { useStreamingStore } from '../../stores/streamingStore';
import type { Message, ModelInfo } from '../../types';
import type { QuestionRequest } from '../app/QuestionCard';
import type { PermissionRequest } from '../app/PermissionCard';
import { ChatMessage } from './ChatMessage';
import { ToolGroup } from './ToolGroup';
import { QuestionCard } from '../app/QuestionCard';
import { PermissionCard } from '../app/PermissionCard';

interface ChatMessagesProps {
  messages: Message[];
  models: ModelInfo[];
  sessionId: string | null;
  sessionAutoAccept: Record<string, boolean>;
  permissionRules: Record<string, string>;
  questions: Record<string, QuestionRequest[]>;
  permissions: Record<string, PermissionRequest[]>;
  error: string | null;
  onFork: (messageId: string) => void;
  onRevert: (messageId: string) => void;
  onReplyToQuestion: (requestID: string, answers: string[][]) => void;
  onRejectQuestion: (requestID: string) => void;
  onReplyToPermission: (requestID: string, response: 'once' | 'always' | 'reject') => void;
}

const SKIP_TOOLS = new Set(['step-start', 'step_start', 'reasoning', 'thinking', 'snapshot']);

export function ChatMessages({
  messages, models, sessionId, sessionAutoAccept, permissionRules,
  questions, permissions, error,
  onFork, onRevert, onReplyToQuestion, onRejectQuestion, onReplyToPermission,
}: ChatMessagesProps) {
  const partsMap = useStreamingStore(s => s.partsMap);
  const streamingMsgId = useStreamingStore(s => s.streamingMsgId);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  const handleChatScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const threshold = 70;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

  useEffect(() => {
    const hasPermissions = Object.values(permissions).some(arr => arr.length > 0);
    const hasQuestions = Object.values(questions).some(arr => arr.length > 0);
    if (isNearBottomRef.current || hasPermissions || hasQuestions) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, partsMap, permissions, questions]);

  return (
    <div ref={chatContainerRef} onScroll={handleChatScroll} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      <div style={{ width: '100%', maxWidth: 760, margin: '0 auto', padding: '12px 16px 80px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        {messages.length === 0 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-4)', gap: 8, paddingTop: 80 }}>
            <svg width="40" height="40" viewBox="0 0 100 100" fill="none" opacity={0.3}>
              <path d="M50 50 L8.432 26 L8.432 74 L50 98 Z" fill="rgba(255,255,255,0.08)" stroke="#CECDC3" strokeWidth="2.5" strokeLinejoin="round"/>
              <path d="M50 50 L91.568 26 L91.568 74 L50 98 Z" fill="rgba(255,255,255,0.08)" stroke="#CECDC3" strokeWidth="2.5" strokeLinejoin="round"/>
              <path d="M50 2 L8.432 26 L50 50 L91.568 26 Z" fill="none" stroke="#CECDC3" strokeWidth="2.5" strokeLinejoin="round"/>
            </svg>
            <span style={{ fontSize: 14 }}>Start a conversation</span>
          </div>
        )}

        {(() => {
          type Turn = { msgs: typeof messages };
          const turns: Turn[] = [];
          for (const msg of messages) {
            if (msg.role === 'user') {
              turns.push({ msgs: [msg] });
            } else {
              const last = turns[turns.length - 1];
              if (last && last.msgs[0].role === 'assistant') {
                last.msgs.push(msg);
              } else {
                turns.push({ msgs: [msg] });
              }
            }
          }
          return turns.map((turn, ti) => {
            if (turn.msgs[0].role === 'user') {
              const msg = turn.msgs[0];
              const isLastTurn = ti === turns.length - 1;
              return (
                <ChatMessage
                  key={msg.id}
                  msg={msg}
                  parts={partsMap[msg.id]}
                  isStreaming={msg.id === streamingMsgId}
                  onFork={onFork}
                  onRevert={!isLastTurn ? onRevert : undefined}
                />
              );
            }

            const allTrailParts: any[] = [];
            let finalTextMsg: any = null;
            let finalTailTextParts: any[] = [];

            for (const m of turn.msgs) {
              const mParts = partsMap[m.id] ?? [];
              const lastToolIdx = mParts.reduce((acc: number, p: any, i: number) =>
                (p.type === 'tool' && !SKIP_TOOLS.has((p.tool ?? p.toolName ?? '').toLowerCase())) ? i : acc, -1);

              if (lastToolIdx >= 0) {
                const trailSlice = mParts.slice(0, lastToolIdx + 1).filter((p: any) => {
                  if (p.type === 'tool') return !SKIP_TOOLS.has((p.tool ?? p.toolName ?? '').toLowerCase());
                  return p.type === 'text';
                });
                allTrailParts.push(...trailSlice);
                const tail = mParts.slice(lastToolIdx + 1).filter((p: any) => p.type === 'text');
                if (tail.length > 0) { finalTailTextParts = tail; finalTextMsg = m; }
              } else {
                const textParts = mParts.filter((p: any) => p.type === 'text');
                const text = textParts.map((p: any) => p.text ?? '').join('') || m.content;
                if (text.trim().length > 0 || m.id === streamingMsgId) {
                  finalTailTextParts = textParts.length > 0 ? textParts : [];
                  finalTextMsg = m;
                }
              }
            }

            if (!finalTextMsg && turn.msgs.length > 0) {
              const last = turn.msgs[turn.msgs.length - 1];
              if (last.id === streamingMsgId) { finalTextMsg = last; finalTailTextParts = []; }
            }

            const modelId = [...turn.msgs].reverse().find((m: any) => m.model)?.model;
            const modelName = modelId ? (models.find(m => m.id === modelId)?.name ?? modelId) : undefined;
            const providerName = modelId ? models.find(m => m.id === modelId)?.providerName : undefined;

            return (
              <div key={`turn-${ti}`} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {allTrailParts.length > 0 && (
                  <div style={{ marginBottom: finalTextMsg ? 6 : 0 }}>
                    <ToolGroup
                      parts={allTrailParts}
                      isStreaming={turn.msgs.some((m: any) => m.id === streamingMsgId)}
                      modelName={modelName}
                      providerName={providerName}
                    />
                  </div>
                )}
                {finalTextMsg && (
                  <ChatMessage
                    msg={finalTextMsg}
                    parts={finalTailTextParts.length > 0 ? finalTailTextParts : (partsMap[finalTextMsg.id] ?? []).filter((p: any) => p.type === 'text')}
                    isStreaming={finalTextMsg.id === streamingMsgId}
                    hideTools
                    modelName={modelName}
                    providerName={providerName}
                  />
                )}
              </div>
            );
          });
        })()}

        {sessionId && questions[sessionId]?.map(q => (
          <QuestionCard key={q.id} question={q} onReply={onReplyToQuestion} onReject={onRejectQuestion} />
        ))}

        {sessionId && permissions[sessionId]?.filter(p => !sessionAutoAccept[sessionId])?.map(p => (
          <PermissionCard key={p.id} permission={p} onReply={onReplyToPermission} configRule={permissionRules[p.permission?.toLowerCase()] || permissionRules['*']} />
        ))}

        {error && (
          <div style={{ padding: '8px 12px', background: '#2a1a1a', border: '1px solid #5a2a2a', borderRadius: 8, color: 'var(--red)', fontSize: 13 }}>{error}</div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
