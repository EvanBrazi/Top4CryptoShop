'use strict';

const mongoose = require('mongoose');
const { isDeepStrictEqual } = require('node:util');
const { assertCents, parseMoney, formatMoney, MAX_CENTS } = require('../utils/money');
const methods = require('../config/paymentMethods');
const { Schema } = mongoose;
const keyValid = value => typeof value === 'string' && value.length >= 1 && value.length <= 128 && /^[a-z\d][a-z\d._:-]*$/i.test(value) && !/\s/.test(value);
const hexId = value => typeof value === 'string' && value.length === 24 && /^[a-f\d]{24}$/.test(value);
const moneyPair = (mirror, cents) => {
  try { return typeof mirror === 'number' && parseMoney(mirror) === assertCents(cents); } catch (_) { return false; }
};
function strictString(value) {
  if (value !== undefined && typeof value !== 'string') throw new TypeError('A string is required');
  return value;
}
function numericMoney(value) {
  if (value === undefined) return value;
  if (typeof value !== 'number') throw new TypeError('A numeric money mirror is required');
  parseMoney(value);
  return value;
}
function centsField() { return { type: Number, min: 0, max: MAX_CENTS }; }
const resultSchema = new Schema({
  paymentId: { type: String, required: true, validate: keyValid },
  userId: { type: String, required: true, validate: hexId },
  status: { type: String, required: true, enum: ['completed', 'cancelled'] },
  currency: { type: String, enum: ['USD'] },
  amountCents: centsField(), balanceCents: centsField(),
  balance: { type: String }, operationId: { type: String, validate: hexId }
}, { _id: false, strict: 'throw' });
const decisionSchema = new Schema({
  actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, required: true, enum: ['approve', 'reject'] },
  idempotencyKey: { type: String, required: true, validate: keyValid },
  payloadHash: { type: String, required: true, validate: value => typeof value === 'string' && /^[a-f\d]{64}$/.test(value) && value.length === 64 },
  reason: { type: String, required: true, trim: true, minlength: 1, maxlength: 500 },
  decidedAt: { type: Date, required: true },
  operationId: { type: Schema.Types.ObjectId, ref: 'FinancialOperation' },
  result: { type: resultSchema, required: true }
}, { _id: false, strict: 'throw' });
const receiptSchema = new Schema({
  publicId: { type: String, required: true, validate: value => /^private_payment_receipts\/[a-f\d-]{36}$/.test(value) && !/\s/.test(value) },
  format: { type: String, required: true, enum: ['jpg'] },
  deliveryType: { type: String, required: true, enum: ['authenticated'] }
}, { _id: false, strict: 'throw' });

const paymentSchema = new Schema({
  paymentId: { type: String, required: true, validate: keyValid },
  userId: { type: String, required: true, validate: hexId },
  // No legacy hydration default: only explicitly identified modern submissions are decidable.
  submissionVersion: { type: Number, required: true, enum: [1] },
  amount: { type: Number, required: true, validate: value => typeof value === 'number' && value > 0 },
  currency: { type: String, required: true, enum: ['USD', 'SYP', 'USDT'] },
  // Explicit zero means UNVERIFIED, not quoted/creditable money. Approval replaces it.
  amountInUSD: { type: Number, required: true },
  amountCents: centsField(), // Authoritative USD settlement exists only after approval; no default.
  method: { type: String, required: true, enum: Object.keys(methods) },
  note: { type: String, trim: true, maxlength: 500 },
  status: { type: String, required: true, enum: ['pending', 'completed', 'cancelled'] },
  receipt: { type: receiptSchema, required: true, select: false },
  receiptImage: { type: String, select: false }, // Legacy public URL; never exposed by the new API.
  decision: { type: decisionSchema, select: false },
  createdAt: { type: Date, required: true, default: Date.now, immutable: true }
}, { strict: 'throw', versionKey: false, autoCreate: false, autoIndex: false, bufferCommands: false });

for (const schema of [paymentSchema, decisionSchema, resultSchema, receiptSchema]) {
  schema.eachPath((name, path) => {
    if (path.instance === 'String') path.castFunction(strictString);
    if (['amountCents', 'balanceCents'].includes(name)) path.castFunction(value => value === undefined ? value : assertCents(value));
  });
}
for (const name of ['amount', 'amountInUSD']) paymentSchema.path(name).castFunction(numericMoney);

paymentSchema.pre('validate', function () {
  const method = Object.hasOwn(methods, this.method) ? methods[this.method] : undefined;
  if (!method || this.currency !== method.currency || this.amount < method.min || this.amount > method.max) {
    this.invalidate('method', 'Method, currency and amount limits must match server rules');
  }
  const decision = this.decision;
  if (this.status === 'pending') {
    if (decision !== undefined || this.amountCents !== undefined || this.amountInUSD !== 0) this.invalidate('decision', 'Pending payments have no verified settlement or decision');
    return;
  }
  if (!decision || decision.type !== (this.status === 'completed' ? 'approve' : 'reject')) {
    this.invalidate('decision', 'A matching terminal decision is required');
    return;
  }
  const result = decision.result;
  if (!result || result.paymentId !== this.paymentId || result.userId !== this.userId || result.status !== this.status) {
    this.invalidate('decision.result', 'The durable result must match its payment');
    return;
  }
  if (this.status === 'completed') {
    let formatted;
    try { formatted = formatMoney(result.balanceCents); } catch (_) { /* invalid cents */ }
    if (!(this.amountCents > 0) || !moneyPair(this.amountInUSD, this.amountCents) ||
        !decision.operationId || result.operationId !== String(decision.operationId) ||
        result.amountCents !== this.amountCents || result.currency !== 'USD' || result.balance !== formatted || formatted === undefined) {
      this.invalidate('decision.result', 'An approval requires an exact positive settlement and journal result');
    }
  } else if (this.amountCents !== undefined || this.amountInUSD !== 0 || decision.operationId !== undefined ||
      ['amountCents', 'balanceCents', 'balance', 'operationId', 'currency'].some(path => result[path] !== undefined)) {
    this.invalidate('decision.result', 'A rejection cannot claim a monetary effect');
  }
});

// Preserve the legacy physical name so an existing valid unique index can be reused non-destructively.
paymentSchema.index({ paymentId: 1 }, { name: 'paymentId_1', unique: true, collation: { locale: 'simple' } });
paymentSchema.index({ 'decision.actorId': 1, 'decision.type': 1, 'decision.idempotencyKey': 1 }, {
  name: 'payment_actor_decision_idempotency', unique: true, collation: { locale: 'simple' },
  partialFilterExpression: { 'decision.actorId': { $type: 'objectId' }, 'decision.type': { $type: 'string' }, 'decision.idempotencyKey': { $type: 'string' } }
});
paymentSchema.index({ userId: 1, createdAt: -1, _id: -1 }, { name: 'payment_owner_history', collation: { locale: 'simple' } });
paymentSchema.index({ status: 1, createdAt: -1, _id: -1 }, { name: 'payment_pending_queue' });

function blocked() {
  return Object.assign(new Error('Payments are immutable except for one transaction-bound pending decision'), { code: 'UNSAFE_PAYMENT_UPDATE' });
}
paymentSchema.pre('save', async function () {
  if (!this.isNew || this.status !== 'pending') throw blocked();
  await this.validate({ validateModifiedOnly: false }); // Save-validation bypasses cannot create a terminal payment.
});
paymentSchema.pre(['updateOne', 'findOneAndUpdate'], async function () {
  const update = this.getUpdate();
  const filter = this.getFilter();
  if (!this.getOptions().session?.inTransaction() || this.getOptions().upsert || Array.isArray(update) ||
      !mongoose.isObjectIdOrHexString(filter._id) || filter.status !== 'pending' ||
      !update || !isDeepStrictEqual(Object.keys(update), ['$set'])) throw blocked();
  const set = update.$set;
  const allowed = set?.status === 'completed' ? ['status', 'decision', 'amountInUSD', 'amountCents'] : ['status', 'decision'];
  if (!set || !['completed', 'cancelled'].includes(set.status) ||
      !isDeepStrictEqual(Object.keys(set).sort(), allowed.sort())) throw blocked();
  const original = await this.model.findOne(filter).select('+receipt +decision').session(this.getOptions().session).lean();
  if (original) {
    if (original.status !== 'pending' || original.decision !== undefined || original.amountCents !== undefined ||
        original.amountInUSD !== 0 || original.submissionVersion !== 1) throw blocked();
    await this.model.hydrate({ ...original, ...set }).validate({ validateModifiedOnly: false });
  }
  this.setOptions({ runValidators: true });
});
paymentSchema.pre(['updateMany', 'replaceOne', 'findOneAndReplace', 'deleteMany', 'findOneAndDelete'], function () { throw blocked(); });
paymentSchema.pre('deleteOne', { document: true, query: true }, function () { throw blocked(); });
paymentSchema.pre(['insertMany', 'bulkWrite'], function (next) { next(blocked()); });

// Raw collection access must be restricted at the database boundary.
module.exports = mongoose.model('Payment', paymentSchema);
