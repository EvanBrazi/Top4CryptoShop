/**
 * @file auth.js
 * @description 🔐 وحدة إدارة الجلسة وتسجيل الدخول والخروج
 * @version 1.0.0
 */

import { secureFetch } from './securefetch.js';

/**
 * تسجيل مستخدم جديد
 * @param {string} username - اسم المستخدم المطلوب تسجيله
 * @param {string} password - كلمة المرور الخاصة بالمستخدم
 * @param {string} email - البريد الإلكتروني للمستخدم
 * @param {string} phone - رقم الهاتف الكامل للمستخدم (مع رمز الدولة)
 * @param {string} theme - الثيم المفضل للمستخدم (مثلاً: 'dark' أو 'light')
 * @returns {Promise<object>} - كائن يحتوي على نتيجة التسجيل (نجاح أو خطأ)
 */
export async function register(username, password, email, phone, theme) {
    const res = await secureFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, email, phone, theme })
    });

    return res.json();
}

/**
 * تسجيل الدخول
 * @param {string} username - اسم المستخدم
 * @param {string} password - كلمة المرور
 * @returns {Promise<object>} - كائن يحتوي على بيانات الجلسة أو رسالة الخطأ
 */
export async function login(username, password) {
    const res = await secureFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
    });

    return res.json();
}

/**
 * تسجيل الخروج من الجلسة الحالية
 * @returns {Promise<object>} - كائن يحتوي على نتيجة الخروج (نجاح أو خطأ)
 */
export async function logout() {
    const res = await secureFetch('/api/auth/logout', {
        method: 'POST'
    });

    return res.json();
}


/**
 * التحقق من الجلسة الحالية
 * @returns {Promise<object>}
 */
export async function checkSession(expectedRole = null) {
    try {
        const res = await secureFetch('/api/auth/check-session', {
            method: 'GET'
        });

        const contentType = res.headers.get('content-type');
        if (!res.ok || res.status === 401 || contentType?.includes('text/html')) {
            window.location.href = '/401.html';
            return null;
        }

        const data = await res.json();

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
        console.error('Session check failed:', err);
        window.location.href = '/401.html';
        return null;
    }

    return res.json();
}
