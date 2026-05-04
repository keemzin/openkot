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
  _client = createOpencodeClient({ baseUrl: base });
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
