'use strict';
const { createBrowserLogout, response } = require('./helpers/browserLogout');

const AUTH_KEYS = ['userId', 'userToken', 'customSessionId', 'user_id', 'user_token', 'authToken'];
const PURCHASE_KEY = 'purchase-intent-v1:userA:games:1';
const DECISION_KEY = 'order-decision-v1:userA:ord-abc';
const input = { category: 'games', productId: 1, packageIndex: 0, fulfillmentTarget: { playerId: 'Player_123' } };
// Deliberate whitespace proves byte-for-byte preservation, not save/parse/restore.
const PURCHASE = JSON.stringify({ payload: { ...input, idempotencyKey: 'purchase-original' }, unknown: true }, null, 2);
const DECISION = JSON.stringify({ orderId: 'ord-abc', action: 'reject', payload: { reason: 'Verified cancellation', idempotencyKey: 'decision-original' } }, null, 2);
const initialStorage = () => ({ userId: 'userA', userToken: 'retryable-token-123456789',
  customSessionId: 'retryable-session', user_id: 'legacy-user', user_token: 'legacy-token', authToken: 'legacy-analytics-token',
  [PURCHASE_KEY]: PURCHASE, [DECISION_KEY]: DECISION,
  theme: 'night', activeTab: 'orders', top4cryptoshop_activeTab: 'games', unrelated: 'keep-me', balance: '99.01' });
const logoutCalls = browser => browser.fetch.mock.calls.filter(([url]) => new URL(url, 'http://localhost').pathname === '/api/auth/logout');

describe('Actual UserManager logout preserves financial recovery storage', () => {
  let browser;
  beforeEach(() => { browser = createBrowserLogout({ initialStorage: initialStorage() }); });

  test('successful logout removes exactly the six auth-owned keys; keeps user reset, toast and redirect', async () => {
    await browser.manager._handleLogout();
    expect(logoutCalls(browser)).toHaveLength(1);
    expect(await browser.logout.mock.results[0].value).toMatchObject({ success: true });
    expect(browser.localStorage.removeItem.mock.calls.map(([key]) => key).sort()).toEqual([...AUTH_KEYS].sort());
    for (const key of AUTH_KEYS) expect(browser.localStorage.getItem(key)).toBeNull();
    expect(browser.localStorage.clear).not.toHaveBeenCalled();
    expect(browser.manager.getUser()).toEqual({});
    expect(browser.showToast).toHaveBeenLastCalledWith('Logged out', 'success');
    expect(browser.setTimeout).toHaveBeenCalledWith(expect.any(Function), 100);
    browser.runRedirects(); expect(browser.window.location.replace).toHaveBeenCalledWith('/logout.html');
  });

  test('auth.logout itself removes authToken as part of the six-key allowlist', async () => {
    await browser.auth.logout();
    expect(browser.localStorage.getItem('authToken')).toBeNull();
    expect(browser.localStorage.snapshot()).toEqual(Object.fromEntries(Object.entries(initialStorage()).filter(([key]) => !AUTH_KEYS.includes(key))));
  });

  test('successful logout preserves purchase-intent-v1:userA:games:1 byte-for-byte', async () => {
    await browser.manager._handleLogout(); expect(browser.localStorage.getItem(PURCHASE_KEY)).toBe(PURCHASE);
  });
  test('successful logout preserves order-decision-v1:userA:ord-abc byte-for-byte', async () => {
    await browser.manager._handleLogout(); expect(browser.localStorage.getItem(DECISION_KEY)).toBe(DECISION);
  });

  test.each([401, 403, 503])('failed logout HTTP %s preserves ALL storage, including retryable auth', async status => {
    browser.fetch.mockImplementation(async url => new URL(url, 'http://localhost').pathname === '/api/auth/csrf'
      ? response(200, { success: true, csrfToken: 'a'.repeat(64) })
      : response(status, { success: false, code: 'LOGOUT_REFUSED', error: 'LOGOUT_REFUSED' }));
    const before = browser.localStorage.snapshot(), sessionBefore = browser.sessionStorage.snapshot();
    await browser.manager._handleLogout();
    expect(logoutCalls(browser)).toHaveLength(1);
    expect(browser.localStorage.snapshot()).toEqual(before);
    expect(browser.sessionStorage.snapshot()).toEqual(sessionBefore);
    expect(browser.showToast).toHaveBeenLastCalledWith('LOGOUT_REFUSED', 'error');
    expect(browser.setTimeout).not.toHaveBeenCalled();
  });

  test('network failure preserves ALL storage', async () => {
    browser.fetch.mockImplementation(async url => {
      if (new URL(url, 'http://localhost').pathname === '/api/auth/csrf') return response(200, { success: true, csrfToken: 'a'.repeat(64) });
      throw new Error('Acknowledgment lost');
    });
    const before = browser.localStorage.snapshot(); await browser.manager._handleLogout();
    expect(logoutCalls(browser)).toHaveLength(1); expect(browser.localStorage.snapshot()).toEqual(before);
    expect(browser.sessionStorage.snapshot()).toEqual({ tabState: 'keep-session-state' });
    expect(browser.showToast).toHaveBeenLastCalledWith('NETWORK_ERROR', 'error');
    expect(browser.setTimeout).not.toHaveBeenCalled();
  });

  test('cancelled confirmation dispatches no logout and changes no storage', async () => {
    browser.confirm.mockReturnValue(false);
    const before = browser.localStorage.snapshot(), cookie = browser.document.cookie;
    await browser.manager._handleLogout();
    expect(browser.logout).not.toHaveBeenCalled(); expect(browser.fetch).not.toHaveBeenCalled();
    expect(browser.localStorage.snapshot()).toEqual(before); expect(browser.document.cookie).toBe(cookie);
    expect(browser.sessionStorage.snapshot()).toEqual({ tabState: 'keep-session-state' });
    expect(browser.setTimeout).not.toHaveBeenCalled();
  });

  test('multiple owners actual purchase and decision keys coexist after logout', async () => {
    const keys = ['purchase-intent-v1:ownerA:apps:1', 'purchase-intent-v1:ownerB:apps:1',
      'order-decision-v1:ownerA:ord-abc', 'order-decision-v1:ownerB:ord-abc'];
    for (const key of keys) browser.localStorage.setItem(key, key.startsWith('purchase') ? PURCHASE : DECISION);
    const before = keys.map(key => browser.localStorage.getItem(key));
    await browser.manager._handleLogout(); expect(keys.map(key => browser.localStorage.getItem(key))).toEqual(before);
  });

  test.each([['ownerA_uuid', 'ownerB_uuid'], ['ownerB_uuid', 'ownerA_uuid']])
  ('actual purchase/order loaders as %s cannot see, consume or clear %s intents', async (current, foreign) => {
    const foreignPurchase = `purchase-intent-v1:${foreign}:apps:1`, foreignDecision = `order-decision-v1:${foreign}:ord-abc`;
    const appInput = { category: 'apps', productId: 1, quantity: 1900, fulfillmentTarget: { accountId: 'Acct_123' } };
    const foreignRaw = JSON.stringify({ payload: { ...appInput, idempotencyKey: 'purchase-foreign' }, unknown: true });
    browser.localStorage.setItem(foreignPurchase, foreignRaw); browser.localStorage.setItem(foreignDecision, DECISION);
    browser.localStorage.setItem('userId', current);
    browser.fetch.mockImplementation(async (url, options) => {
      if (url === '/api/auth/session-info') return response(200, { isAuthenticated: true, userId: current });
      const payload = JSON.parse(options.body);
      expect(payload.idempotencyKey).not.toMatch(/foreign|original/);
      return response(200, { success: true, replayed: false });
    });
    const purchases = new browser.PurchaseClient(), orders = new browser.OrderClient();
    expect(purchases.pending(current, 'apps', 1)).toBeNull();
    expect(purchases.pendingPurchases(current)).toEqual([]); expect(orders.pendingDecisions(current)).toEqual([]);
    expect(purchases.pendingPurchases(foreign)).toHaveLength(1); expect(orders.pendingDecisions(foreign)).toHaveLength(1);
    await purchases.purchase(appInput); await orders.decide('ord-abc', 'reject', 'New owner decision');
    expect(browser.localStorage.getItem(foreignPurchase)).toBe(foreignRaw); expect(browser.localStorage.getItem(foreignDecision)).toBe(DECISION);
    expect(purchases.pendingPurchases(current)).toEqual([]); expect(orders.pendingDecisions(current)).toEqual([]);
  });

  test.each(['theme', 'activeTab', 'top4cryptoshop_activeTab', 'unrelated', 'balance'])
  ('successful logout preserves non-auth key %s', async key => {
    const before = browser.localStorage.getItem(key); await browser.manager._handleLogout(); expect(browser.localStorage.getItem(key)).toBe(before);
  });
  test('successful logout preserves sessionStorage', async () => {
    const before = browser.sessionStorage.snapshot(); await browser.manager._handleLogout(); expect(browser.sessionStorage.snapshot()).toEqual(before);
    expect(browser.sessionStorage.clear).not.toHaveBeenCalled();
  });
  test('logout never writes or deletes document.cookie', async () => {
    const before = browser.document.cookie; await browser.manager._handleLogout();
    expect(browser.cookieWrites).not.toHaveBeenCalled(); expect(browser.document.cookie).toBe(before);
  });
  test('logout never enumerates or deletes IndexedDB', async () => {
    await browser.manager._handleLogout(); expect(browser.indexedDB.databases).not.toHaveBeenCalled(); expect(browser.indexedDB.deleteDatabase).not.toHaveBeenCalled();
  });
});
