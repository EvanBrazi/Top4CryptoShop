/**
 * @file secureFetch.js
 * @description 🛡️ وحدة إرسال الطلبات مع حماية CSRF تلقائية
 * @version 1.0.0
 */

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
    const needsCsrf = ['POST', 'PUT', 'DELETE'].includes(method);
    const csrfToken = needsCsrf ? getCsrfTokenFromCookie() : null;

    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
        ...(csrfToken ? { 'x-csrf-token': csrfToken } : {})
    };

    try {
        const response = await fetch(url, {
            ...options,
            headers,
            credentials: 'include'
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        return response;
    } catch (err) {
        console.error("📛 فشل الطلب:", err.message);
        throw err; // أعد إرسال الخطأ ليتم التعامل معه في register.js
    }
}

