import { ensureCsrfToken } from '../securefetch.js';

const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value);
const validReason = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 500 && !/[\x00-\x1f\x7f<>&'"`]/.test(value);
const failure = (code, status = 0, state = 'rejected', extra = {}) => Object.assign(new Error(code), { code, status, state, retryWithSameKey: false, dispatched: false, ...extra });
const moneyMatches = (cents, decimal) => typeof cents === 'string' && /^(0|[1-9]\d*)$/.test(cents) && BigInt(cents) <= BigInt(Number.MAX_SAFE_INTEGER) &&
  decimal === `${BigInt(cents) / 100n}.${String(BigInt(cents) % 100n).padStart(2, '0')}`;

export class OrderDecisionClient {
  #confirmed = new Map();
  #inFlight = new Set();
  constructor({ storage = localStorage, fetcher = (u, o) => window.fetch(u, o), uuid = () => crypto.randomUUID(), isActive = () => true } = {}) {
    Object.assign(this, { storage, fetcher, uuid, isActive });
  }
  #key(adminId, orderId) {
    if (!validId(adminId) || !validId(orderId)) throw failure('INVALID_FINANCIAL_INPUT');
    return `order-decision-v1:${adminId}:${orderId}`;
  }
  #saved(key, orderId) {
    const raw = this.storage.getItem(key);
    if (raw === null) return null;
    try {
      const record = JSON.parse(raw), payload = record?.payload;
      if (record.orderId !== orderId || !['accept', 'reject'].includes(record.action) || !validReason(payload?.reason) ||
          typeof payload?.idempotencyKey !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(payload.idempotencyKey) ||
          Object.keys(payload).sort().join() !== 'idempotencyKey,reason' ||
          !Object.keys(record).every(key => ['orderId', 'action', 'payload', 'savedAt'].includes(key)) ||
          ('savedAt' in record && (!Number.isSafeInteger(record.savedAt) || record.savedAt < 0))) throw new Error();
      return { record, raw };
    } catch { return { record: { orderId, corrupt: true }, raw }; }
  }
  pendingDecisions(adminId) {
    this.#key(adminId, 'scan');
    const prefix = `order-decision-v1:${adminId}:`, records = [];
    for (let index = 0; index < this.storage.length; index++) {
      const key = this.storage.key(index);
      if (key?.startsWith(prefix)) {
        const orderId = key.slice(prefix.length), saved = this.#saved(key, orderId);
        if (saved) records.push(validId(orderId) ? saved.record : { orderId, corrupt: true });
      }
    }
    return records;
  }
  #headers() {
    const headers = { 'Content-Type': 'application/json' }, token = this.storage.getItem('userToken'), session = this.storage.getItem('customSessionId');
    if (token) headers.Authorization = `Bearer ${token}`;
    if (session) headers['x-session-id'] = session;
    try {
      const csrf = decodeURIComponent(document.cookie.match(/(?:^|;\s*)x-csrf-token=([^;]+)/)?.[1] || '');
      if (/^[a-f0-9]{64}$/.test(csrf)) headers['x-csrf-token'] = csrf;
    } catch { /* A malformed cookie requires bootstrap, never a financial retry. */ }
    return headers;
  }
  #active() { if (!this.isActive()) throw failure('UNAUTHENTICATED', 0, 'auth'); }
  async #verify(adminId, captured) {
    this.#active();
    const response = await this.fetcher('/api/auth/session-info', { headers: this.#headers(), credentials: 'include', cache: 'no-store' });
    if (!response.ok) throw failure(response.status === 401 ? 'UNAUTHENTICATED' : response.status === 403 ? 'FINANCIAL_FORBIDDEN' : 'RESOURCE_READ_UNAVAILABLE',
      response.status, [401, 403].includes(response.status) ? 'auth' : 'rejected');
    const session = await response.json(), current = this.#headers();
    if (session?.isAuthenticated !== true || session.userId !== adminId || current.Authorization !== captured.Authorization ||
        current['x-session-id'] !== captured['x-session-id']) throw failure('UNAUTHENTICATED', 0, 'auth');
    this.#active();
  }
  async #csrf(force = false) {
    if (!force) { if (!this.#headers()['x-csrf-token']) await ensureCsrfToken(); return; }
    const response = await this.fetcher('/api/auth/csrf', { method: 'GET', credentials: 'include', cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !/^[a-f0-9]{64}$/.test(data?.csrfToken || '') || data.csrfToken !== this.#headers()['x-csrf-token']) {
      throw failure('CSRF_INVALID', response.status);
    }
  }
  async decide({ orderId, action, reason, expectedOwner }) {
    return this.#run(expectedOwner, orderId, { action, reason });
  }
  async recoverDecision({ adminId, orderId }) { return this.#run(adminId, orderId); }
  async #run(adminId, orderId, requested) {
    const key = this.#key(adminId, orderId);
    if (this.#inFlight.has(key)) throw failure('DECISION_BUSY');
    this.#inFlight.add(key);
    try {
      const captured = this.#headers();
      await this.#csrf(); await this.#verify(adminId, captured);
      let saved = this.#saved(key, orderId);
      if (saved?.record.corrupt) throw failure('ORDER_RECONCILIATION_REQUIRED');
      if (saved && requested && (saved.record.action !== requested.action || saved.record.payload.reason !== requested.reason)) throw failure('IDEMPOTENCY_CONFLICT', 0, 'conflict');
      if (!saved) {
        if (!requested) throw failure('ORDER_RECONCILIATION_REQUIRED');
        if (!['accept', 'reject'].includes(requested.action) || !validReason(requested.reason) || requested.reason.trim().length < 10) throw failure('INVALID_FINANCIAL_REASON');
        const record = { orderId, action: requested.action, payload: { idempotencyKey: `decision-${this.uuid()}`, reason: requested.reason }, savedAt: Date.now() };
        const raw = JSON.stringify(record);
        try {
          this.storage.setItem(key, raw);
          if (this.storage.getItem(key) !== raw) throw new Error();
        } catch { throw failure('storage_failure_before_dispatch'); }
        saved = this.#saved(key, orderId);
        if (!saved || saved.record.corrupt) throw failure('ORDER_RECONCILIATION_REQUIRED');
      }
      return await this.#dispatch(adminId, key, saved, captured);
    } catch (error) { throw error?.code ? error : failure('NETWORK_ERROR'); }
    finally { this.#inFlight.delete(key); }
  }
  #validReceipt(receipt, record) {
    if (receipt?.success !== true || receipt.orderId !== record.orderId || typeof receipt.userId !== 'string' || !receipt.userId ||
        receipt.status !== (record.action === 'accept' ? 'completed' : 'cancelled') || typeof receipt.replayed !== 'boolean') return false;
    return record.action === 'accept' || (receipt.chargeCurrency === 'USD' && moneyMatches(receipt.chargeCents, receipt.charge) &&
      BigInt(receipt.chargeCents) > 0n && moneyMatches(receipt.balanceCents, receipt.balance) && Number.isSafeInteger(receipt.quantity) &&
      receipt.quantity > 0 && typeof receipt.operationId === 'string' && receipt.operationId.length > 0);
  }
  async #dispatch(adminId, key, saved, captured) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const current = this.#headers();
      if (current.Authorization !== captured.Authorization || current['x-session-id'] !== captured['x-session-id']) throw failure('UNAUTHENTICATED', 0, 'auth');
      if (this.storage.getItem(key) !== saved.raw) throw failure('IDEMPOTENCY_CONFLICT', 0, 'conflict');
      this.#active();
      let response, data;
      try {
        response = await this.fetcher(`/api/orders/${encodeURIComponent(saved.record.orderId)}/${saved.record.action}`, {
          method: 'PUT', headers: current, credentials: 'include', body: JSON.stringify(saved.record.payload)
        });
        data = await response.json();
      } catch { throw failure(response ? 'INVALID_RESPONSE' : 'NETWORK_ERROR', response?.status || 0, 'unknown', { dispatched: true, retryWithSameKey: true }); }
      if (response.status === 403 && data?.code === 'CSRF_INVALID' && attempt === 0) {
        try { await this.#csrf(true); await this.#verify(adminId, captured); } catch (error) { throw Object.assign(error, { dispatched: true }); }
        continue;
      }
      if (!response.ok) throw failure(data?.code || data?.error || 'INVALID_RESPONSE', response.status,
        response.status >= 500 ? 'unknown' : response.status === 401 ? 'auth' : 'rejected', { dispatched: true, retryWithSameKey: data?.retryWithSameKey === true });
      if (response.status !== 200 || !this.#validReceipt(data, saved.record)) throw failure('INVALID_RESPONSE', response.status, 'unknown', { dispatched: true, retryWithSameKey: true });
      this.#confirmed.set(key, saved.raw);
      if (this.isActive()) this.discardConfirmedDecision({ adminId, orderId: saved.record.orderId });
      return data; // Historical replay balances must never be applied to current account state.
    }
  }
  discardConfirmedDecision({ adminId, orderId }) {
    const key = this.#key(adminId, orderId), confirmed = this.#confirmed.get(key);
    if (!confirmed) return false;
    try {
      if (this.storage.getItem(key) !== confirmed) return false;
      this.storage.removeItem(key);
      if (this.storage.getItem(key) !== null) return false;
      this.#confirmed.delete(key); return true;
    } catch { return false; } // A cleanup failure cannot undo a committed acknowledgement.
  }
}
