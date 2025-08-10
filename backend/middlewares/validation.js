const { body, validationResult } = require('express-validator');

/**
 * وسائط التحقق من صحة بيانات تسجيل المستخدم
 * تشمل التحقق من:
 * - اسم المستخدم (3 أحرف على الأقل)
 * - كلمة المرور (6 أحرف على الأقل)
 * - رقم الجوال (اختياري ولكن إذا وجب يجب أن يكون صحيحاً)
 */
const validateRegister = [
  body('username')
    .trim()
    .isLength({ min: 3 })
    .withMessage('يجب أن يكون اسم المستخدم 3 أحرف على الأقل')
    .escape(), // الحماية من هجمات XSS
  
  body('password')
    .isLength({ min: 6 })
    .withMessage('يجب أن تكون كلمة المرور 6 أحرف على الأقل')
    .matches(/[0-9]/)
    .withMessage('يجب أن تحتوي كلمة المرور على رقم واحد على الأقل'),
  
  body('phone')
    .optional({ checkFalsy: true })
    .isMobilePhone()
    .withMessage('رقم الجوال غير صالح')
];

/**
 * وسائط التحقق من صحة بيانات تسجيل الدخول
 * تشمل التحقق من:
 * - وجود اسم المستخدم
 * - وجود كلمة المرور
 */
const validateLogin = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('اسم المستخدم مطلوب')
    .escape(),
  
  body('password')
    .notEmpty()
    .withMessage('كلمة المرور مطلوبة')
];

/**
 * معالجة أخطاء التحقق من الصحة
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 * @param {Function} next - الوظيفة التالية في الميدل وير
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const extractedErrors = errors.array().map(err => {
      let suggestion = '';

      switch (err.param) {
        case 'username':
          suggestion = 'اختر اسم مستخدم يتكون من أحرف وأرقام فقط، بدون رموز أو فراغات.';
          break;
        case 'password':
          suggestion = 'استخدم كلمة مرور قوية تحتوي على أحرف كبيرة وصغيرة وأرقام، مثل: Pass1234.';
          break;
        case 'phone':
          suggestion = 'اكتب رقم الجوال بصيغة دولية مثل: +963912345678.';
          break;
        case 'email':
          suggestion = 'تأكد من كتابة البريد الإلكتروني بشكل صحيح مثل: example@domain.com.';
          break;
        default:
          suggestion = 'يرجى مراجعة هذا الحقل والتأكد من صحته.';
      }

      return {
        field: err.param,
        message: err.msg,
        suggestion
      };
    });

    return res.status(422).json({
      success: false,
      error: 'فشل التحقق من البيانات',
      details: extractedErrors
    });
  }

  next();
};

module.exports = {
  validateRegister,
  validateLogin,
  handleValidationErrors
};