/**
 * csrfMiddleware.js
 * 📌 حماية CSRF باستخدام تقنية Double Submit Cookie
 * - generateCsrfToken: لإنشاء رمز CSRF وإرساله للواجهة
 * - doubleCsrfProtection: Middleware لحماية المسارات من هجمات CSRF
 */

const { doubleCsrf } = require("csrf-csrf");
const crypto = require('crypto');

const csrfOptions = {
  getSecret: () => process.env.CSRF_SECRET || "default-secret",
  getSessionIdentifier: (req) => req.ip || req.headers["user-agent"] || "anonymous", // ✅ هنا مكانه
  cookieName: "x-csrf-token",
  cookieOptions: {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production"
  },
  size: 64,
  ignoredMethods: ["GET", "HEAD", "OPTIONS"]
};

const { generateCsrfToken, validateRequest } = doubleCsrf(csrfOptions);

// ✅ تحقق أن الكائن يحتوي على الدوال المطلوبة
console.log(typeof generateCsrfToken); // يجب أن تطبع: function
console.log(typeof validateRequest); // يجب أن تطبع: function

module.exports = {
  doubleCsrfProtection: validateRequest,
  generateCsrfToken: (req, res) => generateCsrfToken(req, res)
};