/**
 * @file appstab.js
 * @module AppsTab
 * @author Evan Brazi
 * @version 8.1.0
 * @description تبويب التطبيقات لعرض شبكة من البطاقات باستخدام نظام الأيقونات الموحد
 * @license MIT
 * @created 2024-12-01
 * @updated 2025-08-20
 */

import { UnifiedIconSystem } from '../core/unified-icon-system.js';

/**
 * @class AppsTab
 * @classdesc يعرض شبكة من التطبيقات مع تحميل ذكي للأيقونات وتفاعل سلس
 */
export class AppsTab {
  /**
   * @constructor
   * @param {Object} config - إعدادات التهيئة
   * @param {string} config.containerId - معرف عنصر الحاوية
   * @param {Object} [config.options={}] - إعدادات إضافية
   * @param {Array} [config.options.appsData=[]] - بيانات التطبيقات
   * @param {string} [config.options.themeColor='#6a5acd'] - لون الثيم
   * @param {Function} [config.options.onCardClick] - دالة عند النقر على البطاقة
   * @param {Object} [config.options.appsTabIcons] - نظام الأيقونات الموحد
   */
  constructor({ containerId, options = {} }) {
    this.container = document.getElementById(containerId);
    if (!this.container) throw new Error(`Container "${containerId}" not found`);

    this.appsTabIcons = options.appsTabIcons || new UnifiedIconSystem();

    this.config = {
      appsData: options.appsData || [],
      themeColor: options.themeColor || '#6a5acd',
      onCardClick: typeof options.onCardClick === 'function' ? options.onCardClick : () => {}
    };

    this.init();
  }

  /**
   * تهيئة التبويب
   * @private
   */
  async init() {
    this._renderSkeleton();
    await this._renderAppsGrid();
    this._setupLazyLoading();
  }

  /**
   * عرض هيكل مؤقت أثناء التحميل
   * @private
   */
  async _renderSkeleton() {
    this.container.innerHTML = `
      <div class="skeleton-grid">
        ${Array(12).fill('<div class="skeleton-card"></div>').join('')}
      </div>
    `;
  }

  /**
   * عرض شبكة التطبيقات
   * @private
   */
  async _renderAppsGrid() {
    const grid = document.createElement('div');
    grid.className = 'apps-grid';

    const fragment = document.createDocumentFragment();

    for (const app of this.config.appsData) {
      const card = await this._createAppCard(app);
      fragment.appendChild(card);
    }

    grid.appendChild(fragment);
    this.container.innerHTML = '';
    this.container.appendChild(grid);
  }

  /**
   * إنشاء بطاقة تطبيق واحدة
   * @private
   * @param {Object} app - بيانات التطبيق
   * @returns {HTMLElement}
   */
  async _createAppCard(app) {
    const card = document.createElement('div');
    card.className = 'app-card';
    card.dataset.appId = app.id || app.name;
    console.log('Create Card :: name : ', card.dataset.appId);
    const iconContainer = document.createElement('div');
    iconContainer.className = 'app-icon-container';

    const iconElement = document.createElement('img');
    iconElement.className = 'app-icon';
    iconElement.alt = app.name;
    iconElement.loading = 'lazy';

    try {
      iconElement.src = await this.appsTabIcons.getIcon(app.icon);
    } catch {
      iconElement.src = this.appsTabIcons.getFallbackIcon();
    }

    iconContainer.appendChild(iconElement);
    card.appendChild(iconContainer);

    const nameElement = document.createElement('div');
    nameElement.className = 'app-name';
    nameElement.textContent = app.name;
    card.appendChild(nameElement);

    card.addEventListener('click', () => this.config.onCardClick(app));

    return card;
  }

  /**
   * تفعيل تحميل الأيقونات عند ظهور البطاقة
   * @private
   */
  async _setupLazyLoading() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const card = entry.target;
          const img = card.querySelector('.app-icon');
          const appId = card.dataset.appId;
          const app = this.config.appsData.find(a => a.id === appId || a.name === appId);

          if (img && !img.src && app) {
            this.appsTabIcons.getIcon(app.icon).then(url => img.src = url);
          }
        }
      });
    }, { threshold: 0.1 });

    this.container.querySelectorAll('.app-card').forEach(card => observer.observe(card));
  }
}
