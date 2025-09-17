/**
 * @file validators.js
 * @description يحتوي على وسائط التحقق من صحة البيانات للواجهات المختلفة (تسجيل، دخول، تعديل الملف الشخصي)
 * @author Evan Brazi
 */

const { body, validationResult } = require('express-validator');

/**
 * ✅ التحقق من صحة بيانات تسجيل المستخدم
 * يشمل:
 * - اسم المستخدم: 3 أحرف على الأقل
 * - كلمة المرور: 8 أحرف على الأقل + رقم
 * - رقم الجوال: اختياري ولكن يجب أن يكون صالحًا إذا تم إدخاله
 */
const validateRegister = [
  body('username')
    .trim()
    .isLength({ min: 3 })
    .withMessage('يجب أن يكون اسم المستخدم 3 أحرف على الأقل')
    .escape(),

  body('password')
    .isLength({ min: 8 })
    .withMessage('يجب أن تكون كلمة المرور 8 أحرف على الأقل')
    .matches(/[0-9]/)
    .withMessage('يجب أن تحتوي كلمة المرور على رقم واحد على الأقل'),

  body('phone')
    .optional({ checkFalsy: true })
    .isMobilePhone()
    .withMessage('رقم الجوال غير صالح')
];

/**
 * ✅ التحقق من صحة بيانات تسجيل الدخول
 * يشمل:
 * - اسم المستخدم: مطلوب
 * - كلمة المرور: مطلوبة
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
 * ✅ التحقق من صحة تعديل الملف الشخصي
 * يشمل:
 * - الاسم: 3 أحرف على الأقل
 * - البريد الإلكتروني: صالح
 * - رقم الجوال: صالح
 * - كلمة المرور: 8 أحرف على الأقل + حرف كبير + رقم
 */
const validateProfileUpdate = [
  body('name')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 3 })
    .withMessage('يجب أن يكون الاسم 3 أحرف على الأقل')
    .escape(),

  body('email')
    .optional({ checkFalsy: true })
    .isEmail()
    .withMessage('البريد الإلكتروني غير صالح')
    .normalizeEmail(),

  body('phone')
    .optional({ checkFalsy: true })
    .isMobilePhone()
    .withMessage('رقم الجوال غير صالح'),

  body('password')
    .optional({ checkFalsy: true })
    .isLength({ min: 8 })
    .withMessage('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
    .matches(/[A-Z]/)
    .withMessage('يجب أن تحتوي كلمة المرور على حرف كبير واحد على الأقل')
    .matches(/[0-9]/)
    .withMessage('يجب أن تحتوي كلمة المرور على رقم واحد على الأقل')
    .matches(/[!@#$%^&*(),.?":{}|<>]/)
    .withMessage('❌ يجب أن تحتوي كلمة المرور على رمز خاص واحد على الأقل.')
];

/**
 * ✅ معالجة أخطاء التحقق من الصحة
 * - يجمع الأخطاء ويحولها إلى تنسيق موحد يحتوي على اقتراحات ذكية
 * - يُستخدم كميدل وير بعد وسائط التحقق
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
          suggestion = 'استخدم كلمة مرور قوية تحتوي على أحرف كبيرة وصغيرة وأرقام ورموز، مثل: Pass!1234.';
          break;
        case 'phone':
          suggestion = 'اكتب رقم الجوال بصيغة دولية مثل: +963 912345678.';
          break;
        case 'email':
          suggestion = 'تأكد من كتابة البريد الإلكتروني بشكل صحيح مثل: example@domain.com.';
          break;
        case 'name':
          suggestion = 'اكتب اسمًا واضحًا لا يقل عن 3 أحرف، بدون رموز خاصة.';
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
  validateProfileUpdate,
  handleValidationErrors
};
