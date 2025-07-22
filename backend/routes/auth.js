const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');

// مسار التسجيل
router.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // التحقق من وجود المستخدم
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ error: 'اسم المستخدم موجود بالفعل' });
        }

        // تشفير كلمة المرور
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // إنشاء مستخدم جديد
        const newUser = new User({
            username,
            password: hashedPassword,
            balance: 0 // رصيد ابتدائي
        });

        await newUser.save();
        res.status(201).json({ message: 'تم إنشاء الحساب بنجاح' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
