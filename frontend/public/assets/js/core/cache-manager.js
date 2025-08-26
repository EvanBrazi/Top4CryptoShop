/**
 * @file cache-manager.js
 * @module CacheManager
 * @description وحدة إدارة الكاش الموحد للأيقونات من المصادر المحلية أو Service Worker
 * @version 2.0.0
 * @license MIT
 * @author Evan Brazi
 * @updated 2025-08-22
 */

/**
 * @class CacheManager
 * @description وحدة مسؤولة عن إدارة الكاش المحلي داخل الذاكرة، وكاش Service Worker، مع دعم التوثيق والتحقق.
 */
export class CacheManager {
    /**
     * @constructor
     * @param {Object} options - إعدادات التهيئة
     * @param {string} options.cacheName - اسم الكاش المستخدم في Service Worker
     */
    constructor({ cacheName = 'top4crypto-v5' } = {}) {
        this.localCache = new Map(); // كاش داخل الذاكرة
        this.cacheName = cacheName;
    }

    /**
     * توليد مفتاح موحد لكل أيقونة باستخدام Base64
     * @param {string} iconName - اسم الأيقونة
     * @returns {string} - مفتاح الكاش الموحد
     */
    generateCacheKey(iconName) {
        return `/cache/${btoa(iconName)}`;
    }

    /**
     * فك ترميز مفتاح الكاش
     * @param {string} cacheKey - مفتاح الكاش المشفر
     * @returns {string} - اسم الأيقونة الأصلي
     */
    decodeCacheKey(cacheKey) {
        return atob(cacheKey.replace('/cache/', ''));
    }

    /**
     * حفظ الأيقونة في الكاش المحلي
     * @param {string} key - مفتاح الكاش
     * @param {Blob} blob - بيانات الصورة
     * @param {string} source - مصدر الصورة ('local' أو 'sw')
     * @param {string} version - رقم الإصدار
     */
    saveToLocalCache(key, blob, source = 'local', version = '1.0.0') {
        if (!(blob instanceof Blob) || blob.size === 0) {
            console.warn('⚠️ Cannot save invalid blob to local cache');
            return;
        }

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
        if (!(blob instanceof Blob) || blob.size === 0) {
            console.warn('⚠️ Cannot save invalid blob to SW cache');
            return;
        }

        try {
            const response = new Response(blob, {
                headers: {
                    'Content-Type': blob.type,
                    'X-Timestamp': Date.now().toString(),
                    'X-Cache-Source': 'manager'
                }
            });

            const cache = await caches.open(this.cacheName);
            await cache.put(key, response);
        } catch (err) {
            console.error('❌ Failed to save to SW cache:', err);
        }
    }

    /**
     * استرجاع الأيقونة من الكاش المحلي
     * @param {string} key - مفتاح الكاش
     * @returns {Blob|null}
     */
    getFromLocalCache(key) {
        const entry = this.localCache.get(key);
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
            return blob;
        } catch (err) {
            console.error(`❌ SW Cache Error: ${key}`, err);
            return null;
        }
    }

    /**
     * تحميل الأيقونة من الشبكة كمصدر أخير
     * @param {string} iconName - اسم الأيقونة
     * @returns {Promise<Blob|null>}
     */
    async fetchFromNetwork(iconName) {
        try {
            // البحث في المسارات المختلفة للأيقونة
            const iconPath = await this._findIconPath(iconName);
            const response = await fetch(iconPath);

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
     * البحث عن الأيقونة في المسارات المختلفة
     * @param {string} iconName - اسم الأيقونة
     * @returns {Promise<string>} - مسار الأيقونة الصالح
     * @private
     */
    async _findIconPath(iconName) {
        console.warn('_findIconPath', iconName);
        const categories = ['apps', 'balances', 'hometab', 'games', 'cryptos'];
        const extraPaths = [
            `/frontend/public/assets/${iconName}`,
            `/backend/public/icons/${iconName}`,
            `/assets/images/${iconName}`,
            `/icons/${iconName}`
        ];

        const possiblePaths = [
            ...categories.map(cat => `/icons/${cat}/${iconName}`),
            ...extraPaths
        ];

        for (const path of possiblePaths) {
            try {
                console.info(`🔍 Trying: ${path}`);
                const response = await fetch(path, { method: 'HEAD' });
                if (response.ok) {
                    console.log(`✅ Found icon at: ${path}`);
                    return path;
                }
            } catch (err) {
                console.warn(`❌ Failed: ${path}`, err);
            }
        }

        console.warn(`⚠️ Icon not found, using default: ${iconName}`);
        return `/icons/apps/default.png`;
    }


    /**
     * التحقق من وجود الأيقونة في أي مصدر
     * @param {string} iconName - اسم الأيقونة
     * @returns {Promise<Blob|null>}
     */
    async getIcon(iconName) {
        const key = this.generateCacheKey(iconName);

        // 1. التحقق من الكاش المحلي
        const localBlob = this.getFromLocalCache(key);
        if (localBlob) return localBlob;

        // 2. التحقق من كاش Service Worker
        const swBlob = await this.getFromSWCache(key);
        if (swBlob) return swBlob;

        // 3. التحميل من الشبكة
        const netBlob = await this.fetchFromNetwork(iconName);
        if (netBlob) return netBlob;

        // 4. استخدام الأيقونة الافتراضية
        console.warn(`⚠️ Icon not found anywhere: ${iconName}`);
        return await this.fetchFromNetwork('default.png');
    }

    /**
     * عرض معلومات الكاش للأيقونة
     * @param {string} iconName - اسم الأيقونة
     */
    logIconInfo(iconName) {
        const key = this.generateCacheKey(iconName);
        const entry = this.localCache.get(key);

        if (!entry) {
            console.log(`ℹ️ No cache data for ${iconName}`);
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

    /**
     * تنظيف الكاش المحلي
     * @param {number} maxAge - الحد الأقصى للعمر بالمللي ثانية
     */
    clearLocalCache(maxAge = 24 * 60 * 60 * 1000) {
        const now = Date.now();
        let removedCount = 0;

        for (const [key, entry] of this.localCache.entries()) {
            if (now - entry.timestamp > maxAge) {
                this.localCache.delete(key);
                removedCount++;
            }
        }

        console.log(`🧹 Removed ${removedCount} items from local cache`);
    }
}
