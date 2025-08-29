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

let wss = null;

/**
 * تهيئة WebSocket عند بدء السيرفر
 * @param {WebSocket.Server} serverInstance - كائن WebSocket.Server
 */
function initNotifications(serverInstance) {
  wss = serverInstance;

  wss.on('connection', (ws, req) => {
    // تعيين القيم الافتراضية
    ws.userType = 'guest';
    ws.userId = null;

    // استقبال بيانات المصادقة من العميل
    ws.on('message', msg => {
      try {
        const data = JSON.parse(msg);
        if (data.type === 'auth') {
          ws.userType = data.role || 'guest';
          ws.userId = data.userId || null;
        }
      } catch (err) {
        console.error('❌ خطأ في تحليل رسالة WebSocket:', err);
      }
    });

    // يمكن إضافة تسجيل العميل هنا إذا أردت تتبعهم لاحقًا
  });
}

/**
 * إرسال إشعار لجميع العملاء أو حسب الدور
 * @param {Object} payload - البيانات المرسلة
 * @param {String|null} targetRole - 'admin' أو 'user' أو null لإرسال للجميع
 */
function notify(payload, targetRole = null) {
  if (!wss) {
    console.warn('⚠️ WebSocket غير مهيأ بعد');
    return;
  }

  const message = JSON.stringify(payload);

  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      if (!targetRole || client.userType === targetRole) {
        try {
          client.send(message);
        } catch (err) {
          console.error(`❌ فشل إرسال الإشعار إلى ${client.userId}:`, err);
        }
      }
    }
  });
}

/**
 * إرسال إشعار موجه فقط للأدمن
 * @param {Object} payload
 */
function notifyAdmins(payload) {
  notify(payload, 'admin');
}

/**
 * إرسال إشعار موجه فقط للمستخدمين
 * @param {Object} payload
 */
function notifyUsers(payload, targetUserId = null) {
  if (!wss) {
    console.warn('⚠️ WebSocket غير مهيأ بعد');
    return;
  }

  const message = JSON.stringify(payload);

  wss.clients.forEach(client => {
    if (
      client.readyState === 1 &&
      client.userType === 'user' &&
      (!targetUserId || client.userId === targetUserId)
    ) {
      try {
        client.send(message);
        console.log(`📡 إرسال إشعار إلى المستخدم: ${targetUserId}`, message);
      } catch (err) {
        console.error(`❌ فشل إرسال الإشعار إلى ${client.userId}:`, err);
      }
    }
  });
}

/**
 * تسجيل عميل WebSocket (اختياري للتوسع لاحقًا)
 * @param {WebSocket} ws - العميل المتصل
 */
function registerClient(ws) {
  // يمكن تخزين العملاء في قائمة أو ربطهم بجلسات لاحقًا
  // هذه الدالة جاهزة للتوسع المستقبلي
}

module.exports = {
  initNotifications,
  notify,
  notifyAdmins,
  notifyUsers,
  registerClient
};
