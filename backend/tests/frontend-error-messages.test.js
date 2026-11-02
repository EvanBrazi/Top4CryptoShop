'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { load } = require('cheerio');
const { TextEncoder } = require('node:util');
const JS = path.join(__dirname, '../../frontend/public/assets/js');
const HTML = path.join(__dirname, '../../frontend/public');
function browser(file, names, globals = {}) {
  const source = fs.readFileSync(path.join(JS, file), 'utf8')
    .replace(/^import .*;.*$/gm, '').replace(/^export default .*;.*$/gm, '')
    .replace(/\bexport (const |class |async function |function )/g, '$1');
  return vm.runInNewContext(`${source}\n({ ${names.join(', ')} })`, globals, { filename: file });
}
// Cheerio parses actual HTML; this adapter supplies DOM/event APIs, not browser rendering.
function dom(html) {
  const $ = load(html), cache = new Map(), docEvents = new Map();
  const document = { cookie: `x-csrf-token=${'a'.repeat(64)}` };
  function element(node) {
    if (!node) return null;
    if (cache.has(node)) return cache.get(node);
    const q = $(node), events = new Map();
    const el = {
      node, ownerDocument: document, tagName: node.name?.toUpperCase(), style: {}, disabled: false,
      get id() { return q.attr('id') || ''; },
      get className() { return q.attr('class') || ''; }, set className(value) { q.attr('class', value); },
      get type() { return q.attr('type') || ''; }, set type(value) { q.attr('type', value); },
      get hidden() { return q.attr('hidden') !== undefined; },
      set hidden(value) { if (value) q.attr('hidden', ''); else q.removeAttr('hidden'); },
      get value() { return q.val() || ''; }, set value(value) { q.val(value); },
      get textContent() { return q.text(); }, set textContent(value) { q.text(value); },
      get innerHTML() { throw new Error('HTML access is forbidden in these error tests'); },
      set innerHTML(value) { throw new Error(`HTML write is forbidden: ${value}`); },
      getAttribute: name => q.attr(name) ?? null,
      setAttribute: (name, value) => q.attr(name, String(value)),
      removeAttribute: name => q.removeAttr(name),
      querySelector: selector => element(q.find(selector)[0]),
      querySelectorAll: selector => q.find(selector).toArray().map(element),
      closest: selector => element(q.closest(selector)[0]),
      contains: child => child === el || q.find('*').toArray().includes(child?.node),
      prepend: child => q.prepend(child.node), appendChild: child => q.append(child.node),
      remove: () => q.remove(),
      addEventListener(type, fn) { if (!events.has(type)) events.set(type, new Set()); events.get(type).add(fn); },
      removeEventListener(type, fn) { events.get(type)?.delete(fn); },
      async fire(type, extra = {}) {
        const event = { type, target: el, preventDefault: jest.fn(), ...extra };
        for (const fn of [...(events.get(type) || [])]) await fn(event);
        return event;
      },
      listenerCount: type => events.get(type)?.size || 0,
      selectionStart: 0, selectionEnd: 0, selectionDirection: 'none'
    };
    el.setSelectionRange = jest.fn((start, end, direction) => {
      el.selectionStart = start; el.selectionEnd = end; el.selectionDirection = direction;
    });
    el.classList = { add: name => q.addClass(name), remove: name => q.removeClass(name),
      contains: name => q.hasClass(name), toggle: (name, state) => q.toggleClass(name, state) };
    cache.set(node, el); return el;
  }
  document.getElementById = id => element($('[id]').toArray().find(node => $(node).attr('id') === id));
  document.querySelectorAll = selector => $(selector).toArray().map(element);
  document.querySelector = selector => element($(selector)[0]);
  document.createElement = tag => element($(`<${tag}></${tag}>`)[0]);
  document.contains = el => $('*').toArray().includes(el?.node);
  document.addEventListener = (type, fn) => {
    if (!docEvents.has(type)) docEvents.set(type, new Set()); docEvents.get(type).add(fn);
  };
  document.fire = async type => { for (const fn of docEvents.get(type) || []) await fn(); };
  document.body = element($('body')[0]); document.head = element($('head')[0]);
  return document;
}
const response = (status, body) => ({ status, ok: status >= 200 && status < 300,
  text: async () => JSON.stringify(body) });
function environment(page = 'register.html', fetcher) {
  const document = dom(fs.readFileSync(path.join(HTML, page), 'utf8'));
  const values = new Map(), localStorage = { getItem: key => values.get(key) ?? null,
    setItem: jest.fn((key, value) => values.set(key, String(value))) };
  const window = { location: { href: `http://localhost/${page}`, origin: 'http://localhost' },
    Swal: { fire: jest.fn() } };
  const fetch = jest.fn(fetcher || (async url => String(url).endsWith('/api/auth/csrf')
    ? response(200, { success: true, csrfToken: 'a'.repeat(64) })
    : response(201, { success: true, user: { id: 'new-user', role: 'user' } })));
  const console = { error: jest.fn(), warn: jest.fn(), log: jest.fn() };
  const globals = { document, window, localStorage, fetch, console, TextEncoder, URL, Headers, FormData,
    setTimeout, clearTimeout, Swal: window.Swal, alert: jest.fn() };
  const messages = browser('utils/errorMessages.js', ['getErrorMessage', 'getErrorField', 'ERROR_MESSAGES', 'SUPPORT', 'GENERIC_ERROR_MESSAGE']);
  const ux = browser('utils/formUX.js', ['bindPasswordToggle', 'bindPasswordToggles', 'validatePasswordConfirmation', 'bindDebouncedValidation', 'attachFieldFeedback'], globals);
  const { STORAGE_KEYS } = browser('utils/appUtils.js', ['STORAGE_KEYS'], globals);
  const { secureFetch } = browser('securefetch.js', ['secureFetch'], { ...globals, ...messages });
  const auth = browser('auth.js', ['login', 'register'], { ...globals, STORAGE_KEYS, secureFetch });
  return { ...globals, ...messages, ...ux, ...auth, secureFetch, STORAGE_KEYS,
    start: (overrides = {}) => browser(page === 'login.html' ? 'login.js' : 'register.js', [],
      { ...globals, ...messages, ...ux, ...auth, secureFetch, STORAGE_KEYS, ...overrides }) };
}
function fillRegistration(env, overrides = {}) {
  const values = { username: 'New_User', password: 'StrongPass1!', confirmPassword: 'StrongPass1!',
    email: 'new@example.com', countryCode: '', phoneNumber: '', ...overrides };
  for (const [id, value] of Object.entries(values)) env.document.getElementById(id).value = value;
}
async function settle() { for (let i = 0; i < 12; i++) await Promise.resolve(); }

const EXPECTED_MESSAGES = [
  ['INVALID_USERNAME', 'اسم المستخدم يجب أن يكون بين 3 و30 حرفًا، باستخدام الحروف الإنجليزية والأرقام والشرطة السفلية'],
  ['INVALID_PASSWORD', 'كلمة المرور يجب أن تكون 8 أحرف على الأقل، وتحتوي على حرف كبير وصغير ورقم ورمز، ولا تتجاوز 72 بايت'],
  ['INVALID_EMAIL', 'صيغة البريد الإلكتروني غير صحيحة'],
  ['INVALID_PHONE', 'يرجى إدخال رقم هاتف صحيح بصيغة دولية'],
  ['USER_USERNAME_TAKEN', 'اسم المستخدم مستخدم بالفعل، جرب اسماً آخر'],
  ['USER_EMAIL_TAKEN', 'البريد الإلكتروني مسجل بالفعل'],
  ['USER_PHONE_TAKEN', 'رقم الهاتف مسجل بالفعل'],
  ['AUTH_FORBIDDEN', 'هذا الحساب معلق مؤقتاً. لطلب إعادة التفعيل، تواصل مع الدعم عبر واتساب: +963980217649'],
  ['CSRF_INVALID', 'انتهت صلاحية الجلسة. يرجى إعادة المحاولة'],
  ['INVALID_LOGIN', 'اسم المستخدم أو كلمة المرور غير صحيحة'],
  ['RATE_LIMIT', 'طلبات كثيرة. يرجى الانتظار قبل المحاولة مجدداً'],
  ['RATE_LIMITED', 'طلبات كثيرة. يرجى الانتظار قبل المحاولة مجدداً'],
  ['AUTH_RATE_LIMITED', 'طلبات كثيرة. يرجى الانتظار قبل المحاولة مجدداً'],
  ['FINANCIAL_RATE_LIMITED', 'طلبات كثيرة. يرجى الانتظار قبل المحاولة مجدداً'],
  ['PRODUCT_UNAVAILABLE', 'المنتج غير متوفر'],
  ['INVALID_PURCHASE_INPUT', 'بيانات الشراء غير صالحة. تحقق من المنتج والكمية'],
  ['NETWORK_ERROR', 'تعذر الاتصال بالخادم. يرجى التحقق من نتيجة العملية قبل إعادة المحاولة'],
  ['MISSING_CREDENTIALS', 'يرجى تسجيل الدخول للمتابعة'],
  ['PAYMENT_ALREADY_DECIDED', 'تم اتخاذ قرار بشأن هذه الدفعة بالفعل'],
  ['IDEMPOTENCY_CONFLICT', 'تعارض في مفتاح العملية. راجع العملية الأصلية ولا تنشئ عملية جديدة'],
  ['INSUFFICIENT_FUNDS', 'الرصيد غير كافٍ لإتمام العملية']
];
const EXPECTED_FIELDS = [
  ['INVALID_USERNAME', 'usernameError'], ['USER_USERNAME_TAKEN', 'usernameError'],
  ['INVALID_EMAIL', 'emailError'], ['USER_EMAIL_TAKEN', 'emailError'],
  ['INVALID_PASSWORD', 'passwordError'], ['INVALID_PHONE', 'phoneError'],
  ['USER_PHONE_TAKEN', 'phoneError'], ['INVALID_LOGIN', 'generalError']
];
describe('Actual frontend error map and integrations (48 cases)', () => {
  let env;
  beforeEach(() => { jest.useFakeTimers(); env = environment(); });
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });
  // 21 independently specified message cases and 8 field cases.
  test.each(EXPECTED_MESSAGES)('%s maps to its exact Arabic message', (code, message) => {
    expect(env.getErrorMessage({ code })).toBe(message); expect(env.getErrorMessage(code)).toBe(message);
    expect(Object.keys(env.ERROR_MESSAGES).sort()).toEqual(EXPECTED_MESSAGES.map(([key]) => key).sort());
  });
  test.each(EXPECTED_FIELDS)('%s routes to field ID %s', (code, field) => {
    expect(env.getErrorField({ code })).toBe(field); expect(field.startsWith('#')).toBe(false);
  });
  // Four fallback/reason/injection cases.
  test('safe fallback, code precedence, legacy error-code input and optional fallback', () => {
    for (const input of [undefined, null, {}, [], 'UNKNOWN', '__proto__', 'constructor', 'toString',
      { message: 'private database failure' }, { error: { secret: 'provider credentials' } }]) {
      expect(env.getErrorMessage(input)).toBe(env.GENERIC_ERROR_MESSAGE);
      expect(env.getErrorField(input)).toBe('generalError');
    }
    expect(env.getErrorMessage({ error: 'INVALID_EMAIL' })).toBe('صيغة البريد الإلكتروني غير صحيحة');
    expect(env.getErrorMessage({ code: 'INVALID_EMAIL', error: 'INVALID_PASSWORD' })).toBe('صيغة البريد الإلكتروني غير صحيحة');
    expect(env.getErrorMessage('UNKNOWN', 'رسالة بديلة آمنة')).toBe('رسالة بديلة آمنة');
    expect(env.getErrorMessage('UNKNOWN', {})).toBe(env.GENERIC_ERROR_MESSAGE);
  });
  test('HTTP 429 takes precedence without countdown or raw text', () => {
    for (const code of ['UNKNOWN', 'INVALID_EMAIL', undefined]) {
      expect(env.getErrorMessage({ status: 429, code, error: '<script>secret</script>' })).toBe('طلبات كثيرة. يرجى الانتظار قبل المحاولة مجدداً');
      expect(env.getErrorField({ status: 429, code })).toBe('generalError');
    }
  });
  test('unavailable purchase reasons do not change code-only generic purchase message', () => {
    for (const reason of ['MIN_CHARGE', 'NOT_FOUND', 'QUANTITY']) {
      expect(Object.hasOwn(env.ERROR_MESSAGES, reason)).toBe(false);
      expect(env.getErrorMessage({ code: 'INVALID_PURCHASE_INPUT', reason })).toBe('بيانات الشراء غير صالحة. تحقق من المنتج والكمية');
    }
  });
  test('SUPPORT is plain text; malicious backend strings and objects never become HTML', async () => {
    expect(env.SUPPORT).toEqual({ whatsapp: '+963980217649', whatsappDigits: '963980217649' });
    const suspended = env.getErrorMessage('AUTH_FORBIDDEN'); expect(suspended).toContain(env.SUPPORT.whatsapp);
    expect(suspended).not.toMatch(/<a|<br|https?:/);
    const malicious = '<img src=x onerror=alert(1)>';
    env = environment('register.html', async url => String(url).endsWith('/csrf')
      ? response(200, { success: true, csrfToken: 'a'.repeat(64) })
      : response(503, { success: false, code: malicious, error: { secret: malicious } }));
    env.start(); fillRegistration(env); await env.document.getElementById('registerForm').fire('submit');
    const general = env.document.getElementById('generalError'); expect(general.textContent).toBe(env.GENERIC_ERROR_MESSAGE);
    expect(general.querySelector('img')).toBeNull(); expect(env.document.querySelectorAll('.toast-notification')[0].textContent).toBe(env.GENERIC_ERROR_MESSAGE);
  });
  // Four real securefetch cases.
  test('structured HTTP failure preserves status/code/error/type/attempts; adds only displayMessage', async () => {
    env = environment('login.html', async () => response(401, { success: false, code: 'INVALID_LOGIN',
      error: 'INVALID_LOGIN', type: 'invalid_credentials', remainingAttempts: 3 }));
    const result = await env.secureFetch('/api/auth/check-session');
    expect(result).toEqual({ success: false, status: 401, code: 'INVALID_LOGIN', error: 'INVALID_LOGIN',
      type: 'invalid_credentials', remainingAttempts: 3, displayMessage: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    expect(env.fetch).toHaveBeenCalledTimes(1);
  });
  test('network failure stays structured and does not retry', async () => {
    env = environment('login.html', async () => { throw new Error('private network details'); });
    const result = await env.secureFetch('/api/auth/check-session');
    expect(result).toMatchObject({ success: false, status: 0, code: 'NETWORK_ERROR', error: 'NETWORK_ERROR', type: 'network_error' });
    expect(result.displayMessage).toBe(env.getErrorMessage('NETWORK_ERROR')); expect(result.displayMessage).not.toContain('private');
    expect(env.fetch).toHaveBeenCalledTimes(1);
  });
  test('malformed response adds safe message and retains INVALID_RESPONSE without retry', async () => {
    env = environment('login.html', async () => ({ status: 200, ok: true, text: async () => '{' }));
    expect(await env.secureFetch('/api/auth/check-session')).toEqual({ success: false, status: 200,
      code: 'INVALID_RESPONSE', error: 'INVALID_RESPONSE', type: 'response_error', displayMessage: env.GENERIC_ERROR_MESSAGE });
    expect(env.fetch).toHaveBeenCalledTimes(1);
  });
  test('success contract unchanged; CSRF bootstrap shared state respects cookie rotation', async () => {
    let first = true;
    env = environment('login.html', async (url, options) => {
      if (String(url).endsWith('/csrf')) {
        expect(options).toMatchObject({ method: 'GET', credentials: 'include', redirect: 'error', cache: 'no-store' });
        return response(200, { success: true, csrfToken: 'a'.repeat(64) });
      }
      expect(options.headers.get('x-csrf-token')).toBe((first ? 'a' : 'b').repeat(64));
      expect(options).toMatchObject({ method: 'POST', credentials: 'include', redirect: 'error' });
      first = false; env.document.cookie = `x-csrf-token=${'b'.repeat(64)}`;
      return response(200, { success: true, value: 'unchanged' });
    });
    for (let i = 0; i < 2; i++) expect(await env.secureFetch('/api/auth/login', { method: 'POST', body: '{}' }))
      .toEqual({ success: true, status: 200, data: { success: true, value: 'unchanged' } });
    expect(env.fetch).toHaveBeenCalledTimes(3);
  });
  // Five actual login-handler cases.
  test('wrong credentials show Arabic; exact identifier/password payload; no session persistence', async () => {
    env = environment('login.html', async url => String(url).endsWith('/csrf')
      ? response(200, { success: true, csrfToken: 'a'.repeat(64) })
      : response(401, { success: false, code: 'INVALID_LOGIN', error: 'INVALID_LOGIN' }));
    env.start(); env.document.getElementById('username').value = ' user@example.com ';
    env.document.getElementById('password').value = ' ExactPass1! ';
    await env.document.getElementById('loginForm').fire('submit');
    expect(JSON.parse(env.fetch.mock.calls[1][1].body)).toEqual({ identifier: 'user@example.com', password: ' ExactPass1! ' });
    expect(env.document.getElementById('generalError').textContent).toBe('اسم المستخدم أو كلمة المرور غير صحيحة');
    expect(env.document.querySelector('.toast-notification').textContent).not.toContain('INVALID_LOGIN');
    expect(env.localStorage.setItem).not.toHaveBeenCalled(); expect(env.document.getElementById('submitBtn').disabled).toBe(false);
    expect(env.console.error).not.toHaveBeenCalled();
  });
  test('AUTH_FORBIDDEN shows WhatsApp number safely without HTML or success redirect', async () => {
    env = environment('login.html', async url => String(url).endsWith('/csrf')
      ? response(200, { success: true, csrfToken: 'a'.repeat(64) })
      : response(403, { success: false, code: 'AUTH_FORBIDDEN', error: 'AUTH_FORBIDDEN' }));
    env.start(); env.document.getElementById('username').value = 'Suspended_User';
    env.document.getElementById('password').value = 'StrongPass1!'; await env.document.getElementById('loginForm').fire('submit');
    const general = env.document.getElementById('generalError'); expect(general.textContent).toBe(env.getErrorMessage('AUTH_FORBIDDEN'));
    expect(general.querySelector('a')).toBeNull(); expect(env.localStorage.setItem).not.toHaveBeenCalled();
    expect(env.window.location.href).toBe('http://localhost/login.html');
  });
  test('initial check-session 401 has no JS console, toast, redirect or extra request', async () => {
    env = environment('login.html', async () => response(401, { success: false, code: 'UNAUTHENTICATED', error: 'UNAUTHENTICATED' }));
    env.start(); await env.document.fire('DOMContentLoaded'); await settle();
    expect(env.fetch).toHaveBeenCalledTimes(1); expect(new URL(env.fetch.mock.calls[0][0]).pathname).toBe('/api/auth/check-session');
    expect(env.console.error).not.toHaveBeenCalled(); expect(env.console.warn).not.toHaveBeenCalled(); expect(env.console.log).not.toHaveBeenCalled();
    expect(env.document.querySelector('.toast-notification')).toBeNull(); expect(env.window.location.href).toBe('http://localhost/login.html');
  });
  test('initial check contains thrown exceptions and ignores structured non-401 failures', async () => {
    env = environment('login.html'); const unexpected = jest.fn().mockRejectedValue(new Error('private error'));
    env.start({ secureFetch: unexpected }); await env.document.fire('DOMContentLoaded'); await settle();
    expect(unexpected).toHaveBeenCalledTimes(1); expect(env.console.error).not.toHaveBeenCalled();
    expect(env.window.location.href).toBe('http://localhost/login.html');
    const failed = environment('login.html', async () => response(503, { success: false, code: 'AUTH_UNAVAILABLE' }));
    failed.start(); await failed.document.fire('DOMContentLoaded'); await settle();
    expect(failed.console.error).not.toHaveBeenCalled(); expect(failed.window.location.href).toBe('http://localhost/login.html');
  });
  test('successful login preserves top-level session ID, storage, toast and both role redirects', async () => {
    for (const [role, target] of [['admin', '/homepage.html'], ['user', '/']]) {
      const receipt = { success: true, user: { id: `${role}-id`, role, sessionId: 'WRONG_NESTED' },
        token: 'token', sessionId: 'TOP_LEVEL_SESSION', csrfToken: 'a'.repeat(64) };
      env = environment('login.html', async url => String(url).endsWith('/csrf')
        ? response(200, { success: true, csrfToken: 'a'.repeat(64) }) : response(200, receipt));
      env.start(); env.document.getElementById('username').value = 'Username'; env.document.getElementById('password').value = 'StrongPass1!';
      await env.document.getElementById('loginForm').fire('submit');
      expect(env.localStorage.setItem.mock.calls).toEqual([['userId', `${role}-id`], ['userToken', 'token'], ['customSessionId', 'TOP_LEVEL_SESSION']]);
      expect(env.document.querySelector('.toast-notification').textContent).toContain('أهلاً بعودتك');
      jest.advanceTimersByTime(2100); expect(env.window.location.href).toBe(target);
      const active = environment('login.html', async () => response(200, { isAuthenticated: true, user: { id: 'active', role } }));
      active.start(); await active.document.fire('DOMContentLoaded'); await settle(); expect(active.window.location.href).toBe(target);
    }
  });
  // Four register-handler cases: all duplicates plus four old field routes.
  test.each([
    ['USER_USERNAME_TAKEN', 'usernameError', 'username'], ['USER_EMAIL_TAKEN', 'emailError', 'email'],
    ['USER_PHONE_TAKEN', 'phoneError', 'phoneNumber']
  ])('registration %s is Arabic, field-specific, shaken, and cleaned up', async (code, field, input) => {
    env = environment('register.html', async url => String(url).endsWith('/csrf')
      ? response(200, { success: true, csrfToken: 'a'.repeat(64) })
      : response(409, { success: false, code, error: code }));
    env.start(); fillRegistration(env); const spinner = env.document.getElementById('spinner'), btnText = env.document.getElementById('btnText');
    await env.document.getElementById('registerForm').fire('submit');
    expect(env.document.getElementById(field).textContent).toBe(env.getErrorMessage(code));
    expect(env.document.getElementById(input).classList.contains('shake')).toBe(true);
    expect(env.document.getElementById(field).style.animation).toBe('shake 0.3s ease');
    expect(env.document.querySelector('.toast-notification').textContent).toBe(env.getErrorMessage(code));
    expect(env.document.getElementById('generalError').textContent).toBe(''); expect(env.window.Swal.fire).not.toHaveBeenCalled();
    expect(env.document.getElementById('submitBtn').disabled).toBe(false); expect(spinner.style.display).toBe('none'); expect(btnText.style.display).toBe('inline');
    expect(env.localStorage.setItem).not.toHaveBeenCalled(); expect(env.window.location.href).toBe('http://localhost/register.html');
  });
  test('all four old registration routes retain equivalent field and input shakes', async () => {
    for (const [code, field, input] of [['INVALID_USERNAME', 'usernameError', 'username'], ['INVALID_PASSWORD', 'passwordError', 'password'],
      ['INVALID_EMAIL', 'emailError', 'email'], ['INVALID_PHONE', 'phoneError', 'phoneNumber']]) {
      env = environment('register.html', async url => String(url).endsWith('/csrf')
        ? response(200, { success: true, csrfToken: 'a'.repeat(64) }) : response(400, { success: false, code, error: code }));
      env.start(); fillRegistration(env); await env.document.getElementById('registerForm').fire('submit');
      expect(env.document.getElementById(field).textContent).toBe(env.getErrorMessage(code));
      expect(env.document.getElementById(input).classList.contains('shake')).toBe(true);
      expect(env.window.Swal.fire).not.toHaveBeenCalled(); expect(env.document.getElementById('submitBtn').disabled).toBe(false);
    }
  });
  // Execute the actual dialog display statement; financial clients remain unchanged.
  test('purchase display prefers displayMessage and treats markup as text', () => {
    const statement = fs.readFileSync(path.join(JS, 'dialogs/purchaseDialog.js'), 'utf8').match(/errorElement\.textContent = .*;/)[0];
    const errorElement = env.document.getElementById('generalError');
    vm.runInNewContext(statement, { errorElement, error: { displayMessage: '<b>المنتج غير متوفر</b>', message: 'original' } });
    expect(errorElement.textContent).toBe('<b>المنتج غير متوفر</b>'); expect(errorElement.querySelector('b')).toBeNull();
  });
  test('purchase fallback preserves unknown-outcome warning and original error', () => {
    const statement = fs.readFileSync(path.join(JS, 'dialogs/purchaseDialog.js'), 'utf8').match(/errorElement\.textContent = .*;/)[0];
    const errorElement = env.document.getElementById('generalError'), error = new Error('Purchase outcome is unknown; retry the saved logical intent');
    vm.runInNewContext(statement, { errorElement, error }); expect(errorElement.textContent).toBe(error.message);
    expect(error.displayMessage).toBeUndefined();
  });
});
