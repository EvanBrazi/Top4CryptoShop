// 📁 المسار المقترح: core/icon-loader.js

import { UnifiedIconSystem } from './unified-icon-system.js';
import { IconRenderer } from './icon-renderer.js';

export class IconLoader {
  constructor(config = {}) {
    this.system = new UnifiedIconSystem(config);
    this.renderer = new IconRenderer();
  }

  /**
   * تحميل الأيقونة كـ Blob فقط
   * @param {string} iconName - اسم الأيقونة
   * @returns {Promise<Blob|null>}
   */
  async load(iconName) {
    return await this.system.getIcon(iconName);
  }

  /**
   * عرض الأيقونة داخل عنصر <img>
   * @param {string} iconName - اسم الأيقونة
   * @param {HTMLImageElement} imgElement - العنصر الذي سيتم عرض الأيقونة فيه
   * @param {string} fallbackText - النص البديل في حالة الفشل
   */
  async render(iconName, imgElement, fallbackText = '!') {
    await this.renderer.renderFromSystem(this.system, iconName, fallbackText, imgElement);
  }

  /**
   * تحميل الأيقونة كـ URL مؤقت (objectURL)
   * @param {string} iconName
   * @returns {Promise<string|null>}
   */
  async getURL(iconName) {
    const blob = await this.load(iconName);
    if (!blob) return null;
    return URL.createObjectURL(blob);
  }

  /**
   * تنظيف عنوان objectURL بعد الاستخدام
   * @param {string} url
   */
  revokeURL(url) {
    if (url) URL.revokeObjectURL(url);
  }
}
