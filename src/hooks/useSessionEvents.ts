import { useRef, useCallback, useEffect } from 'react';
import type { Part, QuestionRequest, PermissionRequest, Message } from '../types';
import { getClient } from '../lib/opencode';

interface SessionEventsOptions {
  sessionAutoAcceptRef: React.MutableRefObject<Record<string, boolean>>;
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
  sessionAutoAcceptRef,
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
  // AbortController replaces the old EventSource ref — abort() stops the stream
  const abortRef = useRef<AbortController | null>(null);
  const currentSessionIdRef = useRef<string>('');

  const listenToSession = useCallback((sid: string, tempId: string, isOngoing: boolean = false) => {
    // Cancel any existing stream before starting a new one
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    currentSessionIdRef.current = sid;

    if (!isOngoing) {
      onBusySessions(prev => new Set(prev).add(sid));
    }

    const abort = new AbortController();
    abortRef.current = abort;

    // Fire-and-forget async loop — errors are handled inside
    (async () => {
      try {
        const client = await getClient();
        // Check abort after each async operation — stopListening() may have
        // been called while getClient() or client.global.event() was awaiting
        if (abort.signal.aborted) return;

        const result = await client.global.event();
        if (abort.signal.aborted) {
          // Stream opened but we were already aborted — close it immediately
          result.stream.return(undefined);
          return;
        }
        const gen = result.stream;

        // Stop the generator when aborted
        abort.signal.addEventListener('abort', () => gen.return(undefined), { once: true });

        for await (const globalEvent of gen) {
          if (abort.signal.aborted) break;

          // v2 wraps events in { directory, payload }
          const event = (globalEvent as any)?.payload ?? globalEvent;
          const { type } = event as { type: string };

          // ── Filter by session ──────────────────────────────────────────
          const p = event.properties as any;
          const evtSid: string | undefined =
            p?.part?.sessionID ??
            p?.info?.sessionID ??
            p?.sessionID;
          if (evtSid && evtSid !== sid) continue;

          // ── message.part.delta (true streaming — append delta to part text) ──
          if (type === 'message.part.delta') {
            const { messageID, partID, field, delta } = p as {
              messageID: string; partID: string; field: string; delta: string;
            };
            if (field !== 'text' || !delta || !messageID || !partID) continue;

            onStreamingMsgId(messageID);
            onPartsUpdate(prev => {
              const existing = prev[messageID] ?? [];
              const idx = existing.findIndex(pp => pp.id === partID);
              if (idx >= 0) {
                // Append delta to existing text part
                const part = existing[idx];
                const next = [...existing];
                next[idx] = { ...part, text: ((part.text as string) ?? '') + delta };
                return { ...prev, [messageID]: next };
              } else {
                // New part — create it with the delta as initial text
                return {
                  ...prev,
                  [messageID]: [...existing, { id: partID, type: 'text', text: delta, messageID, sessionID: evtSid ?? '' } as any],
                };
              }
            });
            continue;
          }

          // ── message.part.updated ───────────────────────────────────────
          if (type === 'message.part.updated') {
            const part = p.part as Part;
            if (!part?.id) continue;
            const msgId = (part as any).messageID ?? tempId;

            onMessageUpdate(prev => {
              if (prev.some(m => m.id === msgId)) return prev;
              return prev.map(m => m.id === tempId ? { ...m, id: msgId } : m);
            });
            onStreamingMsgId(msgId);
            onPartsUpdate(prev => {
              const base = prev[msgId] ?? prev[tempId] ?? [];
              const idx = base.findIndex(pp => pp.id === part.id);
              const next = [...base];
              if (idx >= 0) next[idx] = part;
              else next.push(part);
              const updated: Record<string, Part[]> = { ...prev, [msgId]: next };
              if (msgId !== tempId) delete updated[tempId];
              return updated;
            });
            continue;
          }

          // ── message.updated ────────────────────────────────────────────
          if (type === 'message.updated') {
            const info = p.info as any;
            if (!info?.id) continue;

            onMessageUpdate(prev => {
              if (prev.some(m => m.id === info.id)) {
                if (info.role === 'assistant' && (info.tokens || info.cost || info.modelID)) {
                  return prev.map(m => m.id === info.id ? {
                    ...m,
                    tokens: info.tokens,
                    cost: info.cost,
                    model: info.modelID ?? info.model,
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
            continue;
          }

          // ── session.idle ───────────────────────────────────────────────
          if (type === 'session.idle') {
            onLoading(false);
            onStreamingMsgId(null);
            onBusySessions(prev => { const next = new Set(prev); next.delete(sid); return next; });
            abort.abort();
            abortRef.current = null;
            onSessionIdle();
            break;
          }

          // ── session.error ──────────────────────────────────────────────
          if (type === 'session.error') {
            const err = p.error as any;
            onError(err?.data?.message ?? err?.message ?? 'Unknown error');
            onLoading(false);
            onStreamingMsgId(null);
            onBusySessions(prev => { const next = new Set(prev); next.delete(sid); return next; });
            abort.abort();
            abortRef.current = null;
            break;
          }

          // ── permission.asked (v2 name) ─────────────────────────────────
          if (type === 'permission.asked') {
            const permission = p as PermissionRequest;
            if (!permission?.id || !permission.sessionID) continue;

            const quickCheck = !!sessionAutoAcceptRef.current[permission.sessionID];
            console.log('permission.asked', { permissionId: permission.id, sessionID: permission.sessionID, quickCheck });

            if (quickCheck) {
              getClient().then(client => client.permission.reply({
                requestID: permission.id,
                reply: 'once',
                directory: getWorkingDir(),
              })).catch(() => {});
            } else {
              fetch(`/api/sessions/${permission.sessionID}/auto-accept`)
                .then(r => r.json())
                .then(data => {
                  if (data.autoAccept) {
                    getClient().then(client => client.permission.reply({
                      requestID: permission.id,
                      reply: 'once',
                      directory: getWorkingDir(),
                    })).catch(() => {});
                  } else {
                    onPermissionsUpdate(prev => {
                      const existing = prev[permission.sessionID] ?? [];
                      const idx = existing.findIndex(pp => pp.id === permission.id);
                      const next = [...existing];
                      if (idx >= 0) next[idx] = permission;
                      else next.push(permission);
                      return { ...prev, [permission.sessionID]: next };
                    });
                  }
                })
                .catch(() => {
                  onPermissionsUpdate(prev => {
                    const existing = prev[permission.sessionID] ?? [];
                    const idx = existing.findIndex(pp => pp.id === permission.id);
                    const next = [...existing];
                    if (idx >= 0) next[idx] = permission;
                    else next.push(permission);
                    return { ...prev, [permission.sessionID]: next };
                  });
                });
            }
            continue;
          }

          // ── permission.replied ─────────────────────────────────────────
          if (type === 'permission.replied') {
            const props = p as { sessionID?: string; requestID?: string };
            if (props.sessionID && props.requestID) {
              onPermissionsUpdate(prev => {
                const existing = prev[props.sessionID!] ?? [];
                const filtered = existing.filter(pp => pp.id !== props.requestID);
                if (filtered.length === 0) {
                  const next = { ...prev };
                  delete next[props.sessionID!];
                  return next;
                }
                return { ...prev, [props.sessionID!]: filtered };
              });
            }
            continue;
          }

          // ── question.asked (v2 native) ─────────────────────────────────
          if (type === 'question.asked') {
            const question = p as QuestionRequest;
            if (question?.id && question.sessionID) {
              onQuestionsUpdate(prev => {
                const existing = prev[question.sessionID] ?? [];
                const idx = existing.findIndex(q => q.id === question.id);
                const next = [...existing];
                if (idx >= 0) next[idx] = question;
                else next.push(question);
                return { ...prev, [question.sessionID]: next };
              });
            }
            continue;
          }

          // ── question.replied / question.rejected ───────────────────────
          if (type === 'question.replied' || type === 'question.rejected') {
            const props = p as { sessionID?: string; requestID?: string };
            if (props.sessionID && props.requestID) {
              onQuestionsUpdate(prev => {
                const existing = prev[props.sessionID!] ?? [];
                const filtered = existing.filter(q => q.id !== props.requestID);
                if (filtered.length === 0) {
                  const next = { ...prev };
                  delete next[props.sessionID!];
                  return next;
                }
                return { ...prev, [props.sessionID!]: filtered };
              });
            }
            continue;
          }
        }
      } catch (err: any) {
        if (err?.name === 'AbortError' || abort.signal.aborted) return;
        console.error('[useSessionEvents] stream error:', err);
        onLoading(false);
        onStreamingMsgId(null);
        onBusySessions(prev => { const next = new Set(prev); next.delete(sid); return next; });
        abortRef.current = null;
      }
    })();

  }, [getWorkingDir]);

  // Reconnect on tab visibility change (mobile / background tab fix)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) return;
      if (currentSessionIdRef.current && !abortRef.current) {
        listenToSession(currentSessionIdRef.current, '', true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [listenToSession]);

  const stopListening = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  return { listenToSession, stopListening };
}
