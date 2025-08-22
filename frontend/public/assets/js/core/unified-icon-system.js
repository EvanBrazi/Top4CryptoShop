/**
 * @file unified-icon-system.js
 * @description نظام موحد لإدارة الأيقونات مع تحسين الأداء والتخزين المؤقت
 * @version 5.0.0
 * @license MIT
 */

import LRUCache from 'https://esm.sh/lru-cache@7';
import { CacheManager } from './cache-manager.js';
import APP_CONFIG from './config.js';

/**
 * @class UnifiedIconSystem
 * @description نظام موحد لتحميل وتخزين الأيقونات باستخدام كاش داخلي وخارجي، مع دعم التحقق الذكي من المسارات.
 * @property {LRUCache} cache - كاش داخلي باستخدام LRU لتقليل استهلاك الذاكرة
 * @property {CacheManager} cacheManager - وحدة إدارة الكاش المحلي وService Worker
 * @method getIcon - تحميل الأيقونة من الكاش أو الشبكة
 * @method preloadIcons - تحميل مسبق لمجموعة أيقونات وتخزينها داخليًا وخارجيًا
 * @method resolve - توليد رابط صالح للأيقونة
 */

export class UnifiedIconSystem {
    constructor(options = {}) {
        this.cacheManager = new CacheManager({ cacheName: APP_CONFIG.CACHE.NAME });
        this.config = {
            basePath: options.basePath || '/icons/',
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
 * توليد مفتاح كاش موحد لتفادي التضارب مع المسارات الثابتة
 * @param {string} iconName
 * @returns {string}
 */
    _generateCacheKey(iconName) {
        const cacheIcon = `/cache/${btoa(iconName)}`;
        console.log('_generateCacheKey : ', cacheIcon, iconName);
        return `/cache/${btoa(iconName)}`;
    }


    /**
 * @method getIcon
 * @param {string} iconName - اسم الأيقونة المطلوبة
 * @returns {Promise<string|null>} - رابط الأيقونة أو null عند الفشل
 */
    async getIcon(iconName) {
        const cacheKey = this._generateCacheKey(iconName);

        // تحقق من الكاش المحلي أولًا
        const localBlob = this.cacheManager.getFromLocalCache(cacheKey);
        if (localBlob) return URL.createObjectURL(localBlob);

        // تحقق من كاش Service Worker
        const swBlob = await this.cacheManager.getFromSWCache(cacheKey);
        if (swBlob) return URL.createObjectURL(swBlob);

        // تحميل من الشبكة
        const blob = await this._loadIcon(iconName, cacheKey);
        if (blob) {
            this.cacheManager.saveToLocalCache(cacheKey, blob, 'network');
            await this.cacheManager.saveToSWCache(cacheKey, blob);
            return URL.createObjectURL(blob);
        }

        return null;
    }



    /**
     * @method _loadIcon
     * @description تحميل الأيقونة من الشبكة وتخزينها في الكاش
     *
 * @method _loadIcon
 * @description تحميل الأيقونة من الشبكة وتخزينها في الكاش بعد التحقق من صلاحية الـ Blob
 */
    async _loadIcon(url, key) {
        const _resolveIconPathUrl = this._resolveIconPath(url);
        const response = await fetch(_resolveIconPathUrl);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const blob = await response.blob();
        // تحقق من صلاحية الـ Blob
        if (!(blob instanceof Blob) || blob.size === 0) {
            console.warn(`⚠️ _loadIcon: Blob غير صالح أو فارغ لـ ${key}`);
            return null;
        }

        // اختياري: تحقق من نوع المحتوى
        if (!blob.type.startsWith('image/')) {
            console.warn(`⚠️ _loadIcon: نوع غير مدعوم (${blob.type}) لـ ${key}`);
            return null;
        }

        this.cache.set(key, { blob, size: blob.size });
        return blob;
    }

    /**
 * @method _resolveIconPathSmart
 * @description البحث عن الأيقونة داخل جميع مجلدات /icons/ وإرجاع أول مسار صالح
 * @param {string} iconName - اسم ملف الأيقونة (مثلاً: wallet.png)
 * @param {Array<string>} folders - قائمة المجلدات الفرعية داخل /icons/
 * @returns {Promise<string>} المسار الكامل للأيقونة أو fallback عند الفشل
 */
    async _resolveIconPathSmart(iconName, folders = ['apps', 'balances', 'hometab', 'games', 'cryptos']) {
        const fallback = `/icons/apps/default.png`;

        for (const folder of folders) {
            const path = `/icons/${folder}/${iconName}`;
            try {
                const response = await fetch(path, { method: 'HEAD' });
                if (response.ok) {
                    console.log(`✅ تم العثور على الأيقونة في: ${path}`);
                    return path;
                }
            } catch (err) {
                console.warn(`❌ فشل التحقق من: ${path}`, err);
            }
        }

        console.warn(`⚠️ لم يتم العثور على "${iconName}" في أي مجلد، سيتم استخدام fallback`);
        return fallback;
    }


    /**
 * @method _resolveIconPath
 * @description توليد المسار الكامل للأيقونة مع دعم Blob و fallback ذكي
 * @param {string|Blob} iconName - اسم الأيقونة أو رابطها أو كائن Blob
 * @returns {string} - رابط صالح يمكن استخدامه في <img> أو fetch
 */
    _resolveIconPath(iconName) {
        console.log('UnifiedIconSystem :: _resolveIconPath : ', iconName);
        
        // إذا كان Blob
        if (iconName instanceof Blob) {
            return URL.createObjectURL(iconName);
        }
        // إذا كان رابط blob: أو يبدأ بـ http أو /
        if (iconName.startsWith('blob:') || iconName.startsWith('http') || iconName.startsWith('/')) {
            return iconName;
        }
        // إذا كان مجرد اسم ملف
        // fallback في حال الإدخال غير صالح
        return this._resolveIconPathSmart(iconName);
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
        const externalCache = await caches.open(cacheName);
        let loadedCount = 0;

        for (const iconName of iconList) {
            const iconUrl = this._resolveIconPath(iconName);
            const cacheKey = this._generateCacheKey(iconName);

            console.log('preloadIcons :: ', iconUrl);

            if (this.cache.has(cacheKey)) continue;

            try {
                const response = await fetch(iconUrl);
                if (response.ok) {
                    const clonedResponse = response.clone();
                    const blob = await response.blob();

                    // تحقق من صلاحية الـ Blob
                    if (!(blob instanceof Blob) || blob.size === 0) {
                        console.warn(`⚠️ preloadIcons: Blob غير صالح لـ ${iconName}`);
                        continue;
                    }

                    // تخزين داخلي
                    this.cache.set(cacheKey, {
                        blob,
                        size: blob.size,
                        source: 'local',
                        version: '1.0.0',
                        timestamp: Date.now()
                    });

                    // تخزين خارجي في Service Worker Cache
                    externalCache.put(iconUrl, clonedResponse);

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
