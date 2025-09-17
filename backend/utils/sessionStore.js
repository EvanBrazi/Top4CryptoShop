/**
 * @file sessionStore.js
 * @description إدارة الجلسات النشطة باستخدام ذاكرة مؤقتة (Map)
 * @version 2.0.0
 * @author Evan Brazi
 */

const activeSessions = new Map(); // customSessionId => { userId, role, expiresAt }

/**
 * ✅ إنشاء جلسة جديدة
 * @param {string} sessionId - معرف الجلسة
 * @param {string} userId - معرف المستخدم
 * @param {string} role - دور المستخدم
 * @param {number} durationMs - مدة الجلسة بالميلي ثانية (افتراضي: ساعة واحدة)
 */
function createSession(sessionId, userId, role, durationMs = 60 * 60 * 1000) {
  activeSessions.set(sessionId, {
    userId,
    role,
    expiresAt: Date.now() + durationMs
  });
  console.log('✅ جلسة جديدة مسجلة:', sessionId);
}

/**
 * ✅ تنظيف الجلسات المنتهية كل دقيقة
 */
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of activeSessions.entries()) {
    if (session.expiresAt && session.expiresAt < now) {
      activeSessions.delete(sessionId);
    }
  }
}, 60000); // كل دقيقة

module.exports = {
  activeSessions,
  createSession
};
