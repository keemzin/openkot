import { useRef, useCallback, useEffect } from 'react';
import type { Part, QuestionRequest, PermissionRequest, Message } from '../types';
import { getClient } from '../lib/opencode';
import { useStreamingStore } from '../stores/streamingStore';

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

/**
 * Safety poll interval (ms) — checks session.status periodically while loading.
 * Catches the case where SSE silently dies and never recovers.
 */
const SAFETY_POLL_INTERVAL = 3000;

/**
 * After an SSE reconnect, wait this long before checking if session went idle during the gap.
 */
const RECONNECT_STABILITY_DELAY = 2000;

export function useSessionEvents(options: SessionEventsOptions) {
  const {
    sessionAutoAcceptRef: _sessionAutoAcceptRef,
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
  } = options;

  // Store all callbacks in refs so listenToSession doesn't need stale-closure-free deps
  const callbacksRef = useRef({
    onMessageUpdate, onPartsUpdate, onStreamingMsgId, onBusySessions,
    onError, onLoading, onQuestionsUpdate, onPermissionsUpdate, onSessionIdle, getWorkingDir,
  });
  callbacksRef.current = {
    onMessageUpdate, onPartsUpdate, onStreamingMsgId, onBusySessions,
    onError, onLoading, onQuestionsUpdate, onPermissionsUpdate, onSessionIdle, getWorkingDir,
  };

  // AbortController replaces the old EventSource ref — abort() stops the stream
  const abortRef = useRef<AbortController | null>(null);
  const currentSessionIdRef = useRef<string>('');
  const loadingCheckTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Delta buffer + rAF flush — coalesce SSE deltas into a single React update per frame
  const deltaBufferRef = useRef<Map<string, Map<string, string>>>(new Map());
  const rafRef = useRef<number | null>(null);

  const cleanupSession = useCallback((sid: string, error?: string | null) => {
    const cbs = callbacksRef.current;
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    deltaBufferRef.current = new Map();
    cbs.onLoading(false);
    cbs.onStreamingMsgId(null);
    cbs.onBusySessions(prev => { const next = new Set(prev); next.delete(sid); return next; });
    if (error) cbs.onError(error);
    cbs.onSessionIdle();
    if (loadingCheckTimerRef.current) {
      clearInterval(loadingCheckTimerRef.current);
      loadingCheckTimerRef.current = null;
    }
  }, []);

  const listenToSession = useCallback((sid: string, tempId: string, isOngoing: boolean = false) => {
    const cbs = callbacksRef.current;

    // Cancel any existing stream before starting a new one
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    currentSessionIdRef.current = sid;

    if (!isOngoing) {
      cbs.onBusySessions(prev => new Set(prev).add(sid));
    }

    const abort = new AbortController();
    abortRef.current = abort;

    // ── Safety poll: while loading, periodically check session.status ──
    if (loadingCheckTimerRef.current) {
      clearInterval(loadingCheckTimerRef.current);
    }
    loadingCheckTimerRef.current = setInterval(async () => {
      if (abort.signal.aborted) return;
      const dir = callbacksRef.current.getWorkingDir();
      if (!dir || !sid) return;
      try {
        const client = await getClient();
        const resp: any = await client.session.status({ directory: dir });
        const statusData = resp?.data ?? resp;
        const sessionStatus = statusData?.[sid];
        // If session is no longer busy but we're still loading, SSE missed the idle event
        if (sessionStatus?.type !== 'busy') {
          console.warn('[useSessionEvents] safety poll: session idle but SSE missed it, recovering');
          abort.abort();
          abortRef.current = null;
          cleanupSession(sid);
        }
      } catch {}
    }, SAFETY_POLL_INTERVAL);

    // Fire-and-forget async loop — errors are handled inside
    (async () => {
      let reconnectDelay = 500; // start fast
      let failCount = 0;
      const MAX_RECONNECT_DELAY = 10000;

      while (!abort.signal.aborted) {
        try {
          const client = await getClient();
          if (abort.signal.aborted) return;

          const result = await client.event.subscribe({ directory: callbacksRef.current.getWorkingDir() || undefined });
          if (abort.signal.aborted) {
            result.stream.return(undefined);
            return;
          }
          const gen = result.stream;
          abort.signal.addEventListener('abort', () => { try { gen.return(undefined); } catch {} }, { once: true });

          // Check if this is a reconnection (failCount was > 0 before reset)
          const isReconnecting = failCount > 0;

          // Reset reconnect delay on successful connection
          reconnectDelay = 500;
          failCount = 0;

          // ── After reconnect, schedule a one-shot check for "missed idle" ──
          let reconnectStabilityTimer: ReturnType<typeof setTimeout> | null = null;
          if (isReconnecting) {
            reconnectStabilityTimer = setTimeout(async () => {
              if (abort.signal.aborted) return;
              const dir = callbacksRef.current.getWorkingDir();
              if (!dir || !sid) return;
              try {
                const client = await getClient();
                const resp: any = await client.session.status({ directory: dir });
                const statusData = resp?.data ?? resp;
                const sessionStatus = statusData?.[sid];
                if (sessionStatus?.type !== 'busy') {
                  console.warn('[useSessionEvents] reconnect check: session idle during gap, recovering');
                  cleanupSession(sid);
                }
              } catch {}
            }, RECONNECT_STABILITY_DELAY);
          }

          for await (const globalEvent of gen) {
            if (abort.signal.aborted) break;
            // Clear the reconnect stability timer since we got an event
            if (reconnectStabilityTimer) {
              clearTimeout(reconnectStabilityTimer);
              reconnectStabilityTimer = null;
            }

          const cb = callbacksRef.current;

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

          // ── message.part.delta (true streaming — buffer + rAF flush) ──
          if (type === 'message.part.delta') {
            const { messageID, partID, field, delta } = p as {
              messageID: string; partID: string; field: string; delta: string;
            };
            if (field !== 'text' || !delta || !messageID || !partID) continue;

            cb.onStreamingMsgId(messageID);

            // Buffer the delta — accumulate per messageID+partID
            const buf = deltaBufferRef.current;
            let partBuf = buf.get(messageID);
            if (!partBuf) { partBuf = new Map(); buf.set(messageID, partBuf); }
            partBuf.set(partID, (partBuf.get(partID) ?? '') + delta);

            // Schedule rAF flush if not already scheduled
            if (rafRef.current === null) {
              rafRef.current = requestAnimationFrame(() => {
                rafRef.current = null;
                const batch = deltaBufferRef.current;
                deltaBufferRef.current = new Map();
                if (batch.size > 0) {
                  useStreamingStore.getState().applyDeltaBatch(batch);
                }
              });
            }
            continue;
          }

          // ── message.part.updated ───────────────────────────────────────
          if (type === 'message.part.updated') {
            const part = p.part as Part;
            if (!part?.id) continue;
            const msgId = (part as any).messageID ?? tempId;

            cb.onMessageUpdate(prev => {
              if (prev.some(m => m.id === msgId)) return prev;
              return prev.map(m => m.id === tempId ? { ...m, id: msgId } : m);
            });
            cb.onStreamingMsgId(msgId);
            cb.onPartsUpdate(prev => {
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

          // ── message.removed ────────────────────────────────────────────
          // Fired by OpenCode after revert — remove the message from UI
          if (type === 'message.removed') {
            const removedId = p.messageID as string;
            if (removedId) {
              cb.onMessageUpdate(prev => prev.filter(m => m.id !== removedId));
              cb.onPartsUpdate(prev => {
                const next = { ...prev };
                delete next[removedId];
                return next;
              });
            }
            continue;
          }

          // ── message.updated ────────────────────────────────────────────
          if (type === 'message.updated') {
            const info = p.info as any;
            if (!info?.id) continue;

            // Skip messages that OpenCode has marked as reverted
            if (info.revert) continue;

            cb.onMessageUpdate(prev => {
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
                    cb.onPartsUpdate((pm: Record<string, Part[]>) => {
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
            if (info.role === 'assistant') cb.onStreamingMsgId(info.id);
            continue;
          }

          // ── session.idle ───────────────────────────────────────────────
          if (type === 'session.idle') {
            cleanupSession(sid);
            abort.abort();
            abortRef.current = null;
            break;
          }

          // ── session.error ──────────────────────────────────────────────
          if (type === 'session.error') {
            const err = p.error as any;
            cleanupSession(sid, err?.data?.message ?? err?.message ?? 'Unknown error');
            abort.abort();
            abortRef.current = null;
            break;
          }

           // ── permission.asked (v2 name) ─────────────────────────────────
           if (type === 'permission.asked') {
             const permission = p as PermissionRequest;
             if (!permission?.id || !permission.sessionID) continue;

             console.log('permission.asked', { permissionId: permission.id, sessionID: permission.sessionID, autopilotDisabled: true });
             cb.onPermissionsUpdate(prev => {
               const existing = prev[permission.sessionID] ?? [];
               const idx = existing.findIndex(pp => pp.id === permission.id);
               const next = [...existing];
               if (idx >= 0) next[idx] = permission;
               else next.push(permission);
               return { ...prev, [permission.sessionID]: next };
             });
             continue;
          }

          // ── permission.replied ─────────────────────────────────────────
          if (type === 'permission.replied') {
            const props = p as { sessionID?: string; requestID?: string };
            if (props.sessionID && props.requestID) {
              cb.onPermissionsUpdate(prev => {
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
              cb.onQuestionsUpdate(prev => {
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
              cb.onQuestionsUpdate(prev => {
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
        } // end for-await

        // Clear reconnect stability timer if still pending
        if (reconnectStabilityTimer) {
          clearTimeout(reconnectStabilityTimer);
          reconnectStabilityTimer = null;
        }

        // Stream ended without session.idle — unexpected disconnect
        // Wait and reconnect unless aborted
        if (!abort.signal.aborted) {
          failCount++;
          console.warn(`[useSessionEvents] stream ended unexpectedly (attempt ${failCount}), reconnecting in ${reconnectDelay}ms...`);
          if (failCount >= 2) callbacksRef.current.onError(`Connection lost. Reconnecting...`);
          await new Promise(r => setTimeout(r, reconnectDelay));
          if (failCount >= 2) callbacksRef.current.onError(null);
          reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
        }

      } catch (err: any) {
        if (err?.name === 'AbortError' || abort.signal.aborted) return;
        console.error('[useSessionEvents] stream error:', err);
        if (!abort.signal.aborted) {
          failCount++;
          if (failCount >= 2) {
            callbacksRef.current.onError(`Connection error. Reconnecting in ${reconnectDelay / 1000}s...`);
          }
          await new Promise(r => setTimeout(r, reconnectDelay));
          if (failCount >= 2) callbacksRef.current.onError(null);
          reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
        }
      }
      } // end while
    })();

  }, []); // All callbacks accessed via callbacksRef.current — no dependencies needed

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
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    deltaBufferRef.current = new Map();
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  return { listenToSession, stopListening };
}
