'use strict';

const mongoose = require('mongoose');
const { assertCents, formatMoney, MAX_CENTS } = require('../utils/money');
const { Schema } = mongoose;

const effects = Object.freeze({
  balance_adjustment: { source: 'adjustment', effect: 'adjustment' },
  balance_migration: { source: 'user', effect: 'migration' },
  order_debit: { source: 'order', effect: 'debit' },
  order_refund: { source: 'order', effect: 'refund' },
  payment_credit: { source: 'payment', effect: 'credit' }
});

function safeInteger(value, signed = false) {
  return Number.isSafeInteger(value) && !Object.is(value, -0) && (signed || value >= 0);
}
function centField() {
  return { type: Number, required: true, min: 0, max: MAX_CENTS, validate: value => safeInteger(value) };
}
function strictString(value) {
  if (value === undefined) return value;
  if (typeof value !== 'string') throw new TypeError('A string is required');
  return value;
}
function sourceRequired() {
  // Source-backed effects cannot opt out of deduplication. Adjustments may omit the group.
  return this.operationType !== 'balance_adjustment' ||
    ['sourceType', 'sourceId', 'effect'].some(path => this[path] !== undefined);
}

const resultSchema = new Schema({
  balanceCents: centField(),
  balance: {
    type: String, required: true,
    validate: function (value) {
      try { return value === formatMoney(this.balanceCents); } catch (_) { return false; }
    }
  },
  resourceId: { type: String, minlength: 1, maxlength: 128, validate: value => !/\s/.test(value) }
}, { _id: false, strict: 'throw' });
resultSchema.path('balanceCents').castFunction(value => value === undefined ? value : assertCents(value));
for (const path of ['balance', 'resourceId']) resultSchema.path(path).castFunction(strictString);

const operationSchema = new Schema({
  actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  operationType: { type: String, required: true, enum: Object.keys(effects) },
  currency: { type: String, required: true, enum: ['USD'], default: 'USD' },
  idempotencyKey: {
    type: String, required: true, minlength: 1, maxlength: 128,
    validate: value => /^[a-z\d][a-z\d._:-]*$/i.test(value) && !/\s/.test(value)
  },
  payloadHash: { type: String, required: true, validate: value => /^[a-f\d]{64}$/.test(value) && value.length === 64 },
  beforeCents: centField(),
  afterCents: centField(),
  deltaCents: {
    type: Number, required: true,
    validate: function (value) {
      if (!safeInteger(value, true) || !safeInteger(this.beforeCents) || !safeInteger(this.afterCents)) return false;
      if (BigInt(value) !== BigInt(this.afterCents) - BigInt(this.beforeCents)) return false;
      if (this.operationType === 'order_debit') return value < 0;
      if (['order_refund', 'payment_credit'].includes(this.operationType)) return value > 0;
      if (this.operationType === 'balance_migration') return value === 0;
      return true;
    }
  },
  sourceType: {
    type: String, required: sourceRequired, enum: ['order', 'payment', 'adjustment', 'user'],
    validate: function (value) { return value === effects[this.operationType]?.source; }
  },
  sourceId: {
    type: String, required: sourceRequired, minlength: 1, maxlength: 128,
    validate: function (value) {
      return !/\s/.test(value) &&
        (this.operationType !== 'balance_migration' || value === String(this.userId));
    }
  },
  effect: {
    type: String, required: sourceRequired, enum: ['debit', 'refund', 'credit', 'adjustment', 'migration'],
    validate: function (value) { return value === effects[this.operationType]?.effect; }
  },
  reason: {
    type: String, trim: true, minlength: 1, maxlength: 500,
    required: function () { return this.operationType === 'balance_adjustment'; }
  },
  result: {
    type: resultSchema, required: true,
    validate: function (value) { return value.balanceCents === this.afterCents; }
  },
  createdAt: { type: Date, required: true, default: Date.now, immutable: true }
}, {
  strict: 'throw', versionKey: false, autoCreate: false, autoIndex: false, bufferCommands: false
});

// Disable coercion: strings, booleans, null, fractional values and unsafe integers are not cents.
for (const path of ['beforeCents', 'afterCents', 'deltaCents']) {
  operationSchema.path(path).castFunction(value => {
    if (value === undefined) return value;
    if (!safeInteger(value, path === 'deltaCents')) throw new TypeError('Safe integer cents are required');
    return value;
  });
}
for (const path of ['operationType', 'currency', 'idempotencyKey', 'payloadHash', 'sourceType', 'sourceId', 'effect', 'reason']) {
  operationSchema.path(path).castFunction(strictString);
}

// Binary key comparison remains explicit even if a database has a different default collation.
operationSchema.index({ actorId: 1, operationType: 1, idempotencyKey: 1 }, {
  name: 'financial_actor_operation_idempotency', unique: true, collation: { locale: 'simple' }
});
operationSchema.index({ sourceType: 1, sourceId: 1, effect: 1 }, {
  name: 'financial_source_effect_once', unique: true, collation: { locale: 'simple' },
  partialFilterExpression: {
    sourceType: { $type: 'string' }, sourceId: { $type: 'string' }, effect: { $type: 'string' }
  }
});
operationSchema.index({ userId: 1, createdAt: -1, _id: -1 }, { name: 'financial_user_history' });

function appendOnlyError() {
  const error = new Error('Financial operations are append-only; updates, deletions and bulk writes are disabled');
  error.code = 'FINANCIAL_JOURNAL_APPEND_ONLY';
  return error;
}
operationSchema.pre('save', async function () {
  if (!this.isNew) throw appendOnlyError();
  if (this.$session()?.inTransaction() !== true) {
    const error = new Error('Financial journal inserts require an active transaction');
    error.code = 'FINANCIAL_TRANSACTION_REQUIRED';
    throw error;
  }
  // A caller cannot bypass journal validation with validateBeforeSave/validateModifiedOnly options.
  await this.validate({ validateModifiedOnly: false });
});
operationSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteMany', 'findOneAndDelete'], function () {
  throw appendOnlyError();
});
operationSchema.pre('deleteOne', { document: true, query: true }, function () { throw appendOnlyError(); });
operationSchema.pre(['insertMany', 'bulkWrite'], function (next) { next(appendOnlyError()); });

// Guards apply to Mongoose APIs. Raw collection access must be restricted at the database boundary.
module.exports = mongoose.model('FinancialOperation', operationSchema);
