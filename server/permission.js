// Permission auto-accept (autopilot) module
// Matches OpenChamber's pattern for per-session auto-accept with ancestor inheritance

// Sessions where the client has enabled Permission Auto-Accept (autopilot)
const autoAcceptingSessions = new Set();

// Set auto-accept state for a session
const setAutoAcceptSession = (sessionId, enabled) => {
  if (typeof sessionId !== 'string' || sessionId.length === 0) return;
  if (enabled) {
    autoAcceptingSessions.add(sessionId);
  } else {
    autoAcceptingSessions.delete(sessionId);
  }
};

// Cache for session parent IDs (for auto-accept inheritance)
const sessionParentIdCache = new Map();
const SESSION_PARENT_CACHE_TTL_MS = 60 * 1000;

const getCachedSessionParentId = (sessionId) => {
  const entry = sessionParentIdCache.get(sessionId);
  if (!entry) return undefined;
  if (Date.now() - entry.at > SESSION_PARENT_CACHE_TTL_MS) {
    sessionParentIdCache.delete(sessionId);
    return undefined;
  }
  return entry.parentID;
};

const setCachedSessionParentId = (sessionId, parentID) => {
  sessionParentIdCache.set(sessionId, { parentID: parentID ?? null, at: Date.now() });
};

const fetchSessionParentId = async (sessionId, fetchFn) => {
  if (!sessionId) return undefined;

  const cached = getCachedSessionParentId(sessionId);
  if (cached !== undefined) return cached;

  try {
    const response = await fetchFn(`/session/${encodeURIComponent(sessionId)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) return undefined;
    const session = await response.json().catch(() => null);
    if (!session || typeof session !== 'object') return undefined;

    const parentID = session.parentID ? session.parentID : null;
    setCachedSessionParentId(sessionId, parentID);
    return parentID;
  } catch {
    return undefined;
  }
};

// Check if session or any ancestor has auto-accept enabled
const isSessionAutoAccepting = async (sessionId, fetchFn) => {
  if (!sessionId || autoAcceptingSessions.size === 0) return false;
  let current = sessionId;
  const seen = new Set();
  while (current && !seen.has(current)) {
    if (autoAcceptingSessions.has(current)) return true;
    seen.add(current);
    const parent = await fetchSessionParentId(current, fetchFn);
    if (!parent) return false;
    current = parent;
  }
  return false;
};

// Create routes for permission auto-accept
const createPermissionRoutes = (app, { OPENCODE_HOST, OPENCODE_PORT }) => {
  const jsonBody = require('express').json();

  // Auto-accept (autopilot) endpoint - mirror client-side state to server
  app.post('/api/notifications/auto-accept', jsonBody, (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
    const enabled = body.enabled === true;
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId required' });
    }
    setAutoAcceptSession(sessionId, enabled);
    console.log(`[auto-accept] Session ${sessionId}: ${enabled ? 'enabled' : 'disabled'}`);
    return res.json({ success: true, sessionId, enabled });
  });

  // Check if session (or any ancestor) has auto-accept enabled
  app.get('/api/sessions/:id/auto-accept', async (req, res) => {
    const sessionId = req.params.id;
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId required' });
    }
    const isAutoAccepting = await isSessionAutoAccepting(sessionId, (url, options) =>
      fetch(`http://${OPENCODE_HOST}:${OPENCODE_PORT}${url}`, options)
    );
    return res.json({ sessionId, autoAccept: isAutoAccepting });
  });

  // Debug endpoint to check auto-accept state
  app.get('/api/debug/auto-accept', (req, res) => {
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : null;
    const result = {
      autoAcceptingSessions: Array.from(autoAcceptingSessions),
      sessionParentIdCache: Object.fromEntries(sessionParentIdCache),
    };
    if (sessionId) {
      isSessionAutoAccepting(sessionId, (url, options) =>
        fetch(`http://${OPENCODE_HOST}:${OPENCODE_PORT}${url}`, options)
      ).then(accepting => {
        result.isSessionAutoAccepting = accepting;
        res.json(result);
      }).catch(err => {
        result.error = err.message;
        res.json(result);
      });
    } else {
      res.json(result);
    }
  });
};

module.exports = {
  autoAcceptingSessions,
  setAutoAcceptSession,
  isSessionAutoAccepting,
  createPermissionRoutes,
  // Exported for testing
  fetchSessionParentId,
  getCachedSessionParentId,
  setCachedSessionParentId,
};
