'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { File } = require('node:buffer');
const { randomUUID } = require('node:crypto');
const { load } = require('cheerio');
const ROOT = path.join(__dirname, '../../frontend/public');
const JS = path.join(ROOT, 'assets/js');
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ID = '11111111-1111-4111-8111-111111111111';
const NEXT = '22222222-2222-4222-8222-222222222222';
const key = (id = ID, owner = OWNER) => `payment-submission-v1:${owner}:${id}`;
const intent = (id = ID, owner = OWNER) => ({ version: 1, userId: owner, submissionId: id, createdAt: '2026-11-03T08:00:00.000Z' });
const response = (status, body) => ({ status, ok: status >= 200 && status < 300, text: async () => JSON.stringify(body) });
const error = (status, code) => response(status, { success: false, code, error: code });
const proof = (size = 64, type = 'image/jpeg') => new File([new Uint8Array(size)], 'receipt.jpg', { type });
function browser(file, names, globals) {
  const source = fs.readFileSync(path.join(JS, file), 'utf8')
    .replace(/^import .*;.*$/gm, '').replace(/\bexport (const |class |async function |function )/g, '$1');
  return vm.runInNewContext(`${source}\n({ ${names.join(', ')} })`, globals, { filename: file });
}
function storage(initial = {}) {
  const values = new Map(Object.entries({ userId: 'wrong-cached-user', userToken: 'auth', customSessionId: 'auth',
    user_id: 'legacy', user_token: 'legacy', authToken: 'legacy', theme: 'night',
    'purchase-intent-v1:other:games:1': '  purchase bytes  ', 'order-decision-v1:other:ord-1': '  decision bytes  ', ...initial }));
  return {
    get length() { return values.size; }, key: i => [...values.keys()][i] ?? null,
    getItem: jest.fn(k => values.get(k) ?? null), setItem: jest.fn((k, v) => values.set(k, String(v))),
    removeItem: jest.fn(k => values.delete(k)), clear: jest.fn(() => values.clear()),
    snapshot: () => Object.fromEntries(values)
  };
}
// Parse real account.html and implement only DOM/events; no layout/browser automation.
function dom() {
  const $ = load(fs.readFileSync(path.join(ROOT, 'account.html'), 'utf8'));
  const cache = new Map(), documentEvents = new Map(), document = { cookie: '' };
  function element(node) {
    if (!node) return null;
    if (cache.has(node)) return cache.get(node);
    const q = $(node), events = new Map(); let files = [];
    const el = {
      node,
      get id() { return q.attr('id'); }, set id(v) { q.attr('id', v); },
      get className() { return q.attr('class') || ''; }, set className(v) { q.attr('class', v); },
      get type() { return q.attr('type'); }, set type(v) { q.attr('type', v); },
      get hidden() { return q.attr('hidden') !== undefined; }, set hidden(v) { if (v) q.attr('hidden', ''); else q.removeAttr('hidden'); },
      get disabled() { return q.attr('disabled') !== undefined; }, set disabled(v) { if (v) q.attr('disabled', ''); else q.removeAttr('disabled'); },
      get value() { return q.val() || ''; }, set value(v) { q.val(String(v)); if (el.type === 'file' && v === '') files = []; },
      get files() { return files; }, set files(v) { files = v; },
      get textContent() { return q.text(); }, set textContent(v) { q.text(String(v)); },
      get children() { return q.children().toArray().map(element); },
      getAttribute: name => q.attr(name) ?? null, setAttribute: (name, v) => q.attr(name, String(v)),
      querySelector: selector => element(q.find(selector)[0]),
      querySelectorAll: selector => q.find(selector).toArray().map(element),
      appendChild: child => { q.append(child.node); return child; },
      addEventListener(type, fn) { if (!events.has(type)) events.set(type, new Set()); events.get(type).add(fn); },
      removeEventListener(type, fn) { events.get(type)?.delete(fn); },
      async fire(type) { for (const fn of events.get(type) || []) await fn({ type, target: el, preventDefault() {} }); },
      async click() { if (!el.disabled) await el.fire('click'); }
    };
    el.dataset = new Proxy({}, { get: (_, name) => q.attr(`data-${name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`),
      set: (_, name, value) => { q.attr(`data-${name}`, String(value)); return true; } });
    cache.set(node, el); return el;
  }
  document.getElementById = id => element($('[id]').toArray().find(node => $(node).attr('id') === id));
  document.querySelector = selector => element($(selector)[0]);
  document.querySelectorAll = selector => $(selector).toArray().map(element);
  document.createElement = tag => element($(`<${tag}></${tag}>`)[0]);
  document.addEventListener = (type, fn) => { if (!documentEvents.has(type)) documentEvents.set(type, []); documentEvents.get(type).push(fn); };
  return document;
}
function payment(id = ID, owner = OWNER, status = 'pending') {
  return { _id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', userId: owner,
    paymentId: `pay-${id}`, status, createdAt: '2026-11-03T08:00:00.000Z', method: 'visa', decisionReason: null, decidedAt: null,
    claimedAmountMinor: '5000', amount: '50.00', currency: 'USD', amountCents: status === 'completed' ? '1234' : null,
    amountInUSD: status === 'completed' ? '12.34' : '0.00', note: '' };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
async function environment({ localStorage = storage(), owner = OWNER } = {}) {
  const document = dom(), server = new Map(), routes = new Map();
  const account = { id: owner, username: 'user_test', balanceCents: '10000' };
  const window = { location: { href: 'https://shop.test/account', origin: 'https://shop.test', replace: jest.fn() } };
  routes.set('GET /api/users/me', () => response(200, account));
  routes.set('GET /api/auth/csrf', () => { document.cookie = `x-csrf-token=${'a'.repeat(64)}`; return response(200, { success: true, csrfToken: 'a'.repeat(64) }); });
  routes.set('POST /api/auth/logout', () => response(200, { success: true }));
  routes.set('GET /api/payments', () => response(200, { items: [...server.values()].filter(p => p.userId === owner), nextBefore: null }));
  routes.set('POST /api/payments', (_, options) => {
    const id = options.headers.get('x-submission-id'); server.set(id, payment(id, owner));
    return response(201, { paymentId: `pay-${id}`, status: 'pending' });
  });
  const fetch = jest.fn(async (url, options = {}) => {
    const target = new URL(url, window.location.href), method = options.method || 'GET';
    const route = routes.get(`${method} ${target.pathname}`);
    if (route) return route(target, options);
    if (method === 'GET' && target.pathname.startsWith('/api/payments/submissions/')) {
      const id = target.pathname.split('/').pop(), found = server.get(id);
      return response(200, found?.userId === owner ? { outcome: 'committed', payment: found }
        : { outcome: 'unresolved', paymentId: `pay-${id}`, retrySubmission: false });
    }
    throw new Error(`Unexpected request: ${method} ${target.pathname}`);
  });
  const uuid = jest.fn().mockReturnValueOnce(ID).mockReturnValueOnce(NEXT).mockImplementation(randomUUID);
  const globals = { document, window, localStorage, fetch, URL, Headers, FormData, crypto: { randomUUID: uuid }, setTimeout };
  const messages = browser('utils/errorMessages.js', ['getErrorMessage', 'ERROR_MESSAGES', 'GENERIC_ERROR_MESSAGE'], globals);
  const transport = browser('securefetch.js', ['secureFetch'], { ...globals, ...messages });
  const data = browser('utils/accountData.js', ['fetchCurrentAccount', 'submitPayment', 'fetchSubmissionStatus', 'fetchPaymentsPage',
    'fetchOrdersPage', 'fetchCategory', 'normalizeOrder', 'normalizePayment'], { ...globals, ...transport });
  const submission = browser('utils/paymentSubmissionClient.js', ['PAYMENT_METHODS', 'validatePayment', 'buildPaymentForm', 'PaymentSubmissionClient'], { ...globals, ...data });
  const topup = browser('accountTopup.js', ['mountTopup'], { ...globals, ...messages, ...submission });
  const { STORAGE_KEYS } = browser('utils/appUtils.js', ['STORAGE_KEYS'], globals);
  const auth = browser('auth.js', ['logout'], { ...globals, ...transport, STORAGE_KEYS });
  browser('account.js', [], { ...globals, ...data, ...topup, ...auth, DialogPurchase: jest.fn() });
  await settle();
  const e = { ...globals, ...messages, ...transport, ...data, ...submission, ...auth, routes, server, account, uuid,
    node: name => document.getElementById(`account-${name}`), t: name => document.getElementById(`account-topup-${name}`),
    calls: (pathname, method) => fetch.mock.calls.filter(([url, opts]) => new URL(url, window.location.href).pathname === pathname && (!method || opts?.method === method)),
    async fill(extra = {}) {
      const values = { method: 'visa', amount: '50.00', note: '', file: proof(), ...extra };
      for (const field of ['method', 'amount', 'note']) e.t(field).value = values[field];
      e.t('receipt').files = values.file ? [values.file] : [];
      await e.t('form').fire('input'); return values;
    },
    submit: () => e.t('form').fire('submit'),
    check: () => e.t('check').click()
  };
  return e;
}

describe('C5e.1b.1 real Top-up form, transport, persistence and recovery', () => {
  test('1 method mirror matches every backend method including inclusive limits and universal receipt', async () => {
    const e = await environment(), backend = require('../config/paymentMethods');
    expect(Object.keys(e.PAYMENT_METHODS).sort()).toEqual(Object.keys(backend).sort());
    for (const [name, config] of Object.entries(backend)) {
      expect(e.PAYMENT_METHODS[name]).toEqual({ ...config, receiptRequired: true });
      expect(Object.isFrozen(e.PAYMENT_METHODS[name])).toBe(true);
    }
    expect(Object.isFrozen(e.PAYMENT_METHODS)).toBe(true);
  });
  test('2 eight methods, limits, required receipt guidance and keyboard-ready labels; no automatic requests', async () => {
    const e = await environment(); await e.node('tab-topup').click();
    expect(e.t('method').children).toHaveLength(9); // Eight methods plus the empty prompt.
    expect(e.t('submit').disabled).toBe(true);
    expect(e.node('panel-topup').textContent).toContain('إيصال الدفع (مطلوب)');
    expect(e.t('file-guide').textContent).toBe('JPEG, PNG, WebP — حتى 5 ميغابايت');
    await e.fill();
    expect(e.t('limits').textContent).toContain('USD'); expect(e.t('limits').textContent).toContain('الحد الأدنى: 10');
    expect(e.t('limits').textContent).toContain('الحد الأقصى: 100'); expect(e.t('submit').disabled).toBe(false);
    for (const field of ['method', 'amount', 'note', 'receipt']) {
      expect(e.document.querySelector(`label[for="account-topup-${field}"]`)).not.toBeNull();
    }
    expect(e.calls('/api/users/me')).toHaveLength(1); expect(e.fetch).toHaveBeenCalledTimes(1);
    await e.node('tab-settings').click(); expect(e.node('panel-settings').textContent).toContain('Coming soon');
  });
  test('3 canonical money, inclusive boundaries and exact source-currency limits, never parseFloat', async () => {
    const e = await environment(), values = await e.fill();
    for (const [method, config] of Object.entries(e.PAYMENT_METHODS)) {
      for (const amount of [String(config.min), `${config.min}.00`, `${config.max}.00`]) {
        expect(e.validatePayment({ ...values, method, amount })).toBeNull();
      }
      expect(e.validatePayment({ ...values, method, amount: `${config.max}.01` })).toBe('INVALID_PAYMENT_AMOUNT');
    }
    for (const amount of ['5', '150', '050', '50.001', '5e1', '+50', '-50', ' 50', '50 ', '50\n', '50.', '.50', '9'.repeat(1000)]) {
      await e.fill({ amount }); expect(e.t('submit').disabled).toBe(true);
      await e.submit(); expect(e.t('message').textContent).toBe(e.getErrorMessage('INVALID_PAYMENT_AMOUNT'));
    }
    expect(e.calls('/api/payments', 'POST')).toHaveLength(0); expect(e.uuid).not.toHaveBeenCalled();
  });
  test('4 method and note validation; missing receipt, MIME, empty file and 6 MiB block dispatch', async () => {
    const e = await environment(), values = await e.fill();
    expect(e.validatePayment({ ...values, method: 'unknown' })).toBe('INVALID_PAYMENT_METHOD');
    for (const note of ['x'.repeat(501), '<script>', '>']) expect(e.validatePayment({ ...values, note })).toBe('INVALID_PAYMENT_NOTE');
    for (const file of [null, proof(0), proof(10, 'application/pdf')]) {
      await e.fill({ file }); expect(e.t('submit').disabled).toBe(true); await e.submit();
      expect(e.t('message').textContent).toBe(e.getErrorMessage('INVALID_PAYMENT_UPLOAD'));
    }
    await e.fill({ file: proof(6 * 1024 * 1024) }); expect(e.t('submit').disabled).toBe(true);
    expect(e.t('message').textContent).toBe('الملف أكبر من 5 ميغابايت. صغّر الصورة وأعد المحاولة.');
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) expect(e.validatePayment({ ...values, file: proof(5242880, type) })).toBeNull();
    expect(e.calls('/api/payments', 'POST')).toHaveLength(0);
  });
  test('5 real secureFetch sends exact FormData with CSRF, no manual Content-Type; owner record precedes POST', async () => {
    const e = await environment(), initial = e.localStorage.snapshot(); await e.fill({ note: 'proof note' });
    const original = e.routes.get('POST /api/payments');
    e.routes.set('POST /api/payments', (url, options) => {
      expect(options.body).toBeInstanceOf(FormData);
      expect([...options.body.keys()]).toEqual(['method', 'amount', 'note', 'receipt']);
      expect(options.body.get('method')).toBe('visa'); expect(options.body.get('amount')).toBe('50.00');
      expect(options.body.get('note')).toBe('proof note'); expect(options.body.get('receipt').size).toBe(64);
      expect(options.headers.get('Content-Type')).toBeNull(); expect(options.headers.get('x-csrf-token')).toBe('a'.repeat(64));
      expect(options.headers.get('x-submission-id')).toBe(ID); expect(options.credentials).toBe('include');
      expect(options.redirect).toBe('error');
      const record = JSON.parse(e.localStorage.getItem(key()));
      expect(record).toMatchObject({ version: 1, userId: OWNER, submissionId: ID });
      expect(Object.keys(record).sort()).toEqual(['createdAt', 'submissionId', 'userId', 'version']);
      return original(url, options);
    });
    await e.submit();
    expect(e.calls('/api/users/me')).toHaveLength(2); expect(e.calls('/api/auth/csrf')).toHaveLength(1);
    expect(e.calls('/api/payments', 'POST')).toHaveLength(1); expect(e.localStorage.getItem(key())).toBeNull();
    expect(e.localStorage.getItem('userId')).toBe('wrong-cached-user');
    for (const k of Object.keys(initial)) expect(e.localStorage.getItem(k)).toBe(initial[k]);
    expect(e.localStorage.clear).not.toHaveBeenCalled();
  });
  test('6 bare 201 acknowledges, clears form, refreshes real Payments page 1, balance unchanged', async () => {
    const e = await environment(); await e.fill(); await e.submit();
    expect(e.t('message').textContent).toContain('قيد مراجعة الإدارة');
    expect(e.t('recovery').hidden).toBe(true); expect(e.t('submit').disabled).toBe(true);
    for (const name of ['method', 'amount', 'note', 'receipt']) expect(e.t(name).value).toBe('');
    expect(e.t('receipt').files).toHaveLength(0); expect(e.localStorage.getItem(key())).toBeNull();
    expect(e.calls('/api/payments', 'GET')[0][0]).toBe('https://shop.test/api/payments?limit=20');
    expect(e.node('payments-body').textContent).toContain(`pay-${ID}`);
    expect(e.node('balance').textContent).toBe('$100.00'); expect(e.calls('/api/users/me')).toHaveLength(2);
  });
  test.each([[400, 'INVALID_PAYMENT_AMOUNT'], [403, 'CSRF_INVALID'], [429, 'FINANCIAL_RATE_LIMITED']])(
    '7 definite rejection HTTP %s maps Arabic, preserves inputs, never automatically retries', async (status, code) => {
      const e = await environment(); await e.fill(); e.routes.set('POST /api/payments', () => error(status, code)); await e.submit();
      expect(e.t('message').textContent).toBe(e.getErrorMessage(code)); expect(e.t('amount').value).toBe('50.00');
      expect(e.localStorage.getItem(key())).toBeNull(); expect(e.calls('/api/payments', 'POST')).toHaveLength(1);
    });
  test('8 duplicate 409 retains same UUID, blocks new upload, offers manual recovery', async () => {
    const e = await environment(); await e.fill(); e.routes.set('POST /api/payments', () => error(409, 'PAYMENT_SUBMISSION_EXISTS'));
    await e.submit(); const saved = e.localStorage.getItem(key());
    expect(saved).not.toBeNull(); expect(e.t('recovery').hidden).toBe(false); expect(e.t('check').disabled).toBe(false);
    expect(e.t('message').textContent).toBe(e.getErrorMessage('duplicate_submission'));
    await e.submit(); expect(e.localStorage.getItem(key())).toBe(saved);
    expect(e.uuid).toHaveBeenCalledTimes(1); expect(e.calls('/api/payments', 'POST')).toHaveLength(1);
    expect(e.calls(`/api/payments/submissions/${ID}`)).toHaveLength(0);
  });
  test.each(['PAYMENT_SUBMISSION_OUTCOME_UNKNOWN', 'RECEIPT_STORAGE_UNAVAILABLE', 'INVALID_RECEIPT_STORAGE', 'PAYMENT_SUBMISSION_UNAVAILABLE'])(
    '9 ALL POST 503s (%s) retain intent and show unknown, no automatic retry or recovery', async code => {
      const e = await environment(); await e.fill(); e.routes.set('POST /api/payments', () => error(503, code)); await e.submit();
      expect(e.localStorage.getItem(key())).not.toBeNull(); expect(e.t('recovery').hidden).toBe(false);
      expect(e.t('message').textContent).toBe('تم الإرسال لكن لم نتأكد من النتيجة. يرجى التحقق من الحالة.');
      await e.submit(); expect(e.uuid).toHaveBeenCalledTimes(1); expect(e.calls('/api/payments', 'POST')).toHaveLength(1);
      expect(e.calls(`/api/payments/submissions/${ID}`)).toHaveLength(0);
    });
  test('10 network loss keeps recovery record; no upload retry even after manual unresolved lookup', async () => {
    const e = await environment(); await e.fill(); e.routes.set('POST /api/payments', () => { throw new Error('lost response'); });
    await e.submit(); const saved = e.localStorage.getItem(key()); await e.check(); await e.submit();
    expect(saved).not.toBeNull(); expect(e.localStorage.getItem(key())).toBe(saved);
    expect(e.t('message').textContent).toBe(e.getErrorMessage('unresolved_submission'));
    expect(e.calls('/api/payments', 'POST')).toHaveLength(1); expect(e.calls(`/api/payments/submissions/${ID}`)).toHaveLength(1);
  });
});

describe('C5e.1b.1 manual recovery, ownership and failure boundaries', () => {
  test('11 reload scans only authenticated owner and renders persistent banner without GET or upload', async () => {
    const saved = JSON.stringify(intent(), null, 2), store = storage({ [key()]: saved, [key(NEXT, OTHER)]: JSON.stringify(intent(NEXT, OTHER)) });
    const e = await environment({ localStorage: store });
    expect(e.t('recovery').hidden).toBe(false); expect(e.t('recovery').textContent).toContain('لديك محاولة إيداع قيد التحقق');
    expect(e.t('submit').disabled).toBe(true); expect(e.fetch).toHaveBeenCalledTimes(1);
    await e.node('tab-topup').click(); expect(e.fetch).toHaveBeenCalledTimes(1);
    expect(store.getItem(key())).toBe(saved); expect(store.setItem).not.toHaveBeenCalled();
  });
  test.each(['pending', 'completed', 'cancelled'])('12 committed recovery (%s) removes owned intent and refreshes Payments', async status => {
    const e = await environment({ localStorage: storage({ [key()]: JSON.stringify(intent()) }) });
    e.server.set(ID, payment(ID, OWNER, status)); e.account.balanceCents = '11000'; await e.check();
    expect(e.calls(`/api/payments/submissions/${ID}`, 'GET')).toHaveLength(1);
    expect(e.localStorage.getItem(key())).toBeNull(); expect(e.t('recovery').hidden).toBe(true);
    expect(e.t('message').textContent).toContain('تم إرسال طلبك بنجاح');
    expect(e.node('payments-body').textContent).toContain(`pay-${ID}`);
    expect(e.node('balance').textContent).toBe(status === 'completed' ? '$110.00' : '$100.00');
    expect(e.calls('/api/payments', 'POST')).toHaveLength(0);
  });
  test('13 unresolved recovery retains record and never permits re-upload', async () => {
    const saved = JSON.stringify(intent()), e = await environment({ localStorage: storage({ [key()]: saved }) });
    await e.check(); expect(e.localStorage.getItem(key())).toBe(saved);
    expect(e.t('message').textContent).toBe('لا يزال قيد المعالجة. حاول مرة أخرى بعد دقائق');
    expect(e.t('submit').disabled).toBe(true); await e.submit();
    expect(e.calls('/api/payments', 'POST')).toHaveLength(0); expect(e.uuid).not.toHaveBeenCalled();
  });
  test.each([404, 503])('14 recovery HTTP %s keeps record and offers manual lookup, never upload', async status => {
    const saved = JSON.stringify(intent()), e = await environment({ localStorage: storage({ [key()]: saved }) });
    const code = status === 503 ? 'RESOURCE_READ_UNAVAILABLE' : 'NOT_FOUND';
    e.routes.set(`GET /api/payments/submissions/${ID}`, () => error(status, code)); await e.check();
    expect(e.localStorage.getItem(key())).toBe(saved); expect(e.t('message').textContent).toBe(e.getErrorMessage(code));
    expect(e.t('check').disabled).toBe(false); expect(e.calls('/api/payments', 'POST')).toHaveLength(0);
  });
  test.each([
    {}, { paymentId: `pay-${ID}`, retrySubmission: false },
    { outcome: 'unresolved', paymentId: `pay-${NEXT}`, retrySubmission: false },
    { outcome: 'unresolved', paymentId: `pay-${ID}`, retrySubmission: true },
    { outcome: 'committed', payment: payment(ID, OTHER) },
    { outcome: 'committed', payment: payment(NEXT) }
  ])('15 malformed or foreign recovery %# shows generic error and keeps record', async body => {
    const saved = JSON.stringify(intent()), e = await environment({ localStorage: storage({ [key()]: saved }) });
    e.routes.set(`GET /api/payments/submissions/${ID}`, () => response(200, body)); await e.check();
    expect(e.localStorage.getItem(key())).toBe(saved); expect(e.t('message').textContent).toBe(e.GENERIC_ERROR_MESSAGE);
    expect(e.calls('/api/payments', 'GET')).toHaveLength(0); expect(e.calls('/api/payments', 'POST')).toHaveLength(0);
  });
  test.each([{ status: 'pending' }, { paymentId: `pay-${NEXT}`, status: 'pending' }, { paymentId: `pay-${ID}`, status: 'completed' }])(
    '16 malformed 201 %# is unknown, keeps UUID, no Payments refresh or second upload', async body => {
      const e = await environment(); await e.fill(); e.routes.set('POST /api/payments', () => response(201, body)); await e.submit();
      expect(e.localStorage.getItem(key())).not.toBeNull(); expect(e.t('message').textContent).toBe(e.getErrorMessage('unknown_outcome'));
      expect(e.t('recovery').hidden).toBe(false); await e.submit();
      expect(e.calls('/api/payments', 'POST')).toHaveLength(1); expect(e.calls('/api/payments', 'GET')).toHaveLength(0);
    });
  test('17 413 oversized rejection allows changing receipt and a NEW submission UUID', async () => {
    const e = await environment(); await e.fill(); const original = e.routes.get('POST /api/payments');
    e.routes.set('POST /api/payments', () => error(413, 'INVALID_PAYMENT_UPLOAD')); await e.submit();
    expect(e.t('message').textContent).toBe('الملف أكبر من 5 ميغابايت. صغّر الصورة وأعد المحاولة.');
    expect(e.localStorage.getItem(key())).toBeNull(); expect(e.t('recovery').hidden).toBe(true);
    e.routes.set('POST /api/payments', original); await e.fill({ file: proof(128) }); await e.submit();
    expect(e.calls('/api/payments', 'POST').map(([, opts]) => opts.headers.get('x-submission-id'))).toEqual([ID, NEXT]);
    expect(e.localStorage.getItem(key(NEXT))).toBeNull();
  });
  test('18 /api/users/me 401 mid-form redirects before UUID persistence, CSRF or POST', async () => {
    const e = await environment(); await e.fill(); e.routes.set('GET /api/users/me', () => error(401, 'TOKEN_EXPIRED')); await e.submit();
    expect(e.window.location.replace).toHaveBeenCalledWith('/login.html'); expect(e.uuid).not.toHaveBeenCalled();
    expect(e.localStorage.setItem).not.toHaveBeenCalled(); expect(e.calls('/api/auth/csrf')).toHaveLength(0);
    expect(e.calls('/api/payments', 'POST')).toHaveLength(0);
  });
  test.each(['submit', 'recover'])('19 HTTP 401 during %s preserves intent and redirects', async action => {
    const e = await environment({ localStorage: storage(action === 'recover' ? { [key()]: JSON.stringify(intent()) } : {}) });
    if (action === 'submit') { await e.fill(); e.routes.set('POST /api/payments', () => error(401, 'INVALID_TOKEN')); await e.submit(); }
    else { e.routes.set(`GET /api/payments/submissions/${ID}`, () => error(401, 'INVALID_TOKEN')); await e.check(); }
    expect(e.window.location.replace).toHaveBeenCalledWith('/login.html'); expect(e.localStorage.getItem(key())).not.toBeNull();
  });
  test('20 quota exceeded prevents POST and shows storage-before-dispatch message', async () => {
    const e = await environment(); await e.fill(); const before = e.localStorage.snapshot();
    e.localStorage.setItem.mockImplementation(() => { throw new Error('QuotaExceededError'); }); await e.submit();
    expect(e.t('message').textContent).toBe('تعذر حفظ رقم الطلب على هذا الجهاز. لم يتم إرسال الطلب.');
    expect(e.localStorage.snapshot()).toEqual(before); expect(e.calls('/api/payments', 'POST')).toHaveLength(0);
    expect(e.calls('/api/auth/csrf')).toHaveLength(0);
  });
  test('21 real logout and re-login preserve submission bytes and all unrelated recovery keys', async () => {
    const saved = JSON.stringify(intent(), null, 2), store = storage({ [key()]: saved });
    const e = await environment({ localStorage: store }), before = store.snapshot(); await e.node('logout').click();
    expect(e.window.location.replace).toHaveBeenCalledWith('/login.html'); expect(store.getItem(key())).toBe(saved);
    const authKeys = ['userId', 'userToken', 'customSessionId', 'user_id', 'user_token', 'authToken'];
    expect(store.removeItem.mock.calls.map(([k]) => k).sort()).toEqual([...authKeys].sort());
    for (const k of Object.keys(before).filter(k => !authKeys.includes(k))) expect(store.getItem(k)).toBe(before[k]);
    const { STORAGE_KEYS } = browser('utils/appUtils.js', ['STORAGE_KEYS'], e);
    const { login } = browser('auth.js', ['login'], { ...e, STORAGE_KEYS });
    e.routes.set('POST /api/auth/login', () => response(200, { success: true, user: { id: OWNER, role: 'user' },
      token: 'test-only-token', sessionId: 'test-only-session', csrfToken: 'a'.repeat(64), redirectTo: '/account' }));
    expect((await login('user_test', 'TestOnly_123')).success).toBe(true);
    const reloaded = await environment({ localStorage: store });
    expect(reloaded.t('recovery').hidden).toBe(false); expect(store.getItem(key())).toBe(saved);
    expect(reloaded.fetch).toHaveBeenCalledTimes(1); expect(store.clear).not.toHaveBeenCalled();
  });
  test('22 foreign owner cannot see local submission banner or recover another user record', async () => {
    const saved = JSON.stringify(intent()), store = storage({ [key()]: saved });
    const e = await environment({ localStorage: store, owner: OTHER });
    expect(e.t('recovery').hidden).toBe(true); await e.node('tab-topup').click(); await e.check();
    expect(e.fetch).toHaveBeenCalledTimes(1); expect(store.getItem(key())).toBe(saved);
    const client = new e.PaymentSubmissionClient(OTHER, { storage: store });
    expect(client.pending()).toEqual([]); await expect(client.recover(intent())).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  test('23 authoritative owner changes mid-form: stale page cannot dispatch for another session', async () => {
    const e = await environment(); await e.fill(); e.routes.set('GET /api/users/me', () => response(200, { ...e.account, id: OTHER })); await e.submit();
    expect(e.window.location.replace).toHaveBeenCalledWith('/login.html'); expect(e.calls('/api/payments', 'POST')).toHaveLength(0);
    expect(e.localStorage.setItem).not.toHaveBeenCalled();
  });
  test('24 double-submit while owner read is pending dispatches only once', async () => {
    const e = await environment(); await e.fill(); let release;
    e.routes.set('GET /api/users/me', () => new Promise(resolve => { release = resolve; }));
    const pending = e.submit(); await settle(); await e.submit(); expect(e.t('submit').disabled).toBe(true);
    release(response(200, e.account)); await pending;
    expect(e.calls('/api/payments', 'POST')).toHaveLength(1); expect(e.uuid).toHaveBeenCalledTimes(1);
  });
  test('25 logout while owner read is pending prevents late dispatch', async () => {
    const e = await environment(); await e.fill(); let release;
    e.routes.set('GET /api/users/me', () => new Promise(resolve => { release = resolve; }));
    const pending = e.submit(); await settle(); await e.node('logout').click(); release(response(200, e.account)); await pending;
    expect(e.calls('/api/payments', 'POST')).toHaveLength(0); expect(e.localStorage.setItem).not.toHaveBeenCalled();
  });
  test('26 corrupt owned records remain and block submission; unrelated records untouched', async () => {
    const store = storage({ [key()]: '{bad json' }), before = store.snapshot(), e = await environment({ localStorage: store });
    expect(e.t('recovery').hidden).toBe(false); expect(e.t('check').disabled).toBe(true); await e.submit();
    expect(e.calls('/api/payments', 'POST')).toHaveLength(0); expect(store.snapshot()).toEqual(before);
  });
  test('27 multiple records are recovered one click at a time, removing only the confirmed owned key', async () => {
    const store = storage({ [key()]: JSON.stringify(intent()), [key(NEXT)]: JSON.stringify(intent(NEXT)), [key(ID, OTHER)]: 'foreign bytes' });
    const e = await environment({ localStorage: store }); e.server.set(ID, payment()); e.server.set(NEXT, payment(NEXT));
    await e.check(); expect(store.getItem(key())).toBeNull(); expect(store.getItem(key(NEXT))).not.toBeNull();
    expect(e.calls(`/api/payments/submissions/${NEXT}`)).toHaveLength(0); expect(e.t('recovery').hidden).toBe(false);
    await e.check(); expect(store.getItem(key(NEXT))).toBeNull(); expect(store.getItem(key(ID, OTHER))).toBe('foreign bytes');
  });
  test('28 malformed JSON acknowledgement remains unknown and never displays backend HTML', async () => {
    const e = await environment(); await e.fill();
    e.routes.set('POST /api/payments', () => ({ status: 201, ok: true, text: async () => '<img src=x onerror=bad>' })); await e.submit();
    expect(e.localStorage.getItem(key())).not.toBeNull(); expect(e.t('message').children).toHaveLength(0);
    expect(e.t('message').textContent).toBe(e.getErrorMessage('unknown_outcome'));
  });
  test('29 invalid generated UUID prevents persistence and dispatch', async () => {
    const e = await environment(); await e.fill(); e.uuid.mockReset().mockReturnValue(`${ID}\n`); await e.submit();
    expect(e.t('message').textContent).toBe(e.getErrorMessage('INVALID_SUBMISSION_ID'));
    expect(e.localStorage.setItem).not.toHaveBeenCalled(); expect(e.calls('/api/payments', 'POST')).toHaveLength(0);
  });
});
