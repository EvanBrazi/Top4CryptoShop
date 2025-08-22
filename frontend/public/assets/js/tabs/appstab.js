/**
 * @file appstab.js
 * @module AppsTab
 * @author Evan Brazi
 * @version 8.2.0
 * @description تبويب التطبيقات لعرض شبكة من البطاقات باستخدام نظام الأيقونات الموحد مع دعم التحميل الكسول والتحليل الزمني
 * @license MIT
 * @created 2024-12-01
 * @updated 2025-08-22
 */

import { IconRenderer } from '../core/icon-renderer.js';
import { UnifiedIconSystem } from '../core/unified-icon-system.js';

/**
 * @class AppsTab
 * @classdesc يعرض شبكة من التطبيقات مع تحميل ذكي للأيقونات وتفاعل سلس وتحليل الأداء
 */
export class AppsTab {
  /**
   * @constructor
   * @param {Object} config - إعدادات التهيئة
   */
  constructor({ containerId, options = {} }) {
    this.container = document.getElementById(containerId);
    if (!this.container) throw new Error(`Container "${containerId}" not found`);

    this.appsTabIcons = options.appsTabIcons || new UnifiedIconSystem({
      basePath: '/icons/apps/',
      fallback: 'default.png'
    });

    this.iconRenderer = options.iconRenderer || new IconRenderer('apps-tab-home');
    this.fallbackUrl = options.fallbackUrl || '/icons/apps/default.png';

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
    this._injectStyles();
    await this._renderAppsGrid();
    this._setupLazyLoading();
  }

  /**
   * عرض هيكل مؤقت أثناء التحميل
   * @private
   */
  _renderSkeleton() {
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
    this.container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'apps-grid';

    const fragment = document.createDocumentFragment();
    const cards = await Promise.all(
      this.config.appsData.map(app => this._createAppCard(app))
    );
    cards.forEach(card => fragment.appendChild(card));
    grid.appendChild(fragment);
    this.container.appendChild(grid);
  }

  /**
   * إنشاء بطاقة تطبيق واحدة
   * @private
   */
  async _createAppCard(app) {
    const card = document.createElement('div');
    card.className = 'app-card';
    card.dataset.appId = app.id || app.name;
    card.dataset.iconName = app.icon || 'default.png';

    const iconContainer = document.createElement('div');
    iconContainer.className = 'app-icon-container';

    const iconElement = document.createElement('img');
    iconElement.className = 'app-icon';
    iconElement.alt = app.name;
    iconElement.loading = 'lazy';
    iconElement.src = ''; // سيتم تحميله لاحقًا عند التقاطع

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
      entries.forEach(async entry => {
        if (entry.isIntersecting) {
          const card = entry.target;
          const img = card.querySelector('.app-icon');
          const iconName = card.dataset.iconName;

          try {
            console.log('AppsTab ::: _setupLazyLoading : iconName : ', iconName);
            const blob = await this.appsTabIcons.getIcon(iconName);
            this.iconRenderer.render(blob, this.fallbackUrl, img);
            img.onload = () => console.log('✅ تم تحميل الأيقونة:', iconName);
            img.onerror = () => console.warn('❌ فشل تحميل الأيقونة:', iconName);
          } catch (error) {
            console.error('❌ خطأ أثناء تحميل الأيقونة:', iconName, error);
            img.src = this.fallbackUrl;
          }

          observer.unobserve(card); // منع التكرار
        }
      });
    }, { threshold: 0.1 });

    this.container.querySelectorAll('.app-card').forEach(card => observer.observe(card));
  }

  /**
   * حقن أنماط CSS المخصصة
   * @private
   */
  _injectStyles() {
    const styleId = 'apps-tab-styles';
    if (document.getElementById(styleId)) return;

    const link = document.createElement('link');
    link.id = styleId;
    link.rel = 'stylesheet';
    link.href = '/assets/css/apps-tab.css';
    document.head.appendChild(link);
  }
}
