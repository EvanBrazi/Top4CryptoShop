/**
 * ✅ تطبيق الثيم المحفوظ في localStorage
 * يضبط مظهر الصفحة حسب تفضيل المستخدم
 **/
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme') || 'day';
    document.body.classList.remove('day-theme', 'night-theme');
    document.body.classList.add(`${savedTheme}-theme`);
});

/**
 * ✅ تسجيل الدخول عبر Google
 * يعيد توجيه المستخدم إلى صفحة المصادقة الخاصة بـ Google
 */
const googleBtn = document.getElementById('googleSignIn');
if (googleBtn) {
    googleBtn.addEventListener('click', () => {
        const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/auth');
        googleAuthUrl.searchParams.set('response_type', 'code');
        googleAuthUrl.searchParams.set('client_id', 'YOUR_GOOGLE_CLIENT_ID');
        googleAuthUrl.searchParams.set('redirect_uri', 'https://top4cryptoshop.onrender.com/api/auth/google/callback');
        googleAuthUrl.searchParams.set('scope', 'email profile');
        googleAuthUrl.searchParams.set('state', crypto.randomUUID());
        window.location.href = googleAuthUrl.toString();
    });
}

/**
 * ✅ تسجيل الدخول عبر Apple
 */
const appleBtn = document.getElementById('appleSignIn');
if (appleBtn) {
    appleBtn.addEventListener('click', () => {
        const appleAuthUrl = new URL('https://appleid.apple.com/auth/authorize');
        appleAuthUrl.searchParams.set('client_id', 'YOUR_APPLE_SERVICE_ID');
        appleAuthUrl.searchParams.set('redirect_uri', 'https://top4cryptoshop.onrender.com/api/auth/apple/callback');
        appleAuthUrl.searchParams.set('response_type', 'code');
        appleAuthUrl.searchParams.set('scope', 'email name');
        appleAuthUrl.searchParams.set('response_mode', 'form_post');
        window.location.href = appleAuthUrl.toString();
    });
}

/**
 * ✅ عرض رسالة خطأ في عنصر معين
 * @param {string} elementId - معرف العنصر
 * @param {string} message - نص الرسالة
 */
function showError(elementId, message) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = message;
        el.classList.add('show');
    }
}

/**
 * ✅ عرض رسالة خطأ عامة
 * @param {string} message
 */
function showLoginError(message) {
    const generalError = document.getElementById('generalError');
    if (generalError) {
        generalError.textContent = message;
        generalError.classList.add('show');
    }
}

/**
 * ✅ تنفيذ عملية تسجيل الدخول التقليدي
 * @param {string} username
 * @param {string} password
 */
async function loginUser(username, password) {
    try {
        // جلب رمز CSRF
        const csrfRes = await fetch("/csrf-token");
        if (!csrfRes.ok) throw new Error("فشل في جلب رمز CSRF");
        const { csrfToken } = await csrfRes.json();

        // إرسال بيانات الدخول
        const loginRes = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-csrf-token': csrfToken
            },
            credentials: 'include',
            body: JSON.stringify({ username, password })
        });

        const result = await loginRes.json();

        // التعامل مع الأخطاء الخاصة
        if (result.type === 'invalid_password' && result.remainingAttempts !== undefined) {
            showError('attemptsWarning', `❌ تبقّى ${result.remainingAttempts} محاولة قبل تعليق الحساب`);
            return;
        }

        if (result.type === 'too_many_attempts') {
            const suspendedMessage = `
          🚫 تم تعليق الحساب مؤقتًا بسبب عدد المحاولات.
          <br>📞 يمكنك مراسلتنا عبر <a href="https://wa.me/+963980217649" target="_blank" style="color:green;font-weight:bold;">واتساب</a>
          أو الضغط هنا لإرسال طلب إعادة التفعيل.
        `;
            const generalError = document.getElementById('generalError');
            generalError.innerHTML = suspendedMessage;
            generalError.classList.add('show');
            return;
        }

        if (!loginRes.ok || !result.success) {
            throw new Error(result.error || 'حدث خطأ أثناء تسجيل الدخول');
        }

        // تسجيل الدخول ناجح
        console.log("✅ تسجيل الدخول ناجح:", result.user);
        localStorage.setItem('userRole', result.user.role);
        localStorage.setItem('username', result.user.username);

        // التوجيه حسب الدور
        const roleRedirects = {
            admin: '/protectedViews/admin.html',
            user: '/homepage.html',
            moderator: '/moderator/dashboard.html',
            support: '/support/center.html'
        };

        const redirectPath = result.redirectTo || roleRedirects[result.user.role] || '/homepage.html';
        window.location.href = redirectPath;

    } catch (err) {
        console.error("🚨 خطأ أثناء تسجيل الدخول:", err);
        showLoginError(err.message || 'حدث خطأ غير متوقع. حاول لاحقًا.');
    }
}

/**
 * ✅ ربط النموذج بعملية تسجيل الدخول
 */
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // تنظيف الأخطاء السابقة
        document.querySelectorAll('.error-message').forEach(el => {
            el.classList.remove('show');
            el.textContent = '';
        });

        const generalError = document.getElementById('generalError');
        generalError.classList.remove('show');
        generalError.textContent = '';

        const username = document.getElementById('username')?.value.trim();
        const password = document.getElementById('password')?.value;

        if (!username || !password) {
            showLoginError('يرجى إدخال اسم المستخدم وكلمة المرور');
            return;
        }

        await loginUser(username, password);
    });
}