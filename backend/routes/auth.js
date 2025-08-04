const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const RevokedToken = require('../models/RevokedToken');
const { validateRegister, validateLogin } = require('../middlewares/validation');
const rateLimit = require('express-rate-limit');
const { doubleCsrfProtection } = require('../../server'); // استيراد من server.js

// Rate limiting for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  handler: (req, res) => {
    return res.status(429).json({
      error: 'لقد تجاوزت الحد المسموح من المحاولات. يرجى الانتظار 15 دقيقة'
    });
  }
});

// Apply rate limiting to auth routes
router.use(authLimiter);

// تحسينات تسجيل المستخدم
router.post('/register', validateRegister, async (req, res) => {
    try {
        const { username, password, phone, theme } = req.body;

        // التحقق من عدم تكرار اسم المستخدم (حساس لحالة الأحرف)
        const userExists = await User.findOne({ 
            username: { $regex: new RegExp(`^${username}$`, 'i') } 
        });
        
        if (userExists) {
            return res.status(409).json({ 
                error: 'اسم المستخدم مسجل مسبقاً',
                solution: 'اختر اسم مستخدم آخر'
            });
        }

        // إذا كان رقم الجوال مطلوبًا
        if (phone) {
            const phoneExists = await User.findOne({ phone });
            if (phoneExists) {
                return res.status(409).json({ 
                    error: 'رقم الجوال مسجل مسبقاً',
                    solution: 'استخدم رقمًا آخر أو سجل الدخول'
                });
            }
        }

        // تشفير كلمة المرور بكلفة حسابية آمنة
        const salt = await bcrypt.genSalt(12); // زيادة cost factor
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            username,
            password: hashedPassword,
            phone: phone || null,
            theme: theme || 0,
            balance: 0,
            createdAt: new Date(),
            lastLogin: null,
            loginAttempts: 0,
            accountStatus: 'active'
        });

        await newUser.save();

        // إنشاء JWT token مع تحسينات الأمان
        const token = jwt.sign(
            {
                userId: newUser._id,
                role: 'user'
            },
            process.env.JWT_SECRET,
            { 
                expiresIn: '1h',
                issuer: 'top4cryptoshop-api',
                algorithm: 'HS256'
            }
        );

        // تعيين HTTP-only cookie مع تحسينات
        res.cookie('session_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 3600000,
            domain: process.env.FRONTEND_URL || undefined,
            path: '/'
        });

        // عدم إرجاع كلمة المرور حتى المشفرة
        const userResponse = {
            id: newUser._id,
            username: newUser.username,
            phone: newUser.phone,
            theme: newUser.theme,
            balance: newUser.balance,
            createdAt: newUser.createdAt
        };

        return res.status(201).json({
            success: true,
            user: userResponse,
            token // يمكن إزالته إذا كان سيتم استخدام الكوكيز فقط
        });

    } catch (err) {
        console.error('Registration error:', err);
        return res.status(500).json({ 
            error: 'حدث خطأ أثناء التسجيل',
            details: process.env.NODE_ENV === 'development' ? err.message : null,
            requestId: req.requestId
        });
    }
});

// تحسينات تسجيل الدخول
router.post('/login', validateLogin, async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // البحث مع تحديد الحقول المطلوبة فقط
        const user = await User.findOne({ username })
            .select('+password +loginAttempts +accountStatus +lastLogin');
        
        if (!user) {
            return res.status(401).json({ 
                error: 'بيانات الدخول غير صحيحة',
                solution: 'تحقق من اسم المستخدم وكلمة المرور'
            });
        }

        // التحقق من حالة الحساب
        if (user.accountStatus === 'suspended') {
            return res.status(403).json({
                error: 'الحساب موقوف مؤقتاً',
                solution: 'اتصل بدعم العملاء'
            });
        }

        // التحقق من عدد محاولات الدخول الفاشلة
        if (user.loginAttempts >= 5) {
            user.accountStatus = 'suspended';
            await user.save();
            return res.status(429).json({
                error: 'تم تجاوز عدد المحاولات المسموحة',
                solution: 'تم تعليق الحساب مؤقتاً. اتصل بالدعم'
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            user.loginAttempts += 1;
            await user.save();
            
            return res.status(401).json({ 
                error: 'بيانات الدخول غير صحيحة',
                remainingAttempts: 5 - user.loginAttempts
            });
        }

        // إعادة تعيين محاولات الدخول عند النجاح
        user.loginAttempts = 0;
        user.lastLogin = new Date();
        await user.save();

        // إنشاء JWT token
        const token = jwt.sign(
            {
                userId: user._id,
                role: user.role || 'user'
            },
            process.env.JWT_SECRET,
            { 
                expiresIn: '1h',
                issuer: 'top4cryptoshop-api'
            }
        );

        // إعداد الكوكيز
        res.cookie('session_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 3600000,
            domain: process.env.FRONTEND_URL || undefined,
            path: '/'
        });

        // إعداد رأس CSRF
        res.setHeader('X-CSRF-Token', req.csrfToken());

        const userResponse = {
            id: user._id,
            username: user.username,
            phone: user.phone,
            theme: user.theme,
            balance: user.balance,
            lastLogin: user.lastLogin
        };

        return res.json({
            success: true,
            user: userResponse,
            token // اختياري حسب احتياجات العميل
        });

    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ 
            error: 'حدث خطأ أثناء تسجيل الدخول',
            details: process.env.NODE_ENV === 'development' ? err.message : null,
            requestId: req.requestId
        });
    }
});

// تسجيل الخروج المحسن
router.post('/logout', doubleCsrfProtection, async (req, res) => {
    try {
        const token = req.cookies.session_token || req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(400).json({ 
                error: 'لم يتم توفير رمز الجلسة',
                solution: 'قد تكون مسجلًا للخروج بالفعل'
            });
        }

        // إضافة التوكن إلى القائمة السوداء
        await RevokedToken.create({ 
            token,
            revokedAt: new Date(),
            reason: 'user_logout'
        });

        // مسح الكوكيز
        res.clearCookie('session_token', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            domain: process.env.FRONTEND_URL || undefined,
            path: '/'
        });

        return res.json({ 
            success: true, 
            message: 'تم تسجيل الخروج بنجاح' 
        });

    } catch (err) {
        console.error('Logout error:', err);
        return res.status(500).json({ 
            error: 'حدث خطأ أثناء تسجيل الخروج',
            details: process.env.NODE_ENV === 'development' ? err.message : null,
            requestId: req.requestId
        });
    }
});

// إعادة توليد CSRF token
router.get('/refresh-csrf', doubleCsrfProtection, (req, res) => {
    return res.json({ 
        success: true,
        csrfToken: req.csrfToken(),
        expiresAt: new Date(Date.now() + 3600000) // 1 ساعة
    });
});

module.exports = router;
