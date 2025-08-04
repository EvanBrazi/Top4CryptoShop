/**
 * server.js - ملف التشغيل الرئيسي للتطبيق
 * إصدار: 2.0.0
 * وصف: يحتوي على إعدادات الخادم الأساسية، وسائط الأمان، إدارة الجلسات، تعريف المسارات ومعالجة الأخطاء
 * التغييرات:
 * - إزالة الخيارات deprecated لـ MongoDB
 * - تحسين إدارة اتصال MongoDB
 * - تحسين إعادة التوجيه HTTPS
 * - تحسين معالجة الأخطاء
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

// =============================================
//               تهيئة التطبيق
// =============================================
const app = express();

// =============================================
//               وسائط الأمان
// =============================================

// 1. وسائط الأمان الأساسية
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"]
    }
  }
}));
app.use(cookieParser());
app.use(compression());
app.use(morgan('combined'));

// 2. إعداد الجلسات مع MongoDB
const sessionConfig = {
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    ttl: 24 * 60 * 60,
    crypto: {
      secret: process.env.SESSION_CRYPTO_SECRET || crypto.randomBytes(32).toString('hex')
    }
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,
    domain: process.env.COOKIE_DOMAIN || undefined
  }
};

if (app.get('env') === 'production') {
  app.set('trust proxy', 1);
  sessionConfig.cookie.secure = true;
}

app.use(session(sessionConfig));

// 3. الحد من معدل الطلبات
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  handler: (req, res) => {
    res.status(429).json({
      error: 'لقد تجاوزت الحد المسموح من الطلبات',
      retryAfter: '15 دقيقة'
    });
  }
});
app.use(limiter);

// 4. إعداد CORS المحسن
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:8000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token'],
  exposedHeaders: ['x-csrf-token']
};
app.use(cors(corsOptions));

// =============================================
//             وسائط تحليل الطلبات
// =============================================
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// =============================================
//             الملفات الثابتة
// =============================================
const staticFilesPath = path.join(__dirname, '../frontend/public');
app.use(express.static(staticFilesPath, {
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// =============================================
//             رؤوس الأمان الإضافية
// =============================================
app.use((req, res, next) => {
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

// =============================================
//             اتصال قاعدة البيانات
// =============================================
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      retryWrites: true,
      w: 'majority'
    });
    console.log('✅ تم الاتصال بـ MongoDB بنجاح');
  } catch (err) {
    console.error('❌ فشل الاتصال بقاعدة البيانات:', err);
    process.exit(1);
  }
};

mongoose.connection.on('disconnected', () => {
  console.log('❌ فقدان الاتصال بقاعدة البيانات، جاري إعادة الاتصال...');
  setTimeout(connectDB, 5000);
});

mongoose.connection.on('connected', () => {
  console.log('✔ اتصال مستقر بقاعدة البيانات');
});

connectDB();

// =============================================
//             إعادة توجيه HTTPS
// =============================================
app.use((req, res, next) => {
  if (!req.secure && req.get('x-forwarded-proto') !== 'https' && process.env.NODE_ENV === 'production') {
    return res.redirect(301, `https://${req.get('host')}${req.url}`);
  }
  next();
});

// =============================================
//                تعريف المسارات
// =============================================
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const apiRoutes = require('./routes/api');

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', apiRoutes);

// =============================================
//              الصفحات الرئيسية
// =============================================
const serveStaticPage = (page) => (req, res) => {
  res.sendFile(path.join(staticFilesPath, `${page}.html`), (err) => {
    if (err) {
      res.status(404).json({ error: 'الصفحة غير موجودة' });
    }
  };
};

app.get('/signup', serveStaticPage('signup'));
app.get('/login', serveStaticPage('login'));
app.get('/homepage', serveStaticPage('homepage'));

// =============================================
//              معالجة الأخطاء
// =============================================
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}]`, err.stack);
  
  const errorResponse = {
    error: 'حدث خطأ في الخادم',
    requestId: req.id,
    ...(process.env.NODE_ENV === 'development' && {
      message: err.message,
      stack: err.stack
    })
  };

  res.status(err.status || 500).json(errorResponse);
});

// =============================================
//              جميع الطلبات الأخرى
// =============================================
app.get('*', serveStaticPage('dashboard'));

// =============================================
//              تشغيل الخادم
// =============================================
const PORT = process.env.PORT || 10000;
const server = app.listen(PORT, () => {
  console.log(`🚀 الخادم يعمل على http://localhost:${PORT}`);
});

// معالجة الأخطاء غير الملتقطة
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  server.close(() => process.exit(1));
});

module.exports = app;
