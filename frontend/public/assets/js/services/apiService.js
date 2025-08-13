// services/apiService.js

export default class ApiService {
    constructor(baseURL = '') {
        this.baseURL = baseURL;
    }

    /**
     * @method fetchData
     * @description جلب بيانات من أي endpoint وتحويلها إلى مصفوفة
     * @param {string} endpoint
     * @param {string} [key] - المفتاح المتوقع للمصفوفة داخل الاستجابة
     * @returns {Promise<Array>}
     */
    async fetchData(endpoint, cacheKey) {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            const parsed = JSON.parse(cached);
            return parsed.data;
        }

        const response = await fetch(endpoint);
        const data = await response.json();

        const cacheObject = {
            data,
            timestamp: Date.now()
        };

        localStorage.setItem(cacheKey, JSON.stringify(cacheObject));
        return data;
    }

    /**
     * ينظف الكاشات القديمة من localStorage بناءً على مدة الصلاحية.
     * @param {number} days - عدد الأيام المسموح بها قبل حذف الكاش.
     *
     * مدة صلاحية الكاش بالتوقيت الميللي ثانية.
     * مثال: 86400000 = يوم واحد
     **/
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
}