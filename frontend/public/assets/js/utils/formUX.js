// Small, opt-in helpers. Importing this module never binds or validates fields.
const toggleBindings = new WeakMap();
const validationBindings = new WeakMap();
const NOOP = () => {};
const SHOW_PASSWORD = 'إظهار كلمة المرور';
const HIDE_PASSWORD = 'إخفاء كلمة المرور';

function syncToggle(inputEl, buttonEl, opts) {
    const visible = inputEl.type === 'text';
    buttonEl.setAttribute('aria-controls', inputEl.id);
    buttonEl.setAttribute('aria-pressed', String(visible));
    buttonEl.setAttribute('aria-label', visible ? opts.hideLabel : opts.showLabel);
    const slash = buttonEl.querySelector('[data-password-slash]');
    if (slash) slash.setAttribute('visibility', visible ? 'visible' : 'hidden');
}

function togglePassword(inputEl, buttonEl, opts) {
    const start = inputEl.selectionStart;
    const end = inputEl.selectionEnd;
    const direction = inputEl.selectionDirection;
    inputEl.type = inputEl.type === 'password' ? 'text' : 'password';
    // Unsupported selection APIs must not prevent toggling or alter the value.
    try {
        if (start !== null && start !== undefined && end !== null && end !== undefined) {
            inputEl.setSelectionRange(start, end, direction);
        }
    } catch { /* Some input implementations do not support selection. */ }
    syncToggle(inputEl, buttonEl, opts);
}

/** Bind one native button; repeated calls do not add another click handler. */
export function bindPasswordToggle(inputEl, buttonEl, opts = {}) {
    if (!inputEl || !buttonEl || !inputEl.id) return NOOP;
    if (toggleBindings.has(buttonEl)) return toggleBindings.get(buttonEl);
    const labels = { showLabel: SHOW_PASSWORD, hideLabel: HIDE_PASSWORD, ...opts };
    const wrapper = buttonEl.closest('[data-form-ux="password"]');
    const click = () => togglePassword(inputEl, buttonEl, labels);
    buttonEl.type = 'button';
    syncToggle(inputEl, buttonEl, labels);
    buttonEl.addEventListener('click', click);
    // Author button display rules can override the browser's default [hidden].
    if (wrapper) wrapper.setAttribute('data-form-ux-ready', '');
    buttonEl.hidden = false;
    const cleanup = () => {
        buttonEl.removeEventListener('click', click);
        buttonEl.hidden = true;
        if (wrapper) wrapper.removeAttribute('data-form-ux-ready');
        toggleBindings.delete(buttonEl);
    };
    toggleBindings.set(buttonEl, cleanup);
    return cleanup;
}

/** Bind only explicitly marked buttons under this root. */
export function bindPasswordToggles(root) {
    if (!root) return NOOP;
    const document = root.ownerDocument || root;
    const cleanups = Array.from(root.querySelectorAll('[data-password-toggle]'), button => {
        const input = document.getElementById(button.getAttribute('aria-controls'));
        if (!input || !root.contains(input)) return NOOP;
        return bindPasswordToggle(input, button);
    });
    return () => cleanups.forEach(cleanup => cleanup());
}

function feedbackNode(inputEl) {
    const id = inputEl.getAttribute('data-feedback-id');
    return id ? inputEl.ownerDocument.getElementById(id) : null;
}

function renderFeedback(feedbackEl, message, kind) {
    feedbackEl.textContent = message;
    feedbackEl.classList.toggle('show', kind === 'error' && Boolean(message));
    if (!message || !['error', 'success'].includes(kind)) return;
    const icon = feedbackEl.ownerDocument.createElement('span');
    icon.setAttribute('data-form-ux', 'feedback-icon');
    icon.setAttribute('data-kind', kind);
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = kind === 'error' ? '✗' : '✓';
    feedbackEl.prepend(icon);
}

/** Feedback is associated by data-feedback-id; no HTML or inline styles. */
export function attachFieldFeedback(inputEl, message, kind = 'neutral') {
    if (!inputEl) return;
    const text = typeof message === 'string' ? message : '';
    inputEl.setAttribute('aria-invalid', String(kind === 'error' && Boolean(text)));
    const feedback = feedbackNode(inputEl);
    if (feedback) renderFeedback(feedback, text, kind);
}

/** Exact comparison only: never trim, normalize, or mutate either password. */
export function validatePasswordConfirmation(passwordEl, confirmEl, feedbackEl) {
    if (!passwordEl || !confirmEl) return { valid: false, message: 'يرجى تأكيد كلمة المرور' };
    if (feedbackEl?.id) confirmEl.setAttribute('data-feedback-id', feedbackEl.id);
    const message = !confirmEl.value ? 'يرجى تأكيد كلمة المرور' :
        passwordEl.value !== confirmEl.value ? 'كلمتا المرور غير متطابقتين' : '';
    attachFieldFeedback(confirmEl, message, message ? 'error' : 'neutral');
    // Do not set sticky custom validity: submit must recheck corrected values.
    return { valid: !message, message };
}

function applyValidation(inputEl, validatorFn, feedbackEl) {
    const result = validatorFn(inputEl.value);
    if (feedbackEl?.id) inputEl.setAttribute('data-feedback-id', feedbackEl.id);
    const valid = typeof result === 'boolean' ? result : result?.valid === true;
    const message = typeof result?.message === 'string' ? result.message : '';
    attachFieldFeedback(inputEl, message, valid ? 'success' : 'error');
}

/** Tested utility only in C5c.2a. Broad live validation is deferred to C5c.2b. */
export function bindDebouncedValidation(inputEl, validatorFn, feedbackEl, opts = {}) {
    if (!inputEl || typeof validatorFn !== 'function') return NOOP;
    if (validationBindings.has(inputEl)) return validationBindings.get(inputEl);
    const delay = opts.delay ?? 300;
    let timer = null;
    const cancel = () => { clearTimeout(timer); timer = null; };
    const validate = () => { cancel(); applyValidation(inputEl, validatorFn, feedbackEl); };
    const input = () => { cancel(); timer = setTimeout(validate, delay); };
    inputEl.addEventListener('input', input);
    inputEl.addEventListener('blur', validate);
    const cleanup = () => {
        cancel();
        inputEl.removeEventListener('input', input);
        inputEl.removeEventListener('blur', validate);
        validationBindings.delete(inputEl);
    };
    validationBindings.set(inputEl, cleanup);
    return cleanup;
}
// Phone display formatting is intentionally not implemented until C5c.2b.
