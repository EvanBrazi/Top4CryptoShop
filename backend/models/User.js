/**
 * User.js - نموذج مستخدم MongoDB
 * إصدار: 2.0.1
 * وصف: يحتوي على تعريف نموذج المستخدم وجميع الوظائف المرتبطة به
 * التغييرات:
 * - إزالة الفهارس المكررة
 * - تحسين التحقق من الصحة
 * - تحسين أداء الاستعلامات
 * - إصلاح تحذيرات الفهارس المكررة
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;
const bcrypt = require('bcryptjs');
const validator = require('validator');
const crypto = require('crypto');

/**
 * @typedef {Object} User
 * @property {string} username - اسم المستخدم الفريد
 * @property {string} password - كلمة المرور المشفرة
 * @property {string} [phone] - رقم الهاتف (اختياري)
 * @property {string} [email] - البريد الإلكتروني (اختياري)
 * @property {number} [theme=0] - إعدادات الثيم
 * @property {number} [balance=0] - رصيد المستخدم
 * @property {number} [loginAttempts=0] - عدد محاولات الدخول الفاشلة
 * @property {Date} [lastLogin] - تاريخ آخر دخول
 * @property {string} [role='user'] - دور المستخدم (user/admin/moderator)
 * @property {string} [accountStatus='active'] - حالة الحساب
 * @property {number} [tokenVersion=0] - إصدار التوكن
 */

const userSchema = new Schema({
  username: {
    type: String,
    required: [true, 'اسم المستخدم مطلوب'],
    unique: true,
    trim: true,
    minlength: [3, 'يجب أن يكون اسم المستخدم 3 أحرف على الأقل'],
    maxlength: [30, 'يجب ألا يتجاوز اسم المستخدم 30 حرفاً'],
    match: [/^[a-zA-Z0-9_]+$/, 'يجب أن يحتوي اسم المستخدم على أحرف وأرقام فقط'],
    index: true // تعريف الفهرس هنا بدلاً من تكراره لاحقاً
  },
  password: {
    type: String,
    required: [true, 'كلمة المرور مطلوبة'],
    minlength: [8, 'يجب أن تكون كلمة المرور 8 أحرف على الأقل'],
    select: false
  },
  phone: {
    type: String,
    unique: true,
    sparse: true,
    validate: {
      validator: v => validator.isMobilePhone(v, 'any', { strictMode: true }),
      message: 'رقم الهاتف غير صالح'
    },
    index: true // تعريف الفهرس هنا
  },
  email: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    validate: {
      validator: v => validator.isEmail(v),
      message: 'البريد الإلكتروني غير صالح'
    },
    index: true // تعريف الفهرس هنا
  },
  theme: {
    type: Number,
    default: 0,
    enum: {
      values: [0, 1],
      message: 'الثيم يجب أن يكون 0 أو 1'
    }
  },
  balance: {
    type: Number,
    default: 0,
    min: [0, 'لا يمكن أن يكون الرصيد سالباً']
  },
  loginAttempts: {
    type: Number,
    default: 0,
    min: 0,
    max: [5, 'تجاوزت الحد الأقصى لمحاولات الدخول']
  },
  lastLogin: {
    type: Date
  },
  role: {
    type: String,
    enum: ['user', 'admin', 'moderator'],
    default: 'user',
    index: true // تعريف الفهرس هنا
  },
  accountStatus: {
    type: String,
    enum: ['active', 'suspended', 'deactivated'],
    default: 'active',
    index: true // تعريف الفهرس هنا
  },
  tokenVersion: {
    type: Number,
    default: 0
  }
}, { 
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.__v;
      return ret;
    }
  },
  statics: {
    /**
     * البحث عن مستخدم باسم مستخدم معين
     * @param {string} username - اسم المستخدم للبحث
     * @returns {Promise<User>} - وثيقة المستخدم
     */
    findByUsername(username) {
      return this.findOne({ username }).select('+password +loginAttempts');
    }
  }
});

/**
 * تشفير كلمة المرور قبل الحفظ
 */
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    this.tokenVersion += 1;
    next();
  } catch (err) {
    next(err);
  }
});

/**
 * مقارنة كلمة المرور المدخلة مع المشفرة
 * @param {string} candidatePassword - كلمة المرور المدخلة
 * @returns {Promise<boolean>} - نتيجة المقارنة
 */
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

/**
 * زيادة محاولات الدخول الفاشلة
 */
userSchema.methods.incrementLoginAttempts = async function() {
  this.loginAttempts += 1;
  if (this.loginAttempts >= 5) {
    this.accountStatus = 'suspended';
  }
  await this.save();
};

/**
 * إنشاء رمز إعادة تعيين كلمة المرور
 * @returns {string} - رمز إعادة التعيين
 */
userSchema.methods.createPasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex');
  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  this.resetPasswordExpires = Date.now() + 10 * 60 * 1000;
  return resetToken;
};

module.exports = mongoose.model('User', userSchema);
