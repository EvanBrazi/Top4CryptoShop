/**
 * @file icon-cache-manager.js
 * @module IconCacheManager
 * @description وحدة إدارة الكاش الموحد للأيقونات من المصادر المحلية أو Service Worker
 * @version 1.1.0
 * @license MIT
 * @author Evan Brazi
 * @created 2024-12-01
 * @updated 2025-08-21
 * \assets\js\core\cache-manager.js
 */

/**
 * @class CacheManager
 * @description وحدة مسؤولة عن إدارة الكاش المحلي داخل الذاكرة، وكاش Service Worker، مع دعم التوثيق والتحقق.
 * @method generateCacheKey - توليد مفتاح موحد باستخدام Base64
 * @method saveToLocalCache - حفظ الأيقونة في كاش الذاكرة
 * @method getFromLocalCache - استرجاع الأيقونة من كاش الذاكرة
 * @method getFromSWCache - تحميل الأيقونة من كاش Service Worker
 * @method saveToSWCache - حفظ الأيقونة في كاش Service Worker
 * @method logIconInfo - عرض معلومات الكاش للأيقونة
 */

export class CacheManager {
    /**
     * @constructor
     * @param {Object} options - إعدادات التهيئة
     * @param {string} options.cacheName - اسم الكاش المستخدم في Service Worker
     */
    constructor({ cacheName = 'top4crypto-v4' } = {}) {
        this.localCache = new Map(); // كاش داخل الذاكرة
        this.cacheName = cacheName;
    }

    /**
     * توليد مفتاح موحد لكل أيقونة باستخدام Base64
     * @param {string} iconName - اسم الأيقونة
     * @returns {string} - مفتاح الكاش الموحد
     */
    _generateCacheKey(iconName) {
        const cacheIcon = `/cache/${btoa(iconName)}`;
        console.log('_generateCacheKey : ', cacheIcon, iconName);
        return `/cache/${btoa(iconName)}`;
    }


    /**
     * حفظ الأيقونة في الكاش المحلي
     * @param {string} key - مفتاح الكاش
     * @param {Blob} blob - بيانات الصورة
     * @param {string} source - مصدر الصورة ('local' أو 'sw')
     * @param {string} version - رقم الإصدار
     */
    saveToLocalCache(key, blob, source = 'local', version = '1.1.0') {
        if (!(blob instanceof Blob) || blob.size === 0) return;
        this.localCache.set(key, {
            blob,
            size: blob.size,
            source,
            version,
            timestamp: Date.now()
        });
    }

    /**
 * حفظ الأيقونة في كاش Service Worker
 * @param {string} key - المفتاح الموحد
 * @param {Blob} blob - بيانات الصورة
 */
    async saveToSWCache(key, blob) {
        if (!(blob instanceof Blob) || blob.size === 0) return;
        const response = new Response(blob);
        const cache = await caches.open(this.cacheName);
        await cache.put(key, response);
    }

    /**
     * استرجاع الأيقونة من الكاش المحلي
     * @param {string} key - مفتاح الكاش
     * @returns {Blob|null}
     */
    getFromLocalCache(key) {
        const entry = this.localCache.get(key);
        console.log('CacheManager::: getFromLocalCache : ', entry.blob);
        
        return entry?.blob instanceof Blob ? entry.blob : null;
    }

    /**
     * تحميل الأيقونة من Service Worker Cache
     * @param {string} key - مفتاح الكاش
     * @returns {Promise<Blob|null>}
     */
    async getFromSWCache(key) {
        try {
            const cache = await caches.open(this.cacheName);
            const response = await cache.match(key);
            if (!response || !response.ok) return null;
            const blob = await response.blob();
            if (blob.size === 0) return null;
            this.saveToLocalCache(key, blob, 'sw');
            console.log('CacheManager::: getFromLocalCache : ', blob);
            return blob;
        } catch (err) {
            console.error(`❌ SW Cache Error: ${key}`, err);
            return null;
        }
    }

    /**
 * تحميل الأيقونة من الشبكة كمصدر أخير
 * @param {string} iconName
 * @returns {Promise<Blob|null>}
 */
    async fetchFromNetwork(iconName) {
        try {
            const url = `${iconName}.png`;
            const response = await fetch(url);
            if (!response.ok) return null;
            const blob = await response.blob();
            const key = this.generateCacheKey(iconName);
            this.saveToLocalCache(key, blob, 'network');
            await this.saveToSWCache(key, blob);
            return blob;
        } catch (err) {
            console.error(`🌐 Network Fetch Error: ${iconName}`, err);
            return null;
        }
    }

    /**
     * التحقق من وجود الأيقونة في أي مصدر
     * @param {string} iconName - اسم الأيقونة
     * @returns {Promise<Blob|null>}
     */
    async getIcon(iconName) {
        const key = this.generateCacheKey(iconName);
        const localBlob = this.getFromLocalCache(key);
        if (localBlob) return localBlob;

        const swBlob = await this.getFromSWCache(key);
        if (swBlob) return swBlob;

        const netBlob = await this.fetchFromNetwork(iconName);
        if (netBlob) return netBlob;

        console.warn(`⚠️ لم يتم العثور على الأيقونة: ${iconName}`);
        return null;
    }

    /**
     * عرض معلومات الكاش للأيقونة
     * @param {string} iconName
     */
    logIconInfo(iconName) {
        const key = this.generateCacheKey(iconName);
        const entry = this.localCache.get(key);
        if (!entry) {
            console.log(`ℹ️ لا توجد بيانات كاش لـ ${iconName}`);
            return;
        }

        console.table({
            'المفتاح': key,
            'الحجم': `${entry.size} bytes`,
            'المصدر': entry.source,
            'الإصدار': entry.version,
            'الوقت': new Date(entry.timestamp).toLocaleString()
        });
    }
}
