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

router.post('/register', async (req, res) => {
  try {
    const { username, password, phone, theme } = req.body; // إضافة phone و theme

    const existingUser = await User.findOne({ $or: [{ username }, { phone }] });
    if (existingUser) {
      return res.status(400).json({ 
        error: existingUser.username === username ? 
          'اسم المستخدم موجود' : 'رقم الهاتف مسجل بالفعل'
      });
    }

    const newUser = new User({
      username,
      password,
      phone,
      theme: theme || 0, // افتراضيًا 0 إذا لم يُحدد
      balance: 0
    });

    await newUser.save();
    res.status(201).json({ message: 'تم التسجيل بنجاح', userId: newUser._id });
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

router.post('/update-phone', async (req, res) => {
  try {
    const { userId, newPhone } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    user.changeHistory.phoneUpdates.push({
      oldPhone: user.phone,
      newPhone
    });

    user.phone = newPhone;
    await user.save();

    res.json({ message: 'تم تحديث الهاتف بنجاح' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/update-theme', async (req, res) => {
  try {
    const { userId, theme } = req.body;

    await User.findByIdAndUpdate(userId, { theme });
    res.json({ message: 'تم تحديث الثيم بنجاح' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// التحقق من صحة التوكن
router.get('/verify', authenticateToken, (req, res) => {
    res.json({ user: req.user });
});

module.exports = router;
