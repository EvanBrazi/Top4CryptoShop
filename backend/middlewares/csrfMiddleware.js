/**
 * @file csrfMiddleware.js
 * @description 🛡️ حماية من هجمات CSRF باستخدام تقنية Double Submit Cookie + Session Binding
 * - توليد رمز CSRF وتخزينه في الجلسة
 * - إرسال الرمز للواجهة عبر كوكي قابلة للقراءة
 * - التحقق من تطابق الرمز بين الهيدر والجلسة في الطلبات الحساسة
 * @version 1.1.2
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
  // ✅ التأكد من وجود جلسة أولاً
  if (!req.session) {
    console.error('❌ لا توجد جلسة متاحة');
    return;
  }
  const token = generateCsrfToken();

  // ✅ تخزين الرمز في الجلسة
  req.session.csrfToken = token;
  // ✅ إرسال الرمز في الهيدر والكوكي (للتوافق)
  res.setHeader('x-csrf-token', token);
  // ✅ حفظ الجلسة فوراً للتأكد من التخزين
  req.session.save((err) => {
    if (err) {
      console.error('❌ فشل في حفظ الجلسة:', err);
    } else {
      console.log('🔐 تم تخزين CSRF في الجلسة بنجاح:', token.substring(0, 20) + '...');
      console.log('🔐 معرف الجلسة:', req.sessionID);
    }
  });
  // ✅ إرسال معرف الجلسة أيضاً للتطبيقات
  res.setHeader('x-session-id', req.sessionID);
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
  if (req.method === 'OPTIONS') {
    return next();
  }
  console.log('req, res:', req.session);
  // ✅ التحقق من وجود الجلسة أولاً
  if (!req.session) {
    console.error('❌ لا توجد جلسة في طلب CSRF');
    return res.status(403).json({
      success: false,
      error: 'NO_SESSION',
      message: 'لا توجد جلسة نشطة'
    });
  }
  const headerToken = req.headers['x-csrf-token'];
  const sessionToken = req.session?.csrfToken;

  // ✅ تسجيل الرموز للمراقبة أثناء التطوير
  if (process.env.NODE_ENV !== 'production') {
    console.log('🔐 رمز CSRF من الهيدر:', headerToken ? headerToken.substring(0, 20) + '...' : 'غير موجود');
    console.log('🔐 رمز CSRF من الجلسة:', sessionToken ? sessionToken.substring(0, 20) + '...' : 'غير موجود');
    console.log('🔐 معرف الجلسة:', req.sessionID);
    console.log('🔐 بيانات الجلسة كاملة:', req.session);
  }

  if (!sessionToken) {
    console.warn('❌ لا يوجد CSRF token في الجلسة');
    return res.status(403).json({
      success: false,
      error: 'MISSING_CSRF_SESSION',
      message: 'رمز CSRF غير موجود في الجلسة - يرجى إعادة تسجيل الدخول'
    });
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
