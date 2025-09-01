/**
 * @file notifications.js
 * @module utils/notifications
 * @description
 *  - وحدة مركزية لإرسال إشعارات WebSocket حسب الدور
 *  - تدعم إرسال موجه للأدمن أو للمستخدمين أو للجميع
 *  - قابلة للتوسع لدعم غرف أو أنواع إضافية
 *
 * @author Evan Brazi
 * @version 1.1.0
 * @lastModified 2025-08-28
 */

const Order = require('../models/Order');
const Payment = require('../models/Payment');

let wss = null;

function initNotifications(serverInstance) {
  wss = serverInstance;
  wss.on('connection', (ws) => {
    ws.userType = 'guest';
    ws.userId = null;

    ws.on('message', async msg => {
      try {
        const data = JSON.parse(msg);
        if (data.type === 'auth') {
          ws.userType = data.role;
          ws.userId = data.userId;
          console.log(`✅ مصادقة ${ws.userType}: ${ws.userId}`);

          if (ws.userType === 'admin') {
            await sendPendingToAdmin(ws);
          } else if (ws.userType === 'user') {
            await sendPendingToUser(ws.userId, ws);
          }
        }
      } catch (err) {
        console.error('❌ رسالة غير صالحة:', msg);
      }
    });
  });
}

async function sendPendingToAdmin(ws) {
  const orders = await Order.find({ status: 'pending' }).sort({ createdAt: -1 });
  orders.forEach(order => ws.send(JSON.stringify({ type: 'newOrder', ...order.toObject() })));

  const payments = await Payment.find({ status: 'pending' });
  payments.forEach(payment => ws.send(JSON.stringify({ type: 'newPayment', ...payment.toObject() })));

  console.log(`📤 أُرسلت ${orders.length} طلبات و ${payments.length} دفعات للأدمن`);
}

async function sendPendingToUser(userId, ws) {
  const orders = await Order.find({ userId, status: 'pending' });
  orders.forEach(order => ws.send(JSON.stringify({ type: 'userOrder', ...order.toObject() })));

  const payments = await Payment.find({ userId, status: 'pending' });
  payments.forEach(payment => ws.send(JSON.stringify({ type: 'userPayment', ...payment.toObject() })));

  console.log(`📤 أُرسلت ${orders.length} طلبات و ${payments.length} دفعات للمستخدم ${userId}`);
}

function notify(payload, targetRole = null, targetUserId = null) {
  if (!wss) return;

  const message = JSON.stringify(payload);
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      if (targetRole && client.userType !== targetRole) return;
      if (targetUserId && client.userId !== targetUserId) return;
      client.send(message);
    }
  });
}

module.exports = {
  initNotifications,
  notify
};
