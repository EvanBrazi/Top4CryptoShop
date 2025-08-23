import { login, checkSession } from './auth.js';
import { STORAGE_KEYS, isValidToken } from './utils/appUtils.js';
// ✅ عناصر الواجهة
const spinner = document.getElementById('spinner');
const btnText = document.getElementById('btnText');
const submitBtn = document.getElementById('submitBtn');

// ✅ تطبيق الثيم المحفوظ
document.addEventListener('DOMContentLoaded', () => {
    const TOKEN = localStorage.getItem(STORAGE_KEYS.USER_TOKEN);
    (async () => {
        console.log('Token : ', await isValidToken(TOKEN));
        if (await isValidToken(TOKEN)) {
            alert('You will go home!', TOKEN)
            window.location.href = '/homepage.html';
        }
    })();
    /**
 * ✅ تطبيق الثيم المحفوظ في localStorage
 * يضبط مظهر الصفحة حسب تفضيل المستخدم
 **/
    const savedTheme = localStorage.getItem('theme') || 'day';
    document.body.classList.remove('day-theme', 'night-theme');
    document.body.classList.add(`${savedTheme}-theme`);
});

// ✅ تسجيل الدخول عبر Google
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

// ✅ تسجيل الدخول عبر Apple
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
 * حفظ بيانات الجلسة في التخزين المحلي
 * @param {object} user - بيانات المستخدم
 * @param {string} token - رمز التوثيق
 */
function saveSession(user, token) {
    localStorage.setItem(STORAGE_KEYS.USER_ID, user.id);
    localStorage.setItem(STORAGE_KEYS.USER_TOKEN, token);
}

// ✅ عرض رسالة خطأ في عنصر معين
function showError(elementId, message) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = message;
        el.classList.add('show');
    }
}

// ✅ عرض رسالة خطأ عامة
function showLoginError(message) {
    const generalError = document.getElementById('generalError');
    if (generalError) {
        generalError.textContent = message;
        generalError.classList.add('show');
    }
}

// ✅ تنبيه SweetAlert2
function showAlert(icon, title, text) {
    if (window.Swal) {
        Swal.fire({ icon, title, text, confirmButtonText: 'حسنًا' });
    } else {
        alert(`${title}: ${text}`);
    }
}

/**
 * ✅ تنفيذ عملية تسجيل الدخول بشكل آمن ومتوافق مع auth.js و secureFetch.js
 * @param {string} username - اسم المستخدم
 * @param {string} password - كلمة المرور
 */
async function loginUser(username, password) {
    spinner.style.display = 'inline-block';
    btnText.style.display = 'none';
    submitBtn.disabled = true;

    try {
        const result = await login(username, password); // ⬅️ استخدام الدالة الموحدة

        if (result.error === "يجب توفير رمز الجلسة") {
            showAlert('error', 'رمز الجلسة مفقود', 'يرجى إعادة تحميل الصفحة أو تسجيل الدخول من جديد.');
            return;
        }

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

        if (!result.success) {
            throw new Error(result.error || 'حدث خطأ أثناء تسجيل الدخول');
        }

        saveSession(result.user, result.token);

        const roleRedirects = {
            admin: '/protectedViews/admin.html',
            user: '/homepage.html',
            moderator: '/moderator/dashboard.html',
            support: '/support/center.html'
        };

        setTimeout(() => {
            spinner.style.display = 'none';
            btnText.style.display = 'inline';
            submitBtn.disabled = false;

            const redirectPath = result.redirectTo || roleRedirects[result.user.role] || '/homepage.html';
            window.location.href = redirectPath;
        }, 1500);

    } catch (err) {
        console.error("🚨 خطأ أثناء تسجيل الدخول:", err);
        showAlert('error', 'فشل تسجيل الدخول', err.message || 'حدث خطأ غير متوقع. حاول لاحقًا.');
    } finally {
        spinner.style.display = 'none';
        btnText.style.display = 'inline';
        submitBtn.disabled = false;
    }
}


// ✅ ربط النموذج بعملية تسجيل الدخول
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

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
            showAlert('warning', 'بيانات ناقصة', 'يرجى إدخال اسم المستخدم وكلمة المرور');
            return;
        }

        await loginUser(username, password);
    });
}