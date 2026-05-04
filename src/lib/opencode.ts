/**
 * OpenCode SDK v2 client singleton.
 *
 * Connects directly to the OpenCode binary (bypassing the Express proxy).
 * The port is read from /config at startup — the server exposes it so the
 * frontend always uses the correct port even when the CLI picks a free one.
 *
 * Every SDK call passes { directory } explicitly, which is the v2 equivalent
 * of the proxy's x-opencode-directory header injection.
 */
import { createOpencodeClient } from '@opencode-ai/sdk/v2/client';
import type { OpencodeClient } from '@opencode-ai/sdk/v2/client';

export type { OpencodeClient };

let _client: OpencodeClient | null = null;
let _initPromise: Promise<OpencodeClient> | null = null;

/**
 * Initialise and cache the SDK client.
 * Reads opencodePort from /config so it works with dynamic port assignment.
 * Safe to call multiple times — only initialises once.
 */
export async function getClient(): Promise<OpencodeClient> {
  if (_client) return _client;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    let opencodePort = 3358; // default from .env

    try {
      const res = await fetch('/config');
      if (res.ok) {
        const cfg = await res.json();
        if (cfg.opencodePort) opencodePort = Number(cfg.opencodePort);
      }
    } catch {
      console.warn('[opencode] /config unreachable, using default port', opencodePort);
    }

    // Always connect to 127.0.0.1 from the browser — the bind host (0.0.0.0)
    // is the server-side listen address, not the client-side connect address.
    const baseUrl = `http://127.0.0.1:${opencodePort}`;
    console.log('[opencode] SDK connecting to', baseUrl);

    _client = createOpencodeClient({ baseUrl });
    return _client;
  })();

  return _initPromise;
}

/** Reset the singleton — call after a server restart on a new port. */
export function resetClient(): void {
  _client = null;
  _initPromise = null;
}
