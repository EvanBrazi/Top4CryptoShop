import { login } from './auth.js';
import { STORAGE_KEYS } from './utils/appUtils.js';
import { secureFetch } from './securefetch.js';

function loginRedirectFor(user) {
    if (user.role === 'admin') return '/homepage.html';
    // TODO(C5): Replace with user dashboard when built
    return '/';
}
// ✅ عناصر الواجهة
const spinner = document.getElementById('spinner');
const btnText = document.getElementById('btnText');
const submitBtn = document.getElementById('submitBtn');

// ✅ تطبيق الثيم المحفوظ
document.addEventListener('DOMContentLoaded', () => {
    (async () => {
        const result = await secureFetch('/api/auth/check-session');
        if (result.success && result.data.isAuthenticated === true &&
            result.data.user?.id && typeof result.data.user.role === 'string') {
            window.location.href = loginRedirectFor(result.data.user);
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
        window.location.href = '/api/auth/google';
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
function saveSession(userId, token, sessionId) {
    localStorage.setItem(STORAGE_KEYS.USER_ID, userId);
    localStorage.setItem(STORAGE_KEYS.USER_TOKEN, token);
    localStorage.setItem(STORAGE_KEYS.SESSION_ID, sessionId)
}

/**
 * اهتزاز عنصر معين لإبراز الخطأ
 * @param {string} elementId - معرف العنصر
 */
function shakeElement(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;

    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 500);
}

// ✅ عرض رسالة خطأ في عنصر معين
function showError(elementId, message) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = message;
        el.classList.add('show');
    }
}

function clearErrors() {
    const errorElements = document.querySelectorAll('.error-message, .general-error');
    errorElements.forEach(el => {
        el.textContent = '';
        el.classList.remove('show');
    });
}

/**
 * استخراج رسالة خطأ مفهومة من أي كائن خطأ
 * @param {any} err - الكائن الخطأ
 * @returns {String} - رسالة نصية قابلة للعرض
 */
function extractErrorMessage(err) {
    if (!err) return 'حدث خطأ غير معروف';

    // إذا كانت الرسالة موجودة بشكل مباشر
    if (typeof err === 'string') return err;
    if (typeof err.message === 'string') return err.message;

    // إذا كانت الرسالة داخل response أو data
    if (err.response?.data?.error) return err.response.data.error;
    if (err.data?.error) return err.data.error;

    // إذا كان كائن JSON
    try {
        return JSON.stringify(err, null, 2);
    } catch {
        return 'حدث خطأ غير متوقع';
    }
}

/**
 * عرض إشعار توست جذاب في أعلى الشاشة
 * @param {String} message - نص الرسالة
 * @param {'success'|'error'|'info'|'warning'} type - نوع الرسالة
 * @param {Number} duration - مدة العرض بالميلي ثانية (افتراضي 3000)
 */
function showToastNotification(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.textContent = message;

    // تنسيق أساسي
    toast.style.position = 'fixed';
    toast.style.top = '20px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.padding = '12px 20px';
    toast.style.borderRadius = '8px';
    toast.style.fontSize = '16px';
    toast.style.fontWeight = '500';
    toast.style.color = '#fff';
    toast.style.zIndex = '9999';
    toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';

    // ألوان حسب النوع
    const colors = {
        success: '#4CAF50',
        error: '#F44336',
        info: '#2196F3',
        warning: '#FF9800'
    };
    toast.style.backgroundColor = colors[type] || '#333';

    document.body.appendChild(toast);

    // إظهار تدريجي
    setTimeout(() => {
        toast.style.opacity = '1';
    }, 100);

    // إزالة بعد المدة المحددة
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, duration);
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
    clearErrors(); // 🧼 تنظيف الأخطاء السابقة
    spinner.style.display = 'inline-block';
    btnText.style.display = 'none';
    submitBtn.disabled = true;

    try {
        const result = await login(username, password);

        // ✅ معالجة الأخطاء المعروفة
        if (result.error === "يجب توفير رمز الجلسة") {
            showAlert('error', 'رمز الجلسة مفقود', 'يرجى إعادة تحميل الصفحة أو تسجيل الدخول من جديد.');
            showToastNotification('⚠️ رمز الجلسة مفقود. أعد المحاولة.', 'error', 3000);
            shakeElement('usernameInput');
            return;
        }

        if (result.type === 'invalid_credentials') {
            showError('usernameError', extractErrorMessage(result.error));
            shakeElement('usernameInput');
            return;
        }

        if (result.type === 'missing_password') {
            showError('passwordError', extractErrorMessage(result.error));
            shakeElement('passwordInput');
            return;
        }

        if (result.type === 'invalid_password' && result.remainingAttempts !== undefined) {
            showError('passwordError', extractErrorMessage(result.error));
            showError('attemptsWarning', `❌ تبقّى ${result.remainingAttempts} محاولة قبل تعليق الحساب`);
            shakeElement('passwordInput');
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
            shakeElement('usernameInput');
            shakeElement('passwordInput');
            return;
        }

        if (!result.success || !result.user) {
            const msg = extractErrorMessage(result.error) || 'حدث خطأ أثناء تسجيل الدخول';
            showToastNotification(`🚨 ${msg}`, 'error', 3000);
            showError('generalError', msg);
            shakeElement('usernameInput');
            shakeElement('passwordInput');
            return;
        }

        // ✅ تسجيل الدخول ناجح؛ sessionId موجود في المستوى الأعلى للاستجابة
        saveSession(result.user.id, result.token, result.sessionId);

        setTimeout(() => {
            spinner.style.display = 'none';
            btnText.style.display = 'inline';
            submitBtn.disabled = false;

            const redirectPath = loginRedirectFor(result.user);
            window.location.href = redirectPath;
        }, 2100);

        showToastNotification(`👋 أهلاً بعودتك يا ${username} 🌟`, 'success', 2000);
    } catch (err) {
        const msg = extractErrorMessage(err.message || err);
        console.error('Login request failed');
        showAlert('error', 'فشل تسجيل الدخول', msg);
        showToastNotification(`🚨 ${msg}`, 'error', 3000);
        shakeElement('usernameInput');
        shakeElement('passwordInput');
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