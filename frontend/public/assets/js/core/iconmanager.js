/**
 * @file iconmanager.js
 * @class IconManager
 * @description نظام متقدم لإدارة وتحسين تحميل الأيقونات مع LRU Cache وذاكرة التخزين المؤقت
 * @version 4.0.0
 * @license MIT
 */

import LRUCache from 'lru-cache';

export class IconManager {
  /**
   * @constructor
   * @param {Object} options - خيارات الإدارة
   * @param {number} options.maxItems - الحد الأقصى للعناصر في الكاش (افتراضي: 50)
   * @param {number} options.maxSize - الحد الأقصى لحجم الكاش بالبايت (افتراضي: 50MB)
   * @param {number} options.ttl - مدة بقاء العنصر في الكاش بالميلي ثانية (افتراضي: 24 ساعة)
   * @param {number} options.maxConcurrent - الحد الأقصى للطلبات المتزامنة (افتراضي: 4)
   * @param {number} options.retryCount - عدد محاولات إعادة المحاولة (افتراضي: 2)
   */
  constructor(options = {}) {
    // إعدادات الكاش
    this.cache = new LRUCache({
      max: options.maxItems || 50,
      maxSize: options.maxSize || 50 * 1024 * 1024, // 50MB افتراضيًا
      sizeCalculation: (value) => value.size || 1024,
      ttl: options.ttl || 24 * 60 * 60 * 1000, // 24 ساعة
      updateAgeOnGet: true,
      ttlRefreshOnGet: true,
      dispose: (value) => {
        if (value?.objectUrl) {
          URL.revokeObjectURL(value.objectUrl); // تحرير الذاكرة عند الإزالة
        }
      }
    });

    // إعدادات النظام
    this.maxConcurrent = options.maxConcurrent || 4;
    this.retryCount = options.retryCount || 2;
    this.requestQueue = [];
    this.activeRequests = new Set();
    this.pendingRequests = new Map();
    this.defaultIconUrl = options.defaultIconUrl || null;
  }

  /**
   * جلب أيقونة من الكاش أو من الشبكة
   * @param {string} iconUrl - رابط الأيقونة
   * @returns {Promise<string>} رابط Object URL للأيقونة
   */
  async getIcon(iconUrl) {
    // التحقق من الطلبات المعلقة لنفس الأيقونة
    if (this.pendingRequests.has(iconUrl)) {
      return this.pendingRequests.get(iconUrl);
    }

    // التحقق من وجود الأيقونة في الكاش
    const cached = this.cache.get(iconUrl);
    if (cached) {
      return cached.objectUrl;
    }

    // إنشاء وعاء للطلب الجديد
    const requestPromise = this._queueRequest(iconUrl);
    this.pendingRequests.set(iconUrl, requestPromise);

    try {
      const result = await requestPromise;
      return result;
    } catch (error) {
      if (this.defaultIconUrl) {
        console.warn(`استخدام الأيقونة الافتراضية بسبب خطأ في تحميل: ${iconUrl}`);
        return this.defaultIconUrl;
      }
      throw error;
    } finally {
      this.pendingRequests.delete(iconUrl);
    }
  }

  /**
   * تحميل الأيقونة (مرادف لـ getIcon لتحسين قابلية القراءة)
   * @param {string} iconUrl - رابط الأيقونة
   * @returns {Promise<string>} رابط Object URL للأيقونة
   */
  async load(iconUrl) {
    return this.getIcon(iconUrl);
  }

  /**
   * إضافة طلب جديد إلى قائمة الانتظار
   * @private
   * @param {string} iconUrl - رابط الأيقونة
   * @returns {Promise<string>} 
   */
  async _queueRequest(iconUrl) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        iconUrl,
        resolve,
        reject,
        retries: 0
      });
      this._processQueue();
    });
  }

  /**
   * معالجة طلبات قائمة الانتظار
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
          this.requestQueue.unshift(request); // إعادة المحاولة في المقدمة
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
   * جلب الأيقونة مع إمكانية إعادة المحاولة
   * @private
   * @param {string} iconUrl - رابط الأيقونة
   * @param {number} attempt - عدد المحاولات الحالية
   * @returns {Promise<Object>} بيانات الأيقونة
   */
  async _fetchWithRetry(iconUrl, attempt = 0) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(iconUrl, {
        signal: controller.signal,
        cache: 'force-cache'
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const blob = await response.blob();
      return {
        objectUrl: URL.createObjectURL(blob),
        size: blob.size,
        lastUsed: Date.now()
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (attempt < this.retryCount) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        return this._fetchWithRetry(iconUrl, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * تحميل مسبق لمجموعة من الأيقونات
   * @param {Array<string>} iconUrls - مصفوفة بروابط الأيقونات
   * @returns {Promise<Array>} نتائج تحميل الأيقونات
   */
  async preloadIcons(iconUrls) {
    const uniqueUrls = [...new Set(iconUrls)];
    return Promise.allSettled(
      uniqueUrls.map(url => this.getIcon(url).catch(() => null))
    );
  }

  /**
   * مسح الكاش بالكامل
   */
  clearCache() {
    this.cache.clear();
    this.requestQueue = [];
    this.activeRequests.clear();
    this.pendingRequests.clear();
  }

  /**
   * الحصول على إحصائيات الكاش
   * @returns {Object} إحصائيات الكاش
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
   * تعيين أيقونة افتراضية عند فشل التحميل
   * @param {string} url - رابط الأيقونة الافتراضية
   */
  setDefaultIcon(url) {
    this.defaultIconUrl = url;
  }
}
