// Permission module - autopilot functionality removed
// Kept for compatibility with other imports

// Export empty functions/objects to prevent import errors
const autoAcceptingSessions = new Set();
const setAutoAcceptSession = () => {};
const isSessionAutoAccepting = async () => false;
const createPermissionRoutes = (app) => {};
const fetchSessionParentId = async () => undefined;
const getCachedSessionParentId = () => undefined;
const setCachedSessionParentId = () => {};

module.exports = {
  autoAcceptingSessions,
  setAutoAcceptSession,
  isSessionAutoAccepting,
  createPermissionRoutes,
  fetchSessionParentId,
  getCachedSessionParentId,
  setCachedSessionParentId,
};