'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
// Evaluate actual browser modules with only their import/export syntax adapted to this CommonJS Jest runner.
function browser(file, name, globals = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../../frontend/public/assets/js', file), 'utf8').replace(/^import .*;\s*$/gm, '').replace(/export (class |async function |function )/g, '$1');
  const context = vm.createContext({ ...globals });
  return vm.runInContext(`${source}\n${name}`, context, { filename: file });
}
function storage() {
  const values = new Map([['userId','owner-1'],['userToken','token-1'],['customSessionId','opaque-1'],['balance','250.00']]);
  return { get length() { return values.size; }, key: i => [...values.keys()][i] ?? null, getItem: key => values.get(key) ?? null, setItem: jest.fn((key, value) => values.set(key, String(value))), removeItem: jest.fn(key => values.delete(key)) };
}
const response = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const authenticated = () => response(200, { isAuthenticated: true, userId: 'owner-1' });
const input = () => ({ category: 'games', productId: 1, packageIndex: 0, fulfillmentTarget: { playerId: 'Player_123' } });
const receipt = extra => ({ success: true, orderId: 'ord-test', charge: '0.99', balance: '99.01', replayed: false, ...extra });
describe('Actual browser purchase/decision clients', () => {
  let store, fetcher, client, PurchaseClient, OrderClient, document;
  beforeEach(() => {
    store = storage(); document = { cookie: 'x-csrf-token=csrf%2D1', dispatchEvent: jest.fn() };
    fetcher = jest.fn().mockResolvedValueOnce(authenticated()).mockResolvedValue(response(201, receipt()));
    const globals = { document, localStorage: store, fetch: fetcher, crypto: { randomUUID: () => 'browser-uuid' }, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } } };
    PurchaseClient = browser('utils/purchaseClient.js', 'PurchaseClient', globals);
    OrderClient = browser('utils/orderClient.js', 'OrderClient', { ...globals, PurchaseClient });
    client = new PurchaseClient({ storage: store, fetcher, uuid: () => 'fixed-uuid' });
  });
  test('exact one purchase POST; verified actor; auth/session/CSRF/cookies; persistence before dispatch', async () => {
    fetcher.mockImplementation(async (url, options) => {
      if (url === '/api/auth/session-info') return authenticated();
      expect(store.getItem(client.key('owner-1','games',1))).toContain('purchase-fixed-uuid');
      expect(options).toMatchObject({ method: 'POST', credentials: 'include', headers: { Authorization: 'Bearer token-1', 'x-session-id': 'opaque-1', 'x-csrf-token': 'csrf-1' } });
      expect(JSON.parse(options.body)).toEqual({ ...input(), idempotencyKey: 'purchase-fixed-uuid' }); return response(201, receipt());
    });
    await client.purchase(input()); expect(fetcher.mock.calls.map(call => call[0])).toEqual(['/api/auth/session-info','/api/orders/purchase']); expect(store.getItem(client.key('owner-1','games',1))).toBeNull();
    expect(store.getItem('balance')).toBe('250.00'); expect(document.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'purchaseConfirmed' }));
  });
  test.each(['transport','json'])('unknown %s result retains key across reload', async mode => {
    fetcher.mockReset().mockResolvedValueOnce(authenticated());
    if (mode === 'transport') fetcher.mockRejectedValueOnce(new Error('Network lost'));
    else fetcher.mockResolvedValueOnce({ ok: true, status: 201, json: async () => { throw new Error('Truncated JSON'); } });
    await expect(client.purchase(input())).rejects.toThrow('unknown');
    const nextFetch = jest.fn().mockResolvedValueOnce(authenticated()).mockResolvedValueOnce(response(200, receipt({ replayed: true })));
    const reloaded = new PurchaseClient({ storage: store, fetcher: nextFetch, uuid: () => 'never-used' });
    await reloaded.purchase(input()); expect(JSON.parse(nextFetch.mock.calls[1][1].body).idempotencyKey).toBe('purchase-fixed-uuid'); expect(store.getItem('balance')).toBe('250.00');
  });
  test.each([400,401,403,409,503])('prior unknown attempt is retained on HTTP %s', async status => {
    const key = client.key('owner-1','games',1); store.setItem(key, JSON.stringify({ payload: { ...input(), idempotencyKey: 'original' }, unknown: true }));
    fetcher.mockReset().mockResolvedValueOnce(authenticated()).mockResolvedValueOnce(response(status, { code: status === 409 ? 'INSUFFICIENT_FUNDS' : 'REFUSED' }));
    await expect(client.purchase(input())).rejects.toThrow('unresolved'); expect(JSON.parse(store.getItem(key)).payload.idempotencyKey).toBe('original');
  });
  test.each([400,409])('new definite rejection %s may be corrected', async status => {
    fetcher.mockReset().mockResolvedValueOnce(authenticated()).mockResolvedValueOnce(response(status, { code: status === 409 ? 'INSUFFICIENT_FUNDS' : 'INVALID_FULFILLMENT_TARGET' })); await expect(client.purchase(input())).rejects.toThrow(); expect(client.pending('owner-1','games',1)).toBeNull();
  });
  test.each([{ packageIndex: 1 }, { fulfillmentTarget: { playerId: 'Changed_123' } }])('changed unresolved intent is refused before financial dispatch: %p', async change => {
    store.setItem(client.key('owner-1','games',1), JSON.stringify({ payload: { ...input(), idempotencyKey: 'original' }, unknown: true })); await expect(client.purchase({ ...input(), ...change })).rejects.toThrow('original'); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  test('account switch cannot send the original owner purchase', async () => {
    fetcher.mockReset().mockResolvedValue(response(200, { isAuthenticated: true, userId: 'other' })); await expect(client.purchase(input(), 'owner-1')).rejects.toThrow('original account'); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  test.each(['userId','userToken','customSessionId'])('changing %s during session verification cannot dispatch under a new identity', async field => {
    fetcher.mockReset().mockImplementation(async () => { store.setItem(field, 'changed-account'); return authenticated(); });
    await expect(client.purchase(input(), 'owner-1')).rejects.toThrow('Authentication changed'); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  test('storage failure prevents purchase dispatch', async () => { store.setItem.mockImplementation(() => { throw new Error('Storage unavailable'); }); await expect(client.purchase(input())).rejects.toThrow(); expect(fetcher).toHaveBeenCalledTimes(1); });
  test('saved intents are owner-scoped and recoverable without a catalog card', () => {
    store.setItem(client.key('owner-1','games',999), JSON.stringify({ payload: { ...input(), productId: 999, idempotencyKey: 'deleted-product' }, unknown: true })); store.setItem(client.key('other','games',1), JSON.stringify({ payload: input() })); expect(client.pendingPurchases('owner-1')).toHaveLength(1);
  });
  test('decision persists exact key/reason and retry across reload; cannot change action', async () => {
    const orders = new OrderClient({ storage: store, fetcher, uuid: () => 'decision-key' });
    fetcher.mockReset().mockResolvedValueOnce(authenticated()).mockRejectedValueOnce(new Error('Response lost'));
    await expect(orders.decide('ord-test', 'reject', 'Verified cancellation')).rejects.toThrow('unknown');
    fetcher.mockResolvedValueOnce(authenticated()); await expect(orders.decide('ord-test', 'accept', 'Verified cancellation')).rejects.toThrow('original decision');
    fetcher.mockResolvedValueOnce(authenticated()).mockResolvedValueOnce(response(200, { success: true, status: 'cancelled', replayed: true })); await orders.decide('ord-test', 'reject', 'Verified cancellation');
    const calls = fetcher.mock.calls.filter(call => call[1]?.method === 'PUT'); expect(calls).toHaveLength(2); expect(calls[0][1].body).toBe(calls[1][1].body); expect(JSON.parse(calls[1][1].body)).toEqual({ idempotencyKey: 'decision-decision-key', reason: 'Verified cancellation' }); expect(orders.pendingDecisions('owner-1')).toEqual([]);
  });
  test('HTTP reads carry session credentials and never send owner filters', async () => {
    const orders = new OrderClient({ storage: store, fetcher, uuid: () => 'x' }); await orders.read('/api/orders'); expect(fetcher.mock.calls[0]).toEqual(['/api/orders', expect.objectContaining({ credentials: 'include', cache: 'no-store', headers: expect.objectContaining({ 'x-session-id': 'opaque-1' }) })]);
  });
  test('dialog constructor restores original intent despite current unavailability', () => {
    store.setItem(client.key('owner-1','games',1), JSON.stringify({ payload: { ...input(), idempotencyKey: 'original' }, unknown: true }));
    const DialogPurchase = browser('dialogs/purchaseDialog.js', 'DialogPurchase', { PurchaseClient: class extends PurchaseClient { constructor() { super({ storage: store, fetcher }); } }, localStorage: store, STORAGE_KEYS: { USER_ID: 'userId', USER_TOKEN: 'userToken' }, getFullPathByCategory: () => '/images/', document: { querySelector: () => true } });
    const dialog = new DialogPurchase({ id: 1, category: 'games', available: false, price: [50], quantity: [999], menuPrice: true }); expect(dialog.pendingPurchase).toEqual(input()); expect(dialog.cardAvailable).toBe(true);
  });
  test('dialog restores exact saved selection and target and locks controls', () => {
    const controls = [{ disabled: false }, { disabled: false }], nodes = new Map();
    const node = selector => { if (!nodes.has(selector)) nodes.set(selector, { style: {}, value: '', closest: () => ({ style: {} }) }); return nodes.get(selector); };
    const DialogPurchase = browser('dialogs/purchaseDialog.js', 'DialogPurchase', { PurchaseClient });
    const dialog = Object.create(DialogPurchase.prototype);
    Object.assign(dialog, { overlay: { querySelector: node, querySelectorAll: () => controls }, card: { fulfillmentSchema: 'walletAddress', fulfillmentNetwork: 'bsc-mainnet' }, cardName: 'Changed product', cardPrice: 50, pendingPurchase: { category: 'games', productId: 1, packageIndex: 3, fulfillmentTarget: { playerId: '001_Player' } }, _generateQuantityInput() {} });
    dialog._injectCardData(); expect(node('#player-id').value).toBe('001_Player'); expect(node('.price-select').selectedIndex).toBe(3); expect(controls.every(control => control.disabled)).toBe(true); expect(node('label[for="player-id"]').textContent).not.toContain('bsc-mainnet');
  });
  test('dialog safely displays errors without closing or clearing unresolved intent', async () => {
    const handlers = new Map(), nodes = new Map();
    const node = selector => { if (!nodes.has(selector)) nodes.set(selector, { value: 'Player_123', selectedIndex: 0, classList: { add() {}, remove() {} }, addEventListener: (event, handler) => handlers.set(`${selector}:${event}`, handler) }); return nodes.get(selector); };
    const DialogPurchase = browser('dialogs/purchaseDialog.js', 'DialogPurchase', { PurchaseClient });
    const dialog = Object.create(DialogPurchase.prototype), message = '<img src=x onerror=alert(1)>';
    Object.assign(dialog, { overlay: { querySelector: node, querySelectorAll: () => [] }, card: { id: 1, requiresFulfillmentTarget: true, fulfillmentSchema: 'playerId' }, cardMenuPrice: true, category: 'games', userId: 'owner-1', purchaseClient: { purchase: jest.fn().mockRejectedValue(new Error(message)), pending: () => ({ payload: { ...input(), idempotencyKey: 'original' }, unknown: true }) }, _validateInputs: () => true, _injectCardData: jest.fn(), close: jest.fn() });
    dialog._setupDialogEvents(); await handlers.get('.confirm-btn:click')(); expect(node('.dialog-error').textContent).toBe(message); expect(dialog.close).not.toHaveBeenCalled(); expect(dialog.pendingPurchase).toEqual(input()); expect(dialog._injectCardData).toHaveBeenCalledTimes(1);
  });
  test('owner list and dedicated target rendering use text, never HTML interpolation', async () => {
    const created = [];
    function element() {
      const node = { children: [], dataset: {}, style: {}, classList: { add() {}, remove() {} }, appendChild(child) { this.children.push(child); }, replaceChildren() { this.children = []; }, addEventListener() {}, querySelectorAll() { return []; } };
      Object.defineProperty(node, 'innerHTML', { set(value) { if (value && value.includes('INJECT')) throw new Error('Unsafe HTML'); this.children = []; } }); created.push(node); return node;
    }
    const modal = element(), content = element(), body = element(), close = element(); modal.querySelector = selector => ({ '.modal-content': content, '.modal-body': body, '.orders-close-btn': close })[selector];
    const dom = { createElement: element, getElementById: () => modal, addEventListener() {} };
    const OrdersTab = browser('tabs/orderstab.js', 'OrdersTab', { OrderClient, document: dom, setTimeout: () => 0 });
    const tab = Object.create(OrdersTab.prototype); const target = '<img INJECT src=x onerror=alert(1)>';
    Object.assign(tab, { tbody: element(), orders: [{ orderId: 'INJECT-order', service: target, quantity: 60, charge: '0.99', status: 'pending', createdAt: new Date().toISOString() }], client: { read: jest.fn().mockResolvedValue({ fulfillmentSnapshot: { schema: 'accountId', network: null, target: { accountId: target } } }) } });
    tab.renderOrders(); tab.showDetailsModal(tab.orders[0]); await Promise.resolve();
    expect(tab.client.read).toHaveBeenCalledWith('/api/orders/INJECT-order/fulfillment'); expect(created.some(node => node.textContent === `accountId: ${target}`)).toBe(true); expect(created.some(node => node.textContent === `الخدمة: ${target}`)).toBe(true);
  });
  test('dialog suppresses concurrent confirm clicks and does not send client prices/IDs', async () => {
    const listeners = new Map(), nodes = new Map();
    const node = selector => { if (!nodes.has(selector)) nodes.set(selector, { value: selector === '#player-id' ? 'Player_123' : '60', selectedIndex: 0, classList: { add() {}, remove() {} }, addEventListener: (type, handler) => listeners.set(`${selector}:${type}`, handler) }); return nodes.get(selector); };
    const DialogPurchase = browser('dialogs/purchaseDialog.js', 'DialogPurchase', { PurchaseClient, alert: jest.fn() });
    const dialog = Object.create(DialogPurchase.prototype); let finish;
    Object.assign(dialog, { overlay: { querySelector: node, querySelectorAll: () => [] }, card: { id: 1, requiresFulfillmentTarget: true, fulfillmentSchema: 'playerId' }, cardMenuPrice: true, category: 'games', userId: 'owner-1', purchaseClient: { purchase: jest.fn(() => new Promise(resolve => { finish = resolve; })) }, _validateInputs: () => true, close: jest.fn() });
    dialog._setupDialogEvents(); const confirm = listeners.get('.confirm-btn:click'); const first = confirm(); await confirm(); expect(dialog.purchaseClient.purchase).toHaveBeenCalledTimes(1); expect(dialog.purchaseClient.purchase).toHaveBeenCalledWith(input(), 'owner-1');
    // A failed request is displayed safely and leaves the dialog open.
    dialog.purchaseClient.pending = () => null; finish({ orderId: 'x', charge: '0.99' }); await first; expect(dialog.purchaseInFlight).toBe(false);
  });
});
