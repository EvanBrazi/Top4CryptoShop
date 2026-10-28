/**
 * @file notifications.js
 * @module utils/notifications
 * @description
 *  - وحدة مركزية لإدارة إشعارات WebSocket
 *  - تدعم الإرسال الموجه حسب الدور أو المستخدم
 *  - تخزن الإشعارات غير المستلمة وتعيد إرسالها عند الاتصال
 *  - تمنع التكرار عبر حقل notified
 *  - قابلة للتوسع لدعم غرف أو أنواع إضافية
 *
 * @author Evan Brazi
 * @version 2.0.0
 * @lastModified 2025-09-03
 */

// TODO Step 5: Order and Payment notifications remain disabled until shared socket authentication.
// Never fetch financial resources using client-asserted socket identities.
function financialPayload(payload) {
  return /payment|order/i.test(String(payload?.type || '')) || payload?.paymentId !== undefined || payload?.orderId !== undefined ||
    ['payment', 'order'].includes(payload?.sourceType);
}
const PendingNotification = require('../models/PendingNotification');

let wss = null;
const userNotificationSessions = new Map(); // لتتبع جلسات المستخدمين المتصلين

/**
 * تهيئة WebSocket وربط جلسات المستخدمين
 * @param {WebSocket.Server} serverInstance - مثيل WebSocket من السيرفر
 */
function initNotifications(serverInstance) {
  wss = serverInstance;

  wss.on('connection', (ws) => {
    ws.userType = 'guest';
    ws.userId = null;
    ws.sessionId = null;

    ws.on('message', async msg => {
      try {
        const data = JSON.parse(msg);

        if (data.type === 'auth') {
          ws.userType = data.role;
          ws.userId = data.userId;
          ws.sessionId = data.sessionId || `${data.userId}_${Date.now()}`;

          console.log(`✅ مصادقة ${ws.userType}: ${ws.userId}`);

          const isFirstSession = !userNotificationSessions.has(ws.userId);

          if (ws.userType === 'admin') {
            await sendPendingToAdmin(ws);
          } else if (ws.userType === 'user') {
            await sendPendingToUser(ws.userId, ws);
            if (isFirstSession) {
              await sendStatusToUser(ws.userId, ws);
            }
            userNotificationSessions.set(ws.userId, {
              sessionId: ws.sessionId,
              lastNotification: new Date()
            });
          }
        }
      } catch (err) {
        console.error('❌ رسالة WebSocket غير صالحة'); // Never log raw inbound bodies or targets.
      }
    });

    ws.on('close', () => {
      if (ws.userId && userNotificationSessions.has(ws.userId)) {
        userNotificationSessions.delete(ws.userId);
      }
    });
  });
}

/**
 * إرسال الطلبات والدفعات المعلقة للأدمن
 * @param {WebSocket} ws - جلسة الأدمن
 */
async function sendPendingToAdmin(ws) {
  // TODO Step 5: no Order/Payment queries or dispatch for unverified socket roles.
}

/**
 * إرسال الطلبات والدفعات المقبولة أو المرفوضة للمستخدم (مرة واحدة فقط)
 * @param {String} userId - معرف المستخدم
 * @param {WebSocket} ws - جلسة المستخدم
 */
async function sendStatusToUser(userId, ws) {
  // TODO Step 5: financial status reads require real shared socket authentication.
}

/**
 * إرسال الإشعارات المؤقتة للمستخدم عند عودته
 * @param {String} userId - معرف المستخدم
 * @param {WebSocket} ws - جلسة المستخدم
 */
async function sendPendingToUser(userId, ws) {
  // Exclude disabled financial entries before the limit so they cannot starve unrelated notices.
  const pending = await PendingNotification.find({ userId, notified: false, $nor: [
    { type: /payment|order/i }, { 'payload.type': /payment|order/i },
    { 'payload.paymentId': { $exists: true } }, { 'payload.orderId': { $exists: true } },
    { 'payload.sourceType': { $in: ['payment', 'order'] } }
  ] }).limit(10);

  for (const notif of pending) {
    // Also suppress old queued financial payloads; removing route dispatch alone is insufficient.
    if (financialPayload(notif) || financialPayload(notif.payload)) continue;
    ws.send(JSON.stringify(notif.payload));
    notif.notified = true;
    notif.notificationSentAt = new Date();
    notif.notificationAttempts += 1;
    await notif.save();
  }

  console.log(`📤 تم إرسال ${pending.length} إشعارات مؤقتة للمستخدم ${userId}`);
}

/**
 * تحديث حالة الإشعار للطلبات والدفعات بعد الإرسال
 * @param {Array} orders - قائمة الطلبات
 * @param {Array} payments - قائمة الدفعات
 */
async function updateNotificationStatus(orders) {
  // TODO Step 5: no notification-state mutations against immutable financial resources.
}

/**
 * إرسال إشعار موجه حسب الدور أو المستخدم
 * @param {Object} payload - محتوى الرسالة
 * @param {String|null} targetRole - 'admin' أو 'user' أو null للجميع
 * @param {String|null} targetUserId - معرف المستخدم المستهدف
 */
async function notify(payload, targetRole = null, targetUserId = null) {
  if (financialPayload(payload) || !wss) return; // TODO Step 5: do not send OR queue Orders/Payments.

  const message = JSON.stringify(payload);
  let delivered = false;

  wss.clients.forEach(client => {
    if (client.readyState !== 1) return;
    if (targetRole && client.userType !== targetRole) return;
    if (targetUserId && client.userId !== targetUserId) return;

    client.send(message);
    delivered = true;
  });

  if (!delivered && targetUserId && targetRole === 'user') {
    await PendingNotification.create({
      userId: targetUserId,
      type: payload.type,
      status: payload.status,
      payload,
      notified: false
    });
    console.log(`📥 تم تخزين إشعار مؤقت للمستخدم ${targetUserId}`);
  }
}

/**
 * تحديث حالة الإشعار بعد الإرسال لأي كيان (دفعة أو طلب)
 * @param {'Payment'|'Order'} modelName - اسم النموذج
 * @param {String} id - معرف الكيان
 * @param {Boolean} useCustomId - هل نستخدم paymentId بدلًا من _id
 */
async function markNotificationSent(modelName, id, useCustomId = false) {
  // TODO Step 5: both Payment and Order notification-state writes are disabled.
}

module.exports = {
  initNotifications,
  notify,
  markNotificationSent
};
