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
const mime = require('mime');
const authRoutes = require('./routes/auth'); // <-- إضافة استيراد مسارات المصادقة
const hpp = require('hpp');

// =============================================
//               تهيئة التطبيق
// =============================================
const app = express();

// أضف هذا الجزء بعد تعريف app وقبل تعريف المسارات
mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI)
.then(() => console.log('✅ تم الاتصال بقاعدة البيانات بنجاح'))
.catch(err => {
  console.error('❌ فشل الاتصال بقاعدة البيانات:', err);
  process.exit(1);
});

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
//               وسائط الأمان (مفعلة الآن)
// =============================================

// 1. تفعيل وسائط الأمان
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net", "https://accounts.google.com", "https://apis.google.com"],
      scriptSrcElem: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net", "https://accounts.google.com", "https://apis.google.com"],
      imgSrc: ["'self'", "data:", "https://cdn-icons-png.flaticon.com", "https://www.gravatar.com", "https://ui-avatars.com", "https://lh3.googleusercontent.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      connectSrc: ["'self'", "'unsafe-inline'", "https://api.ipify.org", "https://accounts.google.com", "https://www.googleapis.com"],
      frameSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com"]
    }
  },
  dnsPrefetchControl: { allow: true },
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  ieNoOpen: true,
  noSniff: true,
  referrerPolicy: { policy: 'no-referrer' },
  xssFilter: true
}));

app.set('trust proxy', 1); // Trust first proxy

// 2. إعداد الجلسات مع قيود الأمان
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'fallback-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    ttl: 24 * 60 * 60,
    autoRemove: 'native'
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000
  },
  name: 'sessionId'
};

app.use(session(sessionConfig));

// 3. تفعيل rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 100, // حد الطلبات لكل IP
  message: {
    error: 'لقد تجاوزت الحد المسموح من الطلبات، يرجى المحاولة لاحقاً'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// 4. إعداniد CORS بشكل آمن
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(hpp());

// =============================================
//             وسائط تحليل الطلبات
// =============================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(compression());
app.use(morgan('combined'));

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

app.use('/icons', express.static(path.join(__dirname, 'public/icons'), {
  setHeaders: (res, filePath) => {
    res.type(filePath);
  }
}));


// =============================================
//                تعريف المسارات
// =============================================

// مسارات API (يجب أن تأتي قبل المسارات الثابتة)
app.use('/api/auth', authRoutes); // <-- إضافة مسارات المصادقة هنا

// مسارات الأيقونات
const iconsRouter = require('./routes/icons');
app.use('/api/icons', iconsRouter);

const cardsRouter = require('./routes/cards');
app.use('/api/cards', cardsRouter);

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
  console.log('🔒 إعدادات الأمان مفعلة');
});
