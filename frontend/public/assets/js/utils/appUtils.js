export const STORAGE_KEYS = {
    USER_ID: 'userId',
    USER_TOKEN: 'userToken',
    SESSION_ID: 'sessionId'
};

const fullPathByCategoryMap = {
    apps: '/icons/apps/',
    games: '/icons/games/',
    cryptos: '/icons/cryptos/',
    balances: '/icons/balances/'
};

export const SUPPORT_PHONE = '+963980217649';

export function clearBrowserData(withIndexedDB = false) {
    // حذف التخزين المحلي
    localStorage.clear();

    // حذف التخزين المؤقت للجلسة
    sessionStorage.clear();

    // حذف الكوكيز
    document.cookie.split(';').forEach(cookie => {
        const name = cookie.split('=')[0].trim();
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/`;
    });

    // حذف قواعد بيانات IndexedDB
    if (withIndexedDB && indexedDB?.databases) {
        indexedDB.databases().then(dbs => {
            dbs.forEach(db => indexedDB.deleteDatabase(db.name));
        });
    }

    console.log('🧹 تم مسح كل بيانات المتصفح بنجاح');
}

/**
   * التحقق من صحة التوكن
   * @param {string} token
   * @returns {Promise<boolean>}
   */
export async function isValidToken(token) {
    if (typeof token !== 'string' || token.length < 16) return false;

    try {
        const res = await fetch('/api/compare-token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            credentials: 'include',
            body: JSON.stringify({ clientToken: token })
        });

        const data = await res.json();
        return data.match === true;
    } catch (err) {
        console.error('❌ خطأ في التحقق من التوكن:', err);
        return false;
    }
}

export function getFullPathByCategory(category) {
    console.log('getFullPathByCategory:', category);
    return fullPathByCategoryMap[category] || '/assets/images/loader.gif';
}

/**
 * التحقق من نوع وحجم الصورة قبل الإرسال
 * @param {File} file - الملف المختار من المستخدم
 * @param {Number} maxSizeMB - الحد الأقصى للحجم بالميجابايت (افتراضي 5MB)
 * @returns {Boolean} - هل الصورة صالحة؟
 */
export function isValidImage(file, maxSizeMB = 5) {
    if (!file) return false;

    const allowedTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
        'image/bmp',
        'image/tiff'
    ];

    const isTypeValid = allowedTypes.includes(file.type);
    const isSizeValid = file.size <= maxSizeMB * 1024 * 1024;

    if (!isTypeValid) {
        alert('❌ صيغة الصورة غير مدعومة. يرجى اختيار صورة بصيغة jpg أو png أو webp أو bmp أو tiff.');
        return false;
    }

    if (!isSizeValid) {
        alert(`❌ حجم الصورة كبير جدًا. الحد الأقصى هو ${maxSizeMB} ميجابايت.`);
        return false;
    }

    return true;
}
