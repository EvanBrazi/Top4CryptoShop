/**
 * @file socket.js
 * @module backend/socket
 * @description
 *  - إعداد WebSocket للإشعارات اللحظية
 *  - يتحقق من الجلسة قبل قبول الاتصال
 *  - يحدد نوع المستخدم (أدمن أو مستخدم)
 *  - يربط WebSocket بوحدة notifications.js
 *
 * @author: Evan Brazi
 * @version: 1.1.0
 * @lastModified: 2025-08-28
 */

const WebSocket = require('ws');
const { registerClient } = require('./utils/notifications');

// 🧠 استخراج sessionId من الكوكيز
function extractSessionId(cookies) {
  if (!cookies) return null;
  const match = cookies.match(/sessionId=([^;]+)/);
  return match ? match[1] : null;
}

// 🔐 جلسات نشطة (مثال باستخدام ذاكرة مؤقتة)
const activeSessions = new Map(); // sessionId => { userId, role }

/**
 * تحقق من صلاحية الجلسة حسب الدور المطلوب
 * @param {string} sessionId
 * @param {string} requiredRole
 * @returns {boolean}
 */
function isValidSession(sessionId, requiredRole = null) {
  const session = activeSessions.get(sessionId);
  if (!session) return false;
  return requiredRole ? session.role === requiredRole : true;
}

/**
 * تهيئة WebSocket وربطه بالخادم
 * @param {http.Server} server - خادم HTTP الرئيسي
 * @returns {Object} - دوال مساعدة مثل sendToAdmins
 */
function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server });

  wss.on('connection', (ws, req) => {
    const cookies = req.headers.cookie;
    const sessionId = extractSessionId(cookies);

    // رفض الاتصال إذا لم تكن الجلسة صالحة
    if (!isValidSession(sessionId, 'admin')) {
      ws.close(4001, 'Unauthorized session');
      return;
    }

    // 🟢 الاتصال مقبول
    const session = activeSessions.get(sessionId);
    ws.userType = session.role;
    ws.userId = session.userId;

    console.log(`🔌 WebSocket connected: ${ws.userId} (${ws.userType})`);

    // 👋 رسالة ترحيب
    ws.send(JSON.stringify({
      type: 'welcome',
      message: `مرحباً يا ${ws.userId}، تم تفعيل الإشعارات اللحظية`
    }));

    // 📡 تسجيل العميل في وحدة الإشعارات
    registerClient(ws);
  });

  return { activeSessions };
}

module.exports = {
  setupWebSocket,
  activeSessions
};
