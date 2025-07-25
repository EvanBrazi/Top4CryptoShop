require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { verifyToken, checkAdmin } = require('./middlewares/authMiddleware');

// التهيئة
const app = express();

// Middlewares
app.use(cors({
  origin: ['http://localhost:8000', 'https://top4cryptoshop.onrender.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
app.use(express.json());

// الملفات الثابتة
const staticFilesPath = path.join(__dirname, '../frontend/public');
app.use(express.static(staticFilesPath));

// الصفحات الرئيسية
app.get('/signup', (req, res) => res.sendFile(path.join(staticFilesPath, 'signup.html')));
app.get('/login', (req, res) => res.sendFile(path.join(staticFilesPath, 'login.html')));
app.get('/homepage.html', (req, res) => res.sendFile(path.join(staticFilesPath, 'homepage.html')));

// قاعدة البيانات
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/Top4CryptoShop')
  .then(() => console.log('✅ تم الاتصال بـ MongoDB بنجاح'))
  .catch(err => console.error('❌ فشل الاتصال:', err));

// المسارات
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

// جميع الطلبات الأخرى
app.get('*', (req, res) => {
  res.sendFile(path.join(staticFilesPath, 'dashboard.html'));
});

// التشغيل (الحل النهائي الموصى به)
function startServer(port = 10000, maxAttempts = 5) {
  const server = app.listen(port, () => {
    console.log(`🚀 الخادم يعمل على http://localhost:${port}`);
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
