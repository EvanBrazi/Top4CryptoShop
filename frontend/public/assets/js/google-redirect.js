import { STORAGE_KEYS } from "./utils/appUtils.js";

/**
 * حفظ بيانات الجلسة في التخزين المحلي
 * @param {object} user - بيانات المستخدم
 * @param {string} token - رمز التوثيق
 */
function saveSession(userId, token, sessionId) {
    console.log('💾 حفظ بيانات الجلسة في التخزين المحلي', userId, token, sessionId);
    localStorage.setItem(STORAGE_KEYS.USER_ID, userId);
    localStorage.setItem(STORAGE_KEYS.USER_TOKEN, token);
    localStorage.setItem(STORAGE_KEYS.SESSION_ID, sessionId)
}

// 📥 استخراج التوكن ومعرف الجلسة من URL
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const sessionId = urlParams.get('customSessionId');

    if (!token || !sessionId) return window.location.href = '/login.html';

    console.log('✅ تم استلام التوكن ومعرف الجلسة:', { token, sessionId });
    // 📥 جلب بيانات المستخدم الحالي
    fetch('/api/users/me', {
        headers: {
            Authorization: `Bearer ${token}`,
            'x-session-id': sessionId
        }
    })
        .then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })
        .then(user => {
            const welcomeEl = document.getElementById('welcomeMessage');
            if (welcomeEl) {
                welcomeEl.textContent = user?.username
                    ? `👋 أهلاً ${user.username}، جاري تحويلك...`
                    : '👋 مرحبًا بك!';
            }

            console.log('✅ بيانات المستخدم:', user);
            // 💾 حفظ بيانات الجلسة
            saveSession(user.id, token, sessionId);
            const roleRedirects = {
                admin: '/protectedViews/admin.html',
                user: '/homepage.html',
                moderator: '/moderator/dashboard.html',
                support: '/support/center.html'
            };

            const redirectPath = roleRedirects[user.role] || '/homepage.html';

            setTimeout(() => {
                alert('تم تسجيل الدخول بنجاح! جاري تحويلك...');
                window.location.href = redirectPath;
            }, 2500);
        })
        .catch(err => {
            console.error('❌ فشل في جلب بيانات المستخدم:', err);
            alert('حدث خطأ أثناء تسجيل الدخول. يرجى المحاولة مرة أخرى.');
            window.location.href = '/login.html';
        });
});
