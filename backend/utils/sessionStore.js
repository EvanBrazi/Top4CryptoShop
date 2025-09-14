// backend/utils/sessionStore.js
// 🔐 جلسات نشطة (مثال باستخدام ذاكرة مؤقتة)
const activeSessions = new Map(); // sessionId => { userId, role }

// تنظيف الجلسات المنتهية كل فترة
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of activeSessions.entries()) {
    if (session.expiresAt && session.expiresAt < now) {
      activeSessions.delete(sessionId);
    }
  }
}, 60000); // كل دقيقة

module.exports = { activeSessions };
