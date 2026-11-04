'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { load } = require('cheerio');
const ROOT = path.join(__dirname, '../../frontend/public');
const JS = path.join(ROOT, 'assets/js');
// Execute real modules, adapting only ESM syntax for Jest's VM.
function browser(file, names, globals) {
  const source = fs.readFileSync(path.join(JS, file), 'utf8')
    .replace(/^import .*;.*$/gm, '').replace(/\bexport (const |class |async function |function )/g, '$1');
  return vm.runInNewContext(`${source}\n({ ${names.join(', ')} })`, globals, { filename: file });
}
// Parse actual HTML and purchase templates, supplying DOM/events but not browser layout.
function dom() {
  const $ = load(fs.readFileSync(path.join(ROOT, 'account.html'), 'utf8'));
  const cache = new Map(), events = new Map();
  const document = { cookie: `x-csrf-token=${'a'.repeat(64)}` };
  function element(node) {
    if (!node) return null;
    if (cache.has(node)) return cache.get(node);
    const q = $(node), handlers = new Map();
    const el = {
      node, style: {},
      get id() { return q.attr('id') || ''; }, set id(value) { q.attr('id', value); },
      get className() { return q.attr('class') || ''; }, set className(value) { q.attr('class', value); },
      get hidden() { return q.attr('hidden') !== undefined; },
      set hidden(value) { if (value) q.attr('hidden', ''); else q.removeAttr('hidden'); },
      get disabled() { return q.attr('disabled') !== undefined; },
      set disabled(value) { if (value) q.attr('disabled', ''); else q.removeAttr('disabled'); },
      get value() { return q.val() || ''; }, set value(value) { q.val(String(value)); },
      get selectedIndex() { return 0; },
      get textContent() { return q.text(); }, set textContent(value) { q.text(String(value)); },
      get children() { return q.children().toArray().map(element); },
      get innerHTML() { throw new Error('Unexpected HTML read'); },
      set innerHTML(value) {
        // Template writes are allowed only for the existing protected purchase dialog.
        if (!q.hasClass('purchase-dialog-overlay') && !q.closest('.purchase-dialog-overlay').length) {
          throw new Error('Dashboard HTML writes are forbidden');
        }
        q.html(value);
      },
      getAttribute: name => q.attr(name) ?? null,
      setAttribute: (name, value) => q.attr(name, String(value)),
      querySelector: selector => element(q.find(selector)[0]),
      querySelectorAll: selector => q.find(selector).toArray().map(element),
      closest: selector => element(q.closest(selector)[0]),
      appendChild: child => { q.append(child.node); return child; },
      remove: () => q.remove(),
      addEventListener(type, handler) {
        if (!handlers.has(type)) handlers.set(type, []);
        handlers.get(type).push(handler);
      },
      removeEventListener(type, handler) {
        handlers.set(type, (handlers.get(type) || []).filter(fn => fn !== handler));
      },
      dispatchEvent(event) {
        return Promise.all((handlers.get(event.type) || []).map(handler => handler({ target: el, ...event })));
      },
      click() { return el.disabled ? Promise.resolve() : el.dispatchEvent({ type: 'click' }); }
    };
    const dataKey = name => `data-${name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`;
    el.dataset = new Proxy({}, { get: (_, name) => q.attr(dataKey(name)),
      set: (_, name, value) => { q.attr(dataKey(name), value); return true; } });
    el.classList = { add: (...names) => q.addClass(names.join(' ')), remove: (...names) => q.removeClass(names.join(' ')) };
    for (const property of ['href', 'rel', 'type']) {
      Object.defineProperty(el, property, { get: () => q.attr(property), set: value => q.attr(property, value) });
    }
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
  return document;
}
const AUTH_KEYS = ['userId', 'userToken', 'customSessionId', 'user_id', 'user_token', 'authToken'];
const PURCHASE_KEY = 'purchase-intent-v1:other-owner:games:2';
const DECISION_KEY = 'order-decision-v1:owner:ord-original';
function storage() {
  const values = new Map([...AUTH_KEYS.map(key => [key, key === 'userId' ? 'owner' : 'auth-value']),
    [PURCHASE_KEY, '  saved purchase bytes  '], [DECISION_KEY, '  saved decision bytes  '], ['theme', 'night']]);
  return {
    get length() { return values.size; }, key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null,
    setItem: jest.fn((key, value) => values.set(key, String(value))),
    removeItem: jest.fn(key => values.delete(key)), clear: jest.fn(() => values.clear()),
    snapshot: () => Object.fromEntries(values)
  };
}
const ok = data => ({ success: true, status: 200, data });
const failed = status => ({ success: false, status, code: status === 401 ? 'UNAUTHENTICATED' : 'UNAVAILABLE' });
const nativeResponse = (status, data) => ({ status, ok: status >= 200 && status < 300, json: async () => data });
const account = extra => ({ id: 'owner', username: 'مستخدم <safe>', balanceCents: '12345', ...extra });
const order = extra => ({ orderId: 'order-1', service: 'Game <safe>', amount: '0.99', charge: 'WRONG',
  chargeCurrency: 'USD', status: 'pending', createdAt: '2026-11-03T08:30:00.000Z', ...extra });
const payment = extra => ({ paymentId: 'payment-1', amount: '25.50', amountInUSD: 'WRONG-USD',
  currency: 'EUR', status: 'completed', createdAt: '2026-11-03T09:30:00.000Z', ...extra });
const product = extra => ({ id: 1, name: 'App <safe>', category: 'apps', price: '1.25', quantity: 1, available: true, ...extra });
const page = (items = [], nextBefore = null) => ({ items, nextBefore });
const settle = () => new Promise(resolve => setImmediate(resolve));
function environment({ me = ok(account()) } = {}) {
  const document = dom(), localStorage = storage();
  const routes = new Map([['/api/users/me', () => me], ['/api/orders', () => ok(page())],
    ['/api/payments', () => ok(page())], ['/api/auth/logout', () => ok({ success: true })]]);
  const catalogs = new Map(['apps', 'games', 'cryptos', 'balances'].map(cat => [`/api/${cat}`, () => nativeResponse(200, [])]));
  // Authenticated reads mock secureFetch envelopes; catalogs mock native Responses ONLY.
  const secureFetch = jest.fn(async (url, options) => {
    const target = new URL(url, 'https://shop.test'), handler = routes.get(target.pathname);
    if (!handler) throw new Error(`Unexpected authenticated request: ${url}`);
    return handler(target, options);
  });
  const fetch = jest.fn(async (url, options) => {
    const target = new URL(url, 'https://shop.test'), handler = catalogs.get(target.pathname);
    if (!handler) throw new Error(`Unexpected native request: ${url}`);
    return handler(target, options);
  });
  const window = { fetch, location: { href: 'https://shop.test/account', origin: 'https://shop.test', replace: jest.fn() } };
  const globals = { document, localStorage, window, fetch, secureFetch, URL, Headers, FormData,
    requestAnimationFrame: fn => fn(), setTimeout, alert: jest.fn(), crypto: { randomUUID: jest.fn() },
    ensureCsrfToken: jest.fn(), CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } } };
  const utils = browser('utils/appUtils.js', ['STORAGE_KEYS', 'getFullPathByCategory'], globals);
  const { PurchaseClient } = browser('utils/purchaseClient.js', ['PurchaseClient'], globals);
  const { DialogPurchase: RealDialog } = browser('dialogs/purchaseDialog.js', ['DialogPurchase'], { ...globals, ...utils, PurchaseClient });
  const DialogPurchase = jest.fn(function (card, options) { return new RealDialog(card, options); });
  const auth = browser('auth.js', ['logout'], { ...globals, ...utils });
  const logout = jest.fn(auth.logout);
  const data = browser('utils/accountData.js', ['assertPageShape', 'fetchCurrentAccount', 'fetchCategory',
    'fetchOrdersPage', 'fetchPaymentsPage', 'normalizeOrder', 'normalizePayment', 'submitPayment', 'fetchSubmissionStatus'], globals);
  const messages = browser('utils/errorMessages.js', ['getErrorMessage'], globals);
  const submission = browser('utils/paymentSubmissionClient.js', ['PAYMENT_METHODS', 'validatePayment', 'PaymentSubmissionClient'], { ...globals, ...data });
  const topup = browser('accountTopup.js', ['mountTopup'], { ...globals, ...messages, ...submission });
  browser('account.js', [], { ...globals, ...data, ...topup, DialogPurchase, logout });
  const e = { document, localStorage, routes, catalogs, secureFetch, fetch, window, data, DialogPurchase, logout,
    node: name => document.getElementById(`account-${name}`),
    calls: endpoint => secureFetch.mock.calls.filter(([url]) => new URL(url, 'https://shop.test').pathname === endpoint),
    async tab(name) { await e.node(`tab-${name}`).click(); await settle(); },
    async category(name) { await document.querySelector(`[data-account-category="${name}"]`).click(); await settle(); }
  };
  return e;
}
async function ready(options) { const e = environment(options); await settle(); return e; }
function expectRedirect(e) { expect(e.window.location.replace).toHaveBeenCalledWith('/login.html'); }
function expectContract(e, name) {
  expect(e.node(`${name}-state`).textContent).toContain('عقد الاستجابة');
  expect(e.node(`${name}-retry`).hidden).toBe(false); expect(e.node(`${name}-more`).hidden).toBe(true);
}

// Seventeen approved cases, with extra assertions for retries, expiry and preservation.
describe('C5e.1a account dashboard (real account.js and accountData.js)', () => {
  test('1 unauthenticated init redirects to login', async () => {
    const e = await ready({ me: failed(401) });
    expect(e.calls('/api/users/me')).toHaveLength(1); expectRedirect(e);
    expect(e.node('shell').hidden).toBe(true); expect(e.node('gate-retry').hidden).toBe(true);
    expect(e.fetch).not.toHaveBeenCalled();
  });

  test('2 authenticated init shows shell and safe username; gate Retry recovers', async () => {
    const e = await ready();
    expect(e.node('shell').hidden).toBe(false); expect(e.document.querySelector('.account-gate').hidden).toBe(true);
    expect(e.node('username').textContent).toBe('مستخدم <safe>'); expect(e.node('username').children).toHaveLength(0);
    expect(e.secureFetch.mock.calls[0]).toEqual(['/api/users/me', { method: 'GET', credentials: 'include', cache: 'no-store' }]);
    expect(e.calls('/api/orders')).toHaveLength(0); expect(e.calls('/api/payments')).toHaveLength(0);
    const retry = await ready({ me: failed(503) });
    expect(retry.node('gate-retry').hidden).toBe(false); expect(retry.node('gate-state').textContent).toContain('تعذر');
    retry.routes.set('/api/users/me', () => ok(account())); await retry.node('gate-retry').click(); await settle();
    expect(retry.node('shell').hidden).toBe(false); expect(retry.calls('/api/users/me')).toHaveLength(2);
  });

  test('3 balanceCents renders exact dollars without numeric conversion, beyond safe integer', async () => {
    for (const [balanceCents, expected] of [['0', '$0.00'], ['1', '$0.01'], ['105', '$1.05'],
      ['12345', '$123.45'], ['900719925474099312345', '$9007199254740993123.45']]) {
      const e = await ready({ me: ok(account({ balanceCents })) });
      expect(e.node('balance').textContent).toBe(expected);
      expect(e.localStorage.setItem).not.toHaveBeenCalled(); expect(e.localStorage.removeItem).not.toHaveBeenCalled();
    }
  });

  test('4 Browse Apps uses native fetch, renders name/price/availability, disables unavailable Buy', async () => {
    const e = await ready();
    e.catalogs.set('/api/apps', () => nativeResponse(200, [product(), product({ id: 2, name: 'Unavailable', available: false })]));
    await e.category('apps');
    expect(e.fetch).toHaveBeenCalledWith('/api/apps', { method: 'GET', credentials: 'include', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' } });
    const cards = e.document.querySelectorAll('.account-card'); expect(cards).toHaveLength(2);
    expect(cards[0].querySelector('.account-card-name').textContent).toBe('App <safe>');
    expect(cards[0].querySelector('.account-card-name').children).toHaveLength(0);
    expect(cards[0].querySelector('.account-card-price').textContent).toBe('1.25');
    expect(cards[0].querySelector('.account-card-availability').textContent).toBe('متوفر');
    expect(cards[1].querySelector('.account-card-availability').textContent).toBe('غير متوفر');
    expect(cards[1].querySelector('button').disabled).toBe(true);
    await cards[1].querySelector('button').click(); expect(e.DialogPurchase).not.toHaveBeenCalled();
    expect(e.calls('/api/apps')).toHaveLength(0);
    await expect(e.data.fetchCategory('unknown')).rejects.toThrow('Unknown category'); expect(e.fetch).toHaveBeenCalledTimes(1);
  });

  test('5 Browse Games uses native fetch and shows first package price', async () => {
    const e = await ready();
    e.catalogs.set('/api/games', () => nativeResponse(200, [product({ category: 'games', name: 'Game', menuPrice: true, price: ['0.99', '5.00'], quantity: [100, 500] })]));
    await e.category('games');
    expect(e.fetch.mock.calls[0][0]).toBe('/api/games'); expect(e.calls('/api/games')).toHaveLength(0);
    expect(e.document.querySelector('.account-card-name').textContent).toBe('Game');
    expect(e.document.querySelector('.account-card-price').textContent).toBe('0.99');
  });

  test('6 Buy opens real DialogPurchase(product, options), creates overlay and makes no POST', async () => {
    const e = await ready(), item = product({ name: 'Actual app' }), before = e.localStorage.snapshot();
    e.catalogs.set('/api/apps', () => nativeResponse(200, [item]));
    await e.category('apps'); await e.document.querySelector('.account-card button').click();
    expect(e.DialogPurchase).toHaveBeenCalledWith(item, { cssPath: '/assets/css/purchase-dialog.css', supportPhone: '+963980217649' });
    expect(e.document.querySelector('.purchase-dialog-overlay')).not.toBeNull();
    expect(e.document.querySelector('.dialog-title').textContent).toBe('Actual app');
    expect(e.document.querySelector('link[href="/assets/css/purchase-dialog.css"]')).not.toBeNull();
    expect(e.fetch.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
    expect(e.secureFetch.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
    expect(e.localStorage.snapshot()).toEqual(before);
  });

  test('7 purchaseConfirmed refreshes balance, selects Orders, reloads page 1, ignores receipt balance', async () => {
    const e = await ready();
    e.routes.set('/api/orders', () => ok(page([order({ orderId: 'old' })], 'old-cursor')));
    await e.tab('orders'); await e.tab('browse');
    e.routes.set('/api/users/me', () => ok(account({ balanceCents: '43210' })));
    e.routes.set('/api/orders', () => ok(page([order({ orderId: 'new' })])));
    await e.document.dispatchEvent({ type: 'purchaseConfirmed', detail: { balance: '0.01', balanceCents: '1', replayed: true } });
    expect(e.calls('/api/users/me')).toHaveLength(2); expect(e.calls('/api/orders')).toHaveLength(2);
    expect(e.calls('/api/orders')[1][0]).toBe('/api/orders?limit=20'); expect(e.node('balance').textContent).toBe('$432.10');
    expect(e.node('tab-orders').getAttribute('aria-pressed')).toBe('true');
    expect(e.node('panel-orders').hidden).toBe(false); expect(e.node('panel-browse').hidden).toBe(true);
    expect(e.node('orders-body').children).toHaveLength(1); expect(e.node('orders-body').textContent).toContain('new');
    expect(e.node('orders-body').textContent).not.toContain('old');
    e.routes.set('/api/users/me', () => failed(401));
    await e.document.dispatchEvent({ type: 'purchaseConfirmed', detail: { balance: '9999.99' } });
    expectRedirect(e); expect(e.calls('/api/orders')).toHaveLength(2); expect(e.node('balance').textContent).toBe('$432.10');
  });

  test('8 Orders has limit, no userId, renders approved fields, lazy-fetches only once', async () => {
    const e = await ready(), item = order(); e.routes.set('/api/orders', () => ok(page([item])));
    await e.tab('orders'); expect(e.calls('/api/orders')[0][0]).toBe('/api/orders?limit=20');
    expect(e.node('orders-body').children[0].children.map(cell => cell.textContent))
      .toEqual(['order-1', 'Game <safe>', 'USD 0.99', 'قيد التنفيذ', new Date(item.createdAt).toLocaleString('ar')]);
    await e.tab('browse'); await e.tab('orders'); expect(e.calls('/api/orders')).toHaveLength(1);
    const expired = await ready(); expired.routes.set('/api/orders', () => failed(401)); await expired.tab('orders');
    expectRedirect(expired); expect(expired.node('orders-retry').hidden).toBe(true);
  });

  test('9 Orders Load more passes encoded cursor, appends rows, suppresses duplicate clicks', async () => {
    const e = await ready(), cursor = 'cursor+/= &'; let release;
    e.routes.set('/api/orders', url => url.searchParams.has('before')
      ? new Promise(resolve => { release = resolve; }) : ok(page([order()], cursor)));
    await e.tab('orders'); expect(e.node('orders-more').hidden).toBe(false); await e.node('orders-more').click();
    // Bypass disabled button with a programmatic event to exercise the in-flight guard.
    await e.node('orders-more').dispatchEvent({ type: 'click' }); await settle();
    expect(e.calls('/api/orders')).toHaveLength(2); expect(e.node('orders-more').disabled).toBe(true);
    expect(e.calls('/api/orders')[1][0]).toBe(`/api/orders?limit=20&before=${encodeURIComponent(cursor)}`);
    release(ok(page([order({ orderId: 'order-2', status: 'cancelled' })]))); await settle();
    expect(e.node('orders-body').children).toHaveLength(2); expect(e.node('orders-body').textContent).toContain('ملغى');
    expect(e.node('orders-more').hidden).toBe(true); expect(e.node('orders-more').disabled).toBe(false);
  });

  test('10a Payments renders amount not amountInUSD, lazy pagination and expiry redirect', async () => {
    const e = await ready(), item = payment(); let release;
    e.routes.set('/api/payments', url => url.searchParams.has('before')
      ? new Promise(resolve => { release = resolve; }) : ok(page([item], 'payment-cursor')));
    await e.tab('payments'); expect(e.calls('/api/payments')[0][0]).toBe('/api/payments?limit=20');
    expect(e.node('payments-body').children[0].children.map(cell => cell.textContent))
      .toEqual(['payment-1', 'EUR 25.50', 'مكتمل', new Date(item.createdAt).toLocaleString('ar')]);
    expect(e.node('payments-body').textContent).not.toContain('WRONG-USD');
    await e.tab('browse'); await e.tab('payments'); expect(e.calls('/api/payments')).toHaveLength(1);
    await e.node('payments-more').click(); await e.node('payments-more').dispatchEvent({ type: 'click' }); await settle();
    expect(e.calls('/api/payments')).toHaveLength(2); expect(e.node('payments-more').disabled).toBe(true);
    expect(e.calls('/api/payments')[1][0]).toBe('/api/payments?limit=20&before=payment-cursor');
    release(ok(page([payment({ paymentId: 'payment-2', status: 'unknown' })]))); await settle();
    expect(e.node('payments-body').children).toHaveLength(2); expect(e.node('payments-body').textContent).toContain('غير معروف');
    expect(e.node('payments-more').hidden).toBe(true);
    const expired = await ready(); expired.routes.set('/api/payments', () => failed(401)); await expired.tab('payments');
    expectRedirect(expired); expect(expired.node('payments-retry').hidden).toBe(true);
  });

  test('10b Payments malformed array shows contract error and Retry, never empty success', async () => {
    const e = await ready(); e.routes.set('/api/payments', () => ok([])); await e.tab('payments');
    expectContract(e, 'payments'); expect(e.node('payments-state').textContent).not.toContain('لا توجد مدفوعات بعد');
    e.routes.set('/api/payments', () => ok(page())); await e.node('payments-retry').click(); await settle();
    expect(e.calls('/api/payments')[1][0]).toBe('/api/payments?limit=20');
    expect(e.node('payments-state').textContent).toBe('لا توجد مدفوعات بعد'); expect(e.node('payments-more').hidden).toBe(true);
  });

  test('11 real logout clears auth only and redirects; failure preserves storage and shows error', async () => {
    const e = await ready(), before = e.localStorage.snapshot(); await e.node('logout').click();
    expect(e.logout).toHaveBeenCalledTimes(1); expectRedirect(e);
    expect(e.secureFetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
    for (const key of AUTH_KEYS) expect(e.localStorage.getItem(key)).toBeNull();
    expect(e.localStorage.removeItem.mock.calls.map(([key]) => key).sort()).toEqual([...AUTH_KEYS].sort());
    expect(e.localStorage.getItem(PURCHASE_KEY)).toBe(before[PURCHASE_KEY]);
    expect(e.localStorage.getItem(DECISION_KEY)).toBe(before[DECISION_KEY]);
    expect(e.localStorage.clear).not.toHaveBeenCalled(); expect(e.localStorage.setItem).not.toHaveBeenCalled();
    const refused = await ready(), saved = refused.localStorage.snapshot();
    refused.routes.set('/api/auth/logout', () => failed(503)); await refused.node('logout').click();
    expect(refused.window.location.replace).not.toHaveBeenCalled(); expect(refused.localStorage.snapshot()).toEqual(saved);
    expect(refused.node('message').textContent).toContain('تعذر تسجيل الخروج');
    expect(refused.node('message').dataset.kind).toBe('error'); expect(refused.node('logout').disabled).toBe(false);
  });

  test('12 Top-up contains submission form with no extra fetch', async () => {
    const e = await ready(); await e.tab('topup');
    expect(e.node('panel-topup').hidden).toBe(false);
    const form = e.node('panel-topup').querySelector('form');
    expect(form).not.toBeNull(); expect(form.querySelector('select')).not.toBeNull();
    expect(form.querySelector('#account-topup-amount')).not.toBeNull();
    expect(form.querySelector('input[type="file"]')).not.toBeNull();
    expect(form.querySelector('button[type="submit"]')).not.toBeNull(); expect(e.secureFetch).toHaveBeenCalledTimes(1);
    expect(e.fetch).not.toHaveBeenCalled();
    for (const name of ['browse', 'orders', 'payments', 'settings']) {
      expect(e.node(`panel-${name}`).hidden).toBe(true); expect(e.node(`tab-${name}`).getAttribute('aria-pressed')).toBe('false');
    }
  });

  test('13 Settings is Coming soon with no mutation or form', async () => {
    const e = await ready(), before = e.localStorage.snapshot(); await e.tab('settings');
    expect(e.node('panel-settings').hidden).toBe(false); expect(e.node('panel-settings').textContent).toContain('Coming soon');
    expect(e.node('panel-settings').querySelector('form')).toBeNull(); expect(e.localStorage.snapshot()).toEqual(before);
    expect(e.secureFetch).toHaveBeenCalledTimes(1); expect(e.fetch).not.toHaveBeenCalled();
  });

  test('14 native catalog failure shows Retry; retry recovers, catalog 401 redirects', async () => {
    const e = await ready(); e.catalogs.set('/api/apps', () => nativeResponse(500, {})); await e.category('apps');
    expect(e.node('catalog-state').textContent).toContain('تعذر'); expect(e.node('catalog-retry').hidden).toBe(false);
    expect(e.node('products').children).toHaveLength(0);
    e.catalogs.set('/api/apps', () => nativeResponse(200, [product()])); await e.node('catalog-retry').click(); await settle();
    expect(e.fetch).toHaveBeenCalledTimes(2); expect(e.node('products').children).toHaveLength(1);
    expect(e.node('catalog-retry').hidden).toBe(true); expect(e.calls('/api/apps')).toHaveLength(0);
    e.catalogs.set('/api/games', () => nativeResponse(200, {})); await e.category('games');
    expect(e.node('catalog-state').textContent).toContain('عقد الاستجابة'); expect(e.node('catalog-retry').hidden).toBe(false);
    e.catalogs.set('/api/cryptos', () => nativeResponse(401, {})); await e.category('cryptos');
    expectRedirect(e); expect(e.node('catalog-retry').hidden).toBe(true);
  });

  test('15a Orders valid empty page shows empty message and no Load more', async () => {
    const e = await ready(); await e.tab('orders');
    expect(e.node('orders-state').textContent).toBe('لا توجد طلبات بعد');
    expect(e.node('orders-more').hidden).toBe(true); expect(e.node('orders-retry').hidden).toBe(true);
    expect(e.node('orders-body').children).toHaveLength(0);
  });

  test('15b Orders malformed shows contract error and Retry reloads page 1', async () => {
    const e = await ready(); e.routes.set('/api/orders', () => ok([])); await e.tab('orders');
    expectContract(e, 'orders'); expect(e.node('orders-state').textContent).not.toContain('لا توجد طلبات بعد');
    for (const malformed of [null, [], {}, { items: [] }, { items: {}, nextBefore: null }, { items: [], nextBefore: 42 }]) {
      expect(() => e.data.assertPageShape(malformed, 'Orders')).toThrow();
    }
    e.routes.set('/api/orders', () => ok(page([order({ status: 'completed' })])));
    await e.node('orders-retry').click(); await settle();
    expect(e.calls('/api/orders')[1][0]).toBe('/api/orders?limit=20');
    expect(e.node('orders-body').textContent).toContain('مكتمل'); expect(e.node('orders-retry').hidden).toBe(true);
    expect(e.node('orders-body').textContent).not.toContain('WRONG');
  });
});
