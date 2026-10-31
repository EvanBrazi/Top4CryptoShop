/**
 * @file auth.js
 * @description 🔐 وحدة إدارة الجلسة وتسجيل الدخول والخروج
 * @version 1.0.0
 */

import { secureFetch } from './securefetch.js';
import { STORAGE_KEYS } from './utils/appUtils.js';

/**
 * ✅ تسجيل مستخدم جديد بطريقة متوافقة مع secureFetch
 * @param {string} username
 * @param {string} password
 * @param {string} email
 * @param {string} phone
 * @returns {Promise<object>} - نتيجة التسجيل دون إنشاء جلسة تسجيل دخول
 */
export async function register(username, password, email, phone) {
    const payload = { username, email, password };
    if (typeof phone === 'string' && phone.trim()) payload.phone = phone.trim();
    const result = await secureFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload)
    });

    if (!result.success) return result;
    if (result.data.success !== true || !result.data.user?.id) {
        return { success: false, status: result.status, code: 'INVALID_REGISTER_RESPONSE',
            error: 'INVALID_REGISTER_RESPONSE', type: 'response_error' };
    }
    return { success: true, status: result.status, user: result.data.user };
}

/**
 * 🔐 تسجيل الدخول بعقد الخادم الحالي
 * @param {string} identifier - اسم المستخدم أو البريد
 * @param {string} password - كلمة المرور
 * @returns {Promise<object>} - نتيجة تسجيل الدخول
 */
export async function login(identifier, password) {
    const result = await secureFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password })
    });
    if (!result.success) return result;

    const { user, token, sessionId, csrfToken, expiresAt, redirectTo, requires2FA } = result.data;
    // The legacy 2FA UI is not migrated in this phase; never persist a pending login.
    if (requires2FA) {
        return { success: false, status: result.status, requires2FA: true,
            code: 'TWO_FACTOR_AUTH_REQUIRED', error: 'TWO_FACTOR_AUTH_REQUIRED' };
    }
    if (result.data.success !== true || !user?.id || typeof user.role !== 'string' ||
        typeof token !== 'string' || !token || typeof sessionId !== 'string' || !sessionId ||
        typeof csrfToken !== 'string' || !/^[a-f0-9]{64}$/.test(csrfToken)) {
        return { success: false, status: result.status, code: 'INVALID_LOGIN_RESPONSE',
            error: 'INVALID_LOGIN_RESPONSE', type: 'response_error' };
    }
    return { success: true, status: result.status, user, token, sessionId,
        csrfToken, expiresAt, redirectTo };
}

/**
 * ✅ تسجيل الخروج من الجلسة الحالية بطريقة متوافقة مع secureFetch
 * @returns {Promise<object>} - كائن يحتوي على نتيجة الخروج (نجاح أو خطأ)
 */
export async function logout() {
    const result = await secureFetch('/api/auth/logout', {
        method: 'POST'
    });
    if (!result.success) return result;
    if (result.data.success !== true) {
        return { success: false, status: result.status, code: 'INVALID_LOGOUT_RESPONSE',
            error: 'INVALID_LOGOUT_RESPONSE', type: 'response_error' };
    }
    // Clear only auth-owned storage after server logout; preserve theme and financial intents.
    [STORAGE_KEYS.USER_ID, STORAGE_KEYS.USER_TOKEN, STORAGE_KEYS.SESSION_ID,
        'user_id', 'user_token'].forEach(key => localStorage.removeItem(key));
    return {
        success: true,
        message: result.data.message || 'تم تسجيل الخروج بنجاح'
    };
}

/**
 * ✅ التحقق من الجلسة الحالية بطريقة متوافقة مع secureFetch
 * @param {string|null} expectedRole - الدور المتوقع للمستخدم
 * @returns {Promise<object|null>} - بيانات المستخدم أو null
 */
export async function checkSession(expectedRole = null) {
    try {
        const result = await secureFetch('/api/auth/check-session', {
            method: 'GET',
        });
        if (!result.success) {
            console.warn('Session check failed');
            window.location.href = '/401.html';
            return null;
        }

        const data = result.data;
        if (!data.isAuthenticated || !data.user) {
            window.location.href = data.redirectTo || '/401.html';
            return null;
        }

        if (expectedRole && data.user.role !== expectedRole) {
            window.location.href = '/401.html';
            return null;
        }

        return data.user;
    } catch {
        console.error('Session check failed');
        window.location.href = '/401.html';
        return null;
    }
}
