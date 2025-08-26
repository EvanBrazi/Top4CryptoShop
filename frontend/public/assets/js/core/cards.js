/**
 * @file cards-service.js
 * @module CardsService
 * @description خدمة جلب ومعالجة بيانات الكروت مع دعم نظام الأيقونات الموحد
 * @version 3.0.0
 * @license MIT
 * @author Evan Brazi
 * @updated 2025-08-25
 */

export class CardsService {
    /**
     * @param {string} apiEndpoint
     * @param {string} basePath
     * @param {Object} options
     */
    constructor(apiEndpoint, basePath, options = {}) {
        this.apiEndpoint = apiEndpoint;
        this.basePath = basePath;
        this.options = options;
        this.iconLoader = null; // يمكن حقنه لاحقًا
    }

    /**
     * ربط محمل الأيقونات بعد التهيئة
     * @param {IconLoader} loader
     */
    injectIconLoader(loader) {
        this.iconLoader = loader;
    }

    /**
     * جلب البيانات من السيرفر
     * @returns {Promise<Array>}
     */
    async fetchCards() {
        try {
            const response = await fetch(this.apiEndpoint, this.options);
            if (!response.ok) throw new Error(`فشل الاتصال: HTTP ${response.status}`);
            const data = await response.json();
            return Array.isArray(data) ? data : [];
        } catch (error) {
            console.error('❌ خطأ أثناء جلب بيانات الكروت:', error);
            return [];
        }
    }

    /**
     * معالجة الكروت وإضافة روابط الصور أو محمل الأيقونات
     * @returns {Promise<Array>}
     */
    async getProcessedCards() {
        const rawCards = await this.fetchCards();

        return rawCards.map(card => ({
            ...card,
            imageUrl: `${this.basePath}/${card.image || 'default.png'}`,
            iconName: card.image || 'default.png',
            iconLoader: this.iconLoader || null
        }));
    }
}
