const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { Schema } = mongoose;

const userSchema = new Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  // أضف هذه الحقول الجديدة:
  phone: {
    type: String,
    unique: true,
    sparse: true,
    validate: {
      validator: v => /^\+?\d{10,15}$/.test(v), // تحقق من رقم الهاتف
      message: 'رقم الهاتف غير صالح'
    }
  },
  theme: {
    type: Number,
    default: 0, // 0 = فاتح، 1 = داكن
    enum: [0, 1] // يسمح فقط بالقيم 0 أو 1
  },
  balance: {
    type: Number,
    default: 0
  },
  // أضف سجل التغييرات:
  changeHistory: {
    phoneUpdates: [{
      oldPhone: String,
      newPhone: String,
      changedAt: { type: Date, default: Date.now }
    }],
    emailUpdates: [{
      oldEmail: String,
      newEmail: String,
      changedAt: { type: Date, default: Date.now }
    }]
  }
}, { timestamps: true });

// تشفير كلمة المرور قبل الحفظ
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// مقارنة كلمات المرور
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// إنشاء توكن استعادة كلمة المرور
userSchema.methods.createPasswordResetToken = function() {
  const resetToken = require('crypto').randomBytes(32).toString('hex');
  
  this.resetPasswordToken = require('crypto')
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  
  this.resetPasswordExpires = Date.now() + 10 * 60 * 1000; // 10 دقائق
  
  return resetToken;
};

module.exports = mongoose.model('User', userSchema);
