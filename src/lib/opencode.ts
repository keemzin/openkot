/**
 * OpenCode SDK v2 client singleton.
 *
 * Routes through the Express proxy at /api — same host and port the browser
 * used to reach the app. This works from any device (localhost, mobile via IP,
 * etc.) because Express is always reachable and forwards to OpenCode internally.
 *
 * The Express proxy injects x-opencode-directory on every request, so we don't
 * need to pass { directory } separately — but we still do for SDK calls that
 * need it explicitly.
 */
import { createOpencodeClient } from '@opencode-ai/sdk/v2/client';
import type { OpencodeClient } from '@opencode-ai/sdk/v2/client';

export type { OpencodeClient };

let _client: OpencodeClient | null = null;

/** Default connection timeout (ms) for SDK fetch calls. */
const FETCH_TIMEOUT_MS = 30_000;

/**
 * Custom fetch that adds a 30-second timeout to all SDK requests.
 * We intentionally do NOT compose the caller's abort signal here — the SDK
 * sometimes aborts its own signal after a response is received (e.g. after
 * promptAsync completes), which would cause a spurious "signal is aborted
 * without reason" error even though the request succeeded.
 *
 * The caller's signal is still passed through so the SDK can cancel in-flight
 * SSE streams, but we only add our own timeout on top.
 */
const timeoutFetch: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), FETCH_TIMEOUT_MS);

  // Only use our timeout signal if the caller didn't provide one.
  // If the caller provided a signal, pass it through unchanged — composing
  // signals caused "aborted without reason" errors when the SDK cancelled
  // its own signal post-response.
  const signal = init?.signal ?? controller.signal;

  try {
    return await fetch(input, { ...init, signal });
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Returns a cached SDK client routed through the Express proxy.
 * Uses window.location.origin so it works from any device on any network.
 */
export function getClientSync(): OpencodeClient {
  if (_client) return _client;

  // Route through Express proxy — always reachable regardless of network topology.
  // Express strips /api and forwards to OpenCode, so the SDK sees the right endpoints.
  const base = typeof window !== 'undefined'
    ? `${window.location.origin}/api`
    : 'http://localhost:3006/api';

  console.log('[opencode] SDK connecting via proxy to', base);
  _client = createOpencodeClient({ baseUrl: base, fetch: timeoutFetch });
  return _client;
}

/**
 * Async version for compatibility with existing call sites.
 */
export async function getClient(): Promise<OpencodeClient> {
  return getClientSync();
}

/** Reset the singleton (e.g. after a server restart). */
export function resetClient(): void {
  _client = null;
}
