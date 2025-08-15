/**
 * @private
 * @method _validateIcon
 * @description التحقق من صلاحية أيقونة التطبيق
 * @param {string} filename - اسم ملف الأيقونة
 * @returns {string} - مسار الأيقونة الصالح
 */
export function _validateIcon(filename) {
    if (typeof filename !== 'string') return 'default.png';
    const allowedExtensions = /\.(png|jpg|jpeg|svg|webp)$/i;
    return allowedExtensions.test(filename) ? filename : 'default.png';
}

/**
 * @private
 * @method _parsePrice
 * @description تحويل السعر إلى رقم
 * @param {any} price - قيمة السعر
 * @returns {number|null} - السعر كرقم
 */
export function _parsePrice(price) {
    const parsed = parseFloat(price);
    return isNaN(parsed) ? null : Math.max(0, parsed);
}

/**
 * @private
 * @method _transformAppsData
 * @description تحويل وتنظيف بيانات التطبيقات
 * @param {Array} rawData - البيانات الخام
 * @returns {Array} - البيانات المنسقة
 */
export function _transformAppsData(rawData) {
    if (!Array.isArray(rawData)) return [];

    return rawData.map(app => ({
        id: Number.isInteger(app.id) ? app.id : Date.now(),
        name: typeof app.name === 'string' ? app.name.trim() : 'بدون اسم',
        icon: _validateIcon(app.icon),
        category: typeof app.category === 'string' ? app.category.trim() : 'غير مصنف',
        price: _parsePrice(app.price),
        available: Boolean(app.available)
    }));
}