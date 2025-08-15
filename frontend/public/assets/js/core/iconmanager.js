/**
 * @file iconmanager.js
 * @class IconManager
 * @description نظام متكامل لإدارة تحميل الأيقونات مع التحكم في الطلبات المتزامنة
 * @version 2.0.0
 * @license MIT
 */

export class IconManager {
  constructor(options = {}) {
    this.options = {
      maxConcurrent: options.maxConcurrent || 6,
      retryCount: options.retryCount || 2,
      timeout: options.timeout || 5000,
      cacheSize: options.cacheSize || 50
    };
    
    this.pendingRequests = new Map();
    this.activeRequests = new Set();
    this.cache = new Map();
    this.cacheOrder = [];
  }

  async load(iconUrl) {
    // التحقق من وجود الأيقونة في الكاش
    if (this.cache.has(iconUrl)) {
      this._updateCacheOrder(iconUrl);
      return this.cache.get(iconUrl);
    }

    // التحقق من وجود طلب معلق لهذه الأيقونة
    if (this.pendingRequests.has(iconUrl)) {
      return this.pendingRequests.get(iconUrl);
    }

    // إنشاء وعاء للطلب الجديد
    const requestPromise = this._fetchWithRetry(iconUrl);
    this.pendingRequests.set(iconUrl, requestPromise);

    try {
      const blob = await requestPromise;
      
      // تخزين في الكاش مع إدارة المساحة
      this._addToCache(iconUrl, blob);
      
      return blob;
    } finally {
      this.pendingRequests.delete(iconUrl);
    }
  }

  async _fetchWithRetry(iconUrl, attempt = 0) {
    // الانتظار إذا تجاوزنا الحد المسموح من الطلبات المتزامنة
    while (this.activeRequests.size >= this.options.maxConcurrent) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.activeRequests.add(iconUrl);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);

    try {
      const response = await fetch(iconUrl, {
        signal: controller.signal,
        cache: 'force-cache'
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      clearTimeout(timeoutId);
      return await response.blob();
    } catch (error) {
      if (attempt < this.options.retryCount) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        return this._fetchWithRetry(iconUrl, attempt + 1);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
      this.activeRequests.delete(iconUrl);
    }
  }

  _addToCache(iconUrl, blob) {
    // تحرير الذاكرة إذا لزم الأمر
    if (this.cache.size >= this.options.cacheSize) {
      const oldestKey = this.cacheOrder.shift();
      this.cache.delete(oldestKey);
    }

    // إضافة إلى الكاش
    const objectUrl = URL.createObjectURL(blob);
    this.cache.set(iconUrl, objectUrl);
    this.cacheOrder.push(iconUrl);
  }

  _updateCacheOrder(iconUrl) {
    this.cacheOrder = this.cacheOrder.filter(url => url !== iconUrl);
    this.cacheOrder.push(iconUrl);
  }

  clearCache() {
    this.cache.forEach(url => URL.revokeObjectURL(url));
    this.cache.clear();
    this.cacheOrder = [];
  }
}
