/**
 * @file unified-icon-system.js
 * @description نظام موحد لإدارة الأيقونات مع تحسين الأداء والتخزين المؤقت
 * @version 5.0.0
 * @license MIT
 * @author Evan Brazi
 * @updated 2025-08-22
 */

import { CacheManager } from './cache-manager.js';

/**
 * @class UnifiedIconSystem
 * @description نظام موحد لتحميل وتخزين الأيقونات باستخدام كاش داخلي وخارجي، مع دعم التحقق الذكي من المسارات.
 */
export class UnifiedIconSystem {
    /**
     * @constructor
     * @param {Object} options - إعدادات التهيئة
     */
    constructor(options = {}) {
        this.cacheManager = new CacheManager(options);
        this.config = {
            basePath: options.basePath || '/icons/',
            defaultIcon: options.defaultIcon || 'default.png',
            maxCacheSize: options.maxCacheSize || 50 * 1024 * 1024,
            ttl: options.ttl || 24 * 60 * 60 * 1000
        };

        this.activeRequests = new Map(); // لمنع التكرار في التحميل
    }

    /**
     * تحميل الأيقونة من الكاش أو الشبكة
     * @param {string} iconName - اسم الأيقونة المطلوبة
     * @returns {Promise<Blob|null>} - بيانات الأيقونة أو null عند الفشل
     */
    async getIcon(iconName) {
        // استخدام الطلب النشط لتجنب التكرار
        if (this.activeRequests.has(iconName)) {
            return this.activeRequests.get(iconName);
        }

        const requestPromise = this.cacheManager.getIcon(iconName)
            .finally(() => {
                this.activeRequests.delete(iconName);
            });

        this.activeRequests.set(iconName, requestPromise);
        return requestPromise;
    }

    /**
     * تحميل مسبق لمجموعة أيقونات
     * @param {Array<string>} iconList - قائمة الأيقونات المراد تحميلها
     * @returns {Promise<number>} عدد الأيقونات التي تم تحميلها فعليًا
     */
    async preloadIcons(iconList = []) {
        let loadedCount = 0;

        for (const iconName of iconList) {
            try {
                const blob = await this.getIcon(iconName);
                if (blob) {
                    loadedCount++;
                    //console.log(`✅ تم تحميل وتخزين "${iconName}"`);
                }
            } catch (err) {
                console.warn(`❌ فشل تحميل "${iconName}":`, err);
            }
        }

        return loadedCount;
    }

    /**
     * تنظيف الكاش
     * @param {number} maxAge - الحد الأقصى للعمر بالمللي ثانية
     */
    clearCache(maxAge = 24 * 60 * 60 * 1000) {
        this.cacheManager.clearLocalCache(maxAge);
    }

    /**
     * الحصول على معلومات عن الأيقونة
     * @param {string} iconName - اسم الأيقونة
     */
    getIconInfo(iconName) {
        this.cacheManager.logIconInfo(iconName);
    }
}
