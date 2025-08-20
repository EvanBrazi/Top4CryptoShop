/**
 * @file unified-icon-system.js
 * @description نظام موحد لإدارة الأيقونات مع تحسين الأداء والتخزين المؤقت
 * @version 5.0.0
 * @license MIT
 */

import LRUCache from 'https://esm.sh/lru-cache@7';

class UnifiedIconSystem {
    constructor(options = {}) {
        this.config = {
            basePath: options.basePath || '/icons/apps/',
            defaultIcon: options.defaultIcon || 'default.png',
            maxCacheSize: options.maxCacheSize || 50 * 1024 * 1024, // 50MB
            maxConcurrent: options.maxConcurrent || 4,
            retryCount: options.retryCount || 2,
            ttl: options.ttl || 24 * 60 * 60 * 1000 // 24 hours
        };

        this.cache = new LRUCache({
            max: options.maxItems || 500,
            maxSize: this.config.maxCacheSize,
            ttl: this.config.ttl,
            updateAgeOnGet: true,
            dispose: (value, key) => {
                if (value?.objectUrl) {
                    URL.revokeObjectURL(value.objectUrl);
                }
            }
        });

        this.activeRequests = new Map();
        this.requestQueue = [];
        this.metrics = {
            hits: 0,
            misses: 0,
            errors: 0,
            totalLoaded: 0
        };
    }

    /**
     * الحصول على أيقونة مع التخزين المؤقت الذكي
     */
    async getIcon(iconName) {
        const iconUrl = this._resolveIconPath(iconName);
        const cacheKey = this._generateCacheKey(iconUrl);

        // التحقق من التخزين المؤقت أولاً
        const cached = this.cache.get(cacheKey);
        if (cached) {
            this.metrics.hits++;
            return cached.objectUrl;
        }

        this.metrics.misses++;

        // منع الطلبات المكررة
        if (this.activeRequests.has(cacheKey)) {
            return this.activeRequests.get(cacheKey);
        }

        const requestPromise = this._loadIcon(iconUrl, cacheKey);
        this.activeRequests.set(cacheKey, requestPromise);

        try {
            const result = await requestPromise;
            return result;
        } catch (error) {
            this.metrics.errors++;
            return this._getDefaultIcon();
        } finally {
            this.activeRequests.delete(cacheKey);
        }
    }

    /**
     * تحميل الأيقونة من المصدر
     */
    async _loadIcon(iconUrl, cacheKey) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(iconUrl, {
                signal: controller.signal,
                cache: 'force-cache'
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);

            this.cache.set(cacheKey, {
                objectUrl,
                size: blob.size,
                loadedAt: Date.now()
            });

            this.metrics.totalLoaded++;
            return objectUrl;

        } catch (error) {
            console.warn(`Failed to load icon: ${iconUrl}`, error);
            throw error;
        }
    }

    /**
     * تحميل مجموعة أيقونات مسبقاً
     */
    async preloadIcons(iconNames) {
        const uniqueIcons = [...new Set(iconNames)];
        const results = await Promise.allSettled(
            uniqueIcons.map(name => this.getIcon(name))
        );
        return results;
    }

    /**
     * مسح التخزين المؤقت
     */
    clearCache() {
        this.cache.clear();
        this.activeRequests.clear();
    }

    /**
     * إحصائيات الأداء
     */
    getStats() {
        return {
            ...this.metrics,
            cacheSize: this.cache.size,
            hitRatio: this.metrics.hits / (this.metrics.hits + this.metrics.misses) || 0,
            activeRequests: this.activeRequests.size
        };
    }

    /**
     * أدوات مساعدة
     */
    _resolveIconPath(iconName) {
        if (!iconName) return `${this.config.basePath}${this.config.defaultIcon}`;
        if (iconName.startsWith('http') || iconName.startsWith('/')) {
            return iconName;
        }
        return `${this.config.basePath}${iconName}`;
    }

    _generateCacheKey(url) {
        return btoa(url); // Base64 encoding for consistent keys
    }

    _getDefaultIcon() {
        return `${this.config.basePath}${this.config.defaultIcon}`;
    }
}

// نسخة singleton عالمية
let globalIconSystem = null;

export function getIconSystem(options = {}) {
    if (!globalIconSystem) {
        globalIconSystem = new UnifiedIconSystem(options);
    }
    return globalIconSystem;
}

export default UnifiedIconSystem;
