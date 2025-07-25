const mongoose = require('mongoose');
const { Schema } = mongoose;
const bcrypt = require('bcryptjs');

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
  phone: {
    type: String,
    unique: true,
    sparse: true,
    validate: {
      validator: v => /^\+?\d{10,15}$/.test(v),
      message: 'رقم الهاتف غير صالح'
    }
  },
  email: {
    type: String,
    unique: true,
    sparse: true,
    validate: {
      validator: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      message: 'البريد الإلكتروني غير صالح'
    }
  },
  theme: {
    type: Number,
    default: 0,
    enum: [0, 1]
  },
  balance: {
    type: Number,
    default: 0
  },
  loginAttempts: {
    type: Number,
    default: 0
  },
  lastLogin: {
    type: Date
  },
role: {
    type: String,
    enum: ['user', 'admin'], // أنواع الصلاحيات
    default: 'user'
  },
  tokenVersion: {
    type: Number,
    default: 0
},
  resetPasswordToken: String,
  resetPasswordExpires: Date,
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

module.exports = mongoose.model('User', userSchema);
