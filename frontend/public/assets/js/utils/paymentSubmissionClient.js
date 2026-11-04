import { fetchCurrentAccount, submitPayment, fetchSubmissionStatus } from './accountData.js';

// Mirror backend/config/paymentMethods.js; checked by payment-submission-ui.test.js.
export const PAYMENT_METHODS = Object.freeze(Object.fromEntries(Object.entries({
  visa: { currency: 'USD', min: 10, max: 100 },
  shamcashdol: { currency: 'USD', min: 10, max: 200000 },
  shamcash: { currency: 'SYP', min: 10000, max: 200000000 },
  syriatel: { currency: 'SYP', min: 5000, max: 550000 },
  mtn: { currency: 'SYP', min: 5000, max: 550000 },
  bank: { currency: 'USD', min: 50, max: 1000 },
  webmoney: { currency: 'USD', min: 20, max: 200000 },
  usdt: { currency: 'USDT', min: 10, max: 200000000 }
}).map(([name, method]) => [name, Object.freeze({ ...method, receiptRequired: true })])));
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const validId = id => typeof id === 'string' && id.length === 36 && UUID.test(id);
const PREFIX = 'payment-submission-v1:';
const fail = code => Object.assign(new Error(code), { code });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function minor(value) {
  if (typeof value !== 'string' || value.length > 32) throw fail('INVALID_PAYMENT_AMOUNT');
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match || match[0] !== value) throw fail('INVALID_PAYMENT_AMOUNT');
  return BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0'));
}
export function validatePayment({ method, amount, note = '', file }) {
  if (!Object.hasOwn(PAYMENT_METHODS, method)) return 'INVALID_PAYMENT_METHOD';
  try {
    const value = minor(amount), config = PAYMENT_METHODS[method];
    if (value < minor(String(config.min)) || value > minor(String(config.max))) throw Error();
  } catch { return 'INVALID_PAYMENT_AMOUNT'; }
  if (typeof note !== 'string' || note.length > 500 || /[<>]/.test(note)) return 'INVALID_PAYMENT_NOTE';
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    !Number.isSafeInteger(file.size) || file.size < 1) return 'INVALID_PAYMENT_UPLOAD';
  if (file.size > 5242880) return 'receipt_too_large';
  return null;
}
export function buildPaymentForm({ method, amount, note = '', file }) {
  const form = new FormData();
  form.append('method', method);
  form.append('amount', amount);
  if (note) form.append('note', note);
  form.append('receipt', file, file.name || 'receipt');
  return form;
}
export class PaymentSubmissionClient {
  constructor(ownerId, { storage, readOwner = fetchCurrentAccount, send = submitPayment,
    resolve = fetchSubmissionStatus, uuid = () => crypto.randomUUID(), active = () => true } = {}) {
    this.ownerId = ownerId;
    Object.assign(this, { storage, readOwner, send, resolve, uuid, active });
  }
  get store() { return this.storage === undefined ? localStorage : this.storage; }
  key(id) { return `${PREFIX}${this.ownerId}:${id}`; }
  pending() {
    const prefix = `${PREFIX}${this.ownerId}:`, records = [];
    for (let i = 0; i < this.store.length; i++) {
      const key = this.store.key(i);
      if (!key?.startsWith(prefix)) continue;
      let record;
      try { record = JSON.parse(this.store.getItem(key)); } catch { /* Retain corrupt owned records. */ }
      if (object(record) && record.version === 1 && record.userId === this.ownerId &&
        validId(record.submissionId) && key === this.key(record.submissionId)) records.push(record);
      else records.push({ submissionId: null });
    }
    return records;
  }
  async ensureOwner() {
    const owner = await this.readOwner();
    // A different authenticated owner requires a fresh account page, never a stale-page dispatch.
    if (!this.active() || !object(owner) || owner.id !== this.ownerId) throw fail('UNAUTHENTICATED');
  }
  clear(record) {
    try { this.store.removeItem(this.key(record.submissionId)); }
    catch { /* Ack stays committed; recovery remains available. */ }
  }
  async submit(fields) {
    const invalid = validatePayment(fields);
    if (invalid) return { state: 'rejected', code: invalid };
    await this.ensureOwner(); // Authoritative ID, never localStorage.userId; 401 prevents persistence/POST.
    if (this.pending().length) return { state: 'unknown', code: 'duplicate_submission' };
    const submissionId = this.uuid();
    if (!validId(submissionId)) return { state: 'rejected', code: 'INVALID_SUBMISSION_ID' };
    const form = buildPaymentForm(fields);
    const record = { version: 1, userId: this.ownerId, submissionId, createdAt: new Date().toISOString() };
    try {
      const saved = JSON.stringify(record);
      this.store.setItem(this.key(submissionId), saved);
      if (this.store.getItem(this.key(submissionId)) !== saved) throw Error();
    } catch { return { state: 'rejected', code: 'storage_failure_before_dispatch' }; }
    let result;
    try { result = await this.send(form, submissionId); }
    catch { result = { status: 0, code: 'NETWORK_ERROR' }; }
    if (result?.success && result.status === 201 && object(result.data) &&
      result.data.paymentId === `pay-${submissionId}` && result.data.status === 'pending') {
      this.clear(record);
      return { state: 'committed' };
    }
    if (result?.status === 401) return { state: 'auth', status: 401 };
    if (result?.status === 409) return { state: 'unknown', code: 'duplicate_submission' };
    // Only well-formed, definite rejections permit a corrected logical attempt with a NEW UUID.
    if (result?.success === false && result.code !== 'INVALID_RESPONSE' && [400, 403, 413, 429].includes(result.status)) {
      this.clear(record);
      return { state: 'rejected', code: result.status === 413 ? 'receipt_too_large' : result.code };
    }
    // ALL 503s, network loss, and malformed acknowledgements stay recoverable; never re-upload.
    return { state: 'unknown', code: 'unknown_outcome' };
  }
  async recover(record) {
    if (!object(record) || !validId(record.submissionId) || record.userId !== this.ownerId) throw fail('INVALID_RESPONSE');
    await this.ensureOwner();
    const result = await this.resolve(record.submissionId);
    if (result?.status === 401) return { state: 'auth', status: 401 };
    if (!result?.success || result.status !== 200) throw fail(result?.code || 'INVALID_RESPONSE');
    const data = result.data, paymentId = `pay-${record.submissionId}`;
    if (object(data) && data.outcome === 'committed' && object(data.payment) &&
      data.payment.paymentId === paymentId && data.payment.userId === this.ownerId &&
      ['pending', 'completed', 'cancelled'].includes(data.payment.status)) {
      this.clear(record);
      return { state: 'committed', payment: data.payment };
    }
    if (object(data) && data.outcome === 'unresolved' && data.paymentId === paymentId && data.retrySubmission === false) {
      return { state: 'unresolved' };
    }
    throw fail('INVALID_RESPONSE');
  }
}
