/**
 * @file usermanager.js
 * @description إدارة بيانات المستخدم مع مزامنة قاعدة البيانات، فحص التوكن، وتحديث الواجهة
 * @version 3.0.0
 * @license MIT
 */
//import MD5 from 'https://cdn.jsdelivr.net/npm/crypto-js/crypto-js.min.js';
import { logout } from './auth.js';
import { toggleDBTheme } from './theme.js';
import { showToast } from './utils/toast.js';

// مفاتيح التخزين المحلي
const STORAGE_KEYS = {
    USER_ID: 'userId',
    USER_TOKEN: 'userToken',
};
// حالة المستخدم الحالية
let currentUser = null;

/**
 * التحقق من صحة التوكن
 * @param {string} token - رمز التوثيق
 * @returns {boolean}
 */
function isValidToken(token) {
    return typeof token === 'string' && token.length >= 16 && (
        fetch('/api/compare-token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` // أو أي اسم تريده
            },
            credentials: 'include', // هذا يضمن إرسال الكوكي مع الطلب
            body: JSON.stringify({ clientToken: token })
        })
            .then(res => res.json())
            .then(data => {
                if (data.match) {
                    console.log('✅ التوكنات متطابقة');
                } else {
                    console.warn('❌ التوكنات غير متطابقة');
                }
            })
            .catch(err => console.error('خطأ في الاتصال:', err))
    );
}

/**
 * تحميل بيانات المستخدم من السيرفر باستخدام userId والتوكن
 * @async
 * @returns {Promise<void>}
 */
async function loadUser() {
    const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
    const token = localStorage.getItem(STORAGE_KEYS.USER_TOKEN);

    if (!userId || !isValidToken(token)) {
        console.warn('⚠️ لا يوجد توكن صالح أو معرف مستخدم');
        return;
    }

    try {
        const res = await fetch(`/api/users/${userId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!res.ok) throw new Error('فشل تحميل بيانات المستخدم');

        const userData = await res.json();
        console.log('User Data: ', userData);
        const isValidateUser = validateUser(userData);
        if (isValidateUser.valid) {
            currentUser = userData;
            await updateUserProfile();
            console.log('validateUser : ', userData);
        } else {
            throw new Error(isValidateUser.errors);
        }
    } catch (error) {
        console.error('❌ خطأ في تحميل المستخدم:', error.message);
        showToast('تعذر تحميل بيانات المستخدم', 'error');
    }
}

/**
 * التحقق من صحة بيانات المستخدم بطريقة مرنة وآمنة
 * @param {Object} user - بيانات المستخدم
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateUser(user) {
    const errors = [];

    if (!user || typeof user !== 'object') {
        errors.push('المدخل ليس كائنًا صالحًا');
        return { valid: false, errors };
    }

    // التحقق من الاسم أو اسم المستخدم
    const name = user.name || user.username;
    if (typeof name !== 'string' || name.trim() === '') {
        errors.push('الاسم غير صالح');
    }

    // التحقق من البريد الإلكتروني
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(user.email || '')) {
        errors.push('البريد الإلكتروني غير صالح');
    }

    // التحقق من الرصيد
    if (typeof user.balance !== 'number' || user.balance < 0) {
        errors.push('الرصيد غير صالح');
    }

    // التحقق من الثيم
    if (![0, 1].includes(user.theme)) {
        errors.push('قيمة الثيم غير مدعومة');
    }

    // التحقق من رقم الهاتف (اختياري)
    if (user.phone && !/^\+?\d{7,15}$/.test(user.phone)) {
        errors.push('رقم الهاتف غير صالح');
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * تحديث واجهة المستخدم حسب بياناته
 * @async
 * @returns {Promise<void>}
 */
async function updateUserProfile() {
    try {
        if (!currentUser) {
            console.warn('⚠️ لا يوجد مستخدم حالي لتحديث الواجهة');
            return;
        }
        const usernameDisplay = document.getElementById('username-display');
        if (usernameDisplay) usernameDisplay.textContent = currentUser.name;

        const balanceElements = [
            document.getElementById('balance-display'),
            document.getElementById('top-balance-display')
        ].filter(Boolean);

        balanceElements.forEach(el => {
            el.textContent = currentUser.balance.toFixed(2);
        });

        const userAvatar = document.getElementById('user-avatar');
        if (userAvatar) await updateUserAvatar(userAvatar);

        toggleDBTheme(currentUser.theme === 1 ? 'night' : 'day');
    } catch (error) {
        console.error('❌ خطأ في تحديث الواجهة:', error.message);
    }
}

/**
 * تحديث صورة الملف الشخصي بطريقة آمنة ومرنة
 * @param {HTMLImageElement} imgElement - عنصر الصورة
 * @returns {Promise<void>}
 */
async function updateUserAvatar(imgElement) {
    try {
        const fallbackSrc = getDefaultAvatar(currentUser.name);

        // منع التكرار اللانهائي
        let hasFailedOnce = false;
        imgElement.onerror = () => {
            if (!hasFailedOnce) {
                hasFailedOnce = true;
                imgElement.src = fallbackSrc;
            }
        };

        // تحديد مصدر الصورة
        if (currentUser.avatar && currentUser.avatar.startsWith('http')) {
            imgElement.src = currentUser.avatar;
        } else {
            const emailHash = generateEmailHash(currentUser.email);
            imgElement.src = `https://www.gravatar.com/avatar/${emailHash}?d=404&s=160`;
        }
    } catch (error) {
        console.error('❌ خطأ في تحميل الصورة:', error.message);
        imgElement.src = getDefaultAvatar(currentUser?.name);
    }
}

/**
 * إنشاء هاش MD5 للبريد الإلكتروني (Gravatar)
 * @param {string} email
 * @returns {string}
 */
function generateEmailHash(email) {
    console.log("اختبار md5:", md5("test@example.com"));
    return md5(email.trim().toLowerCase());
}

/**
 * الحصول على صورة افتراضية باسم المستخدم
 * @param {string} name
 * @returns {string}
 */
function getDefaultAvatar(name) {
    const encodedName = encodeURIComponent(name || 'زائر');
    return `https://ui-avatars.com/api/?name=${encodedName}&background=random&size=160`;
}


/**
 * حفظ بيانات المستخدم في قاعدة البيانات
 * @async
 * @returns {Promise<boolean>}
 */
async function saveUser() {
    const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
    const token = localStorage.getItem(STORAGE_KEYS.USER_TOKEN);

    if (!userId || !isValidToken(token)) {
        showToast('لا يمكن حفظ البيانات بدون توكن صالح', 'error');
        return false;
    }

    try {
        const res = await fetch(`/api/users/${userId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(currentUser)
        });

        if (!res.ok) throw new Error('فشل حفظ البيانات');
        showToast('✅ تم حفظ البيانات بنجاح', 'success');
        return true;
    } catch (error) {
        console.error('❌', error.message);
        showToast('حدث خطأ أثناء حفظ البيانات', 'error');
        return false;
    }
}

/**
 * تنظيف واجهة المستخدم بعد تسجيل الخروج أو غياب بيانات المستخدم.
 * تُستخدم هذه الدالة لإعادة ضبط عناصر الواجهة إلى الحالة الافتراضية،
 * بحيث لا تُعرض بيانات مستخدم غير موجود أو منتهي الجلسة.
 *
 * @function clearUserUI
 * @returns {void}
 */
function clearUserUI() {
    // 🔹 تعيين اسم المستخدم إلى "زائر" في عنصر العرض الرئيسي
    const usernameDisplay = document.getElementById('username-display');
    if (usernameDisplay) usernameDisplay.textContent = 'زائر';

    // 🔹 تحديد عناصر عرض الرصيد (قد تكون متعددة في أماكن مختلفة من الواجهة)
    const balanceElements = [
        document.getElementById('balance-display'),
        document.getElementById('top-balance-display')
    ].filter(Boolean); // ← إزالة العناصر غير الموجودة لتجنب الأخطاء

    // 🔹 تعيين الرصيد إلى القيمة الافتراضية "0.00" لكل عنصر موجود
    balanceElements.forEach(el => {
        el.textContent = '0.00';
    });

    // 🔹 تعيين صورة الملف الشخصي إلى صورة افتراضية باسم "زائر"
    const userAvatar = document.getElementById('user-avatar');
    if (userAvatar) userAvatar.src = getDefaultAvatar('زائر');

    // 🔹 إعادة تعيين الثيم إلى الوضع النهاري كخيار افتراضي
    toggleDBTheme('day');
}


/**
 * تنفيذ عملية تسجيل الخروج من الواجهة
 * @async
 * @returns {Promise<void>}
 */
async function handleLogout() {
    const token = localStorage.getItem(STORAGE_KEYS.USER_TOKEN);
    if (!token) throw new Error('ليس لديك صلاحيات لتسجيل الخروج');

    try {
        if (!confirm('هل أنت متأكد من تسجيل الخروج؟')) return;

        const result = await logout(); // ← الآن تستخدم الدالة المستوردة من auth.js

        if (!result.success) {
            throw new Error(result.error || 'فشل تسجيل الخروج');
        }

        localStorage.clear();
        currentUser = null;
        clearUserUI(); // ← دالة مخصصة لتنظيف الواجهة بعد تسجيل الخروج

        showToast('تم تسجيل الخروج بنجاح', 'success');
        setTimeout(() => window.location.assign('/dashboard') // ✅ بديل آمن
            , 1000);

    } catch (error) {
        console.error('❌ خطأ أثناء تسجيل الخروج:', error.message);
        showToast('حدث خطأ أثناء تسجيل الخروج', 'error');
    }
}

/**
 * تعيين رصيد المستخدم
 * @param {number} balance
 * @returns {boolean}
 */
function setUserBalance(balance) {
    const newBalance = parseFloat(balance);
    if (!isNaN(newBalance) && newBalance >= 0) {
        currentUser.balance = parseFloat(newBalance.toFixed(2));
        return true;
    }
    return false;
}

/**
 * الحصول على اسم المستخدم
 * @returns {string}
 */
function getUserName() {
    return currentUser?.name || 'زائر';
}

/**
 * الحصول على رصيد المستخدم
 * @returns {number}
 */
function getUserBalance() {
    return currentUser?.balance || 0.00;
}

export {
    loadUser,
    validateUser,
    getUserName,
    setUserBalance,
    getUserBalance,
    handleLogout,
    saveUser,
    updateUserProfile
};
