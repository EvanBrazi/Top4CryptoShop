'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { load } = require('cheerio');
const ROOT = path.join(__dirname, '../../frontend/public');
const JS = path.join(ROOT, 'assets/js');
// Run actual browser modules; adapt only ESM syntax, not their behavior.
function browser(file, names, globals) {
  const source = fs.readFileSync(path.join(JS, file), 'utf8')
    .replace(/^import .*;.*$/gm, '').replace(/\bexport (const |class |async function |function )/g, '$1');
  return vm.runInNewContext(`${source}\n({ ${names.join(', ')} })`, globals, { filename: file });
}
// Actual admin HTML, with DOM/event APIs and forbidden template writes (no layout simulation).
function dom() {
  const $ = load(fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8'));
  const cache = new Map(), events = new Map();
  const document = { cookie: `x-csrf-token=${'a'.repeat(64)}` };
  function element(node) {
    if (!node) return null;
    if (cache.has(node)) return cache.get(node);
    const q = $(node), handlers = new Map();
    const el = {
      node, style: {}, focus: jest.fn(), select: jest.fn(),
      get id() { return q.attr('id') || ''; }, set id(value) { q.attr('id', value); },
      get className() { return q.attr('class') || ''; }, set className(value) { q.attr('class', value); },
      get hidden() { return q.attr('hidden') !== undefined; },
      set hidden(value) { if (value) q.attr('hidden', ''); else q.removeAttr('hidden'); },
      get disabled() { return q.attr('disabled') !== undefined; },
      set disabled(value) { if (value) q.attr('disabled', ''); else q.removeAttr('disabled'); },
      get value() { return q.val() || ''; }, set value(value) { q.val(String(value)); },
      get textContent() { return q.text(); }, set textContent(value) { q.text(String(value)); },
      get children() { return q.children().toArray().map(element); },
      get innerHTML() { throw new Error('HTML access forbidden'); },
      set innerHTML(value) { throw new Error(`HTML write forbidden: ${value}`); },
      getAttribute: name => q.attr(name) ?? null,
      setAttribute: (name, value) => q.attr(name, String(value)),
      querySelector: selector => element(q.find(selector)[0]),
      querySelectorAll: selector => q.find(selector).toArray().map(element),
      appendChild: child => { q.append(child.node); return child; },
      addEventListener(type, handler) {
        if (!handlers.has(type)) handlers.set(type, []);
        handlers.get(type).push(handler);
      },
      dispatchEvent(event) {
        return Promise.all((handlers.get(event.type) || []).map(handler => handler({ target: el, ...event })));
      },
      click() { return el.disabled ? Promise.resolve() : el.dispatchEvent({ type: 'click' }); }
    };
    const dataKey = name => `data-${name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`;
    el.dataset = new Proxy({}, { get: (_, name) => q.attr(dataKey(name)),
      set: (_, name, value) => { q.attr(dataKey(name), value); return true; } });
    Object.defineProperty(el, 'type', { get: () => q.attr('type'), set: value => q.attr('type', value) });
    cache.set(node, el); return el;
  }
  document.getElementById = id => element($('[id]').toArray().find(node => $(node).attr('id') === id));
  document.querySelector = selector => element($(selector)[0]);
  document.querySelectorAll = selector => $(selector).toArray().map(element);
  document.createElement = tag => element($(`<${tag}></${tag}>`)[0]);
  document.addEventListener = (type, handler) => {
    if (!events.has(type)) events.set(type, []);
    events.get(type).push(handler);
  };
  document.dispatchEvent = event => Promise.all((events.get(event.type) || []).map(handler => handler(event)));
  document.head = element($('head')[0]); document.body = element($('body')[0]);
  document.execCommand = jest.fn(() => { throw new Error('Deprecated clipboard API forbidden'); });
  return document;
}
const AUTH_KEYS = ['userId', 'userToken', 'customSessionId', 'user_id', 'user_token', 'authToken'];
const PURCHASE_KEY = 'purchase-intent-v1:owner:games:2';
const DECISION_KEY = 'order-decision-v1:owner:ord-original';
function storage() {
  const values = new Map([...AUTH_KEYS.map(key => [key, 'auth-value']),
    [PURCHASE_KEY, '  saved purchase bytes  '], [DECISION_KEY, '  saved decision bytes  '], ['theme', 'night']]);
  return {
    get length() { return values.size; }, key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null,
    setItem: jest.fn((key, value) => values.set(key, String(value))),
    removeItem: jest.fn(key => values.delete(key)), clear: jest.fn(() => values.clear()),
    snapshot: () => Object.fromEntries(values)
  };
}
const response = (status, data) => ({ status, ok: status >= 200 && status < 300,
  text: async () => JSON.stringify(data), json: async () => data });
const denied = status => response(status, { success: false, code: status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN' });
const OWNER = '00000000-0000-4000-8000-000000000002';
const account = extra => ({ id: 'admin-owner', username: 'admin_test <safe>', role: 'admin', ...extra });
const order = extra => ({ id: 'INTERNAL-ID-NOT-FOR-COPY', orderId: 'order-1', userId: OWNER, service: 'Game <safe>',
  amount: '0.99', charge: 'WRONG', chargeCents: '99', chargeCurrency: 'USD', status: 'pending', createdAt: '2026-11-03T08:30:00.000Z', ...extra });
const payment = extra => ({ id: 'INTERNAL-PAYMENT', paymentId: 'payment-1', userId: OWNER, amount: '25.50',
  amountInUSD: 'WRONG-USD', currency: 'EUR', method: 'visa', status: 'pending', createdAt: '2026-11-03T09:30:00.000Z', ...extra });
const user = extra => ({ id: OWNER, username: 'user <safe>', email: 'user@example.test', role: 'user',
  accountStatus: 'active', balanceCents: '12345', balance: 'WRONG-BALANCE', createdAt: '2026-11-03T07:30:00.000Z', ...extra });
const page = (items = [], nextBefore = null) => ({ items, nextBefore });
const settle = () => new Promise(resolve => setImmediate(resolve));
function environment({ me = response(200, account()) } = {}) {
  const document = dom(), localStorage = storage();
  const routes = new Map([['/api/users/me', typeof me === 'function' ? me : () => me], ['/api/orders/admin', () => response(200, page())],
    ['/api/payments/admin', () => response(200, page())], ['/api/users', () => response(200, page())],
    ['/api/auth/csrf', () => response(200, { success: true, csrfToken: 'a'.repeat(64) })],
    ['/api/auth/logout', () => response(200, { success: true })]]);
  // Native fetch is the ONLY mocked transport: real secureFetch validates envelopes and bootstraps CSRF.
  const fetch = jest.fn(async (url, options) => {
    const target = new URL(url, 'https://shop.test'), handler = routes.get(target.pathname);
    if (!handler) throw new Error(`Unexpected request: ${url}`);
    return handler(target, options);
  });
  const window = { fetch, location: { href: 'https://shop.test/admin', origin: 'https://shop.test', replace: jest.fn() } };
  const navigator = { clipboard: { writeText: jest.fn(async () => {}) } };
  const WebSocket = jest.fn(() => { throw new Error('WebSocket forbidden'); });
  const setInterval = jest.fn(() => { throw new Error('Auto-refresh forbidden'); });
  const globals = { document, localStorage, window, navigator, fetch, URL, Headers, FormData, WebSocket, setInterval };
  const messages = browser('utils/errorMessages.js', ['getErrorMessage'], globals);
  const transport = browser('securefetch.js', ['secureFetch'], { ...globals, ...messages });
  const utils = browser('utils/appUtils.js', ['STORAGE_KEYS'], globals);
  const auth = browser('auth.js', ['logout'], { ...globals, ...utils, ...transport });
  const logout = jest.fn(auth.logout);
  const data = browser('utils/adminData.js', ['fetchCurrentAdmin', 'fetchOrdersPage', 'fetchPaymentsPage', 'fetchUsersPage',
    'assertPageShape', 'formatBalance', 'normalizeOrder', 'normalizePayment', 'normalizeUser'], { ...globals, ...transport });
  browser('admin.js', [], { ...globals, ...data, logout });
  const e = { document, localStorage, routes, fetch, window, navigator, WebSocket, setInterval, data, logout,
    node: name => document.getElementById(`admin-${name}`),
    calls: endpoint => fetch.mock.calls.filter(([url]) => new URL(url, 'https://shop.test').pathname === endpoint),
    async tab(name) { await e.node(`tab-${name}`).click(); await settle(); },
    row: name => e.node(`${name}-body`).children[0],
    async copy(name) { await e.row(name).querySelector('button').click(); await settle(); }
  };
  return e;
}
async function ready(options) { const e = environment(options); await settle(); return e; }
function values(e, name) { return e.row(name).children.slice(0, -1).map(cell => cell.textContent); }
function expectRedirect(e) { expect(e.window.location.replace).toHaveBeenCalledWith('/login.html'); }

// Execute the actual page-composition source block to verify guards, aliases and persistence ordering.
async function verifyPageComposition() {
  const source = fs.readFileSync(path.join(__dirname, '../services/serverApplication.js'), 'utf8');
  const block = source.slice(source.indexOf('  const staticPath ='), source.indexOf("  app.get('/account'"));
  const routes = [];
  let release;
  const persistResponse = jest.fn(() => new Promise(resolve => { release = resolve; }));
  const context = { sessionMiddleware: jest.fn(), auth: { verifyToken: jest.fn(), checkAdmin: jest.fn() }, adapter: { persistResponse } };
  vm.runInNewContext(block, { path, __dirname: path.join(__dirname, '../services'), context,
    app: { get: (names, ...handlers) => routes.push({ names, handlers }) } });
  const admin = routes.find(route => route.names.includes('/admin'));
  expect([...admin.names]).toEqual(['/admin', '/admin.html']);
  expect(admin.handlers.slice(0, -1)).toEqual([context.sessionMiddleware, context.auth.verifyToken, context.auth.checkAdmin]);
  const req = {}, res = { set: jest.fn(function () { return this; }), sendFile: jest.fn() }, next = jest.fn();
  const pending = admin.handlers.at(-1)(req, res, next);
  await settle();
  expect(persistResponse).toHaveBeenCalledWith(req, res); expect(res.sendFile).not.toHaveBeenCalled();
  expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
  release(); await pending;
  expect(res.sendFile).toHaveBeenCalledWith(path.join(ROOT, 'admin.html'), expect.any(Function));
  const error = new Error('SESSION_UNAVAILABLE');
  persistResponse.mockRejectedValueOnce(error); res.sendFile.mockClear();
  await admin.handlers.at(-1)(req, res, next);
  expect(next).toHaveBeenCalledWith(error); expect(res.sendFile).not.toHaveBeenCalled();
  const homepage = routes.find(route => route.names.includes('/homepage'));
  expect([...homepage.names]).toEqual(['/homepage', '/homepage.html']);
  expect(homepage.handlers.slice(0, -1)).toEqual([context.sessionMiddleware, context.auth.verifyToken, context.auth.checkAdmin]);
  persistResponse.mockResolvedValue(undefined); res.set.mockClear();
  await homepage.handlers.at(-1)(req, res, next);
  expect(res.sendFile).toHaveBeenCalledWith(path.join(ROOT, 'homepage.html'), expect.any(Function));
  expect(res.set).not.toHaveBeenCalled();
}

describe('C5e.2a minimal admin dashboard: real scripts, transport, auth and HTML', () => {
  test('1 unauthenticated current account redirects to login without queue requests', async () => {
    const e = await ready({ me: denied(401) }); expectRedirect(e);
    expect(e.node('shell').hidden).toBe(true); expect(e.node('gate-retry').hidden).toBe(true);
    expect(e.calls('/api/users/me')).toHaveLength(1); expect(e.calls('/api/orders/admin')).toHaveLength(0);
  });

  test('2 non-admin role or HTTP 403 shows forbidden gate without shell, Retry or queue reads', async () => {
    for (const me of [response(200, account({ role: 'user' })), response(200, account({ role: 'moderator' })), denied(403)]) {
      const e = await ready({ me });
      expect(e.node('gate-state').textContent).toContain('غير مسموح'); expect(e.node('shell').hidden).toBe(true);
      expect(e.node('gate-retry').hidden).toBe(true); expect(e.window.location.replace).not.toHaveBeenCalled();
      expect(e.fetch).toHaveBeenCalledTimes(1);
      await e.node('tab-users').dispatchEvent({ type: 'click' }); expect(e.fetch).toHaveBeenCalledTimes(1);
    }
  });

  test('3 admin shows safe username and default Orders; retry recovers; page route preserves persistence', async () => {
    const e = await ready();
    expect(e.node('shell').hidden).toBe(false); expect(e.document.querySelector('.admin-gate').hidden).toBe(true);
    expect(e.node('username').textContent).toBe('admin_test <safe>'); expect(e.node('username').children).toHaveLength(0);
    expect(e.node('role').textContent).toBe('Admin'); expect(e.node('tab-orders').getAttribute('aria-pressed')).toBe('true');
    expect(e.node('panel-orders').hidden).toBe(false);
    expect(e.calls('/api/payments/admin')).toHaveLength(0); expect(e.calls('/api/users')).toHaveLength(0);
    const retry = environment({ me: () => { throw new Error('Offline'); } }); await settle();
    expect(retry.node('gate-retry').hidden).toBe(false); expect(retry.node('shell').hidden).toBe(true);
    retry.routes.set('/api/users/me', () => response(200, account()));
    await retry.node('gate-retry').click(); await settle(); expect(retry.node('shell').hidden).toBe(false);
    expect(retry.calls('/api/orders/admin')).toHaveLength(1);
    await verifyPageComposition();
  });

  test('4 Orders uses admin pending queue with exact fields and no user/status filter; 401 redirects', async () => {
    const e = environment(), item = order(); e.routes.set('/api/orders/admin', () => response(200, page([item]))); await settle();
    expect(e.calls('/api/orders/admin')[0][0]).toBe('https://shop.test/api/orders/admin?limit=20');
    expect(values(e, 'orders')).toEqual(['order-1', OWNER, 'Game <safe>', 'USD 0.99', 'قيد التنفيذ', new Date(item.createdAt).toLocaleString('ar')]);
    expect(e.row('orders').children[1].className).toBe('admin-ltr'); expect(e.node('orders-body').textContent).not.toContain('WRONG');
    await e.tab('payments'); await e.tab('orders'); expect(e.calls('/api/orders/admin')).toHaveLength(1);
    const expired = environment(); expired.routes.set('/api/orders/admin', () => denied(401)); await settle();
    expectRedirect(expired); expect(expired.node('shell').hidden).toBe(true); expect(expired.node('gate-retry').hidden).toBe(true);
  });

  test('5 Orders pagination encodes cursor, appends rows and suppresses duplicate in-flight clicks', async () => {
    const e = environment(), cursor = 'cursor+/= &'; let release;
    e.routes.set('/api/orders/admin', url => url.searchParams.has('before')
      ? new Promise(resolve => { release = resolve; }) : response(200, page([order()], cursor)));
    await settle(); expect(e.node('orders-more').hidden).toBe(false); await e.node('orders-more').click();
    await e.node('orders-more').dispatchEvent({ type: 'click' }); await settle();
    expect(e.calls('/api/orders/admin')).toHaveLength(2); expect(e.node('orders-more').disabled).toBe(true);
    expect(e.calls('/api/orders/admin')[1][0]).toBe(`https://shop.test/api/orders/admin?limit=20&before=${encodeURIComponent(cursor)}`);
    release(response(200, page([order({ orderId: 'order-2' })]))); await settle();
    expect(e.node('orders-body').children).toHaveLength(2); expect(e.node('orders-more').hidden).toBe(true);
    expect(e.node('orders-more').disabled).toBe(false);
  });

  test('6 valid empty Orders page shows pending empty state without Load more', async () => {
    const e = await ready(); expect(e.node('orders-state').textContent).toBe('لا توجد طلبات معلقة');
    expect(e.node('orders-body').children).toHaveLength(0); expect(e.node('orders-more').hidden).toBe(true);
    expect(e.node('orders-retry').hidden).toBe(true);
  });

  test('7 Payments uses pending admin queue and claimed amount/currency, with lazy pagination and 401 handling', async () => {
    const e = await ready(), item = payment(); let release;
    e.routes.set('/api/payments/admin', url => url.searchParams.has('before')
      ? new Promise(resolve => { release = resolve; }) : response(200, page([item], 'payment-cursor')));
    await e.tab('payments');
    expect(e.calls('/api/payments/admin')[0][0]).toBe('https://shop.test/api/payments/admin?limit=20');
    expect(values(e, 'payments')).toEqual(['payment-1', OWNER, 'EUR 25.50', 'visa', new Date(item.createdAt).toLocaleString('ar')]);
    expect(e.row('payments').children[1].className).toBe('admin-ltr');
    expect(e.node('payments-body').textContent).not.toContain('WRONG-USD');
    await e.tab('orders'); await e.tab('payments'); expect(e.calls('/api/payments/admin')).toHaveLength(1);
    await e.node('payments-more').click(); await e.node('payments-more').dispatchEvent({ type: 'click' }); await settle();
    expect(e.calls('/api/payments/admin')).toHaveLength(2); expect(e.node('payments-more').disabled).toBe(true);
    expect(e.calls('/api/payments/admin')[1][0]).toBe('https://shop.test/api/payments/admin?limit=20&before=payment-cursor');
    release(response(200, page([payment({ paymentId: 'payment-2' })]))); await settle();
    expect(e.node('payments-body').children).toHaveLength(2); expect(e.node('payments-more').hidden).toBe(true);
    const expired = await ready(); expired.routes.set('/api/payments/admin', () => denied(401)); await expired.tab('payments');
    expectRedirect(expired); expect(expired.node('shell').hidden).toBe(true);
  });

  test('8 valid empty Payments page shows pending empty state without Load more', async () => {
    const e = await ready(); await e.tab('payments');
    expect(e.node('payments-state').textContent).toBe('لا توجد مدفوعات معلقة');
    expect(e.node('payments-more').hidden).toBe(true); expect(e.node('payments-retry').hidden).toBe(true);
  });

  test('9 Users renders ID and safe fields, exact string-cents balance; role demotion hides all data', async () => {
    const e = await ready(), item = user(); e.routes.set('/api/users', () => response(200, page([item]))); await e.tab('users');
    expect(e.calls('/api/users')[0][0]).toBe('https://shop.test/api/users?limit=20');
    expect(values(e, 'users')).toEqual([OWNER, 'user <safe>', 'user@example.test', 'user', 'active', '$123.45', new Date(item.createdAt).toLocaleString('ar')]);
    expect(e.row('users').children[0].className).toBe('admin-ltr'); expect(e.row('users').children[1].children).toHaveLength(0);
    await e.tab('orders'); await e.tab('users'); expect(e.calls('/api/users')).toHaveLength(1);
    for (const [cents, expected] of [['0', '$0.00'], ['1', '$0.01'], ['105', '$1.05'], ['900719925474099312345', '$9007199254740993123.45']]) {
      expect(e.data.formatBalance(cents)).toBe(expected);
    }
    expect(() => e.data.formatBalance(12345)).toThrow();
    const demoted = await ready(); demoted.routes.set('/api/users', () => denied(403)); await demoted.tab('users');
    expect(demoted.node('shell').hidden).toBe(true); expect(demoted.node('gate-state').textContent).toContain('غير مسموح');
    expect(demoted.node('gate-retry').hidden).toBe(true); expect(demoted.window.location.replace).not.toHaveBeenCalled();
    for (const name of ['orders', 'payments', 'users']) expect(demoted.node(`${name}-body`).children).toHaveLength(0);
  });

  test('10 valid empty Users page shows empty state without Load more', async () => {
    const e = await ready(); await e.tab('users'); expect(e.node('users-state').textContent).toBe('لا يوجد مستخدمون');
    expect(e.node('users-body').children).toHaveLength(0); expect(e.node('users-more').hidden).toBe(true);
  });

  test('11 Users pagination appends rows with encoded cursor and duplicate-click suppression', async () => {
    const e = await ready(), cursor = 'users+/= &'; let release;
    e.routes.set('/api/users', url => url.searchParams.has('before')
      ? new Promise(resolve => { release = resolve; }) : response(200, page([user()], cursor)));
    await e.tab('users'); expect(e.node('users-more').hidden).toBe(false); await e.node('users-more').click();
    await e.node('users-more').dispatchEvent({ type: 'click' }); await settle();
    expect(e.calls('/api/users')).toHaveLength(2); expect(e.node('users-more').disabled).toBe(true);
    expect(e.calls('/api/users')[1][0]).toBe(`https://shop.test/api/users?limit=20&before=${encodeURIComponent(cursor)}`);
    release(response(200, page([user({ id: '00000000-0000-4000-8000-000000000003' })]))); await settle();
    expect(e.node('users-body').children).toHaveLength(2); expect(e.node('users-more').hidden).toBe(true);
    expect(e.node('users-more').disabled).toBe(false);
  });

  test('12 Copy success writes each public resource/user ID, not internal IDs, and announces success', async () => {
    const e = environment();
    e.routes.set('/api/orders/admin', () => response(200, page([order()])));
    e.routes.set('/api/payments/admin', () => response(200, page([payment()])));
    e.routes.set('/api/users', () => response(200, page([user()]))); await settle();
    for (const [name, id] of [['orders', 'order-1'], ['payments', 'payment-1'], ['users', OWNER]]) {
      await e.tab(name); await e.copy(name);
      expect(e.navigator.clipboard.writeText).toHaveBeenLastCalledWith(id);
      expect(e.node('message').textContent).toBe('✓ Copied'); expect(e.node('copy-box').hidden).toBe(true);
    }
    expect(e.document.execCommand).not.toHaveBeenCalled(); expect(e.localStorage.setItem).not.toHaveBeenCalled();
  });

  test('13 Copy rejection or absent Clipboard API shows readonly fallback, focuses and selects ID', async () => {
    for (const missing of [false, true]) {
      const e = environment(); e.routes.set('/api/orders/admin', () => response(200, page([order()]))); await settle();
      if (missing) e.navigator.clipboard = undefined;
      else e.navigator.clipboard.writeText.mockRejectedValue(new Error('Permission denied'));
      await e.copy('orders');
      expect(e.node('copy-box').hidden).toBe(false); expect(e.node('copy-fallback').hidden).toBe(false);
      expect(e.node('copy-fallback').value).toBe('order-1'); expect(e.node('copy-fallback').getAttribute('readonly')).not.toBeNull();
      expect(e.node('copy-fallback').focus).toHaveBeenCalledTimes(1); expect(e.node('copy-fallback').select).toHaveBeenCalledTimes(1);
      expect(e.node('message').textContent).toBe('Press Ctrl+C to copy'); expect(e.document.execCommand).not.toHaveBeenCalled();
    }
  });

  test('14 bare-array responses show contract error and Retry, not empty success; retries reload page 1', async () => {
    const endpoints = { orders: '/api/orders/admin', payments: '/api/payments/admin', users: '/api/users' };
    const items = { orders: order(), payments: payment(), users: user() };
    for (const [name, endpoint] of Object.entries(endpoints)) {
      const e = environment(); e.routes.set(endpoint, () => response(200, [])); await settle(); await e.tab(name);
      expect(e.node(`${name}-state`).textContent).toContain('عقد الاستجابة'); expect(e.node(`${name}-retry`).hidden).toBe(false);
      expect(e.node(`${name}-more`).hidden).toBe(true); expect(e.node(`${name}-state`).textContent).not.toContain('لا توجد');
      e.routes.set(endpoint, () => response(200, page([items[name]])));
      await e.node(`${name}-retry`).click(); await settle();
      expect(e.calls(endpoint).at(-1)[0]).toBe(`https://shop.test${endpoint}?limit=20`);
      expect(e.node(`${name}-body`).children).toHaveLength(1); expect(e.node(`${name}-retry`).hidden).toBe(true);
      for (const malformed of [null, [], {}, { items: [] }, { items: {}, nextBefore: null }, { items: [], nextBefore: 42 }]) {
        expect(() => e.data.assertPageShape(malformed, name)).toThrow();
      }
    }
    const failed = environment(); failed.routes.set('/api/orders/admin', () => response(500, { success: false })); await settle();
    expect(failed.node('orders-state').textContent).toContain('تعذر'); expect(failed.node('orders-retry').hidden).toBe(false);
    failed.routes.set('/api/orders/admin', () => response(200, page())); await failed.node('orders-retry').click(); await settle();
    expect(failed.node('orders-state').textContent).toBe('لا توجد طلبات معلقة');
  });

  test('15 admin calls no marketplace/disabled endpoints and imports no legacy managers or decision UI', async () => {
    const e = await ready(); await e.tab('payments'); await e.tab('users');
    const endpoints = e.fetch.mock.calls.map(([url]) => new URL(url, 'https://shop.test').pathname);
    expect(endpoints).toEqual(['/api/users/me', '/api/orders/admin', '/api/payments/admin', '/api/users']);
    expect(e.fetch.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
    for (const file of ['admin.js', 'utils/adminData.js']) {
      const source = fs.readFileSync(path.join(JS, file), 'utf8');
      expect(source).not.toMatch(/\/api\/(?:apps|games|cryptos|balances|cards|security|compare-token|notifications)/);
      expect(source).not.toMatch(/(?:appmanager|usermanager|homepage|adminOrders|purchaseClient|orderClient)\.js/);
      expect(source).not.toMatch(/\/accept|\/reject/);
    }
    expect(e.node('info').textContent).toContain('Decision UI coming in C5e.2b');
    expect(e.node('info').querySelector('script')).toBeNull(); expect(e.document.querySelector('form')).toBeNull();
    expect(e.document.querySelectorAll('script').map(node => node.getAttribute('src'))).toEqual(['/assets/js/admin.js']);
    expect(e.localStorage.setItem).not.toHaveBeenCalled(); expect(e.localStorage.removeItem).not.toHaveBeenCalled();
  });

  test('16 no WebSocket connection or unmanaged refresh interval is attempted', async () => {
    const e = await ready(); await e.tab('payments'); await e.tab('users'); await e.tab('orders');
    expect(e.WebSocket).not.toHaveBeenCalled(); expect(e.setInterval).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(JS, 'admin.js'), 'utf8')).not.toMatch(/WebSocket|setInterval/);
  });

  test('17 real logout bootstraps CSRF, POSTs once, clears only auth and redirects; failed logout stays honest', async () => {
    const e = await ready(), before = e.localStorage.snapshot(); await e.node('logout').click();
    expect(e.logout).toHaveBeenCalledTimes(1); expectRedirect(e);
    expect(e.calls('/api/auth/csrf')).toHaveLength(1); expect(e.calls('/api/auth/logout')).toHaveLength(1);
    const options = e.calls('/api/auth/logout')[0][1];
    expect(options.method).toBe('POST'); expect(options.credentials).toBe('include');
    expect(options.headers.get('x-csrf-token')).toBe('a'.repeat(64));
    const paths = e.fetch.mock.calls.map(([url]) => new URL(url, 'https://shop.test').pathname);
    expect(paths.indexOf('/api/auth/csrf')).toBeLessThan(paths.indexOf('/api/auth/logout'));
    for (const key of AUTH_KEYS) expect(e.localStorage.getItem(key)).toBeNull();
    expect(e.localStorage.removeItem.mock.calls.map(([key]) => key).sort()).toEqual([...AUTH_KEYS].sort());
    expect(e.localStorage.getItem(PURCHASE_KEY)).toBe(before[PURCHASE_KEY]); expect(e.localStorage.getItem(DECISION_KEY)).toBe(before[DECISION_KEY]);
    expect(e.localStorage.clear).not.toHaveBeenCalled(); expect(e.localStorage.setItem).not.toHaveBeenCalled();
    const refused = await ready(), saved = refused.localStorage.snapshot();
    refused.routes.set('/api/auth/logout', () => response(503, { success: false, code: 'LOGOUT_UNAVAILABLE' }));
    await refused.node('logout').click(); expect(refused.window.location.replace).not.toHaveBeenCalled();
    expect(refused.localStorage.snapshot()).toEqual(saved); expect(refused.node('message').textContent).toContain('تعذر تسجيل الخروج');
    expect(refused.node('logout').disabled).toBe(false);
  });
});
