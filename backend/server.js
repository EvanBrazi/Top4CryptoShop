/**
 * Top4CryptoShop\backend\server.js
 * ملف التشغيل الرئيسي لتطبيق Top4CryptoShop
 *
 * @author: Evan Brazi
 * @version: 2.3.0
 * @lastModified: 2025-08-28
 * @description:
 * - إعدادات الخادم، الأمان، الجلسات، WebSocket، المسارات، والملفات الثابتة
 */

require('dotenv').config();

// =======================
// 📚 استيراد المكتبات الأساسية
// =======================
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
const { initNotifications } = require('./utils/notifications');
const securityHeaders = require('./middleware/security');
const { verifyToken, checkAdmin } = require('./middlewares/auth');

// =======================
// 🧠 الوظائف الداخلية
// =======================
const https = require('https');
const WebSocket = require('ws');

// =======================
// 🚀 تهيئة التطبيق والخادم
// =======================
const app = express();
const server = https.createServer({
  cert: fs.readFileSync('cert.pem'),
  key: fs.readFileSync('key.pem')
}, app);

const wss = new WebSocket.Server({ server, path: "/ws" });

wss.on('connection', socket => {
  console.log("Client connected");
  socket.send("Welcome!");
});

server.listen(process.env.PORT || 443);
initNotifications(wss); // ✅ تهيئة الإشعارات

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
app.use(securityHeaders); // ✅ تفعيل إعدادات الحماية من ملف middleware/security.js
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
});

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-key',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 86400000
  },
  name: 'sessionId'
}));

// =======================
// 🚦 تحديد معدل الطلبات
// =======================
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10000,
  message: { error: 'تم تجاوز الحد المسموح من الطلبات' }
}));

// =======================
// 🔄 وسائط تحليل الطلبات
// =======================
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());
app.use(hpp());
app.use(compression());
app.use(morgan('dev'));

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
app.use('/images/payments', express.static(path.join(__dirname, 'uploads/payments')));
const staticPath = path.join(__dirname, '../frontend/public');
if (!fs.existsSync(staticPath)) fs.mkdirSync(staticPath, { recursive: true });

app.use(favicon(path.join(staticPath, 'assets/images/favicon.ico')));
app.use(express.static(staticPath, {
  maxAge: '1d',
  setHeaders: res => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', 'public, max-age=86400');
  }
}));

// =======================
// 🔀 المسارات الديناميكية
// =======================
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/users', require('./routes/users'));
app.use('/api/icons', require('./routes/icons'));
app.use('/api/cards', require('./routes/cards'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/payments', require('./routes/payments')); // ✅ يدعم رفع الصور + WebSocket

// =======================
// 📦 مسارات API إضافية
// =======================
app.use((req, res, next) => {
  console.log(`📡 طلب وارد: ${req.method} ${req.url}`);
  next();
});

const dataRoutes = ['apps', 'games', 'cryptos', 'balances', 'essential'];
dataRoutes.forEach(route => {
  app.get(`/api/${route}`, (req, res) => {
    fs.readFile(path.join(__dirname, `data/${route}.json`), 'utf8', (err, data) => {
      if (err) return res.status(500).json({ error: `فشل تحميل ${route}` });
      res.json(JSON.parse(data));
    });
  });
});

app.post('/api/compare-token', (req, res) => {
  const clientToken = req.body.clientToken;
  const cookieToken = req.cookies.session_token;

  const match = clientToken && cookieToken && clientToken === cookieToken;

  res.json({ match });
});

// =======================
// 🧠 منطق WebSocket
// =======================
app.put('/api/users/:id/balance', async (req, res) => {
  const userId = req.params.id;
  const newBalance = req.body.balance;

  // ⚠️ تحقق من صلاحيات الأدمن لاحقًا
  broadcast({ type: 'paymentAccepted', userId, newBalance }, 'admin');
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
app.get('/register', servePage('register'));
app.get('/login', servePage('login'));

app.get('/homepage', (req, res) => {
  if (!req.session?.user || req.session.user.role !== 'admin') {
    return res.redirect('/login');
  }
  res.sendFile(path.join(staticPath, 'homepage.html'));
});

app.get('/admin', verifyToken, checkAdmin, (req, res) => {
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
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
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
