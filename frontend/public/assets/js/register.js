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
            e.target.value = value.replace(/[^+\d]/g, "").replace(/(?!^)\+/g, "");
        }
    });
});

// 🧭 روابط OAuth
byId('googleSignIn').addEventListener('click', () => {
    window.location.href = '/api/auth/google';
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
    else if (!/^[A-Za-z0-9_]{3,30}$/.test(username))
        errors.usernameError = 'اسم المستخدم يجب أن يكون بين 3 و 30 حرفًا (حروف إنجليزية، أرقام، أو _)';

    if (!password) errors.passwordError = 'يرجى إدخال كلمة المرور';
    else if (password.length < 8 || new TextEncoder().encode(password).length > 72 ||
        !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/.test(password))
        errors.passwordError = 'كلمة المرور يجب أن تكون 8 أحرف على الأقل، وتحتوي على حرف كبير وصغير ورقم ورمز، ولا تتجاوز 72 بايت';

    if (!email) errors.emailError = 'يرجى إدخال البريد الإلكتروني';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        errors.emailError = 'صيغة البريد الإلكتروني غير صحيحة';

    // Both blank is valid; providing either part requires the other.
    if (phoneNumber && !countryCode) errors.phoneError = 'يرجى اختيار رمز الدولة';
    else if (countryCode && !phoneNumber) errors.phoneError = 'يرجى إدخال رقم الجوال';
    else if (phoneNumber && !/^\+\d{8,15}$/.test(`${countryCode}${phoneNumber}`))
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
    const fullPhoneNumber = countryCode && phoneNumber ? `${countryCode}${phoneNumber}` : undefined;

    // ✅ التحقق من صحة البيانات
    const errors = validateForm({ username, password, email, countryCode, phoneNumber });
    if (phoneNumberRaw.trim() && !phoneNumber) errors.phoneError = 'يرجى إدخال رقم هاتف صحيح';
    if (Object.keys(errors).length > 0) {
        Object.entries(errors).forEach(([id, msg]) => showError(id, msg));
        return;
    }

    // ⏳ حالة تحميل مؤقتة بعد نجاح التحقق المحلي
    spinner.style.display = 'inline-block';
    btnText.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.textContent = 'جاري التسجيل...';
    try {
        const result = await register(username, password, email, fullPhoneNumber);
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

        // Registration creates an account only; authentication starts on the login page.
        setTimeout(() => {
            spinner.style.display = 'none';
            btnText.style.display = 'inline';
            submitBtn.disabled = false;

            const redirectPath = '/login.html';
            window.location.href = redirectPath;
        }, 1600);
        showToastNotification(`👋 تم إنشاء الحساب بنجاح! سيتم تحويلك الآن... 🌟`, 'success', 1500);
        showAlert('success', 'تم التسجيل', 'تم إنشاء الحساب بنجاح! سيتم تحويلك الآن...');
    } catch {
        console.error('Registration request failed');
        showGeneralError('حدث خطأ أثناء التسجيل، يرجى التحقق من النتيجة قبل المحاولة مجددًا');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'تسجيل';
        spinner.style.display = 'none';
        btnText.style.display = 'inline';
        submitBtn.disabled = false;
    }
});
