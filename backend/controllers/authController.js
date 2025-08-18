const User = require('../models/User');
const bcrypt = require('bcryptjs');

/**
 * @function registerUser
 * @description تسجيل مستخدم جديد في النظام
 * @route POST /api/auth/register
 * @access Public
 */
const registerUser = async (req, res) => {
  try {
    const { username, email, password, phone } = req.body;

    // ✅ التحقق من وجود جميع الحقول المطلوبة
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: 'يرجى تعبئة جميع الحقول المطلوبة'
      });
    }

    // ✅ التحقق من صحة البريد الإلكتروني
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(422).json({
        success: false,
        error: 'INVALID_EMAIL',
        message: 'صيغة البريد الإلكتروني غير صحيحة'
      });
    }

    // ✅ التحقق من قوة كلمة المرور
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;
    if (!passwordRegex.test(password)) {
      return res.status(422).json({
        success: false,
        error: 'WEAK_PASSWORD',
        message: 'كلمة المرور ضعيفة. يجب أن تحتوي على حرف كبير وصغير ورقم ورمز خاص'
      });
    }

    // ✅ التحقق من وجود المستخدم مسبقًا
    const existingUser = await User.findOne({
      $or: [{ username: username.trim() }, { email: email.trim().toLowerCase() }]
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'USER_EXISTS',
        message: 'اسم المستخدم أو البريد الإلكتروني مستخدم مسبقًا'
      });
    }

    // ✅ تشفير كلمة المرور
    const hashedPassword = await bcrypt.hash(password, 10);

    // ✅ إنشاء المستخدم الجديد
    const user = new User({
      username: username.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      phone: phone?.trim(),
      accountStatus: 'active',
      loginAttempts: 0
    });

    await user.save();

    // ✅ الرد النهائي
    return res.status(201).json({
      success: true,
      message: 'تم إنشاء الحساب بنجاح',
      user: {
        id: user._id,
        username: user.username,
        email: user.email
      }
    });

  } catch (err) {
    console.error('❌ خطأ أثناء التسجيل:', err);

    // ✅ التعامل مع أخطاء قاعدة البيانات
    const errors = Object.values(err.errors || {}).map(e => ({
      field: e.path,
      message: e.message,
      suggestion: getSuggestion(e.path)
    }));

    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'حدث خطأ أثناء إنشاء الحساب',
      details: errors.length ? errors : undefined
    });
  }
};

/**
 * @function getSuggestion
 * @description يقدم اقتراحات للمستخدم حسب نوع الخطأ
 * @param {string} field - اسم الحقل
 * @returns {string} اقتراح للمستخدم
 */
function getSuggestion(field) {
  switch (field) {
    case 'username':
      return 'اختر اسم مستخدم يتكون من أحرف وأرقام فقط، بدون رموز أو فراغات.';
    case 'password':
      return 'استخدم كلمة مرور قوية تحتوي على حرف كبير، صغير، رقم، ورمز خاص.';
    case 'phone':
      return 'اكتب رقم الجوال بصيغة دولية مثل: +963912345678.';
    case 'email':
      return 'تأكد من كتابة البريد الإلكتروني بشكل صحيح مثل: example@domain.com.';
    default:
      return 'يرجى مراجعة هذا الحقل والتأكد من صحته.';
  }
}

module.exports = {
  registerUser
};