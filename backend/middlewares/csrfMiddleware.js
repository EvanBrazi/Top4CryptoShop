/**
 * @file csrfMiddleware.js
 * @description 🛡️ حماية CSRF باستخدام تقنية Double Submit Cookie + Session Binding
 * - توليد رمز CSRF وتخزينه في الجلسة
 * - إرسال الرمز للواجهة عبر كوكي
 * - التحقق من الرمز في الطلبات الحساسة
 * @version 1.0.0
 * @license MIT
 */

const crypto = require('crypto');

// 🧬 توليد رمز CSRF عشوائي
function generateCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * 📤 إرسال رمز CSRF للواجهة وتخزينه في الجلسة
 * @param {Request} req - الطلب الوارد
 * @param {Response} res - الرد المرسل
 */
function attachCsrfToken(req, res) {
  const token = generateCsrfToken();
  req.session.csrfToken = token;

  res.cookie('x-csrf-token', token, {
    httpOnly: false, // يسمح للواجهة بقراءته
    sameSite: 'Strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  });
}

/**
 * 🛡️ Middleware لحماية المسارات من هجمات CSRF
 * يتحقق من تطابق الرمز بين الهيدر والجلسة
 */
function doubleCsrfProtection(req, res, next) {
  const headerToken = req.headers['x-csrf-token'];
  const sessionToken = req.session?.csrfToken;

  console.log('🔐 دخلنا doubleCsrfProtection');
  console.log('🔐 CSRF من الهيدر:', headerToken);
  console.log('🔐 CSRF من الجلسة:', sessionToken);

  if (!headerToken || !sessionToken || headerToken !== sessionToken) {
    console.warn('❌ رمز CSRF غير صالح');
    return res.status(403).json({ error: 'رمز CSRF غير صالح' });
  }

  next();
}

module.exports = {
  attachCsrfToken,
  doubleCsrfProtection
};
