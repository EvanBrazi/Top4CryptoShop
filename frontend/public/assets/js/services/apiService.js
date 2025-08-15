/**
 * @file apiService.js
 * @class ApiService
 * @description خدمة متكاملة لإدارة طلبات API مع نظام تخزين مؤقت متقدم
 * @version 2.0.0
 * @license MIT
 */

export default class ApiService {
  /**
   * @constructor
   * @param {string} [baseURL=''] - الرابط الأساسي لجميع طلبات API
   * @param {Object} [options={}] - خيارات إضافية
   * @param {number} [options.cacheDuration=7] - مدة صلاحية الكاش بالأيام
   * @param {number} [options.maxConcurrentRequests=5] - الحد الأقصى للطلبات المتزامنة
   */
  constructor(baseURL = '', options = {}) {
    this.baseURL = baseURL;
    this.options = {
      cacheDuration: options.cacheDuration || 7,
      maxConcurrentRequests: options.maxConcurrentRequests || 5
    };
    this.requestQueue = [];
    this.activeRequests = 0;
    this.cachePrefix = 'api_cache_';
  }

  /**
   * @private
   * @method _processQueue
   * @description معالجة طابور الطلبات المتعثرة
   */
  _processQueue() {
    while (this.requestQueue.length > 0 && this.activeRequests < this.options.maxConcurrentRequests) {
      const { resolve, reject, endpoint, cacheKey, key } = this.requestQueue.shift();
      this.activeRequests++;
      this._fetchWithCache(endpoint, cacheKey, key)
        .then(resolve)
        .catch(reject)
        .finally(() => {
          this.activeRequests--;
          this._processQueue();
        });
    }
  }

  /**
   * @private
   * @method _fetchWithCache
   * @description تنفيذ الطلب مع إدارة الكاش
   * @param {string} endpoint - مسار API
   * @param {string} cacheKey - مفتاح التخزين
   * @param {string|null} key - مفتاح بيانات فرعي
   * @returns {Promise<any>}
   */
  async _fetchWithCache(endpoint, cacheKey, key = null) {
    const fullCacheKey = `${this.cachePrefix}${cacheKey}`;
    const cachedData = this._getCache(fullCacheKey);
    
    if (cachedData) {
      return key ? cachedData[key] : cachedData;
    }

    try {
      const response = await fetch(`${this.baseURL}${endpoint}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const data = await response.json();
      this._setCache(fullCacheKey, data);
      return key ? data[key] : data;
    } catch (error) {
      console.error('فشل في جلب البيانات:', error);
      throw error;
    }
  }

  /**
   * @private
   * @method _getCache
   * @description استرجاع البيانات من الكاش المحلي
   * @param {string} key - مفتاح التخزين
   * @returns {any|null}
   */
  _getCache(key) {
    const item = localStorage.getItem(key);
    if (!item) return null;

    try {
      const { data, timestamp } = JSON.parse(item);
      const cacheAgeDays = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
      
      if (cacheAgeDays > this.options.cacheDuration) {
        localStorage.removeItem(key);
        return null;
      }
      return data;
    } catch (e) {
      localStorage.removeItem(key);
      return null;
    }
  }

  /**
   * @private
   * @method _setCache
   * @description تخزين البيانات في الكاش المحلي
   * @param {string} key - مفتاح التخزين
   * @param {any} data - البيانات للتخزين
   */
  _setCache(key, data) {
    const cacheObject = {
      data,
      timestamp: Date.now()
    };
    localStorage.setItem(key, JSON.stringify(cacheObject));
  }

  /**
   * @method fetchData
   * @description جلب بيانات من API مع إدارة الطلبات المتزامنة والتخزين المؤقت
   * @param {string} endpoint - مسار API
   * @param {string} cacheKey - مفتاح التخزين (بدون البادئة)
   * @param {string|null} [key=null] - مفتاح بيانات فرعي
   * @returns {Promise<any>}
   */
  async fetchData(endpoint, cacheKey, key = null) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ resolve, reject, endpoint, cacheKey, key });
      this._processQueue();
    });
  }

  /**
   * @method clearCache
   * @description حذف الكاش المحدد أو جميع الكاشات
   * @param {string|null} [key=null] - مفتاح محدد للحذف (اختياري)
   */
  clearCache(key = null) {
    if (key) {
      localStorage.removeItem(`${this.cachePrefix}${key}`);
    } else {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith(this.cachePrefix)) {
          localStorage.removeItem(k);
        }
      });
    }
  }

  /**
   * @method refreshData
   * @description إعادة جلب البيانات وتحديث الكاش
   * @param {string} endpoint - مسار API
   * @param {string} cacheKey - مفتاح التخزين
   * @param {string|null} [key=null] - مفتاح بيانات فرعي
   * @returns {Promise<any>}
   */
  async refreshData(endpoint, cacheKey, key = null) {
    this.clearCache(cacheKey);
    return this.fetchData(endpoint, cacheKey, key);
  }

  /**
   * @method getCacheInfo
   * @description الحصول على معلومات عن حالة الكاش
   * @returns {Object}
   */
  getCacheInfo() {
    return {
      size: this._getCacheSize(),
      items: this._getCacheKeys(),
      options: { ...this.options }
    };
  }

  /**
   * @private
   * @method _getCacheKeys
   * @description الحصول على مفاتيح الكاش الحالية
   * @returns {Array<string>}
   */
  _getCacheKeys() {
    return Object.keys(localStorage)
      .filter(k => k.startsWith(this.cachePrefix))
      .map(k => k.replace(this.cachePrefix, ''));
  }

  /**
   * @private
   * @method _getCacheSize
   * @description حساب حجم الكاش بالبايت
   * @returns {number}
   */
  _getCacheSize() {
    return this._getCacheKeys().reduce((total, key) => {
      const item = localStorage.getItem(`${this.cachePrefix}${key}`);
      return total + (item ? item.length * 2 : 0); // تقريب بحجم UTF-16
    }, 0);
  }
}
