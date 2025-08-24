
require('dotenv').config({ path: __dirname + '/../.env' });

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

(async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ تم الاتصال بقاعدة البيانات');

        const userId = '68ab836e6425a9c4a964926e';
        const user = await User.findById(userId).select('+password');

        if (!user) {
            console.log('❌ المستخدم غير موجود');
            return;
        }

        console.log('👤 اسم المستخدم:', user.username);
        console.log('🔐 كلمة المرور المشفّرة:', user.password);

        const isMatch = await bcrypt.compare('HelloItsMe.123456', user.password);
        console.log('✅ هل تطابق كلمة المرور؟', isMatch);
    } catch (err) {
        console.error('❌ خطأ أثناء تنفيذ السكربت:', err.message);
    } finally {
        const users = await User.find({});
        console.log('🆔 معرفات المستخدمين:', users.map(u => ({ id: u._id, username: u.username })));
        mongoose.disconnect();
    }
})();
