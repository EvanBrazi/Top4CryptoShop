/**
 * @file secureFetch.js
 * @description 🛡️ وحدة إرسال الطلبات مع حماية CSRF تلقائية
 * @version 1.0.0
 */
import { checkSession } from "./auth.js";

function getCsrfTokenFromCookie() {
    const match = document.cookie.match(/(?:^|;\s*)x-csrf-token=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
}

/**
 * إرسال طلب آمن تلقائيًا مع رمز CSRF
 * @param {string} url - عنوان الطلب
 * @param {object} options - إعدادات fetch (method, headers, body...)
 * @returns {Promise<Response>}
 */
export async function secureFetch(url, options = {}) {
    const method = options.method?.toUpperCase() || 'GET';

    // 🛡️ فقط أضف رمز CSRF للطلبات الحساسة
    const needsCsrf = ['POST', 'PUT', 'DELETE'].includes(method);
    const csrfToken = needsCsrf ? getCsrfTokenFromCookie() : null;

    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
        ...(csrfToken ? { 'x-csrf-token': csrfToken } : {})
    };

    const res = await secureFetch(url, {
        ...options,
        headers
    });
    const data = await res.json();
    console.log('📦 استجابة السيرفر:', data);
    return res;
    /**return fetch(url, {
        ...options,
        headers
    });*/
}
