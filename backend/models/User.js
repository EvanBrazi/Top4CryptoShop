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
const { assertCents, parseMoney, MAX_CENTS } = require('../utils/money');

function balanceMismatch(balance, balanceCents) {
  try {
    assertCents(balanceCents);
    return typeof balance !== 'number' || parseMoney(balance) !== balanceCents;
  } catch (_) { return true; }
}
function financialWriteError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
function assertExistingFinancialState(state) {
  let cents;
  try {
    if (typeof state?.balance !== 'number') throw new TypeError('A stored numeric balance is required');
    cents = parseMoney(state.balance);
  } catch (_) {
    throw financialWriteError('LEGACY_BALANCE_INVALID', 'The stored balance cannot be represented exactly in cents; manual reconciliation is required');
  }
  if (state.balanceCents !== undefined && balanceMismatch(state.balance, state.balanceCents)) {
    throw financialWriteError('BALANCE_STATE_MISMATCH', 'The stored balance mirror is inconsistent; manual reconciliation is required');
  }
  return cents;
}
function balancePath(path) {
  return typeof path === 'string' && ['balance', 'balanceCents'].some(field => path === field || path.startsWith(`${field}.`));
}

// Inspect actual update paths (including $rename destinations), not unrelated nested data.
function financialSet(update) {
  const set = Object.create(null);
  const collect = (path, value, operator) => {
    if (!balancePath(path) && !(operator === '$rename' && balancePath(value))) return;
    if (operator !== '$set' || !['balance', 'balanceCents'].includes(path) || Object.hasOwn(set, path)) {
      throw financialWriteError('UNSAFE_FINANCIAL_UPDATE', 'Balances permit only a complete $set pair; financial operators and dotted paths are disabled');
    }
    set[path] = value;
  };
  for (const [key, value] of Object.entries(update || {})) {
    if (key.startsWith('$')) {
      for (const [path, entry] of Object.entries(value || {})) collect(path, entry, key);
    } else {
      collect(key, value, '$set');
    }
  }
  return set;
}


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
    required: function () {
      return this.provider === 'local';
    },
    minlength: 8,
    select: false,
    validate: {
      validator: function (v) {
        // Do not apply plaintext strength rules to an unchanged stored hash.
        if (!this.isModified('password')) return true;
        if (!v) return this.provider !== 'local';
        return typeof v === 'string' && Buffer.byteLength(v, 'utf8') <= 72 &&
          /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/.test(v);
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

  googleId: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },

  provider: {
    type: String,
    enum: ['local', 'google'],
    default: 'local'
  },

  theme: {
    type: Number,
    default: 0,
    enum: [0, 1]
  },

  // Legacy/display mirror only. Financial writes set this and balanceCents together in a transaction.
  balance: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
    validate: {
      validator: Number.isFinite,
      message: 'الرصيد يجب أن يكون رقماً محدوداً وغير سالب'
    }
  },

  // No default: a hydrated legacy account must not acquire a fictitious zero balance.
  balanceCents: {
    type: Number,
    min: 0,
    max: MAX_CENTS,
    validate: [
      {
        validator: value => Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0),
        message: 'الرصيد بالسنت يجب أن يكون عدداً صحيحاً آمناً وغير سالب'
      },
      {
        validator: function (value) {
          // Query writes are checked as a complete pair in query middleware below.
          if (this instanceof mongoose.Query) return true;
          if (!this.isSelected('balance') && !this.isModified('balance')) return true;
          return !balanceMismatch(this.balance, value);
        },
        message: 'رصيد السنت لا يطابق الرصيد المتوافق'
      }
    ]
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
    required: true,
    default: 0,
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
    validate: {
      validator: Number.isSafeInteger,
      message: 'إصدار رمز المصادقة يجب أن يكون عدداً صحيحاً آمناً وغير سالب'
    }
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
  // Detect conflicting document.save() calls; query/$inc writes still need explicit financial guards.
  optimisticConcurrency: true,
  toJSON: {
    virtuals: true,
    transform: function (doc, ret) {
      delete ret.password;
      delete ret.__v;
      delete ret.resetPasswordToken;
      delete ret.resetPasswordExpires;
      delete ret.twoFASecret;
      delete ret.trustedDevices;
      delete ret.tokenVersion;
      return ret;
    }
  }
});

// Strict per-path casting: never coerce booleans or numeric strings into authoritative cents.
userSchema.path('balanceCents').castFunction(value => value === undefined ? value : assertCents(value));

function initializeZeroBalance(user) {
  if (user.isNew && user.balance === 0 && user.balanceCents === undefined && !user.$errors?.balanceCents) {
    user.balanceCents = 0;
  }
}
// Preserve raw stored values, not hydration defaults, for explicit document-based migrations.
userSchema.pre('init', function (raw) {
  this.$locals.financialSnapshot = { balance: raw.balance, balanceCents: raw.balanceCents };
});
userSchema.post('save', function () {
  if (this.isSelected('balance')) {
    this.$locals.financialSnapshot = { balance: this.balance, balanceCents: this.balanceCents };
  }
  if (Object.hasOwn(this.$locals, 'financialWhereBeforeSave')) {
    this.$where = this.$locals.financialWhereBeforeSave;
    delete this.$locals.financialWhereBeforeSave;
  }
});
userSchema.pre('validate', function () {
  initializeZeroBalance(this);
  if (this.isModified('balanceCents') && this.balanceCents === undefined) {
    this.invalidate('balanceCents', 'An authoritative balance cannot be removed');
  }
});
userSchema.pre('save', function () {
  initializeZeroBalance(this);
  // Recheck financial invariants even when save validation has been disabled by a caller.
  const validationError = this.validateSync(['balance', 'balanceCents']);
  if (validationError) throw validationError;
  const financialChange = this.isModified('balance') || this.isModified('balanceCents');
  const zeroCreation = this.isNew && this.balance === 0 && this.balanceCents === 0;
  if (!financialChange || zeroCreation) return;
  if (this.$session()?.inTransaction() !== true) {
    throw financialWriteError('FINANCIAL_TRANSACTION_REQUIRED', 'Balance writes require an active transaction');
  }
  if (!this.isModified('balance') || !this.isModified('balanceCents') || balanceMismatch(this.balance, this.balanceCents)) {
    throw financialWriteError('BALANCE_PAIR_REQUIRED', 'Balance writes must set a matching balance and balanceCents pair');
  }
  if (!this.isNew) {
    const original = this.$locals.financialSnapshot;
    assertExistingFinancialState(original);
    // Query writes do not advance __v. Compare the original money pair as well, so a
    // document loaded before this transaction cannot overwrite a newer balance.
    if (!Object.hasOwn(this.$locals, 'financialWhereBeforeSave')) {
      this.$locals.financialWhereBeforeSave = this.$where;
    }
    this.$where = {
      ...this.$where, balance: original.balance,
      balanceCents: original.balanceCents === undefined ? { $exists: false } : original.balanceCents
    };
  }
});

// 🔐 تشفير كلمة المرور
userSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) return;
  // Save middleware runs after validation, so guard the increment against overflow here.
  if (!Number.isSafeInteger(this.tokenVersion) || this.tokenVersion < 0 || this.tokenVersion >= Number.MAX_SAFE_INTEGER) {
    const error = new mongoose.Error.ValidationError(this);
    error.addError('tokenVersion', new mongoose.Error.ValidatorError({
      path: 'tokenVersion', value: this.tokenVersion,
      message: 'Cannot safely increment authentication token version'
    }));
    throw error;
  }
  this.password = await bcrypt.hash(this.password, 12);
  this.tokenVersion += 1;
});

// Query updates and bulk inserts do not execute document save hashing.
function touchesPassword(value) {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, entry]) =>
    key === 'password' || key.startsWith('password.') ||
    (key === '$rename' && Object.values(entry || {}).some(v => v === 'password' || String(v).startsWith('password.'))) ||
    touchesPassword(entry));
}
userSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany', 'replaceOne', 'findOneAndReplace'], async function () {
  const update = this.getUpdate();
  if (Array.isArray(update) || ['replaceOne', 'findOneAndReplace'].includes(this.op) || touchesPassword(update)) {
    throw new Error('User password/replacement writes must use document.save()');
  }
  if (this.getOptions().upsert) {
    throw financialWriteError('UNSAFE_USER_UPSERT', 'User creation must use a validated document save');
  }
  const set = financialSet(update);
  if (Object.keys(set).length) {
    if (this.getOptions().session?.inTransaction() !== true) {
      throw financialWriteError('FINANCIAL_TRANSACTION_REQUIRED', 'Balance writes require an active transaction');
    }
    if (!Object.hasOwn(set, 'balance') || !Object.hasOwn(set, 'balanceCents') || balanceMismatch(set.balance, set.balanceCents)) {
      throw financialWriteError('BALANCE_PAIR_REQUIRED', 'Balance writes must set a matching balance and balanceCents pair');
    }
    // Each balance write must correspond to one account's journal effect.
    if (this.op === 'updateMany' || !mongoose.isObjectIdOrHexString(this.getFilter()._id)) {
      throw financialWriteError('UNSAFE_FINANCIAL_UPDATE', 'Financial balance writes must target one account by its ID');
    }
    // Validate the stored source inside the same transaction, before a caller can overwrite it.
    // lean() avoids manufacturing zero from a default when legacy data is incomplete.
    const existing = await this.model.findOne(this.getFilter()).select('balance balanceCents')
      .session(this.getOptions().session).lean();
    if (existing) assertExistingFinancialState(existing);
  }
  this.setOptions({ runValidators: true });
});
userSchema.pre('insertMany', function (next) {
  next(new Error('User creation must use document.save() to hash passwords'));
});
userSchema.pre('bulkWrite', function (next) {
  next(new Error('User bulk writes are disabled; use validated document operations'));
});

// 🔍 مقارنة كلمة المرور
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (typeof candidatePassword !== 'string' || !candidatePassword ||
      Buffer.byteLength(candidatePassword, 'utf8') > 72 || typeof this.password !== 'string' || !this.password) {
    return false;
  }
  return bcrypt.compare(candidatePassword, this.password);
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
  if (typeof identifier !== 'string' || !identifier.trim() || identifier.length > 254) {
    throw new TypeError('A nonempty identifier of at most 254 characters is required');
  }
  const normalized = identifier.trim();
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const query = validator.isEmail(normalized)
    ? { email: normalized.toLowerCase() }
    : validator.isMobilePhone(normalized, 'any', { strictMode: true })
      ? { phone: normalized }
      : { username: new RegExp(`^${escaped}$`, 'i') };

  return this.findOne(query).select('+password +loginAttempts +accountStatus +lastLogin');
};

// 📊 فهرس مركب لتحسين البحث
userSchema.index({ username: 1, email: 1 });

module.exports = mongoose.model('User', userSchema);
