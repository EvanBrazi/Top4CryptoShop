const User = require('../models/User');
const bcrypt = require('bcryptjs');

/**
 * تسجيل مستخدم جديد
 * @route POST /api/auth/register
 */
const registerUser = async (req, res) => {
  try {
    const { username, email, password, phone } = req.body;

    // تحقق من وجود المستخدم مسبقًا
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'USER_EXISTS',
        message: 'اسم المستخدم أو البريد الإلكتروني مستخدم مسبقًا'
      });
    }

    // تشفير كلمة المرور
    const hashedPassword = await bcrypt.hash(password, 10);

    // إنشاء المستخدم
    const user = new User({
      username,
      email,
      password: hashedPassword,
      phone
    });

    await user.save();

    res.status(201).json({
      success: true,
      message: 'تم إنشاء الحساب بنجاح',
      user: {
        id: user._id,
        username: user.username,
        email: user.email
      }
    });
  } catch (err) {
    const errors = Object.values(err.errors || {}).map(e => ({
      field: e.path,
      message: e.message,
      suggestion: getSuggestion(e.path)
    }));

    res.status(422).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'فشل التحقق من البيانات',
      details: errors
    });
  }
};

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