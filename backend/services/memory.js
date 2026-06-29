const HISTORY_LIMIT = 8; // 4 échanges (user + assistant)
const TTL_MS = 2 * 60 * 60 * 1000; // 2h d'inactivité

const store = new Map(); // sessionId → { history, lastSeen }

function getHistory(sessionId) {
  const entry = store.get(sessionId);
  if (!entry) return [];
  entry.lastSeen = Date.now();
  return entry.history;
}

function addExchange(sessionId, userMsg, assistantMsg) {
  const entry = store.get(sessionId) || { history: [], lastSeen: Date.now() };
  entry.history.push(
    { role: 'user',      content: userMsg      },
    { role: 'assistant', content: assistantMsg }
  );
  if (entry.history.length > HISTORY_LIMIT) {
    entry.history.splice(0, entry.history.length - HISTORY_LIMIT);
  }
  entry.lastSeen = Date.now();
  store.set(sessionId, entry);
}

function clearSession(sessionId) {
  store.delete(sessionId);
}

// Purge des sessions inactives toutes les 15 min
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of store) {
    if (now - entry.lastSeen > TTL_MS) store.delete(id);
  }
}, 15 * 60 * 1000);

module.exports = { getHistory, addExchange, clearSession };
