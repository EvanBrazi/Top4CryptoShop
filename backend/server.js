require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { checkTokenRevocation } = require('./middlewares/authMiddleware');

// التهيئة
const app = express();

// في server.js
const https = require('https');
const fs = require('fs');
const options = {
  key: fs.readFileSync('server.key'),
  cert: fs.readFileSync('server.cert')
};
https.createServer(options, app).listen(443);

// Middlewares
app.use(cors({
  origin: ['http://localhost:8000', 'https://top4cryptoshop.onrender.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
app.use(express.json());

// حماية المسارات
app.use('/api', checkTokenRevocation);

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
app.use('/api/auth', authRoutes);

const adminRoutes = require('./routes/admin');
app.use('/api/admin', adminRoutes);

// جميع الطلبات الأخرى
app.get('*', (req, res) => {
  res.sendFile(path.join(staticFilesPath, 'dashboard.html'));
});

// التشغيل
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 الخادم يعمل على http://localhost:${PORT}`));
