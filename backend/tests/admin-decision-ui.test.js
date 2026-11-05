'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { load } = require('cheerio');
const ROOT = path.join(__dirname, '../../frontend/public');
const JS = path.join(ROOT, 'assets/js');
const ADMIN = '00000000-0000-4000-8000-000000000001';
const USER = '00000000-0000-4000-8000-000000000002';
const ID = '00000000-0000-4000-8000-000000000003';
const KEY = `order-decision-v1:${ADMIN}:${ID}`;
const REASON = 'تم التحقق من تفاصيل الطلب';
const TOKEN = 'a'.repeat(64), NEXT_TOKEN = 'b'.repeat(64);
const response = (status, data) => ({ status, ok: status >= 200 && status < 300,
  json: async () => data, text: async () => JSON.stringify(data) });
const refused = (status, code, extra = {}) => response(status, { success: false, code, error: code, ...extra });
const receipt = (action = 'accept', extra = {}) => ({ success: true, orderId: ID, userId: USER,
  status: action === 'accept' ? 'completed' : 'cancelled', replayed: false,
  ...(action === 'reject' ? { chargeCurrency: 'USD', chargeCents: '99', charge: '0.99', quantity: 2,
    balanceCents: '1099', balance: '10.99', operationId: 'refund-operation' } : {}), ...extra });
const order = () => ({ orderId: ID, userId: USER, service: 'Game <safe>', amount: '0.99', chargeCurrency: 'USD',
  chargeCents: '99', status: 'pending', createdAt: '2026-11-03T08:30:00.000Z' });
const legacy = (extra = {}) => ({ orderId: ID, action: 'accept', payload: { idempotencyKey: 'decision-original', reason: REASON }, ...extra });
const settle = () => new Promise(resolve => setImmediate(resolve));
function browser(file, names, globals) {
  const source = fs.readFileSync(path.join(JS, file), 'utf8').replace(/^import .*;.*$/gm, '')
    .replace(/\bexport (const |class |async function |function )/g, '$1');
  return vm.runInNewContext(`${source}\n({ ${names.join(', ')} })`, globals, { filename: file });
}
// Reuse the approved admin adapter; add only native dialog/lifecycle DOM APIs here.
function dom() {
  const source = fs.readFileSync(path.join(__dirname, 'admin-dashboard.test.js'), 'utf8');
  const base = vm.runInNewContext(`${source.slice(source.indexOf('function dom()'), source.indexOf('const AUTH_KEYS'))}\ndom()`,
    { fs, path, ROOT, load, jest, Promise });
  const decorated = new Set(), $ = load('');
  function decorate(el) {
    if (!el || decorated.has(el)) return el;
    decorated.add(el);
    const add = el.addEventListener.bind(el), dispatch = el.dispatchEvent.bind(el), handlers = new Map();
    el.addEventListener = (type, handler) => {
      const marker = { active: true };
      if (!handlers.has(type)) handlers.set(type, new Map());
      handlers.get(type).set(handler, marker);
      add(type, event => marker.active ? handler(event) : undefined);
    };
    el.removeEventListener = (type, handler) => { const marker = handlers.get(type)?.get(handler); if (marker) marker.active = false; };
    el.fire = async (type, extra = {}) => {
      const event = { type, defaultPrevented: false, ...extra };
      event.preventDefault = jest.fn(() => { event.defaultPrevented = true; });
      await dispatch(event); return event;
    };
    el.click = () => el.disabled ? Promise.resolve() : el.fire('click');
    el.focus = jest.fn(() => { base.activeElement = el; });
    el.remove = () => $(el.node).remove();
    Object.defineProperty(el, 'isConnected', { get: () => base.querySelectorAll('*').includes(el) });
    Object.defineProperty(el, 'readOnly', { get: () => $(el.node).attr('readonly') !== undefined,
      set: value => value ? $(el.node).attr('readonly', '') : $(el.node).removeAttr('readonly') });
    el.open = false; el.returnValue = '';
    el.showModal = jest.fn(() => { el.open = true; });
    el.close = jest.fn(value => { el.open = false; el.returnValue = value || ''; void el.fire('close'); });
    el.escape = async () => { const event = await el.fire('cancel'); if (!event.defaultPrevented) el.close(); return event; };
    return el;
  }
  base.querySelectorAll('*').forEach(decorate);
  const create = base.createElement;
  base.createElement = tag => decorate(create(tag));
  return base;
}
function environment({ saved = {}, cookie = `x-csrf-token=${TOKEN}`, items = [order()] } = {}) {
  const document = dom(); document.cookie = cookie;
  const values = new Map(Object.entries({ userId: USER, userToken: 'admin-token', customSessionId: 'admin-session', balance: '10.00', ...saved }));
  const localStorage = { get length() { return values.size; }, key: index => [...values.keys()][index] ?? null,
    getItem: jest.fn(key => values.get(key) ?? null), setItem: jest.fn((key, value) => values.set(key, String(value))),
    removeItem: jest.fn(key => values.delete(key)), snapshot: () => Object.fromEntries(values) };
  const routes = new Map([
    ['/api/users/me', () => response(200, { id: ADMIN, username: 'admin_main', role: 'admin' })],
    ['/api/orders/admin', () => response(200, { items, nextBefore: null })],
    ['/api/auth/session-info', () => response(200, { isAuthenticated: true, userId: ADMIN })],
    ['/api/auth/csrf', () => { document.cookie = `x-csrf-token=${TOKEN}`; return response(200, { success: true, csrfToken: TOKEN }); }],
    ['/api/auth/logout', () => response(200, { success: true })],
    [`/api/orders/${ID}/accept`, () => response(200, receipt())],
    [`/api/orders/${ID}/reject`, () => response(200, receipt('reject'))]
  ]);
  const fetch = jest.fn(async (url, options = {}) => {
    const target = new URL(url, 'https://shop.test'), handler = routes.get(target.pathname);
    if (!handler) throw new Error(`Unexpected request: ${url}`);
    return handler(target, options);
  });
  const events = new Map();
  const window = { fetch, location: { href: 'https://shop.test/admin', origin: 'https://shop.test', replace: jest.fn() },
    addEventListener: (type, fn) => events.set(type, fn) };
  const uuid = jest.fn(() => '00000000-0000-4000-8000-000000000004');
  const globals = { document, localStorage, fetch, window, URL, Headers, FormData, navigator: { clipboard: { writeText: jest.fn() } },
    crypto: { randomUUID: uuid }, setTimeout, clearTimeout };
  const messages = browser('utils/errorMessages.js', ['getErrorMessage', 'ERROR_MESSAGES'], globals);
  const transport = browser('securefetch.js', ['secureFetch', 'ensureCsrfToken'], { ...globals, ...messages });
  const clients = browser('utils/orderDecisionClient.js', ['OrderDecisionClient'], { ...globals, ...transport });
  const modal = browser('adminDecisionModal.js', ['mountAdminDecisions'], { ...globals, ...messages });
  const data = browser('utils/adminData.js', ['fetchCurrentAdmin', 'fetchOrdersPage', 'fetchPaymentsPage', 'fetchUsersPage',
    'normalizeOrder', 'normalizePayment', 'normalizeUser'], { ...globals, ...transport });
  const utils = browser('utils/appUtils.js', ['STORAGE_KEYS'], globals);
  const auth = browser('auth.js', ['logout'], { ...globals, ...transport, ...utils });
  const e = { document, localStorage, values, routes, fetch, window, uuid, active: true, ...clients, ...messages,
    node: name => document.getElementById(`admin-${name}`), puts: () => fetch.mock.calls.filter(([, opts]) => opts.method === 'PUT'),
    calls: endpoint => fetch.mock.calls.filter(([url]) => new URL(url, 'https://shop.test').pathname === endpoint),
    args: extra => ({ orderId: ID, action: 'accept', reason: REASON, expectedOwner: ADMIN, ...extra }),
    send: (status, code, extra) => routes.set(`/api/orders/${ID}/accept`, () => refused(status, code, extra)),
    async page() { browser('admin.js', [], { ...globals, ...data, ...auth, ...clients, ...modal, logVersionBanner: jest.fn() }); await settle(); },
    pagehide: () => events.get('pagehide')(),
    onSuccess: jest.fn(), onUnknown: jest.fn(), onAuthFailure: jest.fn(), onAlreadyDecided: jest.fn()
  };
  e.client = new clients.OrderDecisionClient({ storage: localStorage, fetcher: fetch, uuid, isActive: () => e.active });
  e.mount = () => (e.controller = modal.mountAdminDecisions({ client: e.client, adminId: ADMIN, isActive: () => e.active,
    getOrder: () => order(), onSuccess: e.onSuccess, onUnknown: e.onUnknown, onAuthFailure: e.onAuthFailure, onAlreadyDecided: e.onAlreadyDecided }));
  e.open = (action = 'accept') => { e.mount(); e.controller.open({ order: order(), action, trigger: e.node('tab-orders') }); e.node('decision-reason').value = REASON; };
  e.submit = () => e.node('decision-form').fire('submit');
  return e;
}

describe('C5e.2b.1 real admin order decisions', () => {
  afterEach(() => jest.useRealTimers());

  test('01 gates with the authoritative admin ID and mounts two actions only for pending orders without dispatch', async () => {
    const e = environment({ items: [order(), { ...order(), orderId: 'history', status: 'completed' }] }); await e.page();
    expect(e.node('shell').hidden).toBe(false);
    expect(e.node('orders-body').children[0].children).toHaveLength(8);
    expect(e.node('orders-body').children[0].querySelectorAll('[data-admin-decision]').map(n => n.textContent)).toEqual(['قبول', 'رفض']);
    expect(e.node('orders-body').children[1].querySelectorAll('[data-admin-decision]')).toHaveLength(0);
    expect(e.puts()).toHaveLength(0); expect(e.localStorage.setItem).not.toHaveBeenCalled();
    const denied = environment(); denied.routes.set('/api/users/me', () => refused(401, 'UNAUTHENTICATED')); await denied.page();
    expect(denied.window.location.replace).toHaveBeenCalledWith('/login.html');
  });

  test('02 accept/reject open text-only native dialogs with focus, labelled details, Enter submission and Escape cancellation', async () => {
    const e = environment(); await e.page();
    const buttons = e.node('orders-body').querySelectorAll('[data-admin-decision]');
    await buttons[0].click();
    expect(e.node('decision-dialog').open).toBe(true); expect(e.document.activeElement).toBe(e.node('decision-reason'));
    expect(e.node('decision-title').textContent).toBe('قبول الطلب'); expect(e.node('decision-service').textContent).toBe('Game <safe>');
    expect(e.node('decision-service').children).toHaveLength(0); expect(e.node('decision-user-id').textContent).toBe(USER);
    expect(e.node('decision-amount').textContent).toBe('USD 0.99'); expect(e.node('decision-reason').getAttribute('aria-describedby')).toContain('decision-error');
    await e.node('decision-dialog').escape(); expect(e.node('decision-dialog').open).toBe(false); expect(buttons[0].focus).toHaveBeenCalled();
    await buttons[1].click(); expect(e.node('decision-title').textContent).toBe('رفض الطلب');
    e.node('decision-reason').value = REASON; await e.submit(); await settle();
    expect(e.puts()[0][0]).toBe(`/api/orders/${ID}/reject`); expect(e.node('decision-dialog').open).toBe(false);
    expect(e.node('message').textContent).toBe('تم تنفيذ القرار بنجاح'); expect(e.node('orders-body').children).toHaveLength(0);
  });

  test('03 invalid length, controls, newlines and forbidden reason characters never dispatch', async () => {
    const e = environment(); e.open();
    for (const value of ['', 'short', ' '.repeat(10), 'a'.repeat(501), ...['\n', '\r', '\t', '\x00', '\x7f', '<', '>', '&', "'", '"', '`'].map(c => REASON + c)]) {
      e.node('decision-reason').value = value; await e.submit();
      expect(e.node('decision-error').hidden).toBe(false); expect(e.node('decision-reason').getAttribute('aria-invalid')).toBe('true');
      await expect(e.client.decide(e.args({ reason: value }))).rejects.toMatchObject({ code: 'INVALID_FINANCIAL_REASON' });
    }
    expect(e.puts()).toHaveLength(0); expect(e.localStorage.setItem).not.toHaveBeenCalled();
  });

  test('04 missing CSRF bootstraps before verified immutable persistence and exact PUT payload', async () => {
    const e = environment({ cookie: '' });
    e.routes.set(`/api/orders/${ID}/accept`, (_, opts) => {
      const saved = JSON.parse(e.localStorage.getItem(KEY));
      expect(saved.savedAt).toEqual(expect.any(Number)); expect(saved.orderId).toBe(ID);
      expect(JSON.parse(opts.body)).toEqual(saved.payload); expect(Object.keys(JSON.parse(opts.body)).sort()).toEqual(['idempotencyKey', 'reason']);
      expect(opts.headers['x-csrf-token']).toBe(TOKEN); expect(opts.credentials).toBe('include');
      return response(200, receipt());
    });
    const result = await e.client.decide(e.args({ reason: 'a'.repeat(10) }));
    expect(result.status).toBe('completed'); expect(e.calls('/api/auth/csrf')).toHaveLength(1);
    expect(e.fetch.mock.calls.slice(0, 2).map(([url]) => url)).toEqual(['/api/auth/csrf', '/api/auth/session-info']);
    expect(e.uuid).toHaveBeenCalledTimes(1); expect(e.localStorage.getItem(KEY)).toBeNull();
    expect(e.localStorage.getItem(`order-decision-v1:${USER}:${ID}`)).toBeNull();
  });

  test('05 rejection validates refund evidence, accepts the 500-character boundary and never applies replay balances', async () => {
    const e = environment(); e.routes.set(`/api/orders/${ID}/reject`, () => response(200, receipt('reject', { replayed: true, balanceCents: '99999', balance: '999.99' })));
    const result = await e.client.decide(e.args({ action: 'reject', reason: 'a'.repeat(500) }));
    expect(result.replayed).toBe(true); expect(e.localStorage.getItem('balance')).toBe('10.00'); expect(e.localStorage.getItem(KEY)).toBeNull();
  });

  test('06 failed storage writes or read-back prevent every financial dispatch', async () => {
    for (const fail of ['quota', 'readback']) {
      const e = environment(); e.localStorage.setItem.mockImplementation(() => { if (fail === 'quota') throw new Error('quota'); });
      await expect(e.client.decide(e.args())).rejects.toMatchObject({ code: 'storage_failure_before_dispatch', dispatched: false });
      expect(e.puts()).toHaveLength(0);
    }
  });

  test('07 owner or captured Authorization/session changes during bootstrap abort without dispatch', async () => {
    for (const changed of ['owner', 'token', 'session']) {
      const e = environment({ cookie: '' });
      e.routes.set('/api/auth/csrf', () => {
        e.document.cookie = `x-csrf-token=${TOKEN}`;
        if (changed === 'owner') e.routes.set('/api/auth/session-info', () => response(200, { isAuthenticated: true, userId: USER }));
        else e.values.set(changed === 'token' ? 'userToken' : 'customSessionId', 'rotated');
        return response(200, { success: true, csrfToken: TOKEN });
      });
      await expect(e.client.decide(e.args())).rejects.toMatchObject({ state: 'auth' });
      expect(e.puts()).toHaveLength(0); expect(e.localStorage.getItem(KEY)).toBeNull();
    }
  });

  test('08 network and all unknown 503 codes preserve metadata and intent without retry', async () => {
    for (const code of ['NETWORK_ERROR', 'FINANCIAL_OUTCOME_UNKNOWN', 'FINANCIAL_UNAVAILABLE', 'FINANCIAL_RETRY_EXHAUSTED']) {
      const e = environment();
      if (code === 'NETWORK_ERROR') e.routes.set(`/api/orders/${ID}/accept`, () => { throw new Error('offline'); });
      else e.send(503, code, { retryWithSameKey: true });
      await expect(e.client.decide(e.args())).rejects.toMatchObject({ code, status: code === 'NETWORK_ERROR' ? 0 : 503, state: 'unknown', retryWithSameKey: true });
      expect(e.puts()).toHaveLength(1); expect(e.localStorage.getItem(KEY)).not.toBeNull(); expect(e.localStorage.removeItem).not.toHaveBeenCalled();
    }
  });

  test('09 malformed 200 receipts never confirm, clear or retry', async () => {
    const invalid = [null, { success: true, data: receipt() }, receipt('accept', { orderId: 'other' }), receipt('accept', { status: 'cancelled' }),
      receipt('accept', { replayed: undefined }), receipt('accept', { userId: null })];
    for (const data of invalid) {
      const e = environment(); e.routes.set(`/api/orders/${ID}/accept`, () => response(200, data));
      await expect(e.client.decide(e.args())).rejects.toMatchObject({ code: 'INVALID_RESPONSE', status: 200, state: 'unknown' });
      expect(e.puts()).toHaveLength(1); expect(e.client.discardConfirmedDecision({ adminId: ADMIN, orderId: ID })).toBe(false);
      expect(e.localStorage.getItem(KEY)).not.toBeNull();
    }
    const refund = environment(); refund.routes.set(`/api/orders/${ID}/reject`, () => response(200, receipt('reject', { charge: '1.00' })));
    await expect(refund.client.decide(refund.args({ action: 'reject' }))).rejects.toMatchObject({ state: 'unknown' });
    expect(refund.localStorage.getItem(KEY)).not.toBeNull();
  });

  test('10 an existing saved decision rejects changed action/reason and reuses its original key without rewriting', async () => {
    const raw = JSON.stringify(legacy()), e = environment({ saved: { [KEY]: raw } });
    await expect(e.client.decide(e.args({ action: 'reject' }))).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(e.client.decide(e.args({ reason: 'سبب آخر مختلف تماماً' }))).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(e.puts()).toHaveLength(0); expect(e.localStorage.getItem(KEY)).toBe(raw);
    await e.client.decide(e.args()); expect(JSON.parse(e.puts()[0][1].body)).toEqual(legacy().payload);
    expect(e.uuid).not.toHaveBeenCalled(); expect(e.localStorage.setItem).not.toHaveBeenCalled();
  });

  test('11 corrupt owned records are preserved and foreign namespaces are not exposed or dispatched', async () => {
    const foreign = `order-decision-v1:${USER}:${ID}`;
    for (const raw of ['broken-json', JSON.stringify(legacy({ orderId: 'wrong' })), JSON.stringify(legacy({ savedAt: 'invalid' })),
      JSON.stringify(legacy({ payload: { idempotencyKey: 'key', reason: REASON, extra: true } }))]) {
      const e = environment({ saved: { [KEY]: raw, [foreign]: JSON.stringify(legacy()) } }); e.mount();
      expect(e.client.pendingDecisions(ADMIN)).toEqual([{ orderId: ID, corrupt: true }]);
      expect(e.node('decisions-list').children).toHaveLength(1); expect(e.node('decisions-list').querySelector('button').disabled).toBe(true);
      await expect(e.client.recoverDecision({ adminId: ADMIN, orderId: ID })).rejects.toMatchObject({ code: 'ORDER_RECONCILIATION_REQUIRED' });
      expect(e.client.discardConfirmedDecision({ adminId: ADMIN, orderId: ID })).toBe(false);
      expect(e.localStorage.getItem(KEY)).toBe(raw); expect(e.localStorage.getItem(foreign)).not.toBeNull(); expect(e.puts()).toHaveLength(0);
    }
  });

  test('12 unknown modal closes on Escape but reload shows an explicit exact-key recovery with no automatic PUT', async () => {
    const first = environment(); await first.page();
    first.routes.set(`/api/orders/${ID}/accept`, () => { throw new Error('blocked PUT'); });
    await first.node('orders-body').querySelector('[data-admin-decision]').click(); first.node('decision-reason').value = REASON; await first.submit();
    expect(first.node('decision-unknown').hidden).toBe(false); expect(first.node('decision-submit').disabled).toBe(true);
    expect(first.node('decisions-pending').textContent).toContain('لديك قرارات قيد التحقق. تحقق من الحالة');
    await first.node('decision-dialog').escape(); expect(first.node('decisions-pending').hidden).toBe(false);
    const raw = first.localStorage.getItem(KEY), second = environment({ saved: { [KEY]: raw } }); await second.page();
    expect(second.puts()).toHaveLength(0); expect(second.node('decisions-pending').hidden).toBe(false);
    await second.node('decisions-list').querySelector('button').click(); await second.node('decision-recover').click(); await settle();
    expect(JSON.parse(second.puts()[0][1].body)).toEqual(JSON.parse(raw).payload);
    expect(second.localStorage.getItem(KEY)).toBeNull(); expect(second.node('decisions-pending').hidden).toBe(true);
    expect(second.node('orders-body').children).toHaveLength(0);
  });

  test('13 legacy records without savedAt and with short backend-valid reasons recover unchanged', async () => {
    const record = legacy({ payload: { idempotencyKey: 'legacy-key', reason: 'ok' } }), raw = JSON.stringify(record);
    const e = environment({ saved: { [KEY]: raw } }); e.mount();
    await e.node('decisions-list').querySelector('button').click();
    expect(e.node('decision-reason').value).toBe('ok'); expect(e.node('decision-reason').readOnly).toBe(true);
    await e.node('decision-recover').click(); expect(JSON.parse(e.puts()[0][1].body)).toEqual(record.payload);
    expect(e.localStorage.setItem).not.toHaveBeenCalled(); expect(e.uuid).not.toHaveBeenCalled(); expect(e.onSuccess).toHaveBeenCalledTimes(1);
  });

  test('14 cleanup failure preserves acknowledged evidence and discard is permitted only by the confirming client', async () => {
    const e = environment(); e.localStorage.removeItem.mockImplementationOnce(() => { throw new Error('cleanup'); });
    await e.client.decide(e.args()); expect(e.localStorage.getItem(KEY)).not.toBeNull();
    const fresh = new e.OrderDecisionClient({ storage: e.localStorage, fetcher: e.fetch });
    expect(fresh.discardConfirmedDecision({ adminId: ADMIN, orderId: ID })).toBe(false);
    expect(e.client.discardConfirmedDecision({ adminId: ADMIN, orderId: ID })).toBe(true); expect(e.localStorage.getItem(KEY)).toBeNull();
  });

  test('15 rapid double submission and the client in-flight guard produce only one PUT', async () => {
    const e = environment(); e.open(); let release;
    e.routes.set(`/api/orders/${ID}/accept`, () => new Promise(resolve => { release = resolve; }));
    const first = e.submit(); await settle(); await e.submit();
    await expect(e.client.decide(e.args())).rejects.toMatchObject({ code: 'DECISION_BUSY' });
    expect(e.puts()).toHaveLength(1); expect(e.node('decision-submit').disabled).toBe(true);
    const escape = await e.node('decision-dialog').escape(); expect(escape.defaultPrevented).toBe(true);
    release(response(200, receipt())); await first; expect(e.onSuccess).toHaveBeenCalledTimes(1);
  });

  test('16 only definitive 403 CSRF_INVALID refreshes once, reverifies and retries an identical payload', async () => {
    for (const finalStatus of [200, 403]) {
      const e = environment(); let attempts = 0;
      e.routes.set('/api/auth/csrf', () => { e.document.cookie = `x-csrf-token=${NEXT_TOKEN}`; return response(200, { csrfToken: NEXT_TOKEN }); });
      e.routes.set(`/api/orders/${ID}/accept`, () => ++attempts === 1 || finalStatus === 403 ? refused(403, 'CSRF_INVALID') : response(200, receipt()));
      if (finalStatus === 200) await e.client.decide(e.args());
      else await expect(e.client.decide(e.args())).rejects.toMatchObject({ code: 'CSRF_INVALID', status: 403 });
      expect(e.puts()).toHaveLength(2); expect(e.puts()[0][1].body).toBe(e.puts()[1][1].body);
      expect(e.puts()[1][1].headers['x-csrf-token']).toBe(NEXT_TOKEN);
      expect(e.calls('/api/auth/csrf')).toHaveLength(1); expect(e.calls('/api/auth/session-info')).toHaveLength(2);
      expect(e.calls('/api/auth/csrf')[0][1]).toEqual({ method: 'GET', credentials: 'include', cache: 'no-store' });
      expect(e.localStorage.getItem(KEY) === null).toBe(finalStatus === 200);
    }
  });

  test('17 other 403s never retry and forced CSRF mismatch or changed context prevents the second PUT', async () => {
    const forbidden = environment(); forbidden.send(403, 'FINANCIAL_FORBIDDEN');
    await expect(forbidden.client.decide(forbidden.args())).rejects.toMatchObject({ code: 'FINANCIAL_FORBIDDEN' });
    expect(forbidden.puts()).toHaveLength(1); expect(forbidden.calls('/api/auth/csrf')).toHaveLength(0);
    for (const changed of ['cookie', 'owner', 'token', 'session', 'inactive']) {
      const e = environment(); e.send(403, 'CSRF_INVALID');
      e.routes.set('/api/auth/csrf', () => {
        if (changed !== 'cookie') e.document.cookie = `x-csrf-token=${NEXT_TOKEN}`;
        if (changed === 'owner') e.routes.set('/api/auth/session-info', () => response(200, { isAuthenticated: true, userId: USER }));
        if (changed === 'token' || changed === 'session') e.values.set(changed === 'token' ? 'userToken' : 'customSessionId', 'rotated');
        if (changed === 'inactive') e.active = false;
        return response(200, { csrfToken: NEXT_TOKEN });
      });
      await expect(e.client.decide(e.args())).rejects.toBeDefined(); expect(e.puts()).toHaveLength(1); expect(e.localStorage.getItem(KEY)).not.toBeNull();
    }
  });

  test('18 409 conflict/reconciliation and recovery 400 retain records; already-decided removes the row without discarding', async () => {
    for (const code of ['IDEMPOTENCY_CONFLICT', 'ORDER_RECONCILIATION_REQUIRED', 'PAYMENT_RECONCILIATION_REQUIRED', 'FINANCIAL_RECONCILIATION_REQUIRED', 'BALANCE_RECONCILIATION_REQUIRED']) {
      const e = environment(); e.open(); e.send(409, code); await e.submit();
      expect(e.node('decision-dialog').open).toBe(true); expect(e.node('decision-error').textContent).toBe(e.ERROR_MESSAGES[code]);
      expect(e.node('decision-recover').hidden).toBe(false); expect(e.node('decision-submit').disabled).toBe(true);
      expect(e.node('decisions-list').querySelectorAll('button')).toHaveLength(1); expect(e.localStorage.getItem(KEY)).not.toBeNull();
      e.send(400, 'INVALID_FINANCIAL_INPUT'); await e.node('decision-recover').click(); expect(e.localStorage.getItem(KEY)).not.toBeNull();
    }
    const e = environment(); await e.page(); await e.node('orders-body').querySelector('[data-admin-decision]').click();
    e.node('decision-reason').value = REASON; e.send(409, 'ORDER_ALREADY_DECIDED'); await e.submit(); await settle();
    expect(e.node('decision-dialog').open).toBe(false); expect(e.node('orders-body').children).toHaveLength(0);
    expect(e.node('message').textContent).toBe('قرار سابق موجود'); expect(e.node('decisions-pending').hidden).toBe(false);
    expect(e.localStorage.getItem(KEY)).not.toBeNull(); expect(e.localStorage.removeItem).not.toHaveBeenCalled();
  });

  test('19 429 shows Arabic, disables submission/recovery for 15 seconds and never automatically retries', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    const e = environment(); e.open(); e.send(429, 'FINANCIAL_RATE_LIMITED'); await e.submit();
    expect(e.node('decision-error').textContent).toBe(e.ERROR_MESSAGES.FINANCIAL_RATE_LIMITED);
    expect(e.node('decision-submit').disabled).toBe(true); expect(e.node('decision-recover').disabled).toBe(true);
    jest.advanceTimersByTime(14999); expect(e.node('decision-submit').disabled).toBe(true);
    jest.advanceTimersByTime(1); expect(e.node('decision-submit').disabled).toBe(false); expect(e.puts()).toHaveLength(1);
    await e.submit(); expect(e.puts()).toHaveLength(2); expect(e.puts()[0][1].body).toBe(e.puts()[1][1].body);
    expect(e.node('decision-submit').disabled).toBe(true); jest.advanceTimersByTime(15000); expect(e.puts()).toHaveLength(2);
  });

  test('20 inactive/destroyed/logout/navigation contexts retain intents and never dispatch or apply stale UI results', async () => {
    const raw = JSON.stringify(legacy()), inactive = environment({ saved: { [KEY]: raw } }); inactive.active = false;
    await expect(inactive.client.decide(inactive.args())).rejects.toMatchObject({ state: 'auth' });
    await expect(inactive.client.recoverDecision({ adminId: ADMIN, orderId: ID })).rejects.toMatchObject({ state: 'auth' });
    expect(inactive.puts()).toHaveLength(0); expect(inactive.localStorage.getItem(KEY)).toBe(raw);
    const destroyed = environment(); destroyed.open(); destroyed.controller.destroy(); await destroyed.submit(); expect(destroyed.puts()).toHaveLength(0);
    const loggedOut = environment({ saved: { [KEY]: raw } }); await loggedOut.page(); await loggedOut.node('logout').click();
    expect(loggedOut.localStorage.getItem(KEY)).toBe(raw); expect(loggedOut.window.location.replace).toHaveBeenCalledWith('/login.html');
    const reloaded = environment({ saved: { [KEY]: loggedOut.localStorage.getItem(KEY) } }); await reloaded.page(); expect(reloaded.node('decisions-pending').hidden).toBe(false);
    const stale = environment(); await stale.page(); await stale.node('orders-body').querySelector('[data-admin-decision]').click();
    stale.node('decision-reason').value = REASON; let release;
    stale.routes.set(`/api/orders/${ID}/accept`, () => new Promise(resolve => { release = resolve; }));
    const submitting = stale.submit(); await settle(); stale.pagehide(); release(response(200, receipt())); await submitting;
    expect(stale.node('message').textContent).toBe(''); expect(stale.localStorage.getItem(KEY)).not.toBeNull(); expect(stale.node('orders-body').children).toHaveLength(1);
  });
});
