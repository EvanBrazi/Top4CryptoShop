/**
 * @file security.js
 * @description 🔐 مسارات المصادقة الثنائية
 */

const express = require('express');
const router = express.Router();
const User = require('../models/User')
const { verifyToken } = require('../middlewares/auth');
const { generateQR, verifyToken: verify2FA, send2FAKeyByEmail, verify2FAFromEmail, disable2FA } = require('../controllers/securityController');

// 🧠 توليد رمز QR للمصادقة الثنائية
router.get('/generate-qr', verifyToken, generateQR);

// ✅ التحقق من رمز TOTP
router.post('/verify-token', verifyToken, verify2FA);

router.post('/send-2fa-email', verifyToken, send2FAKeyByEmail);
router.post('/verify-2fa-email', verifyToken, verify2FAFromEmail);

// 🔍 التحقق من حالة المصادقة الثنائية للمستخدم
router.get('/status', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('twoFAStatus emailVerified twoFAMethod twoFAAttempts');
        res.json({
            emailVerified: user?.emailVerified === true,
            twoFAEnabled: user?.twoFAStatus === 'enabled',
            method: user?.twoFAMethod || null,
            failedAttempts: user?.twoFAAttempts || 0
        });
    } catch (err) {
        console.error('❌ فشل جلب حالة الحماية:', err);
        res.status(500).json({ success: false, error: 'SERVER_ERROR' });
    }
});

router.post('/disable-2fa', verifyToken, disable2FA);

module.exports = router;
