require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { doubleCsrf } = require('csrf-csrf'); // بديل عن csurf
const cookieParser = require('cookie-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const { verifyToken, checkAdmin } = require('./middlewares/authMiddleware');

// التهيئة
const app = express();

// تحسينات الأمان الأساسية
app.use(helmet());
app.use(cookieParser());

// إعداد الجلسات مع MongoDB
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/Top4CryptoShop',
    ttl: 24 * 60 * 60 // 1 يوم
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// CSRF Protection البديل
const { generateToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET || 'your-csrf-secret',
  cookieName: '__Host-psifi.x-csrf-token',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    httpOnly: true,
    path: '/'
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS']
});

app.use(doubleCsrfProtection);

// الحد من معدل الطلبات
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 100,
  message: 'لقد تجاوزت الحد المسموح من الطلبات، يرجى المحاولة لاحقاً'
});
app.use(limiter);

// CORS Configuration
const corsOptions = {
  origin: ['http://localhost:8000', 'https://top4cryptoshop.onrender.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token']
};
app.use(cors(corsOptions));

// Middlewares
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// الملفات الثابتة مع تحسينات التخزين المؤقت
const staticFilesPath = path.join(__dirname, '../frontend/public');
app.use(express.static(staticFilesPath, {
  maxAge: '1d',
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// CSRF Token endpoint
app.get('/csrf-token', (req, res) => {
  res.json({ 
    csrfToken: req.csrfToken(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 1 يوم
  });
});

// الصفحات الرئيسية
app.get('/signup', (req, res) => res.sendFile(path.join(staticFilesPath, 'signup.html')));
app.get('/login', (req, res) => res.sendFile(path.join(staticFilesPath, 'login.html')));
app.get('/homepage', (req, res) => res.sendFile(path.join(staticFilesPath, 'homepage.html')));

// قاعدة البيانات مع تحسينات الاتصال
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/Top4CryptoShop', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000
})
.then(() => console.log('✅ تم الاتصال بـ MongoDB بنجاح'))
.catch(err => console.error('❌ فشل الاتصال:', err));

// المسارات
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const apiRoutes = require('./routes/api');

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', apiRoutes);

// معالجة الأخطاء
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({ 
      error: 'رمز CSRF غير صالح',
      solution: 'جدد الصفحة وحاول مرة أخرى'
    });
  }
  
  res.status(500).json({ 
    error: 'حدث خطأ في الخادم!',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// جميع الطلبات الأخرى
app.get('*', (req, res) => {
  res.sendFile(path.join(staticFilesPath, 'dashboard.html'));
});

// التشغيل مع تحسينات معالجة الأخطاء
function startServer(port = process.env.PORT || 10000, maxAttempts = 5) {
  const server = app.listen(port, () => {
    console.log(`🚀 الخادم يعمل على http://localhost:${port}`);
  });

  process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
    server.close(() => process.exit(1));
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && port < port + maxAttempts) {
      console.log(`⚠️ المنفذ ${port} مشغول، جرب ${port + 1}...`);
      startServer(port + 1, maxAttempts);
    } else {
      console.error('خطأ في الخادم:', err);
      process.exit(1);
    }
  });
}

startServer();
