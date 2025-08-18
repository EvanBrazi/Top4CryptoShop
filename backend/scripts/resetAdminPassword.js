/**
 * @file scripts/createAdmin.js
 * @description تغيير كلمة مرور حساب أدمن في قاعدة البيانات
 * @version 1.1.0
 * @license MIT
 */

require('dotenv').config({ path: __dirname + '/../.env' }); // ✅ تحميل .env

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User'); // تأكد من المسار الصحيح

async function resetPassword() {
  await mongoose.connect(process.env.MONGODB_URI); // ✅ استخدام الرابط من .env

  const newPassword = 'Admin.evan123456';
  const hashedPassword = await bcrypt.hash(newPassword, 12);

  const result = await User.updateOne(
    { username: 'EvanBrazi' },
    { password: hashedPassword }
  );

  console.log('🔐 تم تحديث كلمة مرور الأدمن:', result);
  mongoose.disconnect();
}

resetPassword();