// Web Push to installed PWAs. CommonJS so the Telegram bot process can use it too.
// Needs VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY in .env (generate once: `npx web-push generate-vapid-keys`).
const webpush = require('web-push');

let configured = null;
function ready() {
  if (configured !== null) return configured;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return (configured = false);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@fairshare.app', pub, priv);
  return (configured = true);
}

function pushEnabled() {
  return ready();
}

/**
 * Send one notification to every device a user has enabled.
 * payload: { title, body, url, tag }
 * Dead subscriptions (uninstalled app, revoked permission) are cleaned up.
 */
async function pushToUser(prisma, userId, payload) {
  if (!ready()) return { sent: 0 };
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 24 * 3600, urgency: 'normal' },
      );
      sent++;
    } catch (e) {
      if (e && (e.statusCode === 404 || e.statusCode === 410)) {
        await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
      } else {
        console.error('Push failed', e && (e.statusCode || e.message));
      }
    }
  }));
  return { sent };
}

module.exports = { pushEnabled, pushToUser };
