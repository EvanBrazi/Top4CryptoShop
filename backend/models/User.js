/**
 * User.js - نموذج مستخدم MongoDB
 * إصدار: 1.0.0
 * وصف: يحتوي على تعريف نموذج المستخدم وجميع الوظائف المرتبطة به
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;
const bcrypt = require('bcryptjs');
const validator = require('validator');
const crypto = require('crypto');

/**
 * تعريف مخطط المستخدم
 */
const userSchema = new Schema({
  username: {
    type: String,
    required: [true, 'اسم المستخدم مطلوب'],
    unique: true,
    trim: true,
    minlength: [3, 'يجب أن يكون اسم المستخدم 3 أحرف على الأقل'],
    maxlength: [30, 'يجب ألا يتجاوز اسم المستخدم 30 حرفاً'],
    match: [/^[a-zA-Z0-9_]+$/, 'يجب أن يحتوي اسم المستخدم على أحرف وأرقام فقط']
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
    }
  },
  email: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    validate: {
      validator: v => validator.isEmail(v),
      message: 'البريد الإلكتروني غير صالح'
    }
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
    default: 'user'
  },
  accountStatus: {
    type: String,
    enum: ['active', 'suspended', 'deactivated'],
    default: 'active'
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
      delete ret.password; // إزالة كلمة المرور من الناتج
      delete ret.__v; // إزالة حقل الإصدار
      return ret;
    }
  }
});

// =============================================
//               Middlewares
// =============================================

/**
 * Middleware قبل الحفظ لتشفير كلمة المرور
 */
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  try {
    const saltRounds = process.env.NODE_ENV === 'production' ? 12 : 10;
    const salt = await bcrypt.genSalt(saltRounds);
    this.password = await bcrypt.hash(this.password, salt);
    this.tokenVersion += 1;
    next();
  } catch (err) {
    next(err);
  }
});

// =============================================
//               Methods
// =============================================

/**
 * مقارنة كلمة المرور المدخلة مع المشفرة
 * @param {String} candidatePassword - كلمة المرور المدخلة
 * @returns {Boolean} - نتيجة المقارنة
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
 * @returns {String} - رمز إعادة التعيين
 */
userSchema.methods.createPasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex');
  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  this.resetPasswordExpires = Date.now() + 10 * 60 * 1000; // 10 دقائق
  return resetToken;
};

// =============================================
//               Indexes
// =============================================
userSchema.index({ username: 1 });
userSchema.index({ email: 1 }, { sparse: true });
userSchema.index({ phone: 1 }, { sparse: true });
userSchema.index({ role: 1 });
userSchema.index({ accountStatus: 1 });

module.exports = mongoose.model('User', userSchema);
