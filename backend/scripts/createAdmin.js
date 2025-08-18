/**
 * @file scripts/createAdmin.js
 * @description إنشاء حساب أدمن مبدئي في قاعدة البيانات
 * @version 1.1.0
 * @license MIT
 */

require('dotenv').config({ path: __dirname + '/../.env' }); // ✅ تحميل .env

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ تم الاتصال بقاعدة البيانات بنجاح'))
  .catch(err => {
    console.error('❌ فشل الاتصال بقاعدة البيانات:', err);
    process.exit(1);
  });
/**
 * إنشاء حساب أدمن إذا لم يكن موجودًا
 */
async function createAdmin() {
  const adminData = {
    username: 'EvanBrazi',
    email: "admin@top4cryptoshop.com",
    password: await bcrypt.hash('Admin.evan123456', 10),
    phone: '+966500000000',
    role: 'admin',
    balance: 0,
    theme: 0
  };

  try {
    const existingAdmin = await User.findOne({ username: adminData.username });
    if (existingAdmin) {
      console.log('⚠️ حساب الأدمن موجود مسبقًا');
      return;
    }

    const admin = await User.create(adminData);
    console.log('✅ تم إنشاء الأدمن بنجاح:', {
      username: admin.username,
      role: admin.role,
      _id: admin._id
    });
  } catch (err) {
    console.error('❌ خطأ أثناء الإنشاء:', err.message);
  } finally {
    mongoose.disconnect();
  }
}

createAdmin();