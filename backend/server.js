/**
 * server.js - ملف التشغيل الرئيسي للتطبيق
 * إصدار: 2.1.1
 * وصف: يحتوي على إعدادات الخادم الأساسية، وسائط الأمان، إدارة الجلسات، تعريف المسارات ومعالجة الأخطاء
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const compression = require('compression');
const morgan = require('morgan');
const crypto = require('crypto');
const fs = require('fs');
const favicon = require('serve-favicon');
const authRoutes = require('./routes/auth'); // <-- إضافة استيراد مسارات المصادقة

// =============================================
//               تهيئة التطبيق
// =============================================
const app = express();

// =============================================
//             الملفات الثابتة
// =============================================
const staticFilesPath = path.join(__dirname, '../frontend/public');

// تحقق من وجود مجلد الملفات الثابتة
try {
  if (!fs.existsSync(staticFilesPath)) {
    console.error('❌ مجلد الملفات الثابتة غير موجود:', staticFilesPath);
    fs.mkdirSync(staticFilesPath, { recursive: true });
  }
} catch (err) {
  console.error('❌ خطأ في التحقق من مجلد الملفات:', err);
  process.exit(1);
}

// =============================================
//               وسائط الأمان (معطلة)
// =============================================

// 1. تعطيل جميع وسائط الأمان
console.warn('⚠️  تحذير: جميع إعدادات الأمان معطلة');
app.use((req, res, next) => {
  // تعطيل جميع رؤوس الأمان
  res.removeHeader('X-Powered-By');
  res.removeHeader('X-XSS-Protection');
  res.removeHeader('X-Content-Type-Options');
  res.removeHeader('X-Frame-Options');
  res.removeHeader('Strict-Transport-Security');
  res.removeHeader('Content-Security-Policy');
  res.removeHeader('Referrer-Policy');
  next();
});

// 2. إعداد الجلسات بدون قيود
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: true,
  saveUninitialized: true,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    ttl: 24 * 60 * 60
  }),
  cookie: {
    secure: false,
    httpOnly: false,
    sameSite: false,
    maxAge: 24 * 60 * 60 * 1000
  }
};
app.use(session(sessionConfig));

// 3. تعطيل rate limiting
console.log('⏱️  تم تعطيل معدل الطلبات');

// 4. إعداد CORS مفتوح بالكامل
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: '*',
  exposedHeaders: '*',
  credentials: true
}));

// =============================================
//             وسائط تحليل الطلبات
// =============================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(compression());
app.use(morgan('dev'));

// =============================================
//             الملفات الثابتة
// =============================================
app.use(favicon(path.join(staticFilesPath, './assets/images/favicon.ico')));
app.use(express.static(staticFilesPath, {
  maxAge: '1d',
  setHeaders: (res) => {
    res.set('Access-Control-Allow-Origin', '*');
  }
}));

// =============================================
//                تعريف المسارات
// =============================================

// مسارات API (يجب أن تأتي قبل المسارات الثابتة)
app.use('/api/auth', authRoutes); // <-- إضافة مسارات المصادقة هنا

const serveStaticPage = (page) => (req, res) => {
  const filePath = path.join(staticFilesPath, `${page}.html`);
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error(`❌ فشل تحميل ${page}.html`);
      res.status(404).send('الصفحة غير موجودة');
    }
  });
};

// المسارات الأساسية
app.get('/', serveStaticPage('dashboard'));
app.get('/dashboard', serveStaticPage('dashboard'));
app.get('/signup', serveStaticPage('signup'));
app.get('/login', serveStaticPage('login'));
app.get('/homepage', serveStaticPage('homepage'));

// نقطة نهاية للصحة
app.get('/health', (req, res) => {
  res.json({ status: 'UP' });
});

// معالجة الأخطاء
app.use((err, req, res, next) => {
  console.error('❌ خطأ في الخادم:', err.stack);
  res.status(500).json({
    error: 'حدث خطأ في الخادم',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// =============================================
//              تشغيل الخادم
// =============================================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 الخادم يعمل على http://localhost:${PORT}`);
  console.log('🔓 تحذير: جميع إعدادات الأمان معطلة');
});
