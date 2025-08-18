// 0 = نهاري، 1 = ليلي
const THEME_KEY = 'theme';

// طبّق الثيم مبكرًا بعد تحميل الـ DOM
document.addEventListener('DOMContentLoaded', function () {
    const savedTheme = Number(localStorage.getItem(THEME_KEY) ?? 0);
    document.body.classList.remove('day-theme', 'night-theme');
    document.body.classList.add(savedTheme === 1 ? 'night-theme' : 'day-theme');
});

// 1) تسجيل الدخول عبر Google (placeholder حتى تكمل ضبط OAuth)
document.getElementById('googleSignIn').addEventListener('click', () => {
    window.location.href =
        'https://accounts.google.com/o/oauth2/auth?' +
        'response_type=code&' +
        'client_id=YOUR_GOOGLE_CLIENT_ID&' +
        'redirect_uri=https://top4cryptoshop.onrender.com/api/auth/google/callback&' +
        'scope=email profile&' +
        'state=random_state_string';
});

// 2) تسجيل الدخول عبر Apple (placeholder حتى تكمل ضبط OAuth)
document.getElementById('appleSignIn').addEventListener('click', () => {
    window.location.href =
        'https://appleid.apple.com/auth/authorize?' +
        'client_id=YOUR_APPLE_SERVICE_ID&' +
        'redirect_uri=https://top4cryptoshop.onrender.com/api/auth/apple/callback&' +
        'response_type=code&' +
        'scope=email name&' +
        'response_mode=form_post';
});

// أدوات صغيرة للمساعدة
const digitsOnly = (s) => (s || '').replace(/[^\d]+/g, '');
const byId = (id) => document.getElementById(id);

// 3) التسجيل التقليدي
byId('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    // عرض رسائل الخطأ
    console.log('Error: ' + e);
    // إخفاء رسائل الخطأ السابقة
    document.querySelectorAll('.error-message').forEach((el) => {
        el.classList.remove('show');
        el.textContent = '';
    });

    // إخفاء رسالة الخطأ العامة
    const generalError = byId('generalError');
    generalError.classList.remove('show');
    generalError.textContent = '';

    // التقاط القيم
    const username = byId('username').value.trim();
    const password = byId('password').value;
    const email = byId('email').value.trim();
    const countryCode = byId('countryCode').value;
    const phoneNumberRaw = byId('phoneNumber').value;

    // تحقق من اسم المستخدم
    if (!username) {
        showError('usernameError', 'يرجى إدخال اسم المستخدم');
        return;
    }
    if (username.length < 3 || username.length > 20) {
        showError('usernameError', 'اسم المستخدم يجب أن يكون بين 3 و 20 حرفًا');
        return;
    }

    // تحقق من كلمة المرور
    if (!password) {
        showError('passwordError', 'يرجى إدخال كلمة المرور');
        return;
    }
    if (password.length < 6) {
        showError('passwordError', 'كلمة المرور يجب أن تكون 6 أحرف على الأقل');
        return;
    }

    // تحقق من البريد الإلكتروني (اختياري لكن بصيغة صحيحة إن وُجد)
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showError('emailError', 'صيغة البريد الإلكتروني غير صحيحة');
        return;
    }

    // تحقق بسيط من الهاتف
    if (!countryCode) {
        showError('phoneError', 'يرجى اختيار رمز الدولة');
        return;
    }
    const phoneNumber = digitsOnly(phoneNumberRaw);
    if (!phoneNumber) {
        showError('phoneError', 'يرجى إدخال رقم الجوال');
        return;
    }

    const fullPhoneNumber = `${countryCode}${phoneNumber}`;

    // اجلب الثيم كرقم 0/1 من localStorage (افتراضي 0)
    const themeRaw = localStorage.getItem(THEME_KEY);
    const theme = !isNaN(themeRaw) ? Number(themeRaw) : 0;
    if (!/^\+\d{8,15}$/.test(fullPhoneNumber)) {
        showError('phoneError', 'صيغة رقم الهاتف غير صحيحة');
        return;
    }

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username,
                password,
                email: email || undefined,
                phone: fullPhoneNumber,
                theme
            })
        });
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'حدث خطأ أثناء التسجيل');
        }

        // نجاح
        alert('تم تسجيل الحساب بنجاح!');
        window.location.href = '/homepage.html';
    } catch (err) {
        console.error('Error:', err);

        // توزيع رسائل الخطأ
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
            generalError.textContent = msg;
            generalError.classList.add('show');
        }
    }
});

function showError(elementId, message) {
    const element = document.getElementById(elementId);
    element.textContent = message;
    element.classList.add('show');
}