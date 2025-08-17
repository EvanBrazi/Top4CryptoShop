/**
 * auth.js - JWT authentication and role-based access control
 * يحتوي على ميدل وير التحقق من التوكن، صلاحيات الأدمن، والتحقق من الجلسة
 * @version: 2.1.0
 * @author: Evan Brazi
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const RevokedToken = require('../models/RevokedToken');

/**
 * ✅ التحقق من التوكن من الهيدر أو الكوكيز
 * - يتحقق من وجود التوكن
 * - يفك تشفيره باستخدام JWT_SECRET
 * - يتحقق من أنه غير ملغى
 * - يضيف بيانات المستخدم إلى req.user
 */
const verifyToken = async (req, res, next) => {
  try {
    console.log('verifyToken : ', req.cookies.session_token);
    
    const token =
      req.headers.authorization?.split(' ')[1] ||
      req.cookies.session_token;

    if (!token) {
      return res.status(401).json({ error: 'يجب توفير رمز الجلسة' });
    }

    const revoked = await RevokedToken.findOne({ token });
    if (revoked) {
      return res.status(401).json({ error: 'رمز الجلسة موقوف' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'رمز الجلسة غير صالح' });
  }
};

/**
 * ✅ التحقق من صلاحيات الأدمن
 * - يجب أن يكون المستخدم لديه role = 'admin'
 */
const checkAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'صلاحيات الأدمن مطلوبة' });
  }
  next();
};

/**
 * ✅ التحقق من حالة الجلسة
 * - يستخدم verifyToken داخليًا
 * - يعيد حالة المصادقة وبيانات المستخدم
 */
const checkSession = async (req, res) => {
  try {
    await verifyToken(req, res, async () => {
      res.json({
        success: true,
        isAuthenticated: true,
        user: {
          id: req.user._id,
          username: req.user.username,
          phone: req.user.phone,
          theme: req.user.theme,
          balance: req.user.balance
        }
      });
    });
  } catch (err) {
    res.status(401).json({
      success: false,
      isAuthenticated: false,
      message: 'جلسة غير صالحة'
    });
  }
};

module.exports = {
  verifyToken,
  checkAdmin,
  checkSession
};