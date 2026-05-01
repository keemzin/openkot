import { useRef, useCallback } from 'react';
import type { Part, QuestionRequest, PermissionRequest, Message } from '../types';

interface SessionEventsOptions {
  autopilotRef: React.MutableRefObject<boolean>;
  getWorkingDir: () => string;
  onMessageUpdate: (updater: (prev: Message[]) => Message[]) => void;
  onPartsUpdate: (updater: (prev: Record<string, Part[]>) => Record<string, Part[]>) => void;
  onStreamingMsgId: (id: string | null) => void;
  onBusySessions: (updater: (prev: Set<string>) => Set<string>) => void;
  onError: (error: string | null) => void;
  onLoading: (loading: boolean) => void;
  onQuestionsUpdate: (updater: (prev: Record<string, QuestionRequest[]>) => Record<string, QuestionRequest[]>) => void;
  onPermissionsUpdate: (updater: (prev: Record<string, PermissionRequest[]>) => Record<string, PermissionRequest[]>) => void;
  onSessionIdle: () => void;
}

export function useSessionEvents({
  autopilotRef,
  getWorkingDir,
  onMessageUpdate,
  onPartsUpdate,
  onStreamingMsgId,
  onBusySessions,
  onError,
  onLoading,
  onQuestionsUpdate,
  onPermissionsUpdate,
  onSessionIdle,
}: SessionEventsOptions) {
  const eventSourceRef = useRef<EventSource | null>(null);

  const listenToSession = useCallback((sid: string, tempId: string, isOngoing: boolean = false) => {
    if (eventSourceRef.current) eventSourceRef.current.close();
    const dir = getWorkingDir();
    const es = new EventSource(`/api/event?directory=${encodeURIComponent(dir)}`);
    eventSourceRef.current = es;

    if (!isOngoing) {
      onBusySessions(prev => new Set(prev).add(sid));
    }

    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        const type = payload?.type;
        const evtSid = payload?.properties?.part?.sessionID ?? payload?.properties?.info?.sessionID ?? payload?.properties?.sessionID;
        if (evtSid && evtSid !== sid) return;

        if (type === 'message.part.updated') {
          const part: Part = payload?.properties?.part;
          if (!part?.id) return;
          const msgId = (part as any).messageID ?? tempId;
          onMessageUpdate(prev => {
            if (prev.some(m => m.id === msgId)) return prev;
            return prev.map(m => m.id === tempId ? { ...m, id: msgId } : m);
          });
          onStreamingMsgId(msgId);
          onPartsUpdate(prev => {
            const base = prev[msgId] ?? prev[tempId] ?? [];
            const existing = base;
            const idx = existing.findIndex(p => p.id === part.id);
            const next = [...existing];
            if (idx >= 0) next[idx] = part; else next.push(part);
            const updated: Record<string, Part[]> = { ...prev, [msgId]: next };
            if (msgId !== tempId) delete updated[tempId];
            return updated;
          });
        }

        if (type === 'message.updated') {
          const info = payload?.properties?.info;
          if (!info?.id) return;
          onMessageUpdate(prev => {
            if (prev.some(m => m.id === info.id)) {
              if (info.role === 'assistant' && (info.tokens || info.cost || info.model)) {
                return prev.map(m => m.id === info.id ? {
                  ...m,
                  tokens: info.tokens,
                  cost: info.cost,
                  model: info.model,
                } : m);
              }
              return prev;
            }
            if (info.role === 'user') {
              if (prev.some(m => m.id.startsWith('temp_user_'))) {
                const tempUserId = prev.find(m => m.id.startsWith('temp_user_'))?.id;
                if (tempUserId) {
                  onPartsUpdate((pm: Record<string, Part[]>) => {
                    if (!pm[tempUserId]) return pm;
                    const next: Record<string, Part[]> = { ...pm, [info.id]: pm[tempUserId] };
                    delete next[tempUserId];
                    return next;
                  });
                }
                return prev.map(m => m.id.startsWith('temp_user_') ? { id: info.id, role: info.role, content: '' } : m);
              }
            }
            if (info.role === 'assistant') {
              if (prev.some(m => m.id === tempId)) {
                return prev.map(m => m.id === tempId ? { id: info.id, role: info.role, content: '' } : m);
              }
            }
            return [...prev, { id: info.id, role: info.role, content: '' }];
          });
          if (info.role === 'assistant') onStreamingMsgId(info.id);
        }

        if (type === 'session.idle') {
          onLoading(false);
          onStreamingMsgId(null);
          onBusySessions(prev => { const next = new Set(prev); next.delete(sid); return next; });
          es.close();
          eventSourceRef.current = null;
          onSessionIdle();
        }

        if (type === 'session.error') {
          onError(payload?.properties?.error?.message ?? 'Unknown error');
          onLoading(false);
          onStreamingMsgId(null);
          onBusySessions(prev => { const next = new Set(prev); next.delete(sid); return next; });
          es.close();
          eventSourceRef.current = null;
        }

        if (type === 'question.asked') {
          const question = payload?.properties as QuestionRequest;
          if (question?.id && question.sessionID) {
            onQuestionsUpdate(prev => {
              const sessionQuestions = prev[question.sessionID] ?? [];
              const idx = sessionQuestions.findIndex(q => q.id === question.id);
              const next = [...sessionQuestions];
              if (idx >= 0) next[idx] = question;
              else next.push(question);
              return { ...prev, [question.sessionID]: next };
            });
          }
        }

        if (type === 'question.replied' || type === 'question.rejected') {
          const props = payload?.properties as { sessionID?: string; requestID?: string };
          if (props.sessionID && props.requestID) {
            onQuestionsUpdate(prev => {
              const sessionQuestions = prev[props.sessionID!] ?? [];
              const filtered = sessionQuestions.filter(q => q.id !== props.requestID);
              if (filtered.length === 0) {
                const next = { ...prev };
                delete next[props.sessionID!];
                return next;
              }
              return { ...prev, [props.sessionID!]: filtered };
            });
          }
        }

        if (type === 'permission.asked') {
          const permission = payload?.properties as PermissionRequest;
          if (permission?.id && permission.sessionID) {
            if (autopilotRef.current) {
              fetch('/api/permission/reply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionID: permission.sessionID, requestID: permission.id, reply: 'always', directory: getWorkingDir() }),
              }).catch(() => {});
            } else {
              onPermissionsUpdate(prev => {
                const sessionPermissions = prev[permission.sessionID] ?? [];
                const idx = sessionPermissions.findIndex(p => p.id === permission.id);
                const next = [...sessionPermissions];
                if (idx >= 0) next[idx] = permission;
                else next.push(permission);
                return { ...prev, [permission.sessionID]: next };
              });
            }
          }
        }

        if (type === 'permission.replied' || type === 'permission.rejected') {
          const props = payload?.properties as { sessionID?: string; requestID?: string };
          if (props.sessionID && props.requestID) {
            onPermissionsUpdate(prev => {
              const sessionPermissions = prev[props.sessionID!] ?? [];
              const filtered = sessionPermissions.filter(p => p.id !== props.requestID);
              if (filtered.length === 0) {
                const next = { ...prev };
                delete next[props.sessionID!];
                return next;
              }
              return { ...prev, [props.sessionID!]: filtered };
            });
          }
        }
      } catch {}
    };

    es.onerror = () => {
      onLoading(false);
      onStreamingMsgId(null);
      onBusySessions(prev => { const next = new Set(prev); next.delete(sid); return next; });
      es.close();
      eventSourceRef.current = null;
    };
  }, [getWorkingDir]);

  const stopListening = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  return { listenToSession, stopListening };
}
