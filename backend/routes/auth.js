const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const RevokedToken = require('../models/RevokedToken');

// التسجيل
router.post('/register', async (req, res) => {
    try {
        const { username, password, phone, theme } = req.body;

        // التحقق من البيانات المطلوبة
        if (!username || !password) {
            return res.status(400).json({ error: 'يجب إدخال اسم المستخدم وكلمة المرور' });
        }

        // التحقق من عدم تكرار رقم الجوال
        if (phone) {
            const phoneExists = await User.findOne({ phone });
            if (phoneExists) {
                return res.status(400).json({ error: 'رقم الجوال مسجل مسبقاً' });
            }
        }

        const newUser = new User({
            username,
            password,
            phone: phone || null, // حفظ رقم الجوال (إن وجد)
            theme: theme || 0, // القيمة الافتراضية 0 إذا لم يتم تحديد الثيم
            balance: 0
        });

        await newUser.save();

        const token = jwt.sign(
            { userId: newUser._id },
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '1h' }
        );

        res.status(201).json({
            success: true,
            token,
            user: {
                id: newUser._id,
                username: newUser.username,
                phone: newUser.phone,
                theme: newUser.theme,
                balance: newUser.balance
            }
        });

    } catch (err) {
        res.status(500).json({ 
            error: 'حدث خطأ في الخادم',
            details: process.env.NODE_ENV === 'development' ? err.message : null
        });
    }
});

// تسجيل الدخول
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username }).select('+password');
        
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'بيانات غير صحيحة' });
        }

        const token = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '1h' }
        );

res.json({
            success: true,
            token,
            user: {
                id: user._id,
                username: user.username,
                phone: user.phone,
                theme: user.theme,
                balance: user.balance
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// تسجيل الخروج
router.post('/logout', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(400).json({ error: 'لا يوجد توكن' });

        await RevokedToken.create({ token });
        res.json({ success: true, message: 'تم التسجيل الخروج' });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});


router.get('/admin-panel', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/admin.html'));
});

module.exports = router;
