/**
 * @file apiService.js
 * @class ApiService
 * @description خدمة متقدمة لإدارة طلبات API مع نظام كاش متطور
 * @version 3.0.0
 * @license MIT
 */

export default class ApiService {
  constructor(baseURL = '', options = {}) {
    this.baseURL = baseURL;
    this.options = {
      cacheDuration: options.cacheDuration || 1, // يوم واحد افتراضيًا
      maxConcurrentRequests: options.maxConcurrentRequests || 5,
      retryCount: options.retryCount || 2,
      timeout: options.timeout || 10000, // 10 ثواني افتراضيًا
      cachePrefix: options.cachePrefix || 'api_cache_v3_'
    };
    
    this.requestQueue = [];
    this.activeRequests = 0;
    this.cache = this._initCache();
  }

  _initCache() {
    return {
      get: (key) => {
        try {
          const item = localStorage.getItem(this.options.cachePrefix + key);
          if (!item) return null;
          
          const { data, timestamp, etag } = JSON.parse(item);
          const age = Date.now() - timestamp;
          
          if (age > this.options.cacheDuration * 24 * 60 * 60 * 1000) {
            this.clearCache(key);
            return null;
          }
          
          return { data, etag };
        } catch (e) {
          this.clearCache(key);
          return null;
        }
      },
      
      set: (key, value, etag) => {
        try {
          const item = JSON.stringify({
            data: value,
            timestamp: Date.now(),
            etag
          });
          localStorage.setItem(this.options.cachePrefix + key, item);
        } catch (e) {
          console.error('Failed to save to cache:', e);
          this._clearOldestCacheItems();
        }
      },
      
      clear: (key) => {
        localStorage.removeItem(this.options.cachePrefix + key);
      }
    };
  }

  async fetchData(endpoint, cacheKey, { key = null, forceRefresh = false } = {}) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ resolve, reject, endpoint, cacheKey, key, forceRefresh });
      this._processQueue();
    });
  }

  async _processQueue() {
    while (this.requestQueue.length > 0 && 
           this.activeRequests < this.options.maxConcurrentRequests) {
      const { resolve, reject, endpoint, cacheKey, key, forceRefresh } = this.requestQueue.shift();
      this.activeRequests++;
      
      try {
        const data = await this._fetchWithCache(endpoint, cacheKey, forceRefresh);
        resolve(key ? data[key] : data);
      } catch (error) {
        reject(error);
      } finally {
        this.activeRequests--;
        this._processQueue();
      }
    }
  }

  async _fetchWithCache(endpoint, cacheKey, forceRefresh = false) {
    // التحقق من الكاش إذا لم يكن هناك إجبار على التحديث
    if (!forceRefresh) {
      const cached = this.cache.get(cacheKey);
      if (cached) return cached.data;
    }

    let attempt = 0;
    let lastError;
    
    while (attempt <= this.options.retryCount) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);
        
        const headers = {};
        const cached = this.cache.get(cacheKey);
        if (cached?.etag) {
          headers['If-None-Match'] = cached.etag;
        }

        const response = await fetch(`${this.baseURL}${endpoint}`, {
          signal: controller.signal,
          headers
        });

        clearTimeout(timeoutId);

        if (response.status === 304) { // Not Modified
          return cached.data;
        }

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const etag = response.headers.get('ETag');
        
        if (response.status !== 304) {
          this.cache.set(cacheKey, data, etag);
        }

        return data;
      } catch (error) {
        lastError = error;
        attempt++;
        if (attempt <= this.options.retryCount) {
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }
    }

    // إذا فشلت جميع المحاولات، نعود للكاش إذا كان موجودًا
    const cached = this.cache.get(cacheKey);
    if (cached) {
      console.warn('Using cached data after failed requests');
      return cached.data;
    }

    throw lastError || new Error('Failed to fetch data');
  }

  clearCache(key = null) {
    if (key) {
      this.cache.clear(key);
    } else {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith(this.options.cachePrefix)) {
          localStorage.removeItem(k);
        }
      });
    }
  }

  async refreshData(endpoint, cacheKey, key = null) {
    return this.fetchData(endpoint, cacheKey, { key, forceRefresh: true });
  }

  _clearOldestCacheItems() {
    try {
      const items = Object.keys(localStorage)
        .filter(k => k.startsWith(this.options.cachePrefix))
        .map(k => ({
          key: k,
          item: JSON.parse(localStorage.getItem(k))
        }))
        .sort((a, b) => a.item.timestamp - b.item.timestamp);

      // حذف 10% من أقدم العناصر
      const toRemove = Math.ceil(items.length * 0.1);
      for (let i = 0; i < toRemove; i++) {
        localStorage.removeItem(items[i].key);
      }
    } catch (e) {
      console.error('Failed to clear oldest cache items:', e);
    }
  }

  getCacheInfo() {
    const keys = Object.keys(localStorage)
      .filter(k => k.startsWith(this.options.cachePrefix));

    const size = keys.reduce((total, key) => {
      return total + (localStorage.getItem(key)?.length || 0);
    }, 0);

    return {
      count: keys.length,
      size: `${(size / 1024).toFixed(2)} KB`,
      maxConcurrent: this.options.maxConcurrentRequests,
      cacheDuration: `${this.options.cacheDuration} days`
    };
  }
}
