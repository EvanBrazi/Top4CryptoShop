/**
 * server.js - ملف التشغيل الرئيسي للتطبيق
 * يحتوي على:
 * - إعدادات الخادم الأساسية
 * - وسائط الأمان
 * - إدارة الجلسات
 * - تعريف المسارات
 * - معالجة الأخطاء
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

// 1. التهيئة الأساسية للتطبيق
const app = express();

// 2. وسائط الأمان الأساسية
app.use(helmet());
app.use(cookieParser());
app.use(compression());
app.use(morgan('combined')); // تسجيل الطلبات

// 3. إعداد الجلسات مع MongoDB
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    ttl: 24 * 60 * 60 // 1 يوم
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  }
};

if (app.get('env') === 'production') {
  app.set('trust proxy', 1); // الثقة في بروكسي HTTPS
  sessionConfig.cookie.secure = true;
}

app.use(session(sessionConfig));

// 4. الحد من معدل الطلبات
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 100,
  message: 'لقد تجاوزت الحد المسموح من الطلبات، يرجى المحاولة لاحقاً'
});
app.use(limiter);

// 5. إعداد CORS
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:8000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token']
};
app.use(cors(corsOptions));

// 6. وسائط تحليل الطلبات
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// 7. الملفات الثابتة مع تحسينات التخزين المؤقت
const staticFilesPath = path.join(__dirname, '../frontend/public');
app.use(express.static(staticFilesPath, {
  maxAge: '1d',
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// 8. رؤوس الأمان الإضافية
app.use((req, res, next) => {
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// 9. الاتصال بقاعدة البيانات
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      retryWrites: true,
      w: 'majority',
      poolSize: 10
    });
    console.log('✅ تم الاتصال بـ MongoDB بنجاح');
  } catch (err) {
    console.error('❌ فشل الاتصال بقاعدة البيانات:', err);
    process.exit(1);
  }
};
connectDB();

// 10. تعريف المسارات
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const apiRoutes = require('./routes/api');

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', apiRoutes);

// 11. الصفحات الرئيسية
app.get('/signup', (req, res) => res.sendFile(path.join(staticFilesPath, 'signup.html')));
app.get('/login', (req, res) => res.sendFile(path.join(staticFilesPath, 'login.html')));
app.get('/homepage', (req, res) => res.sendFile(path.join(staticFilesPath, 'homepage.html')));

// 12. معالجة الأخطاء
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  const response = {
    error: 'حدث خطأ في الخادم!',
    requestId: req.id
  };

  if (process.env.NODE_ENV === 'development') {
    response.details = err.message;
    response.stack = err.stack;
  }

  res.status(err.status || 500).json(response);
});

// 13. جميع الطلبات الأخرى
app.get('*', (req, res) => {
  res.sendFile(path.join(staticFilesPath, 'dashboard.html'));
});

// 14. تشغيل الخادم
const PORT = process.env.PORT || 10000;
const server = app.listen(PORT, () => {
  console.log(`🚀 الخادم يعمل على http://localhost:${PORT}`);
});

// 15. معالجة الأخطاء غير الملتقطة
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  server.close(() => process.exit(1));
});

module.exports = app;
