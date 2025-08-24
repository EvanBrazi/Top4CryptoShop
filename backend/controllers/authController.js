const User = require('../models/User');
const bcrypt = require('bcryptjs');

/**
 * @function registerUser
 * @description ينشئ مستخدم جديد ويُرجع بياناته بدون إرسال رد HTTP
 * @param {Object} data - بيانات التسجيل
 * @returns {Object} المستخدم الجديد
 */
const registerUser = async (data) => {
  const { username, email, password, phone } = data;

  if (!username || !email || !password) {
    throw new Error('MISSING_FIELDS');
  }

  const existingUser = await User.findOne({
    $or: [{ username: username.trim() }, { email: email.trim().toLowerCase() }]
  });

  if (existingUser) {
    throw new Error('USER_EXISTS');
  }

  const user = new User({
    username: username.trim(),
    email: email.trim().toLowerCase(),
    password: password, // ❗ بدون تشفير هنا
    phone: phone?.trim(),
    accountStatus: 'active',
    loginAttempts: 0
  });

  await user.save(); // ✅ التشفير يتم تلقائيًا داخل الـ schema

  // تحقق ذكي من نجاح التشفير
  if (!user.password.startsWith('$2')) {
    throw new Error('PASSWORD_NOT_HASHED');
  }

  return user;
};


module.exports = {
  registerUser
};
