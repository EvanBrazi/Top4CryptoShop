// services/apiService.js

/**
 * @class ApiService
 * @description خدمة لجلب البيانات من السيرفر مع دعم الكاش المحلي
 */
export default class ApiService {
  constructor(baseURL = '') {
    this.baseURL = baseURL;
  }

  /**
   * @method fetchData
   * @description جلب بيانات من endpoint وتخزينها مؤقتًا في localStorage
   * @param {string} endpoint - مسار API المطلوب
   * @param {string} cacheKey - مفتاح التخزين المحلي
   * @param {string|null} key - مفتاح داخلي داخل JSON (اختياري)
   * @returns {Promise<Array|Object>}
   */
  async fetchData(endpoint, cacheKey, key = null) {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      return key ? parsed.data[key] : parsed.data;
    }

    const response = await fetch(endpoint);
    const data = await response.json();

    const cacheObject = {
      data,
      timestamp: Date.now()
    };

    localStorage.setItem(cacheKey, JSON.stringify(cacheObject));
    return key ? data[key] : data;
  }

  /**
   * @method clearOldCache
   * @description حذف الكاشات القديمة من localStorage
   * @param {number} days - عدد الأيام قبل اعتبار الكاش قديم
   */
  clearOldCache(days = 7) {
    const now = Date.now();
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      const item = localStorage.getItem(key);
      try {
        const parsed = JSON.parse(item);
        if (parsed.timestamp && now - parsed.timestamp > days * 86400000) {
          localStorage.removeItem(key);
        }
      } catch (e) {
        // تجاهل القيم غير قابلة للتحليل
      }
    });
  }

  /**
   * @method invalidateCache
   * @description حذف كاش معين يدويًا
   * @param {string} key - اسم المفتاح في localStorage
   */
  invalidateCache(key) {
    localStorage.removeItem(key);
  }
}