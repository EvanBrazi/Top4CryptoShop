/**
 * server.js - ملف التشغيل الرئيسي للتطبيق
 * إصدار: 2.1.0
 * وصف: يحتوي على إعدادات الخادم الأساسية، وسائط الأمان، إدارة الجلسات، تعريف المسارات ومعالجة الأخطاء
 * التغييرات:
 * - إزالة الخيارات deprecated لـ MongoDB
 * - تحسين إدارة اتصال MongoDB
 * - تحسين إعادة التوجيه HTTPS
 * - تحسين معالجة الأخطاء
 * - إضافة تحسينات للأداء والمرونة
 * - إصلاح مشاكل المسارات المفقودة
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

// =============================================
//               تهيئة التطبيق
// =============================================
const app = express();

// إنشاء nonce فريد لكل طلب
app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString('hex');
  next();
});

// =============================================
//               وسائط الأمان
// =============================================

// 1. وسائط الأمان الأساسية
//يقلل الامان ويجب استبدال ["'self'", "'unsafe-inline'"] ب nonce or hash
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: [
        "'self'", "'unsafe-inline'"
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'"
      ],
      imgSrc: [
        "'self'", "'unsafe-inline'"
      ],
      fontSrc: [
        "'self'", "'unsafe-inline'"
      ],
      connectSrc: [
        "'self'", "'unsafe-inline'"
      ],
      frameSrc: ["'self'", "'unsafe-inline'"]
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

// 3. الحد من معدل الطلبات (محسّن)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 300, // 300 طلب لكل IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'لقد تجاوزت الحد المسموح من الطلبات',
    retryAfter: '15 دقيقة'
  }
});

// تطبيق معدل الطلبات على مسارات API فقط
app.use('/api/', apiLimiter);

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

// تحقق من وجود مجلد الملفات الثابتة (مع معالجة الأخطاء)
try {
  if (!fs.existsSync(staticFilesPath)) {
    console.error('❌ مجلد الملفات الثابتة غير موجود:', staticFilesPath);
    console.log('⚡ جاري إنشاء المجلد تلقائياً...');
    fs.mkdirSync(staticFilesPath, { recursive: true });
  }
} catch (err) {
  console.error('❌ خطأ في التحقق من مجلد الملفات:', err);
  process.exit(1);
}

// إعداد Favicon
app.use(favicon(path.join(staticFilesPath, './assets/images/favicon.ico')));

// تحسين معالجة الملفات الثابتة
app.use(express.static(staticFilesPath, {
  maxAge: '7d', // زيادة مدة التخزين المؤقت
  etag: true, // تمكين ETag
  lastModified: true, // تمكين Last-Modified
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=604800'); // أسبوع واحد
    }
  }
}));

// =============================================
//             رؤوس الأمان الإضافية
// =============================================
app.use((req, res, next) => {
  // تسجيل وقت بدء الطلب
  req.startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    console.log(`${req.method} ${req.url} - ${res.statusCode} [${duration}ms]`);
  });

  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

// =============================================
//             اتصال قاعدة البيانات (محسّن)
// =============================================
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 30000,
      maxPoolSize: 50,
      retryWrites: true,
      w: 'majority',
      retryReads: true
    });
    console.log('✅ تم الاتصال بـ MongoDB بنجاح');
  } catch (err) {
    console.error('❌ فشل الاتصال بقاعدة البيانات:', err.message);
    
    // رسائل خطأ موضحة
    if (err.message.includes('Invalid scheme')) {
      console.error('الرجاء التأكد أن رابط الاتصال يبدأ بـ mongodb:// أو mongodb+srv://');
    } else if (err.message.includes('bad auth')) {
      console.error('خطأ في اسم المستخدم/كلمة المرور');
    } else if (err.message.includes('ETIMEOUT')) {
      console.error('مهلة الاتصال انتهت - تأكد من اتصال الإنترنت');
    }
    
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

// نقطة نهاية للصحة
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    db: mongoose.connection.readyState === 1 ? 'CONNECTED' : 'DISCONNECTED',
    memoryUsage: process.memoryUsage()
  });
});

// =============================================
//              الصفحات الرئيسية (محسّنة)
// =============================================
const serveStaticPage = (page) => (req, res) => {
  res.sendFile(path.join(staticFilesPath, `${page}.html`), (err) => {
    if (err) {
      console.error(`Failed to load ${page}.html`, err);
      res.status(404).json({ 
        error: 'الصفحة غير موجودة',
        page: `${page}.html`
      });
    }
  });
};

app.get('/signup', serveStaticPage('signup'));
app.get('/login', serveStaticPage('login'));
app.get('/homepage', serveStaticPage('homepage'));

// إضافة مسار /apps/icons المفقود
app.post('/api/apps/icons', (req, res) => {
  try {
    // منطق معالجة الطلب هنا
    res.status(200).json({ 
      success: true,
      message: 'API under development' 
    });
  } catch (err) {
    res.status(500).json({ 
      error: err.message 
    });
  }
});

// =============================================
//              معالجة الأخطاء (محسّنة)
// =============================================
app.use((err, req, res, next) => {
  const timestamp = new Date().toISOString();
  const errorId = crypto.randomBytes(4).toString('hex');
  
  console.error(`[${timestamp}] [${errorId}]`, err.stack);
  
  const errorResponse = {
    error: 'حدث خطأ في الخادم',
    errorId,
    timestamp,
    path: req.path,
    method: req.method,
    ...(process.env.NODE_ENV === 'development' && {
      message: err.message,
      stack: err.stack.split('\n')
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

// معالجة الأخطاء غير الملتقطة (محسّنة)
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  
  // إعطاء وقت للإغلاق بشكل أنيق
  server.close(() => {
    console.log('Server closed due to unhandled rejection');
    process.exit(1);
  });
  
  // إغلاق قسري بعد 5 ثواني إذا لم يتم الإغلاق
  setTimeout(() => {
    console.error('Forcing shutdown due to timeout');
    process.exit(1);
  }, 5000);
});

module.exports = app;
