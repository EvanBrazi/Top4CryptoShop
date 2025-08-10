const User = require('../models/User');

/**
 * تسجيل مستخدم جديد
 * @param {Request} req
 * @param {Response} res
 */
const registerUser = async (req, res) => {
  try {
    const user = new User(req.body);
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
    // التعامل مع أخطاء التحقق من Mongoose
    const errors = Object.values(err.errors || {}).map(e => ({
      field: e.path,
      message: e.message,
      suggestion: getSuggestion(e.path)
    }));

    res.status(422).json({
      success: false,
      error: 'فشل التحقق من البيانات',
      details: errors
    });
  }
};

/**
 * اقتراحات ذكية حسب نوع الخطأ
 * @param {string} field
 * @returns {string}
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