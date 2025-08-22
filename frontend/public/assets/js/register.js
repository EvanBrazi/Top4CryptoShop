/**
 * @file register.js
 * @description نموذج التسجيل التقليدي مع دعم التحقق، الثيم، وOAuth
 * @author Evan Brazi
 * @version 2.0.0
 * @created 2024-12-01
 * @updated 2025-08-22
 */

import { register } from './auth.js'; // دالة التسجيل الموحدة عبر secureFetch

// 🔧 إعدادات الثيم
const THEME_KEY = 'theme';

// ✅ تطبيق الثيم عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = Number(localStorage.getItem(THEME_KEY) ?? 0);
    document.body.classList.remove('day-theme', 'night-theme');
    document.body.classList.add(savedTheme === 1 ? 'night-theme' : 'day-theme');
});

// 🧭 روابط OAuth (Google و Apple)
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

// 🧰 أدوات مساعدة
const digitsOnly = (s) => (s || '').replace(/[^\d]+/g, '');
const byId = (id) => document.getElementById(id);

/**
 * عرض رسالة خطأ في عنصر معين
 * @param {string} elementId - معرف العنصر
 * @param {string} message - نص الرسالة
 */
function showError(elementId, message) {
    const element = byId(elementId);
    element.textContent = message;
    element.classList.add('show');
}

/**
 * عرض رسالة خطأ عامة
 * @param {string} message - نص الرسالة
 */
function showGeneralError(message) {
    const el = byId('generalError');
    el.textContent = message;
    el.classList.add('show');
}

/**
 * التحقق من صحة النموذج
 * @param {Object} data - بيانات النموذج
 * @returns {Object} - كائن يحتوي على الأخطاء
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
        errors.phoneError = 'صيغة رقم الهاتف غير صحيحة';

    return errors;
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
    const fullPhoneNumber = `${countryCode}${phoneNumber}`;
    const themeRaw = localStorage.getItem(THEME_KEY);
    const theme = !isNaN(themeRaw) ? Number(themeRaw) : 0;

    // ✅ التحقق من صحة البيانات
    const errors = validateForm({ username, password, email, countryCode, phoneNumber });
    if (Object.keys(errors).length > 0) {
        Object.entries(errors).forEach(([id, msg]) => showError(id, msg));
        return;
    }

    // ⏳ حالة تحميل مؤقتة
    const submitBtn = byId('submitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'جاري التسجيل...';

    try {
        const result = await register(username, password, email, fullPhoneNumber, theme);

        if (result?.success === false || result?.error) {
            const errorMessage = typeof result === 'string' ? result : result.error || 'حدث خطأ أثناء التسجيل';
            throw new Error(errorMessage);
        }

        // 🎉 نجاح التسجيل
        alert('تم تسجيل الحساب بنجاح!');
        window.location.href = '/homepage.html';

    } catch (err) {
        console.error('❌ خطأ أثناء التسجيل:', err);
        const msg = String(err.message || '');

        if (msg.includes('اسم المستخدم')) {
            showError('usernameError', msg);
        } else if (msg.includes('كلمة المرور')) {
            showError('passwordError', msg);
        } else if (msg.includes('الهاتف') || msg.includes('رقم')) {
            showError('phoneError', msg);
        } else if (msg.includes('البريد')) {
            showError('emailError', msg);
        } else {
            showGeneralError(msg);
        }
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'تسجيل';
    }
});
