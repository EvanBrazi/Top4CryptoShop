/**
 * @file User.js
 * @description نموذج مستخدم MongoDB مع وظائف متقدمة مثل التحقق، التشفير، وإعادة تعيين كلمة المرور
 * @version 2.3.0
 * @author EVAN BRAZI
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;
const bcrypt = require('bcryptjs');
const validator = require('validator');
const crypto = require('crypto');

/**
 * @typedef {Object} User
 * @property {string} username - اسم المستخدم الفريد (3–30 حرفًا، بدون رموز)
 * @property {string} password - كلمة المرور المشفرة (قوية)
 * @property {string} [phone] - رقم الهاتف بصيغة دولية
 * @property {string} email - البريد الإلكتروني الفريد
 * @property {number} [theme=0] - إعدادات الثيم (0: افتراضي، 1: داكن)
 * @property {number} [balance=0] - رصيد المستخدم
 * @property {number} [loginAttempts=0] - عدد محاولات الدخول الفاشلة
 * @property {Date} [lastLogin] - تاريخ آخر دخول
 * @property {string} [role='user'] - دور المستخدم (user/admin/moderator)
 * @property {string} [accountStatus='active'] - حالة الحساب
 * @property {number} [tokenVersion=0] - إصدار التوكن لتحديث الجلسات
 * @property {string} [resetPasswordToken] - رمز إعادة تعيين كلمة المرور (مشفر)
 * @property {Date} [resetPasswordExpires] - تاريخ انتهاء صلاحية رمز إعادة التعيين
 */

const userSchema = new Schema({
  // 🧑‍💻 اسم المستخدم
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

  // 🔐 كلمة المرور (تُشفّر تلقائيًا)
  password: {
    type: String,
    required: [true, 'كلمة المرور مطلوبة'],
    minlength: [8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل'],
    select: false,
    validate: {
      validator: v => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/.test(v),
      message: 'كلمة المرور يجب أن تحتوي على حرف كبير، حرف صغير، رقم، ورمز خاص'
    }
  },

  // 📱 رقم الهاتف (اختياري)
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

  // 📧 البريد الإلكتروني
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

  // 🎨 إعدادات الثيم
  theme: {
    type: Number,
    default: 0,
    enum: {
      values: [0, 1],
      message: 'الثيم يجب أن يكون 0 أو 1 فقط'
    }
  },

  // 💰 الرصيد
  balance: {
    type: Number,
    default: 0,
    min: [0, 'الرصيد لا يمكن أن يكون سالباً']
  },

  // 🚫 محاولات الدخول الفاشلة
  loginAttempts: {
    type: Number,
    default: 0,
    min: 0,
    max: [5, 'تجاوزت الحد الأقصى لمحاولات الدخول']
  },

  // 🕒 آخر دخول
  lastLogin: {
    type: Date
  },

  // 🛡️ الدور
  role: {
    type: String,
    enum: ['user', 'admin', 'moderator'],
    default: 'user',
    index: true
  },

  // ⚠️ حالة الحساب
  accountStatus: {
    type: String,
    enum: ['active', 'suspended', 'deactivated'],
    default: 'active',
    index: true
  },

  // 🔁 إصدار التوكن (لتحديث الجلسات)
  tokenVersion: {
    type: Number,
    default: 0
  },

  // 🔑 رمز إعادة تعيين كلمة المرور (مشفر)
  resetPasswordToken: {
    type: String,
    select: false
  },

  // ⏳ تاريخ انتهاء صلاحية رمز إعادة التعيين
  resetPasswordExpires: {
    type: Date,
    select: false
  }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: function (doc, ret) {
      delete ret.password;
      delete ret.__v;
      delete ret.resetPasswordToken;
      delete ret.resetPasswordExpires;
      return ret;
    }
  }
});


// =============================================
// 🔐 تشفير كلمة المرور قبل الحفظ
// =============================================
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    this.tokenVersion += 1; // تحديث الجلسة عند تغيير كلمة المرور
    next();
  } catch (err) {
    next(err);
  }
});

// =============================================
// 🔍 مقارنة كلمة المرور المدخلة مع المشفرة
// =============================================
/**
 * @method comparePassword
 * @param {string} candidatePassword - كلمة المرور المدخلة
 * @returns {Promise<boolean>} هل تتطابق مع كلمة المرور المشفرة
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// =============================================
// 🚫 زيادة محاولات الدخول الفاشلة وتعليق الحساب إذا لزم
// =============================================
/**
 * @method incrementLoginAttempts
 * @description يزيد عدد المحاولات ويعلّق الحساب إذا تجاوز الحد
 */
userSchema.methods.incrementLoginAttempts = async function () {
  const nextAttempts = Math.min((this.loginAttempts || 0) + 1, 5);
  this.loginAttempts = nextAttempts;
  if (nextAttempts >= 5) {
    this.accountStatus = 'suspended';
  }
  await this.save();
};

// =============================================
// 🔁 إنشاء رمز إعادة تعيين كلمة المرور
// =============================================
/**
 * @method createPasswordResetToken
 * @returns {string} resetToken - الرمز الخام قبل التشفير
 */
userSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');
  this.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  this.resetPasswordExpires = Date.now() + 10 * 60 * 1000; // صالح لمدة 10 دقائق
  return resetToken;
};

// =============================================
// 🔎 البحث عن مستخدم حسب البريد أو اسم المستخدم
// =============================================
/**
 * @method findByIdentifier
 * @param {string} identifier - البريد أو اسم المستخدم
 * @returns {Promise<User>} المستخدم إن وجد
 */
userSchema.statics.findByIdentifier = function (identifier) {
  const query = identifier.includes('@')
    ? { email: identifier.trim().toLowerCase() }
    : { username: { $regex: new RegExp(`^${identifier}$`, 'i') } };

  return this.findOne(query).select('+password +loginAttempts +accountStatus +lastLogin');
};

module.exports = mongoose.model('User', userSchema);