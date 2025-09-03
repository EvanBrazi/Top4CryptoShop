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

const Order = require('../models/Order');
const Payment = require('../models/Payment');
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
        console.error('❌ رسالة غير صالحة:', msg);
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
  const orders = await Order.find({ status: 'pending' }).sort({ createdAt: -1 });
  const payments = await Payment.find({ status: 'pending' });

  orders.forEach(order => {
    ws.send(JSON.stringify({ type: 'newOrder', ...order.toObject() }));
  });

  payments.forEach(payment => {
    ws.send(JSON.stringify({ type: 'newPayment', ...payment.toObject() }));
  });

  console.log(`📤 أُرسلت ${orders.length} طلبات و ${payments.length} دفعات للأدمن`);
}

/**
 * إرسال الطلبات والدفعات المقبولة أو المرفوضة للمستخدم (مرة واحدة فقط)
 * @param {String} userId - معرف المستخدم
 * @param {WebSocket} ws - جلسة المستخدم
 */
async function sendStatusToUser(userId, ws) {
  try {
    const [orders, payments] = await Promise.all([
      Order.find({ userId, status: { $in: ['accepted', 'rejected'] }, notified: false }).lean(),
      Payment.find({ userId, status: { $in: ['accepted', 'rejected'] }, notified: false }).lean()
    ]);

    orders.forEach(order => {
      ws.send(JSON.stringify({ type: 'orderStatus', status: order.status, ...order }));
    });

    payments.forEach(payment => {
      ws.send(JSON.stringify({ type: 'paymentStatus', status: payment.status, ...payment }));
    });

    console.log(`📤 أُرسلت ${orders.length} طلبات و ${payments.length} دفعات جديدة للمستخدم ${userId}`);
    await updateNotificationStatus(orders, payments);
  } catch (error) {
    console.error('❌ خطأ أثناء إرسال إشعارات المستخدم:', error);
  }
}

/**
 * إرسال الإشعارات المؤقتة للمستخدم عند عودته
 * @param {String} userId - معرف المستخدم
 * @param {WebSocket} ws - جلسة المستخدم
 */
async function sendPendingToUser(userId, ws) {
  const pending = await PendingNotification.find({ userId, notified: false }).limit(10);

  for (const notif of pending) {
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
async function updateNotificationStatus(orders, payments) {
  const now = new Date();

  const orderUpdates = orders.map(order =>
    Order.updateOne({ _id: order._id }, {
      $set: { notified: true, notificationSentAt: now },
      $inc: { notificationAttempts: 1 }
    })
  );

  const paymentUpdates = payments.map(payment =>
    Payment.updateOne({ _id: payment._id }, {
      $set: { notified: true, notificationSentAt: now },
      $inc: { notificationAttempts: 1 }
    })
  );

  await Promise.all([...orderUpdates, ...paymentUpdates]);
}

/**
 * إرسال إشعار موجه حسب الدور أو المستخدم
 * @param {Object} payload - محتوى الرسالة
 * @param {String|null} targetRole - 'admin' أو 'user' أو null للجميع
 * @param {String|null} targetUserId - معرف المستخدم المستهدف
 */
async function notify(payload, targetRole = null, targetUserId = null) {
  if (!wss) return;

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
  const models = { Payment, Order };
  const Model = models[modelName];
  const query = useCustomId ? { paymentId: id } : { _id: id };

  await Model.updateOne(query, {
    $set: { notified: true, notificationSentAt: new Date() },
    $inc: { notificationAttempts: 1 }
  });
}

module.exports = {
  initNotifications,
  notify,
  markNotificationSent
};
