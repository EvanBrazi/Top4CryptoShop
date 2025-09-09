// =======================
// 🛡️ إعدادات الأمان الموحدة
// =======================

// =======================
// 🛡️ إعدادات الأمان الموحدة
// =======================

const helmet = require('helmet');

const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: false, // تعطيل الإعدادات الافتراضية لتجنب التداخل
    directives: {
      defaultSrc: ["'self'"],

      scriptSrc: [
        "'self'", "'unsafe-inline'",
        "https://cdnjs.cloudflare.com",
        "https://cdn.jsdelivr.net",
        "https://accounts.google.com",
        "https://apis.google.com",
      ],

      scriptSrcElem: [
        "'self'", "'unsafe-inline'",
        "https://cdnjs.cloudflare.com",
        "https://cdn.jsdelivr.net",
        "https://accounts.google.com",
        "https://apis.google.com",
        "https://esm.sh",
        "https://browser.sentry-cdn.com",
      ],

      imgSrc: [
        "'self'", "data:", "blob:",
        "https://res.cloudinary.com",
        "https://cdn-icons-png.flaticon.com",
        "https://www.gravatar.com",
        "https://ui-avatars.com",
        "https://lh3.googleusercontent.com",
        "https://upload.wikimedia.org",
        "https://developers.google.com"
      ],

      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com",
        "https://cdnjs.cloudflare.com"
      ],

      connectSrc: [
        "'self'", "'unsafe-inline'",
        "ws://localhost:10000/",
        "ws://top4cryptoshop.onrender.com:10000",
        "https://res.cloudinary.com",
        "https://api.ipify.org",
        "https://accounts.google.com",
        "https://www.googleapis.com",
        "https://cdn.jsdelivr.net",
        "https://cdnjs.cloudflare.com",
        "https://upload.wikimedia.org",
        "https://www.gravatar.com",
        "https://esm.sh",
        "https://v6.exchangerate-api.com",
        "https://ui-avatars.com/",
        "https://cdn-icons-png.flaticon.com" // ✅ أضف هذا السطر
      ],

      frameSrc: [
        "'self'", "'unsafe-inline'",
        "https://accounts.google.com"
      ],

      styleSrc: [
        "'self'", "'unsafe-inline'",
        "https://fonts.googleapis.com",
        "https://cdn.jsdelivr.net",
        "https://cdnjs.cloudflare.com"
      ],

      objectSrc: ["'none'"], // منع تحميل ملفات Flash أو محتوى غير آمن
      baseUri: ["'self'"],   // منع تغيير base URI
      formAction: ["'self'"], // منع إرسال النماذج إلى مصادر خارجية
    }
  },

  dnsPrefetchControl: { allow: true },
  frameguard: { action: 'deny' },
  hidePoweredBy: true,

  hsts: {
    maxAge: 31536000, // سنة كاملة
    includeSubDomains: true,
    preload: true
  },

  ieNoOpen: true,
  noSniff: true,
  referrerPolicy: { policy: 'no-referrer' },
  xssFilter: true
});

module.exports = securityHeaders;
