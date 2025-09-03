/**
 * @file register.js
 * @description نموذج التسجيل الموحد مع دعم الثيم الديناميكي، التحقق، التحميل، التنبيهات، و OAuth
 * @author Evan Brazi
 * @version 2.2.0
 * @created 2024-12-01
 * @updated 2025-08-24
 */
import { register } from './auth.js'; // دالة التسجيل الموحدة عبر secureFetch

function showAlert(icon, title, text) {
    if (window.Swal) {
        Swal.fire({ icon, title, text, confirmButtonText: 'حسنًا' });
    } else {
        alert(`${title}: ${text}`);
    }
}

// 🧰 أدوات مساعدة
const digitsOnly = (s) => (s || '').replace(/[^\d]+/g, '');
const byId = (id) => document.getElementById(id); // ← يجب أن يكون قبل أي استخدام

// 🧭 روابط OAuth
byId('googleSignIn').addEventListener('click', () => {
    // ...
});

// 🔧 إعدادات الثيم
const THEME_KEY = 'theme';

const spinner = byId('spinner');
const btnText = byId('btnText');
const submitBtn = byId('submitBtn');

/**
 * تطبيق الثيم بناءً على قيمة من لوحة التحكم أو التخزين المحلي
 */
// ✅ تطبيق الثيم المحفوظ
document.addEventListener('DOMContentLoaded', () => {
    /**
 * ✅ تطبيق الثيم المحفوظ في localStorage
 * يضبط مظهر الصفحة حسب تفضيل المستخدم
 **/
    const savedTheme = localStorage.getItem('theme') || 'day';
    document.body.classList.remove('day-theme', 'night-theme');
    document.body.classList.add(`${savedTheme}-theme`);

    document.getElementById("phoneNumber").addEventListener("input", function (e) {
        let value = e.target.value;

        // السماح فقط بـ + في البداية ثم أرقام
        if (!/^\+?\d*$/.test(value)) {
            e.target.value = value.replace(/[^+\d]/g, "").replace(/^([^+])/, "");
        }
    });
});

// 🧭 روابط OAuth
byId('googleSignIn').addEventListener('click', () => {
    window.location.href =
        'https://accounts.google.com/o/oauth2/auth?' +
        'response_type=code&' +
        'client_id=YOUR_GOOGLE_CLIENT_ID&' +
        'redirect_uri=https://top4cryptoshop.onrender.com/api/auth/google/callback&' +
        'scope=email profile&' +
        'state=random_state_string';
});

byId('appleSignIn').addEventListener('click', () => {
    window.location.href =
        'https://appleid.apple.com/auth/authorize?' +
        'client_id=YOUR_APPLE_SERVICE_ID&' +
        'redirect_uri=https://top4cryptoshop.onrender.com/api/auth/apple/callback&' +
        'response_type=code&' +
        'scope=email name&' +
        'response_mode=form_post';
});

/**
 * عرض رسالة خطأ في عنصر معين
 */
function showError(elementId, message) {
    const element = byId(elementId);
    element.textContent = message;
    element.classList.add('show');
    element.style.animation = 'shake 0.3s ease';
    setTimeout(() => (element.style.animation = ''), 300);
}

function saveSession(user, token) {
    localStorage.setItem('user_id', user.id);
    localStorage.setItem('user_token', token);
}

/**
 * عرض رسالة خطأ عامة
 */
function showGeneralError(message) {
    const el = byId('generalError');
    el.textContent = message;
    el.classList.add('show');
}

function shakeElement(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 500);
}

/**
 * التحقق من صحة النموذج
 */
function validateForm(data) {
    const errors = {};
    const { username, password, email, countryCode, phoneNumber } = data;

    if (!username) errors.usernameError = 'يرجى إدخال اسم المستخدم';
    else if (username.length < 3 || username.length > 20)
        errors.usernameError = 'اسم المستخدم يجب أن يكون بين 3 و 20 حرفًا';

    if (!password) errors.passwordError = 'يرجى إدخال كلمة المرور';
    else if (password.length < 6)
        errors.passwordError = 'كلمة المرور يجب أن تكون 6 أحرف على الأقل';

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        errors.emailError = 'صيغة البريد الإلكتروني غير صحيحة';

    if (!countryCode) errors.phoneError = 'يرجى اختيار رمز الدولة';
    else if (!phoneNumber) errors.phoneError = 'يرجى إدخال رقم الجوال';
    else if (!/^\+\d{8,15}$/.test(`${countryCode}${phoneNumber}`))
        errors.phoneError = 'يرجى إدخال رقم هاتف بصيغة دولية تبدأ بـ +';

    return errors;
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

// 📝 التعامل مع نموذج التسجيل
byId('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    spinner.style.display = 'inline-block';
    btnText.style.display = 'none';
    submitBtn.disabled = true;

    // 🧹 تنظيف الأخطاء السابقة
    document.querySelectorAll('.error-message').forEach((el) => {
        el.classList.remove('show');
        el.textContent = '';
    });
    byId('generalError').classList.remove('show');
    byId('generalError').textContent = '';

    // 📥 التقاط القيم من النموذج
    const username = byId('username').value.trim();
    const password = byId('password').value;
    const email = byId('email').value.trim();
    const countryCode = byId('countryCode').value;
    const phoneNumberRaw = byId('phoneNumber').value;
    const phoneNumber = digitsOnly(phoneNumberRaw);
    const fullPhoneNumber = `${countryCode}${phoneNumber}`;
    const themeRaw = typeof window.dashboardTheme !== 'undefined'
        ? window.dashboardTheme
        : localStorage.getItem(THEME_KEY);
    const theme = !isNaN(themeRaw) ? Number(themeRaw) : 0;

    // ✅ التحقق من صحة البيانات
    const errors = validateForm({ username, password, email, countryCode, phoneNumber });
    if (Object.keys(errors).length > 0) {
        Object.entries(errors).forEach(([id, msg]) => showError(id, msg));
        return;
    }

    // ⏳ حالة تحميل مؤقتة
    submitBtn.disabled = true;
    submitBtn.textContent = 'جاري التسجيل...';
    try {
        const result = await register(username, password, email, fullPhoneNumber, theme);
        if (!result.success) {
            const msg = result.error || 'حدث خطأ أثناء التسجيل';
            showToastNotification(msg, 'error', 1500);
            switch (result.type) {
                case 'invalid_username':
                    showError('usernameError', msg);
                    shakeElement('username');
                    break;
                case 'invalid_password':
                    showError('passwordError', msg);
                    shakeElement('password');
                    break;
                case 'invalid_email':
                    showError('emailError', msg);
                    shakeElement('email');
                    break;
                case 'invalid_phone':
                    showError('phoneError', msg);
                    shakeElement('phoneNumber');
                    break;
                default:
                    showGeneralError(msg);
            }
            return;
        }

        saveSession(result.user, result.token);
        setTimeout(() => {
            spinner.style.display = 'none';
            btnText.style.display = 'inline';
            submitBtn.disabled = false;

            const redirectPath = '/login.html';
            window.location.href = redirectPath;
        }, 1600);
        showToastNotification(`👋 تم إنشاء الحساب بنجاح! سيتم تحويلك الآن... 🌟`, 'success', 1500);
        showAlert('success', 'تم التسجيل', 'تم إنشاء الحساب بنجاح! سيتم تحويلك الآن...');
    } catch (err) {
        console.error('❌ خطأ غير متوقع أثناء التسجيل:', err);
        const msg = extractErrorMessage(err.message || err);
        showGeneralError(msg);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'تسجيل';
        spinner.style.display = 'none';
        btnText.style.display = 'inline';
        submitBtn.disabled = false;
    }
});
