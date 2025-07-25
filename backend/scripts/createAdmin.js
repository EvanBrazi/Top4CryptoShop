require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Connection error:', err));

async function createAdmin() {
  const adminData = {
    username: 'admin', // يمكنك تغيير اسم المستخدم
    password: await bcrypt.hash('admin123', 10), // سيتم تشفير كلمة المرور
    phone: '+966500000000', // رقم الأدمن
    role: 'admin', // تمييزه كأدمن
    balance: 0,
    theme: 0
  };

  try {
    const existingAdmin = await User.findOne({ username: 'admin' });
    if (existingAdmin) {
      console.log('⚠️ حساب الأدمن موجود بالفعل');
      return;
    }

    const admin = await User.create(adminData);
    console.log('✅ تم إنشاء الأدمن بنجاح:', {
      username: admin.username,
      role: admin.role,
      _id: admin._id
    });
  } catch (err) {
    console.error('❌ خطأ في الإنشاء:', err.message);
  } finally {
    mongoose.disconnect();
  }
}

createAdmin();
