/**
 * server.js - ملف التشغيل الرئيسي لتطبيق Top4CryptoShop
 * الإصدار: 2.2.0
 * الوصف: إعدادات الخادم، الأمان، الجلسات، WebSocket، المسارات، والملفات الثابتة
 * المؤلف: Evan Brazi
 */

require('dotenv').config();

// =======================
// 📚 استيراد المكتبات
// =======================
require('dotenv').config();

// 📚 استيراد المكتبات الأساسية
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const cors = require('cors');
const hpp = require('hpp');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const favicon = require('serve-favicon');
const http = require('http');

// 🧠 استيراد الوظائف الداخلية
const setupWebSocket = require('./socket');
const { generateCsrfToken } = require('./middlewares/csrfMiddleware');
const { verifyToken, checkAdmin } = require('./middlewares/auth');

// =======================
// 🚀 تهيئة التطبيق
// =======================
const app = express();
const server = http.createServer(app);
const { broadcast } = setupWebSocket(server);

app.use((req, res, next) => {
  console.log(`📡 طلب وارد: ${req.method} ${req.url}`);
  next();
});

// =======================
// 🔗 الاتصال بقاعدة البيانات
// =======================
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/Top4CryptoShop')
  .then(() => console.log('✅ تم الاتصال بقاعدة البيانات'))
  .catch(err => {
    console.error('❌ فشل الاتصال بقاعدة البيانات:', err);
    process.exit(1);
  });

// =======================
// 🛡️ إعدادات الأمان
// =======================
// 1. تفعيل وسائط الأمان
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net", "https://accounts.google.com", "https://apis.google.com", "chrome-extension://fhimbbbmdjiifimnepkibjfjbppnjble"],
      scriptSrcElem: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net", "https://accounts.google.com", "https://apis.google.com", "https://esm.sh", "https://browser.sentry-cdn.com", "chrome-extension://fhimbbbmdjiifimnepkibjfjbppnjble"],
      imgSrc: ["'self'", "data:", "blob:", "https://cdn-icons-png.flaticon.com", "https://www.gravatar.com", "https://ui-avatars.com", "https://lh3.googleusercontent.com", "https://upload.wikimedia.org"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      connectSrc: ["'self'", "'unsafe-inline'", "ws://localhost:3000", "https://api.ipify.org", "https://accounts.google.com", "https://www.googleapis.com"],
      frameSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com"]
    }
  },
  dnsPrefetchControl: {
    allow: true
  },
  frameguard: {
    action: 'deny'
  },
  hidePoweredBy: true,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  ieNoOpen: true,
  noSniff: true,
  referrerPolicy: {
    policy: 'no-referrer'
  },
  xssFilter: true
}));

app.set('trust proxy', 1);

// =======================
// 🍪 إعداد الجلسات
// =======================
const sessionStore = MongoStore.create({
  client: mongoose.connection.getClient(),
  dbName: 'Top4CryptoShop',
  collectionName: 'sessions',
  ttl: 24 * 60 * 60,
  autoRemove: 'native'
})
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-key',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 86400000
  },
  name: 'sessionId'
}));

// =======================
// 🚦 تحديد معدل الطلبات
// =======================
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  message: { error: 'تم تجاوز الحد المسموح من الطلبات' }
}));

// =======================
// 🔄 وسائط تحليل الطلبات
// =======================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(hpp());
app.use(compression());
app.use(morgan('dev'));

app.get("/csrf-token", (req, res) => {
  try {
    const token = generateCsrfToken(req, res);
    res.json({ csrfToken: token });
  } catch (err) {
    console.error("CSRF Error:", err.message);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// =======================
// 🌐 إعداد CORS
// =======================
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:10000',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400
}));

// =======================
// 📁 الملفات الثابتة
// =======================
app.use(express.static(path.join(__dirname, 'public')));
const staticPath = path.join(__dirname, '../frontend/public');
if (!fs.existsSync(staticPath)) fs.mkdirSync(staticPath, { recursive: true });

app.use(favicon(path.join(staticPath, 'assets/images/favicon.ico')));
app.use(express.static(staticPath, {
  maxAge: '1d',
  setHeaders: res => res.set('Access-Control-Allow-Origin', '*')
}));

// =======================
// 🔀 المسارات الديناميكية
// =======================
const authRouter = require('./routes/auth'); // أو حسب اسم الملف
const adminRouter = require('./routes/admin');
app.use('/api/auth', authRouter); // ✅ هذا يربط المسارات بشكل صحيح
app.use('/api/admin', adminRouter); // ✅ تسجيل جميع مسارات الأدمن تحت /api/admin
app.use('/api/users', require('./routes/users'));
app.use('/api/icons', require('./routes/icons'));
app.use('/api/cards', require('./routes/cards'));

// =======================
// 📦 مسارات API إضافية
// =======================
app.get('/api/apps', (req, res) => {
  fs.readFile(path.join(__dirname, 'data/apps.json'), 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'فشل تحميل التطبيقات' });
    res.json(JSON.parse(data));
  });
});

app.get('/api/essential', (req, res) => {
  fs.readFile(path.join(__dirname, 'data/essential.json'), 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'فشل تحميل essential' });
    res.json(JSON.parse(data));
  });
});

// =======================
// 🧠 منطق WebSocket
// =======================
app.put('/api/users/:id/balance', async (req, res) => {
  const userId = req.params.id;
  const newBalance = req.body.balance;

  // تعديل الرصيد في قاعدة البيانات (معلق)
  // await User.findByIdAndUpdate(userId, { balance: newBalance });
  // ⚠️ تأكد من التحقق من صلاحيات الأدمن هنا لاحقًا
  broadcast({ type: 'balanceUpdate', userId, newBalance }, 'admin');
  res.json({ message: 'تم تعديل الرصيد بنجاح' });
});

// =======================
// 📄 صفحات الواجهة
// =======================
const servePage = page => (req, res) => {
  res.sendFile(path.join(staticPath, `${page}.html`), err => {
    if (err) res.status(404).send('الصفحة غير موجودة');
  });
};

app.get('/', servePage('dashboard'));
app.get('/dashboard', servePage('dashboard'));
app.get('/signup', servePage('signup'));
app.get('/login', servePage('login'));

app.get('/homepage', (req, res) => {
  if (!req.session || !req.session.isAdmin) {
    return res.redirect('/login'); // أو صفحة مخصصة للأدمن
  }

  const filePath = path.join(staticPath, 'homepage.html');
  res.sendFile(filePath);
});

// ✅ تقديم صفحة الأدمن فقط إذا كانت الجلسة صالحة
app.get('/admin', verifyToken, checkAdmin, (req, res) => {
  // ✅ السماح فقط للمستخدمين الذين لديهم دور "admin"
  res.sendFile(path.join(__dirname, 'protectedViews', 'admin.html'));
});

// =======================
// ❤️ نقطة فحص الصحة
// =======================
app.get('/health', (req, res) => {
  res.json({
    status: 'UP',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    memory: process.memoryUsage(),
    uptime: process.uptime()
  });
});

// =======================
// ❌ معالجة الأخطاء
// =======================
app.use((err, req, res, next) => {
  console.error('❌ خطأ في الخادم:', err.stack);
  res.status(500).json({ error: 'حدث خطأ في الخادم' });
});

// =======================
// 🚀 تشغيل الخادم
// =======================
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`🚀 Server + WebSocket يعمل على http://localhost:${PORT}`);
});