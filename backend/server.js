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
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, phone, email, theme } = req.body;

    // 1. تحقق من البيانات المطلوبة
    if (!username || !password) {
      return res.status(400).json({ 
        error: 'يجب إدخال اسم المستخدم وكلمة المرور',
        details: {
          missing_fields: {
            username: !username,
            password: !password
          }
        }
      });
    }

    // 2. تحقق من عدم تكرار البيانات
    const existingUser = await User.findOne({
      $or: [
        { username },
        { phone },
        { email }
      ]
    });

    if (existingUser) {
      let duplicateField = '';
      if (existingUser.username === username) duplicateField = 'اسم المستخدم';
      if (existingUser.phone === phone) duplicateField = 'رقم الهاتف';
      if (existingUser.email === email) duplicateField = 'البريد الإلكتروني';

      return res.status(409).json({
        error: `${duplicateField} مسجل مسبقاً`,
        code: 'DUPLICATE_ENTRY'
      });
    }

    // 3. إنشاء المستخدم الجديد
    const newUser = new User({
      username,
      password, // سيتم تشفيرها تلقائياً في middleware
      phone: phone || null,
      email: email || null,
      theme: theme || 0,
      balance: 0
    });

    // 4. حفظ المستخدم في قاعدة البيانات
    await newUser.save();

    // 5. إنشاء توكن الدخول
    const token = jwt.sign(
      { userId: newUser._id },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '1h' }
    );

    // 6. إرسال الرد الناجح
    res.status(201).json({
      success: true,
      token,
      user: {
        id: newUser._id,
        username: newUser.username,
        balance: newUser.balance,
        theme: newUser.theme
      }
    });

  } catch (err) {
    console.error('🚨 خطأ مفصل في التسجيل:', {
      message: err.message,
      stack: err.stack,
      code: err.code,
      keyValue: err.keyValue
    });

    res.status(500).json({
      error: 'حدث خطأ في الخادم',
      ...(process.env.NODE_ENV === 'development' && {
        details: err.message,
        stack: err.stack
      })
    });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // 1. التحقق من وجود البيانات المطلوبة
    if (!username || !password) {
      return res.status(400).json({ 
        error: 'اسم المستخدم وكلمة المرور مطلوبان',
        code: 'MISSING_CREDENTIALS'
      });
    }

    // 2. البحث عن المستخدم مع تحديد الحقول المطلوبة فقط
    const user = await User.findOne({ username })
      .select('+password +loginAttempts +lastLogin')
      .lean();

    if (!user) {
      return res.status(401).json({ 
        error: 'بيانات الدخول غير صحيحة',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // 3. التحقق من عدد محاولات الدخول الفاشلة
    if (user.loginAttempts >= 5) {
      const timeSinceLastAttempt = Date.now() - user.lastLogin;
      const lockoutDuration = 15 * 60 * 1000; // 15 دقيقة
      
      if (timeSinceLastAttempt < lockoutDuration) {
        return res.status(429).json({
          error: 'تم تجاوز عدد المحاولات المسموح بها',
          code: 'ACCOUNT_LOCKED',
          retryAfter: Math.ceil((lockoutDuration - timeSinceLastAttempt) / 1000)
        });
      }
    }

    // 4. مقارنة كلمة المرور
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      // زيادة عداد المحاولات الفاشلة
      await User.updateOne(
        { _id: user._id },
        { 
          $inc: { loginAttempts: 1 },
          $set: { lastLogin: Date.now() }
        }
      );
      
      return res.status(401).json({ 
        error: 'بيانات الدخول غير صحيحة',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // 5. إعادة تعيين عداد المحاولات بعد تسجيل الدخول الناجح
    await User.updateOne(
      { _id: user._id },
      { 
        $set: { loginAttempts: 0 },
        $currentDate: { lastLogin: true }
      }
    );

    // 6. إنشاء توكن الدخول
    const token = jwt.sign(
      {
        userId: user._id,
        username: user.username
      },
      process.env.JWT_SECRET || 'fallback_secret',
      { 
        expiresIn: '1h',
        issuer: 'Top4CryptoShop',
        audience: 'user-auth'
      }
    );

    // 7. إعداد كوكي آمن (اختياري)
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 3600000 // 1 ساعة
    });

    // 8. إرسال الاستجابة
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        balance: user.balance,
        theme: user.theme || 0
      }
    });

  } catch (err) {
    console.error('🚨 خطأ في تسجيل الدخول:', {
      message: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString()
    });
    
    res.status(500).json({ 
      error: 'حدث خطأ في الخادم',
      ...(process.env.NODE_ENV === 'development' && {
        details: err.message
      })
    });
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
