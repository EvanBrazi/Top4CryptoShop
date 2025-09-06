/**
 * @file security.js
 * @description 🔐 مسارات المصادقة الثنائية
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/auth');
const { generateQR, verifyToken: verify2FA, send2FAKeyByEmail, verify2FAFromEmail } = require('../controllers/securityController');

// 🧠 توليد رمز QR للمصادقة الثنائية
router.get('/generate-qr', verifyToken, generateQR);

// ✅ التحقق من رمز TOTP
router.post('/verify-token', verifyToken, verify2FA);

router.post('/send-2fa-email', verifyToken, send2FAKeyByEmail);
router.post('/verify-2fa-email', verifyToken, verify2FAFromEmail);

// 🔍 التحقق من حالة المصادقة الثنائية للمستخدم
router.get('/status', verifyToken, async (req, res) => {
    try {
        const user = await require('../models/User').findById(req.user._id).select('twoFAStatus');
        res.json({ enabled: user?.twoFAStatus === 'enabled' });
    } catch (err) {
        console.error('❌ فشل جلب حالة الحماية:', err);
        res.status(500).json({ success: false, error: 'SERVER_ERROR' });
    }
});

module.exports = router;
