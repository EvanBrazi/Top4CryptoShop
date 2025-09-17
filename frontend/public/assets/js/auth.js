/**
 * @file auth.js
 * @description 🔐 وحدة إدارة الجلسة وتسجيل الدخول والخروج
 * @version 1.0.0
 */

import { secureFetch } from './securefetch.js';
import { clearBrowserData } from './utils/appUtils.js';

/**
 * ✅ تسجيل مستخدم جديد بطريقة متوافقة مع secureFetch
 * @param {string} username
 * @param {string} password
 * @param {string} email
 * @param {string} phone
 * @param {string} theme
 * @returns {Promise<object>} - كائن يحتوي على نتيجة التسجيل
 */
export async function register(username, password, email, phone, theme) {
    const result = await secureFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, password, email, phone, theme })
    });

    if (!result.success) {
        return {
            success: false,
            error: result.error || 'فشل في تسجيل المستخدم',
            type: result.type || 'server_error',
            status: result.status || 500
        };
    }

    return {
        success: true,
        user: result.data.user,
        token: result.data.token,
        redirectTo: result.data.redirectTo
    };
}

/**
 * 🔐 تسجيل الدخول الآمن مع دعم الجهاز الموثوق
 * @param {string} username - اسم المستخدم أو البريد
 * @param {string} password - كلمة المرور
 * @param {string} deviceId - رمز الجهاز المولد محليًا
 * @param {boolean} rememberDevice - هل يجب حفظ الجهاز كمصدر موثوق
 * @returns {Promise<object>} - نتيجة تسجيل الدخول
 */
export async function login(username, password, deviceId, rememberDevice = false) {
    try {
        const result = await secureFetch('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password, deviceId, rememberDevice })
        });

        if (!result || !result.success || !result.data) return result;

        const { user, token, redirectTo } = result.data;
        return {
            success: true,
            user,
            token,
            redirectTo
        };
    } catch (err) {
        return {
            success: false,
            error: 'NETWORK_ERROR',
            message: err.message || 'فشل الاتصال بالخادم'
        };
    }
}

/**
 * ✅ تسجيل الخروج من الجلسة الحالية بطريقة متوافقة مع secureFetch
 * @returns {Promise<object>} - كائن يحتوي على نتيجة الخروج (نجاح أو خطأ)
 */
export async function logout() {
    const result = await secureFetch('/api/auth/logout', {
        method: 'POST'
    });
    if (!result.success) {
        return {
            success: false,
            error: result.error || 'فشل في تسجيل الخروج',
            type: result.type || 'server_error',
            status: result.status || 500
        };
    }
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
        //console.log('Front: checkSession:', result);
        if (!result.success) {
            console.warn('⚠️ فشل التحقق من الجلسة:', result.error);
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
    } catch (error) {
        console.error('❌ فشل التحقق من الجلسة:', error);
        window.location.href = '/401.html';
        return null;
    }
}
