/**
 * @file securityController.js
 * @description 🎯 منطق المصادقة الثنائية: توليد رمز QR والتحقق من TOTP
 */

const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const nodemailer = require('nodemailer');
const User = require('../models/User');

// قاعدة بيانات مؤقتة (استبدلها بـ MongoDB لاحقًا)
const user2FASecrets = new Map();

/**
 * توليد رمز QR وربط المفتاح بالمستخدم
 */
exports.generateQR = async (req, res) => {
  const secret = speakeasy.generateSecret({
    name: `EvanPlatform (${req.user.username})`,
    length: 20
  });

  user2FASecrets.set(req.user._id.toString(), secret.base32);

  try {
    const qr = await QRCode.toDataURL(secret.otpauth_url);
    res.json({ success: true, qr });
  } catch (err) {
    console.error('❌ فشل توليد رمز QR:', err);
    res.status(500).json({ success: false, error: 'QR_GENERATION_FAILED' });
  }
};

/**
 * التحقق من رمز TOTP المدخل من المستخدم
 */
exports.verifyToken = (req, res) => {
  const { token } = req.body;
  const userId = req.user._id.toString();
  const secret = user2FASecrets.get(userId);

  if (!secret) {
    return res.status(400).json({
      success: false,
      error: 'NO_2FA_SECRET',
      message: 'لم يتم توليد مفتاح المصادقة الثنائية لهذا المستخدم'
    });
  }

  const verified = speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token,
    window: 1
  });

  if (!verified) {
    return res.status(403).json({
      success: false,
      error: 'INVALID_2FA_TOKEN',
      message: 'رمز المصادقة الثنائية غير صحيح'
    });
  }

  res.json({ success: true, message: '✅ تم التحقق بنجاح' });
};

/**
 * إرسال مفتاح المصادقة الثنائية عبر البريد الإلكتروني
 */
exports.send2FAKeyByEmail = async (req, res) => {
  const user = req.user; // تم التحقق مسبقًا عبر JWT
  const secret = speakeasy.generateSecret({ length: 20 });

  // خزّن المفتاح مؤقتًا في قاعدة البيانات أو الذاكرة
  await User.findByIdAndUpdate(user._id, {
    twoFASecret: secret.base32,
    twoFAStatus: 'pending'
  });

  // إعداد البريد
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS
    }
  });

  // إرسال المفتاح للمستخدم
  await transporter.sendMail({
    to: user.email,
    subject: '🔐 مفتاح المصادقة الثنائية',
    html: `
      <p>استخدم المفتاح التالي لإعداد المصادقة الثنائية يدويًا في تطبيق Google Authenticator:</p>
      <pre>${secret.base32}</pre>
      <p>اسم الحساب: ${user.username}</p>
    `
  });

  res.json({ success: true, message: '📧 تم إرسال المفتاح إلى بريدك الإلكتروني' });
};

/**
 * التحقق من رمز TOTP المدخل بعد إعداد التطبيق
 */
exports.verify2FAFromEmail = async (req, res) => {
  const { token } = req.body;
  const user = await User.findById(req.user._id);

  if (!user.twoFASecret) {
    return res.status(400).json({ success: false, error: 'NO_SECRET' });
  }

  const verified = speakeasy.totp.verify({
    secret: user.twoFASecret,
    encoding: 'base32',
    token,
    window: 1
  });

  if (!verified) {
    return res.status(403).json({ success: false, error: 'INVALID_TOKEN' });
  }

  user.twoFAStatus = 'enabled';
  await user.save();

  res.json({ success: true, message: '✅ تم تفعيل الحماية بنجاح' });
};
