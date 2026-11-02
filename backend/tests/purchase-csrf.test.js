'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const JS = path.join(__dirname, '../../frontend/public/assets/js');
const TOKEN = 'a'.repeat(64), OWNER = 'owner-A';
// Execute real browser sources; adapt ESM syntax only. One transport instance per page.
function browser(file, names, globals) {
  const source = fs.readFileSync(path.join(JS, file), 'utf8')
    .replace(/^import .*;.*$/gm, '').replace(/\bexport (const |class |async function |function )/g, '$1');
  return vm.runInNewContext(`${source}\n({ ${names.join(', ')} })`, globals, { filename: file });
}
function storage() {
  const values = new Map([['userId', OWNER], ['userToken', 'token-A'], ['customSessionId', 'session-A'], ['balance', '250.00']]);
  return { get length() { return values.size; }, key: i => [...values.keys()][i] ?? null,
    getItem: key => values.get(key) ?? null,
    setItem: jest.fn((key, value) => values.set(key, String(value))), removeItem: jest.fn(key => values.delete(key)) };
}
const input = extra => ({ category: 'games', productId: 1, packageIndex: 0, fulfillmentTarget: { playerId: 'Player_123' }, ...extra });
const receipt = extra => ({ success: true, orderId: 'order-1', charge: '0.99', balance: '249.01', replayed: false, ...extra });
const response = (status, body, text = JSON.stringify(body)) => ({ status, ok: status >= 200 && status < 300,
  json: async () => body, text: async () => text });
function page(present = false) {
  const e = { storage: storage(), cookie: present ? TOKEN : '', serverOwner: OWNER };
  const document = { get cookie() { return e.cookie ? `x-csrf-token=${e.cookie}` : ''; }, dispatchEvent: jest.fn() };
  e.bootstrap = async () => { e.cookie = TOKEN; return response(200, { success: true, csrfToken: TOKEN }); };
  e.post = async () => response(201, receipt());
  e.fetcher = jest.fn(async (url, options = {}) => {
    const pathname = new URL(url, 'https://shop.test').pathname;
    if (pathname === '/api/auth/csrf') return e.bootstrap(options);
    if (pathname === '/api/auth/session-info') return response(200, { isAuthenticated: true, userId: e.serverOwner });
    if (pathname === '/api/orders/purchase') return e.post(options);
    if (pathname === '/api/test-mutation') return response(200, { success: true });
    throw new Error('Unexpected request');
  });
  let sequence = 0;
  e.uuid = jest.fn(() => `uuid-${++sequence}`);
  const globals = { document, localStorage: e.storage, fetch: e.fetcher, URL, Headers, FormData,
    window: { location: { href: 'https://shop.test/homepage.html', origin: 'https://shop.test' } },
    crypto: { randomUUID: e.uuid }, alert: jest.fn(),
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } } };
  const messages = browser('utils/errorMessages.js', ['getErrorMessage'], globals);
  const transport = browser('securefetch.js', ['secureFetch', 'ensureCsrfToken'], { ...globals, ...messages });
  // PurchaseClient receives the exact helper closure used by secureFetch, not a stub.
  const { PurchaseClient } = browser('utils/purchaseClient.js', ['PurchaseClient'], { ...globals, ...transport });
  const { DialogPurchase } = browser('dialogs/purchaseDialog.js', ['DialogPurchase'], { ...globals, PurchaseClient });
  e.client = new PurchaseClient({ storage: e.storage, fetcher: e.fetcher, uuid: e.uuid });
  e.newClient = () => new PurchaseClient({ storage: e.storage, fetcher: e.fetcher, uuid: e.uuid });
  e.transport = transport; e.document = document; e.DialogPurchase = DialogPurchase;
  e.calls = endpoint => e.fetcher.mock.calls.filter(([url]) => new URL(url, 'https://shop.test').pathname === endpoint);
  e.key = e.client.key(OWNER, 'games', 1);
  return e;
}
function seed(e, unknown = true) {
  const raw = JSON.stringify({ payload: { ...input(), idempotencyKey: 'purchase-original' }, unknown });
  e.storage.setItem(e.key, raw); e.storage.setItem.mockClear(); e.storage.removeItem.mockClear();
  return raw;
}
function noDispatch(e) {
  expect(e.calls('/api/orders/purchase')).toHaveLength(0);
  expect(e.uuid).not.toHaveBeenCalled(); expect(e.storage.setItem).not.toHaveBeenCalled();
  expect(e.storage.removeItem).not.toHaveBeenCalled();
}
async function bootstrapFailure(e, code = 'CSRF_BOOTSTRAP_FAILED') {
  await expect(e.client.purchase(input())).rejects.toMatchObject({ code });
  expect(e.calls('/api/auth/csrf')).toHaveLength(1); noDispatch(e);
}
async function settle() { for (let i = 0; i < 16; i++) await Promise.resolve(); }

describe('Purchase CSRF: five preserved behaviors (green before and after integration)', () => {
  test('P01 existing cookie fast path: no bootstrap, exact one POST with persistence before dispatch', async () => {
    const e = page(true);
    e.post = async options => {
      expect(options).toMatchObject({ method: 'POST', credentials: 'include', headers: {
        Authorization: 'Bearer token-A', 'x-session-id': 'session-A', 'x-csrf-token': TOKEN } });
      expect(JSON.parse(e.storage.getItem(e.key))).toEqual({ payload: { ...input(), idempotencyKey: 'purchase-uuid-1' }, unknown: true });
      return response(201, receipt());
    };
    await e.client.purchase(input());
    expect(e.fetcher.mock.calls.map(([url]) => url)).toEqual(['/api/auth/session-info', '/api/orders/purchase']);
    expect(e.uuid).toHaveBeenCalledTimes(1);
  });
  test('P02 existing saved intent succeeds with original key and no UUID generation', async () => {
    const e = page(true); seed(e); e.post = async () => response(200, receipt({ replayed: true }));
    const result = await e.client.purchase(input());
    expect(result.replayed).toBe(true); expect(e.uuid).not.toHaveBeenCalled();
    expect(JSON.parse(e.calls('/api/orders/purchase')[0][1].body)).toEqual({ ...input(), idempotencyKey: 'purchase-original' });
    expect(e.calls('/api/auth/csrf')).toHaveLength(0);
  });
  test('P03 owner B cannot see, use or clear owner A saved intent', async () => {
    const e = page(true), original = seed(e);
    e.storage.setItem('userId', 'owner-B'); e.storage.setItem('userToken', 'token-B');
    e.storage.setItem('customSessionId', 'session-B'); e.serverOwner = 'owner-B';
    expect(e.client.pendingPurchases('owner-B')).toEqual([]);
    await e.client.purchase(input(), 'owner-B');
    expect(e.storage.getItem(e.key)).toBe(original);
    expect(JSON.parse(e.calls('/api/orders/purchase')[0][1].body).idempotencyKey).toBe('purchase-uuid-1');
    expect(e.client.pendingPurchases('owner-B')).toEqual([]);
  });
  test('P04 actual dialog suppresses a second confirm click while the real client is in flight', async () => {
    const e = page(true), handlers = new Map(), nodes = new Map();
    let finish;
    e.post = () => new Promise(resolve => { finish = resolve; });
    const node = selector => {
      if (!nodes.has(selector)) nodes.set(selector, { value: selector === '#player-id' ? 'Player_123' : '1', selectedIndex: 0,
        classList: { add() {}, remove() {} }, addEventListener: (event, handler) => handlers.set(`${selector}:${event}`, handler) });
      return nodes.get(selector);
    };
    const dialog = Object.create(e.DialogPurchase.prototype);
    Object.assign(dialog, { overlay: { querySelector: node, querySelectorAll: () => [] },
      card: { id: 1, requiresFulfillmentTarget: true, fulfillmentSchema: 'playerId' }, cardMenuPrice: true,
      category: 'games', userId: OWNER, purchaseClient: e.client, _validateInputs: () => true, close: jest.fn() });
    const purchase = jest.spyOn(e.client, 'purchase');
    dialog._setupDialogEvents(); const click = handlers.get('.confirm-btn:click');
    const first = click(); await click(); await settle();
    expect(purchase).toHaveBeenCalledTimes(1); expect(e.calls('/api/orders/purchase')).toHaveLength(1);
    finish(response(201, receipt())); await first;
    expect(dialog.close).toHaveBeenCalledTimes(1); expect(dialog.purchaseInFlight).toBe(false);
  });
  test('P05 success clears only its intent, emits confirmation and never applies a historical balance', async () => {
    const e = page(true), unrelated = 'purchase-intent-v1:owner-B:games:1';
    e.storage.setItem(unrelated, 'keep-other-owner');
    e.post = async () => response(200, receipt({ replayed: true, balance: '1.00' }));
    const result = await e.client.purchase(input());
    expect(e.storage.getItem(e.key)).toBeNull(); expect(e.storage.getItem(unrelated)).toBe('keep-other-owner');
    expect(e.storage.getItem('balance')).toBe('250.00');
    expect(e.document.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'purchaseConfirmed', detail: result }));
  });
});

describe('Purchase CSRF: fifteen missing-bootstrap behaviors (red before, green after integration)', () => {
  test('B01 missing cookie bootstraps before owner verification and sends the matching token', async () => {
    const e = page();
    e.post = async options => {
      expect(options.headers['x-csrf-token']).toBe(TOKEN);
      expect(JSON.parse(e.storage.getItem(e.key)).unknown).toBe(true);
      return response(201, receipt());
    };
    await e.client.purchase(input());
    expect(e.fetcher.mock.calls.map(([url]) => url)).toEqual(['/api/auth/csrf', '/api/auth/session-info', '/api/orders/purchase']);
    expect(e.calls('/api/auth/csrf')[0][1]).toMatchObject({ method: 'GET', credentials: 'include', redirect: 'error', cache: 'no-store' });
    expect(e.calls('/api/orders/purchase')).toHaveLength(1);
  });
  test('B02 network bootstrap failure creates no new intent, UUID or financial POST', async () => {
    const e = page(); e.bootstrap = async () => { throw new Error('Network unavailable'); };
    await bootstrapFailure(e); expect(e.storage.getItem(e.key)).toBeNull();
  });
  test('B03 network bootstrap failure preserves existing known intent byte-for-byte', async () => {
    const e = page(), original = seed(e, false); e.bootstrap = async () => { throw new Error('Network unavailable'); };
    await bootstrapFailure(e); expect(e.storage.getItem(e.key)).toBe(original);
  });
  test('B04 network bootstrap failure preserves existing unknown intent byte-for-byte', async () => {
    const e = page(), original = seed(e); e.bootstrap = async () => { throw new Error('Network unavailable'); };
    await bootstrapFailure(e); expect(e.storage.getItem(e.key)).toBe(original);
  });
  test('B05 HTTP bootstrap failure stops before intent creation and financial dispatch', async () => {
    const e = page(); e.bootstrap = async () => response(503, { success: false });
    await bootstrapFailure(e);
  });
  test('B06 malformed bootstrap JSON stops before intent creation and financial dispatch', async () => {
    const e = page(); e.bootstrap = async () => response(200, null, '{');
    await bootstrapFailure(e);
  });
  test('B07 invalid bootstrap token stops before intent creation and financial dispatch', async () => {
    const e = page(); e.bootstrap = async () => response(200, { success: true, csrfToken: 'invalid' });
    await bootstrapFailure(e, 'CSRF_COOKIE_UNAVAILABLE');
  });
  test('B08 successful response without the browser cookie cannot dispatch', async () => {
    const e = page(); e.bootstrap = async () => response(200, { success: true, csrfToken: TOKEN });
    await bootstrapFailure(e, 'CSRF_COOKIE_UNAVAILABLE');
  });
  test('B09 mismatched response/cookie cannot dispatch or modify a saved intent', async () => {
    const e = page(), original = seed(e);
    e.bootstrap = async () => { e.cookie = 'b'.repeat(64); return response(200, { success: true, csrfToken: TOKEN }); };
    await bootstrapFailure(e, 'CSRF_COOKIE_UNAVAILABLE'); expect(e.storage.getItem(e.key)).toBe(original);
  });
  test('B10 missing-cookie replay bootstraps and resends exactly the original payload/key', async () => {
    const e = page(); seed(e); e.post = async () => response(200, receipt({ replayed: true }));
    const result = await e.client.purchase(input());
    expect(e.calls('/api/auth/csrf')).toHaveLength(1); expect(e.uuid).not.toHaveBeenCalled();
    expect(JSON.parse(e.calls('/api/orders/purchase')[0][1].body)).toEqual({ ...input(), idempotencyKey: 'purchase-original' });
    expect(e.calls('/api/orders/purchase')[0][1].headers['x-csrf-token']).toBe(TOKEN);
    expect(result.replayed).toBe(true); expect(e.storage.getItem(e.key)).toBeNull();
  });
  test('B11 owner/token/session changes during bootstrap reject before financial dispatch', async () => {
    for (const field of ['userId', 'userToken', 'customSessionId']) {
      const e = page(), original = seed(e);
      e.bootstrap = async () => {
        e.storage.setItem(field, 'changed-account'); e.storage.setItem.mockClear();
        e.cookie = TOKEN; return response(200, { success: true, csrfToken: TOKEN });
      };
      await expect(e.client.purchase(input(), OWNER)).rejects.toThrow('Authentication changed');
      expect(e.calls('/api/auth/csrf')).toHaveLength(1); noDispatch(e);
      expect(e.storage.getItem(e.key)).toBe(original);
    }
  });
  test('B12 server owner changes during bootstrap even with unchanged local auth: reject', async () => {
    const e = page(), original = seed(e);
    e.bootstrap = async () => {
      e.serverOwner = 'owner-B'; e.cookie = TOKEN; return response(200, { success: true, csrfToken: TOKEN });
    };
    await expect(e.client.purchase(input(), OWNER)).rejects.toThrow('Authentication changed');
    expect(e.calls('/api/auth/csrf')).toHaveLength(1); noDispatch(e);
    expect(e.storage.getItem(e.key)).toBe(original);
  });
  test('B13 two clients and secureFetch share one page-local bootstrap before any POST', async () => {
    const e = page(); let release;
    e.bootstrap = async () => {
      await new Promise(resolve => { release = resolve; });
      e.cookie = TOKEN; return response(200, { success: true, csrfToken: TOKEN });
    };
    const finished = Promise.allSettled([e.client.purchase(input()), e.newClient().purchase(input({ productId: 2 })),
      e.transport.secureFetch('/api/test-mutation', { method: 'POST', body: '{}' })]);
    await settle();
    const before = { bootstrap: e.calls('/api/auth/csrf').length, purchases: e.calls('/api/orders/purchase').length,
      mutation: e.calls('/api/test-mutation').length, writes: e.storage.setItem.mock.calls.length };
    release(); const results = await finished;
    expect(before).toEqual({ bootstrap: 1, purchases: 0, mutation: 0, writes: 0 });
    expect(results.every(result => result.status === 'fulfilled')).toBe(true);
    expect(e.calls('/api/auth/csrf')).toHaveLength(1); expect(e.calls('/api/orders/purchase')).toHaveLength(2);
    expect(e.calls('/api/orders/purchase').every(([, options]) => options.headers['x-csrf-token'] === TOKEN)).toBe(true);
    expect(e.calls('/api/test-mutation')[0][1].headers.get('x-csrf-token')).toBe(TOKEN);
  });
  test('B14 failed bootstrap releases promise; explicit retry succeeds; cookie removal reboots with fresh token', async () => {
    const e = page(); e.bootstrap = async () => { throw new Error('Offline'); };
    await bootstrapFailure(e);
    e.bootstrap = async () => { e.cookie = TOKEN; return response(200, { success: true, csrfToken: TOKEN }); };
    await e.client.purchase(input());
    e.cookie = ''; const rotated = 'c'.repeat(64);
    e.bootstrap = async () => { e.cookie = rotated; return response(200, { success: true, csrfToken: rotated }); };
    await e.client.purchase(input({ productId: 2 }));
    expect(e.calls('/api/auth/csrf')).toHaveLength(3); expect(e.calls('/api/orders/purchase')).toHaveLength(2);
    expect(e.calls('/api/orders/purchase')[1][1].headers['x-csrf-token']).toBe(rotated);
  });
  test('B15 bootstrap never causes automatic retry of financial 403, 500 or transport failure', async () => {
    for (const outcome of [403, 500, 'network']) {
      const e = page();
      e.post = async () => {
        if (outcome === 'network') throw new Error('Response lost');
        return response(outcome, { success: false, code: outcome === 403 ? 'CSRF_INVALID' : 'UNAVAILABLE' });
      };
      await expect(e.client.purchase(input())).rejects.toThrow();
      expect(e.calls('/api/auth/csrf')).toHaveLength(1); expect(e.calls('/api/orders/purchase')).toHaveLength(1);
      expect(e.calls('/api/orders/purchase')[0][1].headers['x-csrf-token']).toBe(TOKEN);
      expect(JSON.parse(e.storage.getItem(e.key))).toEqual({ payload: { ...input(), idempotencyKey: 'purchase-uuid-1' }, unknown: true });
    }
  });
});
