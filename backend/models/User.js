/**
 * @file models/User.js
 * @description نموذج مستخدم MongoDB مع تشفير، تحقق، صورة رمزية، ووقت التفعيل
 * @version 3.0.0
 * @author EVAN BRAZI
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;
const bcrypt = require('bcryptjs');
const validator = require('validator');
const crypto = require('crypto');

const userSchema = new Schema({
  username: {
    type: String,
    required: [true, 'اسم المستخدم مطلوب'],
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30,
    match: [/^[a-zA-Z0-9_]+$/, 'اسم المستخدم يجب أن يحتوي على أحرف وأرقام فقط'],
    index: true
  },

  password: {
    type: String,
    required: [true, 'كلمة المرور مطلوبة'],
    minlength: 8,
    select: false,
    validate: {
      validator: v => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/.test(v),
      message: 'كلمة المرور يجب أن تحتوي على حرف كبير، حرف صغير، رقم، ورمز خاص'
    }
  },

  phone: {
    type: String,
    unique: true,
    sparse: true,
    validate: {
      validator: v => validator.isMobilePhone(v, 'any', { strictMode: true }),
      message: 'رقم الهاتف غير صالح'
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
    validate: {
      validator: v => validator.isEmail(v),
      message: 'البريد الإلكتروني غير صالح'
    },
    index: true
  },

  theme: {
    type: Number,
    default: 0,
    enum: [0, 1]
  },

  balance: {
    type: Number,
    default: 0,
    min: 0
  },

  avatar: {
    type: String,
    default: '',
    validate: {
      validator: v => v === '' || validator.isURL(v),
      message: 'رابط الصورة غير صالح'
    }
  },

  loginAttempts: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },

  lastLogin: {
    type: Date
  },

  activatedAt: {
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

  // 🔐 المصادقة الثنائية (2FA)
  // - twoFASecret: مفتاح التشفير المستخدم في Google Authenticator
  // - twoFAStatus: حالة الحماية (disabled, pending, enabled)
  // - twoFAActivatedAt: تاريخ التفعيل
  // 🔐 المصادقة الثنائية
  twoFASecret: {
    type: String,
    select: false // لا يتم إرجاعه في الاستعلامات العامة
  },

  twoFAStatus: {
    type: String,
    enum: ['disabled', 'pending', 'enabled'],
    default: 'disabled',
    index: true
  },

  twoFAActivatedAt: {
    type: Date
  },

  tokenVersion: {
    type: Number,
    default: 0
  },

  twoFAMethod: { type: String, enum: ['qr', 'email'], default: null },
  twoFAAttempts: { type: Number, default: 0 },
  
  trustedDevices: [{
    deviceId: String,
    addedAt: Date
  }],

  resetPasswordToken: {
    type: String,
    select: false
  },

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

// 🔐 تشفير كلمة المرور
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  if (this.password.startsWith('$2')) return next(); // حماية من التشفير المكرر
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  this.tokenVersion += 1;
  next();
});

// 🔍 مقارنة كلمة المرور
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// 🚫 زيادة محاولات الدخول
userSchema.methods.incrementLoginAttempts = async function () {
  this.loginAttempts = Math.min((this.loginAttempts || 0) + 1, 5);
  if (this.loginAttempts >= 5) this.accountStatus = 'suspended';
  await this.save();
};

// 🔁 إنشاء رمز إعادة تعيين كلمة المرور
userSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');
  this.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  this.resetPasswordExpires = Date.now() + 10 * 60 * 1000;
  return resetToken;
};

// 🔎 البحث حسب البريد أو اسم المستخدم أو الهاتف
userSchema.statics.findByIdentifier = function (identifier) {
  const query = validator.isEmail(identifier)
    ? { email: identifier.trim().toLowerCase() }
    : validator.isMobilePhone(identifier, 'any', { strictMode: true })
      ? { phone: identifier.trim() }
      : { username: new RegExp(`^${identifier}$`, 'i') };

  return this.findOne(query).select('+password +loginAttempts +accountStatus +lastLogin');
};

// 📊 فهرس مركب لتحسين البحث
userSchema.index({ username: 1, email: 1 });

module.exports = mongoose.model('User', userSchema);
