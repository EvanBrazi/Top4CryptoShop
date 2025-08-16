const jwt = require('jsonwebtoken');

function verifyAdmin(req, res, next) {
  const token = req.cookies.session_token;
  if (!token) {
    return res.status(401).send('يجب تسجيل الدخول أولاً');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).send('ليس لديك صلاحية الوصول إلى لوحة التحكم');
    }

    req.user = decoded; // يمكن استخدامه لاحقاً
    next();
  } catch (err) {
    return res.status(401).send('رمز الدخول غير صالح أو منتهي الصلاحية');
  }
}

module.exports = { verifyAdmin };