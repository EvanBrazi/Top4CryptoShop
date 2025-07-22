const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const nodemailer = require('nodemailer'); // لإرسال البريد الإلكتروني

// تهيئة إرسال البريد (تعديل هذه الإعدادات حسب مزود البريد الخاص بك)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// مسار التسجيل
router.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;

        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ error: 'اسم المستخدم موجود بالفعل' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            username,
            password: hashedPassword,
            balance: 0
        });

        await newUser.save();
        res.status(201).json({ message: 'تم إنشاء الحساب بنجاح' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// مسار استعادة كلمة المرور
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        // 1. التحقق من وجود المستخدم
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ error: 'البريد الإلكتروني غير مسجل' });
        }

        // 2. إنشاء توكن استعادة
        const resetToken = crypto.randomBytes(20).toString('hex');
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = Date.now() + 3600000; // صلاحية ساعة واحدة

        await user.save();

        // 3. إرسال البريد الإلكتروني
        const resetUrl = `https://top4cryptoshop.onrender.com/reset-password.html?token=${resetToken}`;
        
        const mailOptions = {
            to: email,
            subject: 'استعادة كلمة المرور - متجر العملات الرقمية',
            html: `
                <p>لقد تلقيت طلبًا لإعادة تعيين كلمة المرور الخاصة بحسابك.</p>
                <p>الرجاء الضغط على الرابط التالي لإعادة تعيين كلمة المرور:</p>
                <a href="${resetUrl}">${resetUrl}</a>
                <p>إذا لم تطلب إعادة التعيين، يمكنك تجاهل هذا البريد.</p>
            `
        };

        await transporter.sendMail(mailOptions);

        res.json({ message: 'تم إرسال رابط استعادة كلمة المرور إلى بريدك الإلكتروني' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

// مسار إعادة تعيين كلمة المرور
router.post('/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        // 1. البحث عن المستخدم باستخدام التوكن
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ error: 'رابط الاستعادة غير صالح أو منتهي الصلاحية' });
        }

        // 2. تحديث كلمة المرور
        user.password = await bcrypt.hash(newPassword, 10);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;

        await user.save();

        res.json({ message: 'تم تحديث كلمة المرور بنجاح' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'خطأ في الخادم' });
    }
});

module.exports = router;
