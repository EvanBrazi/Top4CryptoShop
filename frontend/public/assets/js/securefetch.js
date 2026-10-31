function inferErrorType(message = '') {
    if (message.includes('اسم المستخدم')) return 'invalid_credentials';
    if (message.includes('كلمة المرور')) return 'invalid_password';
    if (message.includes('رمز الجلسة')) return 'missing_session';
    if (message.includes('تم تعليق الحساب')) return 'too_many_attempts';
    if (message.includes('توكن غير صالح')) return 'invalid_token';
    if (message.includes('انتهت صلاحية الجلسة')) return 'expired_session';
    return 'server_error';
}

/**
 * @file secureFetch.js
 * @description 🛡️ وحدة إرسال الطلبات مع حماية CSRF تلقائية
 * @version 1.0.0
 */
const CSRF_TOKEN = /^[a-f0-9]{64}$/;
let csrfInitialized = false;
let csrfInFlight = null;

function getCsrfTokenFromCookie() {
    const match = document.cookie.match(/(?:^|;\s*)x-csrf-token=([^;]+)/);
    try {
        const token = match ? decodeURIComponent(match[1]) : null;
        return typeof token === 'string' && CSRF_TOKEN.test(token) ? token : null;
    } catch {
        return null;
    }
}

async function readJson(response) {
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('INVALID_RESPONSE');
    }
    return data;
}

function csrfFailure(code = 'CSRF_BOOTSTRAP_FAILED', status = 0) {
    return Object.assign(new Error(code), { code, status, type: 'csrf_error' });
}

async function ensureCsrfToken() {
    if (!csrfInitialized || !getCsrfTokenFromCookie()) {
        if (!csrfInFlight) {
            // Native fetch avoids recursion. Share initialization, never a cached token.
            csrfInFlight = (async () => {
                const response = await fetch('/api/auth/csrf', {
                    method: 'GET',
                    headers: { Accept: 'application/json' },
                    credentials: 'include',
                    redirect: 'error',
                    cache: 'no-store'
                });
                if (!response.ok) throw csrfFailure('CSRF_BOOTSTRAP_FAILED', response.status);
                const data = await readJson(response);
                if (data.success !== true || typeof data.csrfToken !== 'string' ||
                    !CSRF_TOKEN.test(data.csrfToken) || getCsrfTokenFromCookie() !== data.csrfToken) {
                    throw csrfFailure('CSRF_COOKIE_UNAVAILABLE', response.status);
                }
                csrfInitialized = true;
            })().catch(err => {
                csrfInitialized = false;
                throw err?.type === 'csrf_error' ? err : csrfFailure();
            }).finally(() => { csrfInFlight = null; });
        }
        await csrfInFlight;
    }
    // Login rotates this cookie; always read the current value before dispatch.
    const token = getCsrfTokenFromCookie();
    if (!token) throw csrfFailure('CSRF_COOKIE_UNAVAILABLE');
    return token;
}

// TODO(C5b): purchaseClient.js bypasses secureFetch; its CSRF bootstrap gap is not covered here.
/**
 * إرسال طلب آمن تلقائيًا مع رمز CSRF، دون إعادة إرسال أي طلب تعديل.
 * @param {string} url - عنوان من نفس الأصل
 * @param {object} options - إعدادات fetch (method, headers, body...)
 * @returns {Promise<object>} - نتيجة منظمة، وليست Response
 */
export async function secureFetch(url, options = {}) {
    try {
        const target = new URL(url, window.location.href);
        if (!['http:', 'https:'].includes(target.protocol) ||
            target.origin !== window.location.origin || target.username || target.password) {
            return { success: false, status: 0, code: 'CROSS_ORIGIN_REQUEST_BLOCKED',
                error: 'CROSS_ORIGIN_REQUEST_BLOCKED', type: 'request_error' };
        }
        const method = options.method?.toUpperCase() || 'GET';
        const needsCsrf = !['GET', 'HEAD', 'OPTIONS'].includes(method);
        const headers = new Headers(options.headers);
        const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
        if (!headers.has('Content-Type') && options.body != null && !isFormData) {
            headers.set('Content-Type', 'application/json');
        }
        // Authentication uses browser-managed HttpOnly cookies, not cookie-derived headers.
        if (needsCsrf) headers.set('x-csrf-token', await ensureCsrfToken());
        const response = await secureFetchWithLoader(target.href, {
            ...options,
            method,
            headers,
            credentials: 'include',
            redirect: 'error'
        });

        let data;
        try {
            data = await readJson(response);
        } catch {
            return { success: false, status: response.status, code: 'INVALID_RESPONSE',
                error: 'INVALID_RESPONSE', type: 'response_error' };
        }
        if (!response.ok || data.success === false) {
            if (response.status === 403 && data.code === 'CSRF_INVALID') csrfInitialized = false;
            const error = typeof data.error === 'string' ? data.error : 'REQUEST_FAILED';
            return {
                remainingAttempts: data.remainingAttempts,
                success: false,
                status: response.status,
                code: typeof data.code === 'string' ? data.code : error,
                error,
                type: data.type || inferErrorType(error)
            };
        }
        return { success: true, status: response.status, data };
    } catch (err) {
        const code = err?.type === 'csrf_error' ? err.code : 'NETWORK_ERROR';
        return { success: false, status: err?.status || 0, code, error: code,
            type: err?.type === 'csrf_error' ? 'csrf_error' : 'network_error' };
    }
}

async function secureFetchWithLoader(url, options = {}) {
    try {
        if (typeof showLoader === 'function') showLoader();
        return await fetch(url, options);
    } finally {
        if (typeof hideLoader === 'function') hideLoader();
    }
}
