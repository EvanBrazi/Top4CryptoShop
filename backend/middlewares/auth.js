/**
 * auth.js - JWT authentication and role-based access control
 * يحتوي على دوال التحقق من التوكن وصلاحيات الأدمن
 * @author: Evan Brazi
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const RevokedToken = require('../models/RevokedToken');

// ✅ التحقق من التوكن من الهيدر
const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) throw new Error('Token required');

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // تحقق من أن التوكن لم يتم إلغاؤه
    const revoked = await RevokedToken.findOne({ token });
    if (revoked) return res.status(401).json({ error: 'Token revoked' });

    req.user = await User.findById(decoded.userId);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ✅ التحقق من صلاحيات الأدمن بعد التوكن
const checkAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// ✅ التحقق من الأدمن باستخدام كوكيز JWT
const verifyAdmin = (req, res, next) => {
  const token = req.cookies.session_token;
  if (!token) return res.status(401).send('يجب تسجيل الدخول أولاً');

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).send('ليس لديك صلاحية الوصول إلى لوحة التحكم');
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).send('رمز الدخول غير صالح أو منتهي الصلاحية');
  }
};

module.exports = {
  verifyToken,
  checkAdmin,
  verifyAdmin
};