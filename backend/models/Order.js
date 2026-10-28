'use strict';
const mongoose = require('mongoose');
const { isDeepStrictEqual } = require('node:util');
const { createHash } = require('node:crypto');
const Journal = require('./FinancialOperation');
const { assertCents, parseMoney, formatMoney, multiplyDivideCents, MAX_CENTS } = require('../utils/money');
const { validateSnapshot, SCHEMAS } = require('../utils/fulfillmentTarget');
const { keyValid, positiveInteger, purchaseHash } = require('../utils/orderInput');
const { FILES } = require('../services/catalogService');
const { Schema } = mongoose;
const options = { _id: false, strict: 'throw' };
const hex = value => typeof value === 'string' && /^[a-f\d]{24}$/.test(value);
const hash = value => typeof value === 'string' && /^[a-f\d]{64}$/.test(value);
const cents = (required = false) => ({ type: Number, required, min: 0, max: MAX_CENTS });
const targetSchema = new Schema(Object.fromEntries(SCHEMAS.map(name => [name, { type: String }])), options);
const fulfillmentSchema = new Schema({ schema: { type: String, required: true, enum: SCHEMAS },
  validationVersion: { type: Number, required: true, enum: [1] }, network: { type: String, default: undefined },
  target: { type: targetSchema, required: true } }, options);
const catalogSchema = new Schema({ category: { type: String, required: true, enum: ['apps', 'games', 'cryptos', 'balances'] },
  productId: { type: Number, required: true }, productName: { type: String, required: true, maxlength: 200 },
  sourceFile: { type: String, required: true, enum: Object.keys(FILES) }, catalogRevision: { type: String, required: true, validate: hash },
  pricingVersion: { type: Number, required: true, enum: [1] }, mode: { type: String, required: true, enum: ['package', 'proportional'] },
  priceCents: cents(true), baseQuantity: { type: Number, required: true }, minQuantity: { type: Number, required: true }, maxQuantity: { type: Number, required: true },
  minChargeCents: cents(true), maxChargeCents: cents(true), requiresFulfillmentTarget: { type: Boolean, required: true },
  fulfillmentSchema: { type: String, enum: [...SCHEMAS, null] }, fulfillmentValidationVersion: { type: Number, required: true, enum: [1] },
  fulfillmentNetwork: { type: String } }, options);
const selectionSchema = new Schema({ packageIndex: Number, quantity: Number }, options);
const resultSchema = new Schema({ orderId: { type: String, required: true, validate: keyValid }, userId: { type: String, required: true, validate: hex },
  status: { type: String, required: true, enum: ['pending', 'completed', 'cancelled'] },
  chargeCurrency: { type: String, enum: ['USD'] }, chargeCents: cents(), charge: String, quantity: Number,
  balanceCents: cents(), balance: String, operationId: { type: String, validate: hex } }, options);
const requestSchema = new Schema({ actorId: { type: Schema.Types.ObjectId, required: true },
  idempotencyKey: { type: String, required: true, validate: keyValid }, payloadHash: { type: String, required: true, validate: hash },
  result: { type: resultSchema, required: true } }, options);
const decisionSchema = new Schema({ actorId: { type: Schema.Types.ObjectId, required: true },
  type: { type: String, required: true, enum: ['complete', 'cancel'] }, idempotencyKey: { type: String, required: true, validate: keyValid },
  payloadHash: { type: String, required: true, validate: hash }, reason: { type: String, required: true, minlength: 1, maxlength: 500 },
  decidedAt: { type: Date, required: true }, result: { type: resultSchema, required: true } }, options);
const refundSchema = new Schema({ operationId: { type: Schema.Types.ObjectId, required: true }, amountCents: cents(true),
  refundedAt: { type: Date, required: true } }, options);
const orderSchema = new Schema({ orderId: { type: String, required: true, validate: keyValid }, userId: { type: String, required: true, validate: hex },
  financialVersion: { type: Number, required: true, enum: [1] }, // NO hydration defaults for legacy financial evidence.
  catalogSnapshot: { type: catalogSchema, required: true }, selection: { type: selectionSchema, required: true }, quantity: { type: Number, required: true },
  chargeCents: cents(true), chargeCurrency: { type: String, required: true, enum: ['USD'] }, amount: { type: Number, required: true },
  method: { type: String, required: true }, service: { type: String, required: true },
  debitOperationId: { type: Schema.Types.ObjectId, required: true }, request: { type: requestSchema, required: true, select: false },
  fulfillmentSnapshot: { type: fulfillmentSchema, default: undefined, select: false },
  decision: { type: decisionSchema, select: false }, refund: { type: refundSchema, select: false },
  status: { type: String, required: true, enum: ['pending', 'completed', 'cancelled'] },
  createdAt: { type: Date, required: true, immutable: true, default: Date.now }
}, { strict: 'throw', versionKey: false, autoCreate: false, autoIndex: false, bufferCommands: false });
for (const schema of [orderSchema, catalogSchema, selectionSchema, fulfillmentSchema, targetSchema, requestSchema, resultSchema, decisionSchema, refundSchema]) {
  schema.eachPath((name, path) => {
    if (path.instance === 'String') path.castFunction(value => {
      if (value !== undefined && value !== null && typeof value !== 'string') throw new TypeError('A string is required');
      return value;
    });
    if (path.instance === 'Number') path.castFunction(value => {
      if (value === undefined) return value;
      if (name === 'amount') { if (typeof value !== 'number') throw new TypeError('A numeric mirror is required'); parseMoney(value); return value; }
      return assertCents(value);
    });
    if (path.instance === 'Boolean') path.castFunction(value => { if (typeof value !== 'boolean') throw new TypeError('A boolean is required'); return value; });
  });
}
function fail() { return Object.assign(new Error('Orders require immutable financial evidence and a transactional pending decision'), { code: 'UNSAFE_ORDER_UPDATE' }); }
function validateResult(order, result, status, monetary) {
  if (!result || result.orderId !== order.orderId || result.userId !== order.userId || result.status !== status) throw fail();
  if (monetary) {
    if (result.chargeCents !== order.chargeCents || result.chargeCurrency !== 'USD' || result.charge !== formatMoney(order.chargeCents) ||
        result.quantity !== order.quantity || result.balance !== formatMoney(result.balanceCents) || !hex(result.operationId)) throw fail();
  } else if (['chargeCents', 'chargeCurrency', 'charge', 'quantity', 'balanceCents', 'balance', 'operationId'].some(name => result[name] !== undefined)) throw fail();
}
orderSchema.pre('validate', function () {
  try {
    const snapshot = this.catalogSnapshot?.toObject();
    const selection = this.selection?.toObject();
    if (!snapshot || !selection || !positiveInteger(this.quantity) || !positiveInteger(this.chargeCents) ||
        !positiveInteger(snapshot.productId) || !positiveInteger(snapshot.baseQuantity) || !positiveInteger(snapshot.priceCents) ||
        !positiveInteger(snapshot.minQuantity) || !positiveInteger(snapshot.maxQuantity) ||
        snapshot.minQuantity > snapshot.maxQuantity || this.quantity < snapshot.minQuantity || this.quantity > snapshot.maxQuantity ||
        this.chargeCents < snapshot.minChargeCents || this.chargeCents > snapshot.maxChargeCents ||
        FILES[snapshot.sourceFile]?.category !== snapshot.category ||
        (snapshot.requiresFulfillmentTarget && FILES[snapshot.sourceFile]?.schema !== snapshot.fulfillmentSchema) ||
        this.method !== snapshot.category || this.service !== snapshot.productName || parseMoney(this.amount) !== this.chargeCents) throw fail();
    if (snapshot.category === 'apps' && (snapshot.minQuantity !== 1 || snapshot.maxQuantity !== 1000000 || snapshot.minChargeCents !== 50 || snapshot.maxChargeCents !== 100000)) throw fail();
    if (snapshot.category === 'games' && (snapshot.mode !== 'package' || snapshot.maxChargeCents !== 50000)) throw fail();
    if (snapshot.mode === 'package') {
      if (Object.keys(selection).length !== 1 || selection.packageIndex === undefined || this.quantity !== snapshot.baseQuantity || this.chargeCents !== snapshot.priceCents) throw fail();
    } else if (Object.keys(selection).length !== 1 || selection.quantity !== this.quantity || multiplyDivideCents(snapshot.priceCents, this.quantity, snapshot.baseQuantity) !== this.chargeCents) throw fail();
    const fulfillment = this.fulfillmentSnapshot === null ? null : this.fulfillmentSnapshot?.toObject();
    validateSnapshot(fulfillment, snapshot);
    const input = { category: snapshot.category, productId: snapshot.productId, ...selection };
    if (String(this.request?.actorId) !== this.userId || this.request?.payloadHash !== purchaseHash(this.userId, input, fulfillment)) throw fail();
    validateResult(this, this.request.result, 'pending', true);
    if (this.request.result.operationId !== String(this.debitOperationId)) throw fail();
    if (this.status === 'pending') { if (this.decision !== undefined || this.refund !== undefined) throw fail(); }
    else {
      if (this.decision?.type !== (this.status === 'completed' ? 'complete' : 'cancel')) throw fail();
      const audit = this.decision;
      if (audit.reason !== audit.reason.trim() || /[\x00-\x1f\x7f<>&'"`]/.test(audit.reason) ||
          audit.payloadHash !== createHash('sha256').update(JSON.stringify([1, 'order_decision', 'USD', String(audit.actorId), this.orderId, audit.type, audit.reason])).digest('hex')) throw fail();
      validateResult(this, this.decision.result, this.status, this.status === 'cancelled');
      if (this.status === 'completed') { if (this.refund !== undefined) throw fail(); }
      else if (this.refund?.amountCents !== this.chargeCents || String(this.refund.operationId) !== this.decision.result.operationId) throw fail();
    }
  } catch (_) { this.invalidate('financialVersion', 'The order financial and fulfillment evidence is inconsistent'); }
});
orderSchema.index({ orderId: 1 }, { name: 'orderId_1', unique: true, collation: { locale: 'simple' } });
orderSchema.index({ 'request.actorId': 1, 'request.idempotencyKey': 1 }, { name: 'order_actor_purchase_idempotency', unique: true, collation: { locale: 'simple' },
  partialFilterExpression: { financialVersion: 1, 'request.actorId': { $type: 'objectId' }, 'request.idempotencyKey': { $type: 'string' } } });
orderSchema.index({ 'decision.actorId': 1, 'decision.type': 1, 'decision.idempotencyKey': 1 }, { name: 'order_actor_decision_idempotency', unique: true,
  collation: { locale: 'simple' }, partialFilterExpression: { financialVersion: 1, 'decision.actorId': { $type: 'objectId' }, 'decision.type': { $type: 'string' }, 'decision.idempotencyKey': { $type: 'string' } } });
orderSchema.index({ userId: 1, createdAt: -1, _id: -1 }, { name: 'order_owner_history', collation: { locale: 'simple' } });
orderSchema.index({ financialVersion: 1, status: 1, createdAt: -1, _id: -1 }, { name: 'order_pending_queue' });
async function journalEvidence(order, session, effect = 'debit') {
  const id = effect === 'debit' ? order.debitOperationId : order.refund?.operationId;
  const journal = await Journal.findById(id).session(session).lean();
  if (!journal || journal.sourceType !== 'order' || journal.sourceId !== String(order._id) || journal.effect !== effect ||
      journal.operationType !== (effect === 'debit' ? 'order_debit' : 'order_refund') || journal.currency !== 'USD' || String(journal.userId) !== order.userId ||
      journal.deltaCents !== (effect === 'debit' ? -order.chargeCents : order.chargeCents) ||
      journal.result?.resourceId !== order.orderId) throw fail();
  const request = effect === 'debit' ? order.request : order.decision;
  if (String(journal.actorId) !== String(request.actorId) || journal.idempotencyKey !== request.idempotencyKey || journal.payloadHash !== request.payloadHash ||
      journal.result.balanceCents !== request.result.balanceCents || journal.result.balance !== request.result.balance ||
      effect === 'refund' && journal.reason !== request.reason) throw fail();
  await Journal.hydrate(journal).validate();
  return journal;
}
orderSchema.statics.journalEvidence = journalEvidence;
orderSchema.pre('save', async function () {
  if (!this.isNew || this.status !== 'pending' || !this.$session()?.inTransaction()) throw fail();
  await this.validate({ validateModifiedOnly: false });
  await journalEvidence(this, this.$session());
});
orderSchema.pre(['updateOne', 'findOneAndUpdate'], async function () {
  const filter = this.getFilter(), update = this.getUpdate(), session = this.getOptions().session;
  if (!session?.inTransaction() || this.getOptions().upsert || Array.isArray(update) || !mongoose.isObjectIdOrHexString(filter._id) ||
      filter.status !== 'pending' || filter.financialVersion !== 1 || !update || !isDeepStrictEqual(Object.keys(update), ['$set'])) throw fail();
  const set = update.$set;
  const allowed = set?.status === 'completed' ? ['status', 'decision'] : ['status', 'decision', 'refund'];
  if (!set || !['completed', 'cancelled'].includes(set.status) || !isDeepStrictEqual(Object.keys(set).sort(), allowed.sort())) throw fail();
  const original = await this.model.findOne(filter).select('+request +fulfillmentSnapshot +decision +refund').session(session).lean();
  if (original) {
    if (original.decision !== undefined || original.refund !== undefined) throw fail();
    const merged = this.model.hydrate({ ...original, ...set });
    await merged.validate({ validateModifiedOnly: false });
    await journalEvidence(merged, session);
    if (set.status === 'cancelled') await journalEvidence(merged, session, 'refund');
  }
  this.setOptions({ runValidators: true });
});
orderSchema.pre(['updateMany', 'replaceOne', 'findOneAndReplace', 'deleteMany', 'findOneAndDelete'], function () { throw fail(); });
orderSchema.pre('deleteOne', { document: true, query: true }, function () { throw fail(); });
orderSchema.pre(['insertMany', 'bulkWrite'], function (next) { next(fail()); });
// Raw MongoDB APIs remain a separate database-access boundary.
module.exports = mongoose.model('Order', orderSchema);
