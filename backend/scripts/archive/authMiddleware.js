const RevokedToken = require('../../models/RevokedToken');
const jwt = require('jsonwebtoken');
const User = require('../../models/User');

// دالة التحقق من التوكن
const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) throw new Error('Token required');

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.userId);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// دالة التحقق من الأدمن
const checkAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// تصدير الدوال معًا
module.exports = {
  verifyToken,
  checkAdmin
};
