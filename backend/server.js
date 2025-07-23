require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs'); // لأغراض التحقق
const User = require('./models/User');

// تهيئة Express
const app = express();

// Middlewares
app.use(cors({
  origin: [
    'http://localhost:8000',
    'https://top4cryptoshop.onrender.com'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
app.use(express.json());

// ──────────── تحقق من الملفات الثابتة ──────────── //
const staticFilesPath = path.join(__dirname, '../frontend/public');
console.log('📂 يتم خدمة الملفات من:', staticFilesPath);
console.log('🔍 محتوى المجلد:', fs.readdirSync(staticFilesPath));

// خدمة الملفات الثابتة
app.use(express.static(staticFilesPath));

// ──────────── مسارات الصفحات ──────────── //
app.get('/signup', (req, res) => {
  res.sendFile(path.join(staticFilesPath, 'signup.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(staticFilesPath, 'login.html'));
});

// ──────────── اتصال MongoDB ──────────── //
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/Top4CryptoShop')
  .then(() => console.log('✅ تم الاتصال بـ MongoDB بنجاح'))
  .catch(err => console.error('❌ فشل الاتصال بـ MongoDB:', err));

// ============== مسارات API ============== //

// 1. تسجيل مستخدم جديد
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'يجب إدخال اسم المستخدم وكلمة المرور' });
    }

    const newUser = new User({ username, password });
    await newUser.save();

    const token = jwt.sign(
      { userId: newUser._id },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '1h' }
    );

    res.status(201).json({
      success: true,
      token,
      user: {
        id: newUser._id,
        username: newUser.username,
        balance: newUser.balance
      }
    });

  } catch (err) {
    console.error('🚨 خطأ في التسجيل:', err);
    res.status(500).json({
      error: err.code === 11000 ? 'اسم المستخدم موجود بالفعل' : 'حدث خطأ في الخادم'
    });
  }
});

// 2. تسجيل الدخول
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '1h' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        balance: user.balance
      }
    });

  } catch (err) {
    console.error('🚨 خطأ في تسجيل الدخول:', err);
    res.status(500).json({ error: 'حدث خطأ في الخادم' });
  }
});

// 3. بيانات المستخدم
app.get('/api/auth/user', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'مطلوب مصادقة' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    const user = await User.findById(decoded.userId).select('-password');

    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    res.json({
      id: user._id,
      username: user.username,
      balance: user.balance
    });
  } catch (err) {
    res.status(401).json({ error: 'رمز الدخول غير صالح' });
  }
});

// ──────────── إعادة توجيه باقي الطلبات ──────────── //
// ──────────── إعادة توجيه باقي الطلبات ──────────── //
app.get('*', (req, res) => {
  // تجاهل طلبات API والملفات الثابتة
  if (req.path.startsWith('/api') || req.path.includes('.')) {
    return res.status(404).send('Not found');
  }

  // إذا كان المسار غير معروف، أرسل dashboard.html
  res.sendFile(path.join(staticFilesPath, 'dashboard.html'));
});

// بدء الخادم
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 الخادم يعمل على http://localhost:${PORT}`);
  console.log(`🌐 يمكنك الوصول إلى:
  - التسجيل: http://localhost:${PORT}/signup
  - الدخول: http://localhost:${PORT}/login
  `);
});
