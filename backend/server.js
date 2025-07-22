require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const User = require('./models/User');

// تهيئة Express
const app = express();

// Middlewares
app.use(cors({
  origin: 'http://localhost:8000',
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(express.json());

// اتصال MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/Top4CryptoShop')
  .then(() => console.log('✅ تم الاتصال بـ MongoDB بنجاح'))
  .catch(err => console.error('❌ فشل الاتصال بـ MongoDB:', err));

// ============== مسارات API ============== //

// 1. تسجيل مستخدم جديد
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    // التحقق من البيانات
    if (!username || !password) {
      return res.status(400).json({ error: 'يجب إدخال اسم المستخدم وكلمة المرور' });
    }

    // إنشاء مستخدم جديد
    const newUser = new User({ username, password });
    await newUser.save();

    // إنشاء JWT Token
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

    // البحث عن المستخدم
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }

    // التحقق من كلمة المرور
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }

    // إنشاء Token
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

// 3. الحصول على بيانات المستخدم
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

// بدء الخادم
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 الخادم يعمل على http://localhost:${PORT}`);
});
