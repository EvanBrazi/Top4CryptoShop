'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Execute the real browser modules. Adapt only ESM syntax for CommonJS Jest;
// auth, CSRF transport, storage cleanup and financial intent loaders stay real.
function browserModule(file, names, globals) {
  const source = fs.readFileSync(path.join(__dirname, '../../../frontend/public/assets/js', file), 'utf8')
    .replace(/^import .*;\s*$/gm, '')
    .replace(/^export default .*;\s*$/gm, '')
    .replace(/\bexport (const |class |async function |function )/g, '$1');
  return vm.runInNewContext(`${source}\n({ ${names.join(', ')} })`, globals, { filename: file });
}

function storage(initial = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, String(value)]));
  return {
    get length() { return values.size; },
    key: index => [...values.keys()][index] ?? null,
    getItem: jest.fn(key => values.get(key) ?? null),
    setItem: jest.fn((key, value) => values.set(key, String(value))),
    removeItem: jest.fn(key => values.delete(key)),
    clear: jest.fn(() => values.clear()),
    snapshot: () => Object.fromEntries(values)
  };
}

const CSRF = 'a'.repeat(64);
function response(status, body) {
  return { status, ok: status >= 200 && status < 300,
    json: async () => body, text: async () => JSON.stringify(body) };
}

function createBrowserLogout({ initialStorage = {}, fetcher, confirmed = true } = {}) {
  const localStorage = storage(initialStorage), sessionStorage = storage({ tabState: 'keep-session-state' });
  const jar = new Map([['x-csrf-token', CSRF], ['preference', 'keep-cookie']]);
  const cookieWrites = jest.fn(), document = { dispatchEvent: jest.fn() };
  Object.defineProperty(document, 'cookie', {
    get: () => [...jar].map(([key, value]) => `${key}=${value}`).join('; '),
    set: value => {
      cookieWrites(value);
      const part = value.split(';')[0], index = part.indexOf('=');
      const key = part.slice(0, index), content = part.slice(index + 1);
      if (/expires=Thu, 01 Jan 1970/i.test(value)) jar.delete(key);
      else jar.set(key, content);
    }
  });
  // Server Set-Cookie is browser-managed, not a document.cookie write.
  function receiveCookies(headers = []) {
    for (const value of headers) {
      if (/;\s*HttpOnly(?:;|$)/i.test(value)) continue;
      const part = value.split(';')[0], index = part.indexOf('=');
      const key = part.slice(0, index), content = part.slice(index + 1);
      if (!content) jar.delete(key); else jar.set(key, content);
    }
  }
  const fetch = jest.fn(fetcher || (async url => new URL(url, 'http://localhost').pathname === '/api/auth/csrf'
    ? response(200, { success: true, csrfToken: jar.get('x-csrf-token') })
    : response(200, { success: true, message: 'Logged out' })));
  const window = { location: { href: 'http://localhost/dashboard.html', origin: 'http://localhost', replace: jest.fn() } };
  const indexedDB = { databases: jest.fn(async () => [{ name: 'keep-db' }]), deleteDatabase: jest.fn() };
  const showToast = jest.fn(), confirm = jest.fn(() => confirmed), timers = [];
  const setTimeout = jest.fn((fn, delay) => { timers.push(fn); return timers.length; });
  const globals = { localStorage, sessionStorage, document, window, indexedDB, fetch,
    URL, Headers, FormData, showToast, confirm, setTimeout,
    crypto: { randomUUID: () => 'logout-browser-uuid' },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } } };
  const utils = browserModule('utils/appUtils.js', ['STORAGE_KEYS', 'clearBrowserData'], globals);
  const { secureFetch } = browserModule('securefetch.js', ['secureFetch'], globals);
  const auth = browserModule('auth.js', ['logout', 'login'], { ...globals, ...utils, secureFetch });
  const logout = jest.fn(auth.logout);
  const { UserManager } = browserModule('usermanager.js', ['UserManager'], {
    ...globals, ...utils, logout, toggleDBTheme: jest.fn()
  });
  const { PurchaseClient } = browserModule('utils/purchaseClient.js', ['PurchaseClient'], globals);
  const { OrderClient } = browserModule('utils/orderClient.js', ['OrderClient'], { ...globals, PurchaseClient });
  return { manager: UserManager.getInstance(), auth, logout, localStorage, sessionStorage,
    document, cookieWrites, receiveCookies, indexedDB, fetch, confirm, showToast, setTimeout, window,
    runRedirects: () => timers.splice(0).forEach(fn => fn()), PurchaseClient, OrderClient };
}

module.exports = { createBrowserLogout, response, CSRF };
