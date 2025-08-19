/**
 * @file auth.js
 * @description 🔐 وحدة إدارة الجلسة وتسجيل الدخول والخروج
 * @version 1.0.0
 */

import { secureFetch } from './securefetch.js';

/**
 * تسجيل الدخول
 * @param {string} username
 * @param {string} password
 * @returns {Promise<object>}
 */
export async function login(username, password) {
    const res = await secureFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
    });

    return res.json();
}

/**
 * تسجيل الخروج
 * @returns {Promise<object>}
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
