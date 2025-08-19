/**
 * @file iconmanager.js
 * @class IconManager
 * @description نظام متقدم لإدارة وتحسين تحميل الأيقونات باستخدام LRU Cache، مراقبة الأداء، وإعادة المحاولة الذكية
 * @version 4.1.0
 * @license MIT
 */

import LRUCache from 'https://esm.sh/lru-cache@7';
import { fetchIconWithMonitoring } from '../monitoring/iconLoader.js';

export class IconManager {
  /**
   * @constructor
   * @param {Object} options - إعدادات النظام
   */
  constructor(options = {}) {
    this.cache = new LRUCache({
      max: options.maxItems || 500,
      maxSize: options.maxSize || 50 * 1024 * 1024,
      sizeCalculation: value => value.size || 1024,
      ttl: options.ttl || 24 * 60 * 60 * 1000,
      updateAgeOnGet: true,
      ttlRefreshOnGet: true,
      dispose: value => {
        if (value?.objectUrl) URL.revokeObjectURL(value.objectUrl);
      }
    });

    this.maxConcurrent = options.maxConcurrent || 4;
    this.retryCount = options.retryCount || 2;
    this.defaultIconUrl = options.defaultIconUrl || null;

    this.requestQueue = [];
    this.activeRequests = new Set();
    this.pendingRequests = new Map();
  }

  /**
   * تحميل الأيقونة من الكاش أو الشبكة
   * @param {string} iconUrl
   * @returns {Promise<string>} رابط Object URL
   */
  async getIcon(iconUrl) {
    if (this.pendingRequests.has(iconUrl)) {
      console.log('getIcon on pending :: ' + iconUrl);
      return this.pendingRequests.get(iconUrl);
    }

    const cached = this.cache.get(iconUrl);
    if (cached) return cached.objectUrl;
    console.log('No Caching :: ' + iconUrl);

    const requestPromise = this._queueRequest(iconUrl);
    this.pendingRequests.set(iconUrl, requestPromise);

    try {
      const result = await requestPromise;
      return result;
    } catch (error) {
      if (this.defaultIconUrl) {
        console.warn(`Failed to load ,Fallback: ${iconUrl}`);
        return this.defaultIconUrl;
      }
      throw error;
    } finally {
      this.pendingRequests.delete(iconUrl);
    }
  }

  /**
   * مرادف لـ getIcon
   */
  async load(iconUrl) {
    return this.getIcon(iconUrl);
  }

  /**
   * إضافة طلب إلى قائمة الانتظار
   * @private
   */
  async _queueRequest(iconUrl) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ iconUrl, resolve, reject, retries: 0 });
      this._processQueue();
    });
  }

  /**
   * معالجة الطلبات المتراكمة
   * @private
   */
  async _processQueue() {
    while (this.requestQueue.length > 0 &&
           this.activeRequests.size < this.maxConcurrent) {
      const request = this.requestQueue.shift();
      this.activeRequests.add(request.iconUrl);

      try {
        const iconData = await this._fetchWithRetry(request.iconUrl, request.retries);
        this.cache.set(request.iconUrl, iconData);
        request.resolve(iconData.objectUrl);
      } catch (error) {
        if (request.retries < this.retryCount) {
          request.retries++;
          this.requestQueue.unshift(request);
        } else {
          request.reject(error);
        }
      } finally {
        this.activeRequests.delete(request.iconUrl);
        this._processQueue();
      }
    }
  }

  /**
   * تحميل الأيقونة مع إعادة المحاولة
   * @private
   */
  async _fetchWithRetry(iconUrl, attempt = 0) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 500);

    try {
      const response = await fetchIconWithMonitoring(iconUrl, {
        signal: controller.signal,
        cache: 'force-cache'
      });

      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const blob = await response.blob();
      return {
        objectUrl: URL.createObjectURL(blob),
        size: blob.size,
        lastUsed: Date.now()
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (attempt < this.retryCount) {
        console.warn(`Retry ${attempt + 1}: ${iconUrl}`);
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        return this._fetchWithRetry(iconUrl, attempt + 1);
      } else {
        console.error(`Final failure: ${iconUrl}`);
        throw error;
      }
    }
  }

  /**
   * تحميل مسبق لمجموعة أيقونات
   */
  async preloadIcons(iconUrls) {
    const unique = [...new Set(iconUrls)];
    return Promise.allSettled(unique.map(url => this.getIcon(url).catch(() => null)));
  }

  /**
   * مسح الكاش والطلبات
   */
  clearCache() {
    this.cache.clear();
    this.requestQueue = [];
    this.activeRequests.clear();
    this.pendingRequests.clear();
  }

  /**
   * إحصائيات الكاش
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      hits: this.cache.hits,
      misses: this.cache.misses,
      ratio: this.cache.hits / (this.cache.hits + this.cache.misses) || 0
    };
  }

  /**
   * تعيين رابط fallback
   */
  setDefaultIcon(url) {
    this.defaultIconUrl = url;
  }
}