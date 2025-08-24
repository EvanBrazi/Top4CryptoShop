/**
 * @file csrfMiddleware.js
 * @description 🛡️ حماية من هجمات CSRF باستخدام تقنية Double Submit Cookie + Session Binding
 * - توليد رمز CSRF وتخزينه في الجلسة
 * - إرسال الرمز للواجهة عبر كوكي قابلة للقراءة
 * - التحقق من تطابق الرمز بين الهيدر والجلسة في الطلبات الحساسة
 * @version 1.1.0
 * @license MIT
 */

const crypto = require('crypto');

/**
 * 🧬 توليد رمز CSRF عشوائي بطول 64 حرفًا
 * @returns {string} رمز CSRF
 */
function generateCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * 📤 إرسال رمز CSRF للواجهة وتخزينه في الجلسة
 * @param {Request} req - كائن الطلب
 * @param {Response} res - كائن الاستجابة
 */
function attachCsrfToken(req, res) {
  const token = generateCsrfToken();

  // ✅ تخزين الرمز في الجلسة
  req.session.csrfToken = token;

  // ✅ إرسال الرمز في كوكي قابلة للقراءة من الواجهة
  res.cookie('x-csrf-token', token, {
    httpOnly: false, // يسمح للواجهة بقراءته
    sameSite: 'Strict', // يمنع الإرسال من مواقع خارجية
    secure: process.env.NODE_ENV === 'production', // يستخدم HTTPS فقط في الإنتاج
    path: '/'
  });
}

/**
 * 🛡️ Middleware لحماية المسارات من هجمات CSRF
 * يتحقق من تطابق الرمز بين الهيدر والجلسة
 * @param {Request} req
 * @param {Response} res
 * @param {Function} next
 */
function doubleCsrfProtection(req, res, next) {
  const headerToken = req.headers['x-csrf-token'];
  const sessionToken = req.session?.csrfToken;

  // ✅ تسجيل الرموز للمراقبة أثناء التطوير
  if (process.env.NODE_ENV !== 'production') {
    console.log('🔐 رمز CSRF من الهيدر:', headerToken);
    console.log('🔐 رمز CSRF من الجلسة:', sessionToken);
  }

  // ✅ التحقق من تطابق الرمزين
  if (!headerToken || !sessionToken || headerToken !== sessionToken) {
    console.warn('❌ رفض الطلب بسبب رمز CSRF غير صالح');
    return res.status(403).json({
      success: false,
      error: 'INVALID_CSRF',
      message: 'رمز CSRF غير صالح أو مفقود'
    });
  }

  next();
}

module.exports = {
  attachCsrfToken,
  doubleCsrfProtection
};
