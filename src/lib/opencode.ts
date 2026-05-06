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
 * Custom fetch that composes the caller's abort signal (from the SDK) with a
 * 30-second timeout.  When the SDK cancels an SSE stream or the connection
 * hangs, whichever signal fires first wins — preventing the random hangs
 * seen during tool-call streaming.
 */
const timeoutFetch: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  // Compose: caller signal (SDK abort) + our timeout, first one wins.
  const signals: AbortSignal[] = [controller.signal];
  if (init?.signal) signals.push(init.signal);

  const composedSignal =
    typeof AbortSignal.any === 'function'
      ? AbortSignal.any(signals)
      : controller.signal; // fallback for older browsers

  try {
    return await fetch(input, { ...init, signal: composedSignal });
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
