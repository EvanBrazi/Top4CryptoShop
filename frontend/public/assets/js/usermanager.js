/**
 * @file usermanager.js
 * @description نظام متقدم لإدارة بيانات المستخدم مع التحقق من الصحة والتخزين الآمن
 * @version 2.0.0
 * @license MIT
 */

import { showToast } from './utils/toast.js';

// ثوابت التطبيق
const USER_DEFAULTS = {
    name: 'زائر',
    email: null,
    balance: 0.00,
    theme: 'day',
    avatar: null
};

const STORAGE_KEYS = {
    USER_DATA: 'user',
    USER_SESSION: 'userSession'
};

// حالة المستخدم الحالية
let currentUser = { ...USER_DEFAULTS };

/**
 * تهيئة المستخدم الافتراضي
 * @returns {Object} بيانات المستخدم الافتراضية
 */
function initializeDefaultUser() {
    return {
        ...USER_DEFAULTS,
        name: 'Evan Barzi',
        email: 'evanbrazi@support.com',
        balance: 99999.99
    };
}

/**
 * تعيين بيانات المستخدم مع التحقق من الصحة
 * @param {Object} userData - بيانات المستخدم
 * @returns {boolean} true إذا كانت البيانات صالحة
 */
function setUserData(userData) {
    try {
        const validated = validateUser(userData);
        if (validated) {
            currentUser = validated;
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error setting user data:', error);
        return false;
    }
}

/**
 * التحقق من صحة بيانات المستخدم
 * @param {Object} user - بيانات المستخدم
 * @returns {Object|boolean} بيانات المستخدم الصالحة أو false
 */
function validateUser(user) {
    if (!user || typeof user !== 'object') return false;

    // التحقق من الحقول الأساسية
    const validated = {
        name: typeof user.name === 'string' ? user.name.trim() : USER_DEFAULTS.name,
        email: (user.email && typeof user.email === 'string' && isValidEmail(user.email)) 
               ? user.email.trim().toLowerCase() 
               : null,
        balance: typeof user.balance === 'number' && user.balance >= 0 
                ? parseFloat(user.balance.toFixed(2)) 
                : USER_DEFAULTS.balance,
        theme: ['day', 'night'].includes(user.theme) ? user.theme : USER_DEFAULTS.theme,
        avatar: user.avatar || null
    };

    return validated;
}

/**
 * التحقق من صحة عنوان البريد الإلكتروني
 * @param {string} email - البريد الإلكتروني
 * @returns {boolean}
 */
function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

/**
 * تحميل بيانات المستخدم من التخزين المحلي
 * @async
 * @returns {Promise<void>}
 */
async function loadUser() {
    try {
        const userData = localStorage.getItem(STORAGE_KEYS.USER_DATA);
        
        if (!userData) {
            setUserData(initializeDefaultUser());
            return;
        }

        const parsedUser = JSON.parse(userData);
        
        if (!setUserData(parsedUser)) {
            console.warn('بيانات المستخدم غير صالحة، يتم استخدام البيانات الافتراضية');
            setUserData(initializeDefaultUser());
        }

        await updateUserProfile();
    } catch (error) {
        console.error('خطأ في تحميل بيانات المستخدم:', error);
        setUserData(initializeDefaultUser());
        await updateUserProfile();
    }
}

/**
 * تحديث واجهة المستخدم حسب بياناته
 * @async
 * @returns {Promise<void>}
 */
async function updateUserProfile() {
    try {
        // تحديث اسم المستخدم
        const usernameDisplay = document.getElementById('username-display');
        if (usernameDisplay) {
            usernameDisplay.textContent = currentUser.name;
        }

        // تحديث الرصيد
        const balanceElements = [
            document.getElementById('balance-display'),
            document.getElementById('top-balance-display')
        ].filter(el => el);

        balanceElements.forEach(el => {
            el.textContent = currentUser.balance.toFixed(2);
        });

        // تحديث الصورة الشخصية
        const profileImg = document.getElementById('profile-img');
        if (profileImg) {
            await updateProfileImage(profileImg);
        }
    } catch (error) {
        console.error('خطأ في تحديث واجهة المستخدم:', error);
    }
}

/**
 * تحديث صورة الملف الشخصي
 * @async
 * @param {HTMLImageElement} imgElement - عنصر صورة الملف الشخصي
 * @returns {Promise<void>}
 */
async function updateProfileImage(imgElement) {
    try {
        imgElement.onerror = () => {
            imgElement.src = getDefaultAvatar(currentUser.name);
        };

        if (currentUser.avatar) {
            imgElement.src = currentUser.avatar;
        } else if (currentUser.email) {
            const emailHash = await generateEmailHash(currentUser.email);
            imgElement.src = `https://www.gravatar.com/avatar/${emailHash}?d=404&s=160`;
        } else {
            imgElement.src = getDefaultAvatar(currentUser.name);
        }
    } catch (error) {
        console.error('Error updating profile image:', error);
        imgElement.src = getDefaultAvatar(currentUser.name);
    }
}

/**
 * إنشاء هاش للبريد الإلكتروني
 * @async
 * @param {string} email - البريد الإلكتروني
 * @returns {Promise<string>}
 */
async function generateEmailHash(email) {
    // يمكن استخدام مكتبة crypto-js بدلاً من md5 إذا لزم الأمر
    const msgBuffer = new TextEncoder().encode(email);
    const hashBuffer = await crypto.subtle.digest('MD5', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * الحصول على صورة افتراضية
 * @param {string} name - اسم المستخدم
 * @returns {string} رابط الصورة الافتراضية
 */
function getDefaultAvatar(name) {
    const encodedName = encodeURIComponent(name || 'زائر');
    return `https://ui-avatars.com/api/?name=${encodedName}&background=random&size=160`;
}

/**
 * تسجيل خروج المستخدم
 * @async
 * @returns {Promise<void>}
 */
async function logout() {
    try {
        if (!confirm('هل أنت متأكد من تسجيل الخروج؟')) return;

        localStorage.removeItem(STORAGE_KEYS.USER_DATA);
        sessionStorage.removeItem(STORAGE_KEYS.USER_SESSION);
        
        setUserData(initializeDefaultUser());
        await updateUserProfile();
        
        showToast('تم تسجيل الخروج بنجاح', 'success');
        setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
        console.error('حدث خطأ أثناء تسجيل الخروج:', error);
        showToast('حدث خطأ أثناء تسجيل الخروج. يرجى المحاولة مرة أخرى.', 'error');
    }
}

/**
 * حفظ بيانات المستخدم
 * @returns {boolean} true إذا تم الحفظ بنجاح
 */
function saveUser() {
    try {
        localStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(currentUser));
        return true;
    } catch (error) {
        console.error('خطأ في حفظ بيانات المستخدم:', error);
        showToast('حدث خطأ في حفظ بيانات المستخدم', 'error');
        return false;
    }
}

/**
 * تعيين رصيد المستخدم
 * @param {number} balance - الرصيد الجديد
 * @returns {boolean} true إذا تم التحديث بنجاح
 */
function setUserBalance(balance) {
    const newBalance = parseFloat(balance);
    if (!isNaN(newBalance) && newBalance >= 0) {
        currentUser.balance = parseFloat(newBalance.toFixed(2));
        return true;
    }
    return false;
}

function getUserName() {
    return currentUser.name;
}

/**
 * الحصول على رصيد المستخدم
 * @returns {number} الرصيد الحالي
 */
function getUserBalance() {
    return currentUser.balance;
}

export {
    loadUser,
    validateUser,
    getUserName,
    setUserBalance,
    getUserBalance,
    logout,
    saveUser,
    updateUserProfile
};
