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

userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.createPasswordResetToken = function() {
  const resetToken = require('crypto').randomBytes(32).toString('hex');

  this.resetPasswordToken = require('crypto')
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  this.resetPasswordExpires = Date.now() + 10 * 60 * 1000;

  return resetToken;
};

module.exports = mongoose.model('User', userSchema);
