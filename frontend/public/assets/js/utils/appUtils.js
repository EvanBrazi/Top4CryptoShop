export function clearBrowserData(withIndexedDB=false) {
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
