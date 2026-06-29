let webpush;
try { webpush = require('web-push'); } catch { webpush = null; }

if (webpush && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL || 'admin@levco.app'}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// sessionId → PushSubscription object
const subscriptions = new Map();

function saveSubscription(sessionId, subscription) {
  subscriptions.set(sessionId, subscription);
}

function getPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

async function sendNotification(sessionId, payload) {
  if (!isConfigured()) return;
  const sub = subscriptions.get(sessionId);
  if (!sub) return;
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload));
  } catch (err) {
    if (err.statusCode === 410) subscriptions.delete(sessionId); // subscription expired
    else throw err;
  }
}

async function broadcast(payload) {
  if (!isConfigured()) return;
  await Promise.allSettled(
    [...subscriptions.values()].map(sub =>
      webpush.sendNotification(sub, JSON.stringify(payload))
    )
  );
}

const isConfigured = () =>
  Boolean(webpush && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

module.exports = { saveSubscription, getPublicKey, sendNotification, broadcast, isConfigured };
