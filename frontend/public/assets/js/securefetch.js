function inferErrorType(message = '') {
  if (message.includes('اسم المستخدم')) return 'invalid_credentials';
  if (message.includes('كلمة المرور')) return 'invalid_password';
  if (message.includes('رمز الجلسة')) return 'missing_session';
  if (message.includes('تم تعليق الحساب')) return 'too_many_attempts';
  return 'server_error';
}

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
        const response = await secureFetchWithLoader(url, {
            ...options,
            headers,
            credentials: 'include'
        });

        let data;
        try {
            data = await response.json();
        } catch {
            data = { error: await response.text() };
        }

        if (!response.ok) {
            return {
                remainingAttempts: data.remainingAttempts,
                success: false,
                status: response.status,
                error: data.error || 'فشل في تنفيذ الطلب',
                type: data.type || inferErrorType(data.error)
            };
        }

        return {
            success: true,
            data
        };
    } catch (err) {
        return {
            success: false,
            error: err.message || 'خطأ في الاتصال',
            type: 'network_error'
        };
    }
}

async function secureFetchWithLoader(url, options = {}) {
    try {
        showLoader();
        const response = await fetch(url, options);
        return response;
    } finally {
        hideLoader();
    }
}
