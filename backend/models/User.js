/**
 * User.js - نموذج مستخدم MongoDB
 * الإصدار: 2.1.0
 * الوصف: يحتوي على تعريف نموذج المستخدم وجميع الوظائف المرتبطة به
 * التحسينات:
 * - تحسين تحقق كلمة المرور لتشمل رمز خاص
 * - عرض تفاصيل الخطأ بدقة
 * - توثيق شامل لكل خاصية
 * - تحسين أداء الفهارس والتحقق
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;
const bcrypt = require('bcryptjs');
const validator = require('validator');
const crypto = require('crypto');

/**
 * @typedef {Object} User
 * @property {string} username - اسم المستخدم الفريد
 * @property {string} password - كلمة المرور (يتم تشفيرها تلقائياً)
 * @property {string} [phone] - رقم الهاتف بصيغة دولية
 * @property {string} email - البريد الإلكتروني
 * @property {number} [theme=0] - إعدادات الثيم (0: افتراضي، 1: داكن)
 * @property {number} [balance=0] - رصيد المستخدم
 * @property {number} [loginAttempts=0] - عدد محاولات الدخول الفاشلة
 * @property {Date} [lastLogin] - تاريخ آخر دخول
 * @property {string} [role='user'] - دور المستخدم
 * @property {string} [accountStatus='active'] - حالة الحساب
 * @property {number} [tokenVersion=0] - إصدار التوكن
 */

const userSchema = new Schema({
  username: {
    type: String,
    required: [true, 'اسم المستخدم مطلوب'],
    unique: true,
    trim: true,
    minlength: [3, 'اسم المستخدم يجب أن يحتوي على 3 أحرف على الأقل'],
    maxlength: [30, 'اسم المستخدم يجب ألا يتجاوز 30 حرفاً'],
    match: [/^[a-zA-Z0-9_]+$/, 'اسم المستخدم يجب أن يحتوي على أحرف وأرقام فقط'],
    index: true
  },
  password: {
    type: String,
    required: [true, 'كلمة المرور مطلوبة'],
    minlength: [8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل'],
    select: false,
    validate: {
      validator: function (v) {
        // تحقق من وجود حرف كبير، صغير، رقم، ورمز خاص
        return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/.test(v);
      },
      message: 'كلمة المرور يجب أن تحتوي على حرف كبير، حرف صغير، رقم، ورمز خاص'
    }
  },
  phone: {
    type: String,
    unique: true,
    sparse: true,
    validate: {
      validator: v => validator.isMobilePhone(v, 'any', { strictMode: true }),
      message: 'رقم الهاتف غير صالح. يرجى إدخاله بصيغة دولية مثل: +9639xxxxxxx'
    },
    index: true
  },
  email: {
    type: String,
    unique: true,
    sparse: true,
    required: [true, 'البريد الإلكتروني مطلوب'],
    lowercase: true,
    trim: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'صيغة البريد الإلكتروني غير صحيحة'],
    validate: {
      validator: v => validator.isEmail(v),
      message: 'البريد الإلكتروني غير صالح'
    },
    index: true
  },
  theme: {
    type: Number,
    default: 0,
    enum: {
      values: [0, 1],
      message: 'الثيم يجب أن يكون 0 أو 1 فقط'
    }
  },
  balance: {
    type: Number,
    default: 0,
    min: [0, 'الرصيد لا يمكن أن يكون سالباً']
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
    index: true
  },
  accountStatus: {
    type: String,
    enum: ['active', 'suspended', 'deactivated'],
    default: 'active',
    index: true
  },
  tokenVersion: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: function (doc, ret) {
      delete ret.password;
      delete ret.__v;
      return ret;
    }
  }
});

/**
 * تشفير كلمة المرور قبل الحفظ
 */
userSchema.pre('save', async function (next) {
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
 * @param {string} candidatePassword
 * @returns {Promise<boolean>}
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

/**
 * زيادة محاولات الدخول الفاشلة
 */
userSchema.methods.incrementLoginAttempts = async function () {
  const nextAttempts = Math.min((this.loginAttempts || 0) + 1, 5);
  this.loginAttempts = nextAttempts;
  if (nextAttempts >= 5) {
    this.accountStatus = 'suspended';
  }
  await this.save();
};

/**
 * إنشاء رمز إعادة تعيين كلمة المرور
 * @returns {string}
 */
userSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');
  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  this.resetPasswordExpires = Date.now() + 10 * 60 * 1000;
  return resetToken;
};

/**
 * البحث عن مستخدم حسب اسم المستخدم
 * @param {string} username
 * @returns {Promise<User>}
 */
userSchema.statics.findByUsername = function (username) {
  return this.findOne({ username }).select('+password +loginAttempts');
};

module.exports = mongoose.model('User', userSchema);