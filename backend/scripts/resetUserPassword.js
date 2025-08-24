/**
 * @file scripts/resetUserPassword.js
 * @description إعادة تعيين كلمة مرور مستخدم محدد بالمعرف
 * @version 1.0.0
 * @license MIT
 */

require('dotenv').config({ path: __dirname + '/../.env' });

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User'); // تأكد من صحة المسار

async function resetUserPassword() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ تم الاتصال بقاعدة البيانات');

    const userId = '68ab836e6425a9c4a964926e';
    const newPassword = 'HelloItsMe.123456'; // كلمة مرور جديدة للاختبار
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    const result = await User.updateOne(
      { _id: userId },
      {
        password: hashedPassword,
        loginAttempts: 0,
        accountStatus: 'active'
      }
    );

    if (result.modifiedCount === 1) {
      console.log('🔐 تم تحديث كلمة المرور بنجاح للمستخدم HelloItsMe');
    } else {
      console.log('⚠️ لم يتم العثور على المستخدم أو لم يتم التعديل');
    }
  } catch (err) {
    console.error('❌ خطأ أثناء التحديث:', err.message);
  } finally {
    mongoose.disconnect();
  }
}

resetUserPassword();
