require('dotenv').config({ path: __dirname + '/../.env' });

const mongoose = require('mongoose');
const User = require('./models/User'); // تأكد من المسار الصحيح
const bcrypt = require('bcryptjs');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    // 👤 بيانات المستخدم التجريبية
    const rawPassword = 'Test@1234';
    const userData = {
      username: 'testuser',
      email: 'test@example.com',
      password: rawPassword,
      phone: '+963912345678',
      accountStatus: 'active',
      loginAttempts: 0
    };

    // 🧠 تحقق من وجود المستخدم مسبقًا
    const existing = await User.findOne({ email: userData.email });
    if (existing) {
      console.log('⚠️ المستخدم موجود مسبقًا. سيتم حذفه أولاً.');
      await User.deleteOne({ _id: existing._id });
    }

    // 📝 إنشاء المستخدم
    const user = new User(userData);
    await user.save();

    // ✅ طباعة البيانات
    console.log('✅ تم إنشاء المستخدم بنجاح');
    console.log('📧 البريد الإلكتروني:', user.email);
    console.log('🔑 كلمة المرور الأصلية:', rawPassword);
    console.log('🔒 كلمة المرور المشفّرة:', user.password);

    // 🧪 تحقق سريع
    const match = await bcrypt.compare(rawPassword, user.password);
    console.log('✅ المطابقة:', match ? '✔️ صحيحة' : '❌ خاطئة');

    mongoose.disconnect();
  } catch (err) {
    console.error('❌ خطأ أثناء تنفيذ السكربت:', err);
  }
})();
