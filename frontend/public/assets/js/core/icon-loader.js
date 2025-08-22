/**
 * @file icon-loader.js
 * @description المحمل الرئيسي للأيقونات - واجهة موحدة لتحميل وعرض الأيقونات
 * @version 3.0.0
 * @license MIT
 * @author Evan Brazi
 * @updated 2025-08-22
 */

import { UnifiedIconSystem } from './unified-icon-system.js';
import { IconRenderer } from './icon-renderer.js';

/**
 * @class IconLoader
 * @description المحمل الرئيسي للأيقونات - يوفر واجهة بسيطة لتحميل وعرض الأيقونات
 */
export class IconLoader {
    /**
     * @constructor
     * @param {Object} config - إعدادات التهيئة
     */
    constructor(config = {}) {
        this.system = config.system || new UnifiedIconSystem(config);
        this.renderer = config.renderer || new IconRenderer();
        this.config = config;
    }

    /**
     * تحميل الأيقونة كـ Blob
     * @param {string} iconName - اسم الأيقونة
     * @returns {Promise<Blob|null>} بيانات الأيقونة أو null عند الفشل
     */
    async load(iconName) {
        try {
            return await this.system.getIcon(iconName);
        } catch (error) {
            console.error('❌ فشل تحميل الأيقونة:', iconName, error);
            return null;
        }
    }

    /**
     * تحميل الأيقونة كـ URL مؤقت
     * @param {string} iconName - اسم الأيقونة
     * @returns {Promise<string|null>} رابط الأيقونة أو null عند الفشل
     */
    async loadAsURL(iconName) {
        try {
            const blob = await this.load(iconName);
            return blob ? URL.createObjectURL(blob) : null;
        } catch (error) {
            console.error('❌ فشل تحميل الأيقونة كـ URL:', iconName, error);
            return null;
        }
    }

    /**
     * عرض الأيقونة داخل عنصر <img>
     * @param {string} iconName - اسم الأيقونة
     * @param {HTMLImageElement} imgElement - عنصر الصورة
     * @param {string} fallbackText - نص بديل عند الفشل
     * @returns {Promise<void>}
     */
    async render(iconName, imgElement, fallbackText = '!') {
        try {
            await this.renderer.renderFromSystem(
                this.system, 
                iconName, 
                imgElement, 
                fallbackText
            );
        } catch (error) {
            console.error('❌ فشل عرض الأيقونة:', iconName, error);
            
            if (imgElement && this.renderer.generateFallbackIcon) {
                imgElement.src = this.renderer.generateFallbackIcon(fallbackText);
            }
        }
    }

    /**
     * تحميل مسبق لمجموعة أيقونات
     * @param {Array<string>} iconList - قائمة الأيقونات
     * @returns {Promise<number>} عدد الأيقونات التي تم تحميلها
     */
    async preload(iconList) {
        try {
            return await this.system.preloadIcons(iconList);
        } catch (error) {
            console.error('❌ فشل التحميل المسبق للأيقونات:', error);
            return 0;
        }
    }

    /**
     * تنظيف الكاش
     * @param {number} maxAge - الحد الأقصى للعمر بالمللي ثانية
     */
    clearCache(maxAge) {
        this.system.clearCache(maxAge);
    }

    /**
     * الحصول على معلومات عن الأيقونة
     * @param {string} iconName - اسم الأيقونة
     */
    getInfo(iconName) {
        this.system.getIconInfo(iconName);
    }
}

// إنشاء نسخة افتراضية للاستخدام العام
const defaultIconLoader = new IconLoader();

// تصدير المحمل الافتراضي والمكونات الأساسية
export default defaultIconLoader;
export { UnifiedIconSystem, IconRenderer };
