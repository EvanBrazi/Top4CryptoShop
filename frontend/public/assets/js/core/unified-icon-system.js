/**
 * @file unified-icon-system.js
 * @description نظام موحد لإدارة الأيقونات مع تحسين الأداء والتخزين المؤقت
 * @version 5.0.0
 * @license MIT
 */

import LRUCache from 'https://esm.sh/lru-cache@7';
import APP_CONFIG from './config.js';

/**
 * @class UnifiedIconSystem
 * @description مسؤول عن تحميل وتخزين الأيقونات كـ Blob بدون التعامل مع DOM
 */
export class UnifiedIconSystem {
    constructor(options = {}) {
        this.config = {
            basePath: options.basePath || '/icons/apps/',
            defaultIcon: options.defaultIcon || 'default.png',
            maxCacheSize: options.maxCacheSize || 50 * 1024 * 1024, // الحد الأقصى لحجم الكاش بالبايت
            ttl: options.ttl || 24 * 60 * 60 * 1000 // مدة صلاحية الكاش (24 ساعة)
        };

        // إعداد الكاش باستخدام LRUCache مع حساب الحجم لكل Blob
        this.cache = new LRUCache({
            maxSize: this.config.maxCacheSize,
            ttl: this.config.ttl,
            updateAgeOnGet: true,
            sizeCalculation: (value) => value?.size || 1
        });

        this.activeRequests = new Map(); // لمنع التكرار في التحميل
    }

    /**
     * @method getIcon
     * @param {string} iconName - اسم الأيقونة المطلوبة
     * @returns {Promise<Blob|null>} - الأيقونة كـ Blob أو null عند الفشل
     */
    async getIcon(iconName) {
        const cacheKey = btoa(iconName); // مفتاح الكاش باستخدام Base64
        const cached = this.cache.get(cacheKey);
        if (cached) return cached.blob;
        if (this.activeRequests.has(cacheKey)) return this.activeRequests.get(cacheKey);
        const request = this._loadIcon(iconName, cacheKey);
        this.activeRequests.set(cacheKey, request);
        try {
            const blob = await request;
            return blob;
        } catch {
            return null;
        } finally {
            this.activeRequests.delete(cacheKey);
        }
    }

    /**
     * @method _loadIcon
     * @description تحميل الأيقونة من الشبكة وتخزينها في الكاش
     */
    async _loadIcon(url, key) {
        const _resolveIconPathUrl = this._resolveIconPath(url);
        const response = await fetch(_resolveIconPathUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const blob = await response.blob();
        this.cache.set(key, { blob, size: blob.size });
        return blob;
    }

    /**
 * @method _resolveIconPath
 * @description توليد المسار الكامل للأيقونة مع دعم Blob و fallback ذكي
 * @param {string|Blob} name - اسم الأيقونة أو رابطها أو كائن Blob
 * @returns {string} - رابط صالح يمكن استخدامه في <img> أو fetch
 */
    _resolveIconPath(name) {
        const fallback = `${this.config.basePath}${this.config.defaultIcon}`;
        // إذا كان Blob
        if (name instanceof Blob) {
            return URL.createObjectURL(name);
        }
        // إذا كان رابط blob: أو يبدأ بـ http أو /
        if (typeof name === 'string') {
            if (name.startsWith('blob:') || name.startsWith('http') || name.startsWith('/')) {
                return name;
            }

            // إذا كان مجرد اسم ملف
            return `${this.config.basePath}${name}`;
        }

        // fallback في حال الإدخال غير صالح
        console.warn(`⚠️ اسم الأيقونة غير صالح، سيتم استخدام الافتراضية: ${fallback}`);
        return fallback;
    }


    /**
 * @method resolve
 * @alias _resolveIconPath
 * @public
 */
    resolve(name) {
        return this._resolveIconPath(name);
    }

    /**
 * @method preloadIcons
 * @description تحميل مسبق لمجموعة أيقونات وتخزينها في الكاش الداخلي والخارجي
 * @param {Array<string>} iconList - قائمة الأيقونات المراد تحميلها
 * @returns {Promise<number>} عدد الأيقونات التي تم تحميلها فعليًا
 */
    async preloadIcons(iconList = []) {
        const cacheName = APP_CONFIG.CACHE.NAME;
        const cache = await caches.open(cacheName);
        let loadedCount = 0;

        for (const iconName of iconList) {
            const iconUrl = this._resolveIconPath(iconName);
            const cacheKey = btoa(iconUrl);
            console.log('preloadIcons :: ', iconUrl);

            if (this.cache.has(cacheKey)) continue;

            try {
                const response = await fetch(iconUrl);
                if (response.ok) {
                    const clonedResponse = response.clone();
                    const blob = await response.blob();
                    this.cache.set(cacheKey, { blob, size: blob.size });
                    cache.put(iconUrl, clonedResponse);
                    loadedCount++;
                    console.log(`✅ تم تحميل وتخزين "${iconName}"`);
                }
            } catch (err) {
                console.warn(`❌ فشل تحميل "${iconName}":`, err);
            }
        }

        return loadedCount;
    }


}
