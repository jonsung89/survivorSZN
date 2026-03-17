/**
 * Anonymous session ID for non-authenticated user tracking.
 * Persists in localStorage so the same browser/device gets the same ID across visits.
 */

const SESSION_KEY = 'szn_session_id';

function generateId() {
  // Simple UUID v4-like ID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getOrCreateSessionId() {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = generateId();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}
