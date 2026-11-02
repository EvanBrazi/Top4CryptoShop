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

describe('Actual form UX modules and registration handler (36 cases)', () => {
  let env, password, confirm, feedback, button;
  beforeEach(() => {
    jest.useFakeTimers(); env = environment();
    password = env.document.getElementById('password'); confirm = env.document.getElementById('confirmPassword');
    feedback = env.document.getElementById('confirmPasswordError');
    button = env.document.querySelector('[data-password-toggle][aria-controls="password"]');
  });
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });
  // 13 toggle cases. Native browser keyboard/rendering checks remain manual.
  test('no JS: hidden button, normal password, no ready grid', () => {
    expect(button.hidden).toBe(true); expect(password.type).toBe('password');
    expect(button.closest('[data-form-ux]').getAttribute('data-form-ux-ready')).toBeNull();
    const css = fs.readFileSync(path.join(HTML, 'assets/css/form-ux.css'), 'utf8');
    expect(css).toContain('[data-form-ux="password"][data-form-ux-ready]');
    expect(css).toMatch(/\[data-password-toggle\]\[hidden\]\s*\{\s*display: none/);
  });
  test('binding reveals button and synchronizes hidden state and ARIA', () => {
    env.bindPasswordToggle(password, button);
    expect(button.hidden).toBe(false); expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.getAttribute('aria-controls')).toBe('password');
    expect(button.getAttribute('aria-label')).toBe('إظهار كلمة المرور');
    expect(button.closest('[data-form-ux]').getAttribute('data-form-ux-ready')).toBe('');
  });
  test('click reveals password and slash with Arabic label', async () => {
    env.bindPasswordToggle(password, button); await button.fire('click');
    expect(password.type).toBe('text'); expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.getAttribute('aria-label')).toBe('إخفاء كلمة المرور');
    expect(button.querySelector('[data-password-slash]').getAttribute('visibility')).toBe('visible');
  });
  test('second click hides password and slash', async () => {
    env.bindPasswordToggle(password, button); await button.fire('click'); await button.fire('click');
    expect(password.type).toBe('password'); expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.querySelector('[data-password-slash]').getAttribute('visibility')).toBe('hidden');
  });
  test('toggle preserves exact whitespace and Unicode value', async () => {
    password.value = '  PassÉé1!  '; const value = password.value;
    env.bindPasswordToggle(password, button); await button.fire('click'); expect(password.value).toBe(value);
  });
  test('selection and direction preserved without moving focus', async () => {
    password.selectionStart = 2; password.selectionEnd = 6; password.selectionDirection = 'backward';
    env.bindPasswordToggle(password, button); await button.fire('click');
    expect(password.setSelectionRange).toHaveBeenCalledWith(2, 6, 'backward');
  });
  test('unsupported selection API does not prevent toggle', async () => {
    password.setSelectionRange.mockImplementation(() => { throw new Error('unsupported'); });
    env.bindPasswordToggle(password, button); await button.fire('click'); expect(password.type).toBe('text');
  });
  test('registration password and confirmation toggle independently', async () => {
    env.bindPasswordToggles(env.document.getElementById('registerForm')); await button.fire('click');
    expect(password.type).toBe('text'); expect(confirm.type).toBe('password');
    const other = env.document.querySelector('[data-password-toggle][aria-controls="confirmPassword"]');
    await other.fire('click'); expect(confirm.type).toBe('text'); expect(password.type).toBe('text');
  });
  test('repeat binding is idempotent', async () => {
    const cleanup = env.bindPasswordToggle(password, button);
    expect(env.bindPasswordToggle(password, button)).toBe(cleanup);
    expect(button.listenerCount('click')).toBe(1); await button.fire('click'); expect(password.type).toBe('text');
  });
  test('native keyboard semantics: button type, tab order, no key interception', () => {
    env.bindPasswordToggle(password, button); expect(button.tagName).toBe('BUTTON'); expect(button.type).toBe('button');
    expect(button.getAttribute('tabindex')).toBeNull(); expect(button.listenerCount('keydown')).toBe(0);
    expect(button.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
  });
  test('button click does not dispatch form submission', async () => {
    const form = env.document.getElementById('registerForm'), submit = jest.fn();
    form.addEventListener('submit', submit); env.bindPasswordToggle(password, button);
    const event = await button.fire('click'); expect(event.preventDefault).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled(); expect(button.type).toBe('button');
  });
  test('cleanup hides toggle, removes handler and readiness; rebind works', async () => {
    const cleanup = env.bindPasswordToggle(password, button); cleanup(); await button.fire('click');
    expect(password.type).toBe('password'); expect(button.hidden).toBe(true);
    expect(button.closest('[data-form-ux]').getAttribute('data-form-ux-ready')).toBeNull();
    env.bindPasswordToggle(password, button); await button.fire('click'); expect(password.type).toBe('text');
  });
  test('missing nodes are safe and root scans cannot bind outside inputs', () => {
    expect(() => env.bindPasswordToggle(null, button)()).not.toThrow();
    expect(() => env.bindPasswordToggles(null)()).not.toThrow();
    button.setAttribute('aria-controls', 'email');
    env.bindPasswordToggles(button.closest('[data-form-ux]')); expect(button.hidden).toBe(true);
  });
  // 10 exact-confirmation/blur cases.
  test('empty confirmation rejected with Arabic required feedback', () => {
    password.value = 'StrongPass1!';
    expect(env.validatePasswordConfirmation(password, confirm, feedback)).toEqual({ valid: false, message: 'يرجى تأكيد كلمة المرور' });
  });
  test('mismatch uses exact Arabic and aria-invalid', () => {
    password.value = 'StrongPass1!'; confirm.value = 'OtherPass1!';
    expect(env.validatePasswordConfirmation(password, confirm, feedback)).toEqual({ valid: false, message: 'كلمتا المرور غير متطابقتين' });
    expect(confirm.getAttribute('aria-invalid')).toBe('true'); expect(feedback.classList.contains('show')).toBe(true);
  });
  test('matching confirmation is valid', () => {
    password.value = confirm.value = 'StrongPass1!';
    expect(env.validatePasswordConfirmation(password, confirm, feedback)).toEqual({ valid: true, message: '' });
    expect(confirm.getAttribute('aria-invalid')).toBe('false');
  });
  test('whitespace differences are not trimmed', () => {
    password.value = ' StrongPass1!'; confirm.value = 'StrongPass1!';
    expect(env.validatePasswordConfirmation(password, confirm, feedback).valid).toBe(false);
  });
  test('Unicode canonically equivalent strings remain different', () => {
    password.value = 'ÉPass1!'; confirm.value = 'ÉPass1!';
    expect(env.validatePasswordConfirmation(password, confirm, feedback).valid).toBe(false);
  });
  test('case differences remain different', () => {
    password.value = 'StrongPass1!'; confirm.value = 'strongPass1!';
    expect(env.validatePasswordConfirmation(password, confirm, feedback).valid).toBe(false);
  });
  test('confirmation validates on blur, not on input or a debounce timer', async () => {
    env.start(); fillRegistration(env, { confirmPassword: 'Different1!' }); await confirm.fire('input');
    jest.advanceTimersByTime(300); expect(feedback.textContent).toBe('');
    await confirm.fire('blur'); expect(feedback.textContent).toContain('كلمتا المرور غير متطابقتين');
  });
  test('changing original password rechecks existing confirmation on blur', async () => {
    env.start(); fillRegistration(env); password.value = 'ChangedPass1!'; await password.fire('blur');
    expect(feedback.textContent).toContain('كلمتا المرور غير متطابقتين');
  });
  test('correcting confirmation clears stale error without sticky custom validity', async () => {
    env.start(); fillRegistration(env, { confirmPassword: 'Different1!' }); await confirm.fire('blur');
    confirm.value = password.value; await confirm.fire('blur');
    expect(feedback.textContent).toBe(''); expect(feedback.classList.contains('show')).toBe(false);
    expect(confirm.getAttribute('aria-invalid')).toBe('false');
  });
  test('confirmation required, autocomplete, live region and homepage labels preserved', () => {
    expect(confirm.getAttribute('required')).not.toBeNull(); expect(confirm.getAttribute('autocomplete')).toBe('new-password');
    expect(confirm.getAttribute('aria-describedby')).toBe(feedback.id); expect(feedback.getAttribute('aria-live')).toBe('polite');
    const home = dom(fs.readFileSync(path.join(HTML, 'homepage.html'), 'utf8'));
    for (const id of ['newPassword', 'confirmPassword']) {
      expect(home.querySelector(`label[for="${id}"]`)).not.toBeNull(); expect(home.getElementById(id).type).toBe('password');
    }
  });
  // Four actual handler gates, including real auth + securefetch dispatch.
  test('mismatch blocks request before loading and shows Arabic', async () => {
    env.start(); fillRegistration(env, { confirmPassword: 'Different1!' });
    await env.document.getElementById('registerForm').fire('submit'); expect(env.fetch).not.toHaveBeenCalled();
    expect(env.document.getElementById('submitBtn').disabled).toBe(false);
    expect(feedback.textContent).toContain('كلمتا المرور غير متطابقتين');
  });
  test('matching confirmation dispatches exact payload without confirmation', async () => {
    env.start(); fillRegistration(env, { password: ' StrongPass1! ', confirmPassword: ' StrongPass1! ' });
    await env.document.getElementById('registerForm').fire('submit');
    expect(env.fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(env.fetch.mock.calls[1][1].body)).toEqual({ username: 'New_User', email: 'new@example.com', password: ' StrongPass1! ' });
    expect(env.localStorage.setItem).not.toHaveBeenCalled(); expect(env.window.Swal.fire).toHaveBeenCalledWith(expect.objectContaining({ icon: 'success' }));
  });
  test('original password changed then submitted without confirmation blur is blocked', async () => {
    env.start(); fillRegistration(env); password.value = 'ChangedPass1!';
    await env.document.getElementById('registerForm').fire('submit'); expect(env.fetch).not.toHaveBeenCalled();
    expect(feedback.textContent).toContain('كلمتا المرور غير متطابقتين');
  });
  test('existing username/password/email/phone validation remains before dispatch', async () => {
    env.start(); fillRegistration(env, { username: '!!', password: 'weak', confirmPassword: 'weak', email: 'bad', countryCode: '+966', phoneNumber: '' });
    await env.document.getElementById('registerForm').fire('submit'); expect(env.fetch).not.toHaveBeenCalled();
    for (const id of ['usernameError', 'passwordError', 'emailError', 'phoneError']) expect(env.document.getElementById(id).textContent).not.toBe('');
  });
  // Six debounce utility cases; utility remains unbound in production forms.
  test('debounce does not call validator before 300ms', async () => {
    const validator = jest.fn(() => ({ valid: true, message: '' })); env.bindDebouncedValidation(confirm, validator, feedback);
    await confirm.fire('input'); jest.advanceTimersByTime(299); expect(validator).not.toHaveBeenCalled();
  });
  test('debounce fires at exactly 300ms', async () => {
    const validator = jest.fn(() => ({ valid: true, message: '' })); env.bindDebouncedValidation(confirm, validator, feedback);
    await confirm.fire('input'); jest.advanceTimersByTime(300); expect(validator).toHaveBeenCalledTimes(1);
  });
  test('rapid edits validate only latest value', async () => {
    const validator = jest.fn(() => ({ valid: true, message: '' })); env.bindDebouncedValidation(confirm, validator, feedback);
    confirm.value = 'one'; await confirm.fire('input'); jest.advanceTimersByTime(200);
    confirm.value = 'two'; await confirm.fire('input'); jest.advanceTimersByTime(300);
    expect(validator).toHaveBeenCalledTimes(1); expect(validator).toHaveBeenCalledWith('two');
  });
  test('blur validates immediately and cancels pending debounce', async () => {
    const validator = jest.fn(() => ({ valid: false, message: 'خطأ' })); env.bindDebouncedValidation(confirm, validator, feedback);
    await confirm.fire('input'); await confirm.fire('blur'); jest.advanceTimersByTime(300);
    expect(validator).toHaveBeenCalledTimes(1); expect(feedback.textContent).toContain('خطأ');
  });
  test('debounce cleanup cancels timer and removes both listeners', async () => {
    const validator = jest.fn(); const cleanup = env.bindDebouncedValidation(confirm, validator, feedback);
    await confirm.fire('input'); cleanup(); await confirm.fire('blur'); jest.advanceTimersByTime(300);
    expect(validator).not.toHaveBeenCalled(); expect(confirm.listenerCount('input')).toBe(0);
  });
  test('fields have independent debounce timers and repeat binding is idempotent', async () => {
    const first = jest.fn(() => true), second = jest.fn(() => true);
    const cleanup = env.bindDebouncedValidation(password, first, feedback);
    expect(env.bindDebouncedValidation(password, first, feedback)).toBe(cleanup);
    env.bindDebouncedValidation(confirm, second, feedback); await password.fire('input'); jest.advanceTimersByTime(100);
    await confirm.fire('input'); jest.advanceTimersByTime(200); expect(first).toHaveBeenCalledTimes(1); expect(second).not.toHaveBeenCalled();
    jest.advanceTimersByTime(100); expect(second).toHaveBeenCalledTimes(1);
  });
  // Three safe feedback cases.
  test('feedback renders malicious markup as text only', () => {
    env.attachFieldFeedback(confirm, '<img src=x onerror=alert(1)>', 'error');
    expect(feedback.textContent).toContain('<img src=x onerror=alert(1)>'); expect(feedback.querySelector('img')).toBeNull();
    expect(feedback.querySelector('[data-form-ux="feedback-icon"]').getAttribute('aria-hidden')).toBe('true');
  });
  test('error and success feedback update ARIA and icon kind', () => {
    env.attachFieldFeedback(confirm, 'خطأ', 'error'); expect(confirm.getAttribute('aria-invalid')).toBe('true');
    env.attachFieldFeedback(confirm, 'صحيح', 'success'); expect(confirm.getAttribute('aria-invalid')).toBe('false');
    expect(feedback.querySelector('[data-kind="success"]').textContent).toBe('✓');
  });
  test('neutral feedback clears previous error and non-string objects are not exposed', () => {
    env.attachFieldFeedback(confirm, 'خطأ', 'error'); env.attachFieldFeedback(confirm, { private: 'secret' }, 'neutral');
    expect(feedback.textContent).toBe(''); expect(confirm.getAttribute('aria-invalid')).toBe('false');
    expect(feedback.classList.contains('show')).toBe(false);
  });
});
