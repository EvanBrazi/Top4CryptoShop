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
    this._injectStyles();
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
      console.log('Create Card :: name : ', app.name);
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
    const iconContainer = document.createElement('div');
    iconContainer.className = 'app-icon-container';

    const iconElement = document.createElement('img');
    iconElement.className = 'app-icon';
    iconElement.alt = app.name;
    iconElement.loading = 'lazy';

    try {
      iconElement.src = await this.appsTabIcons.getIcon(app.icon);
      console.log('Create Card ::try get : ', app.icon);
    } catch {
      iconElement.src = this.appsTabIcons.getFallbackIcon();
      console.log('Create Card ::catch error so get : ', this.appsTabIcons.getFallbackIcon());
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

  /**
   * حقن أنماط CSS المخصصة
   * @private
   */
  _injectStyles() {
    const styleId = 'apps-tab-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .apps-tab-container {
        --theme-color: ${this.config.themeColor};
        --card-size: 120px;
        position: relative;
        min-height: 60vh;
      }

      .search-container {
        padding: 15px;
        position: sticky;
        top: 0;
        background: white;
        z-index: 10;
        box-shadow: 0 2px 5px rgba(0,0,0,0.05);
      }

      .search-bar {
        width: 100%;
        padding: 10px 15px;
        border: 1px solid #ddd;
        border-radius: 20px;
        font-size: 1rem;
        outline: none;
        transition: all 0.3s ease;
      }

      .search-bar:focus {
        border-color: ${this.config.themeColor};
        box-shadow: 0 0 0 2px rgba(106, 90, 205, 0.2);
      }

      .apps-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(var(--card-size), 1fr));
        gap: 15px;
        padding: 15px;
        direction: rtl;
      }

      .app-card {
        position: relative;
        width: 100%;
        aspect-ratio: 1/1;
        border-radius: auto;
        overflow: hidden;
        cursor: pointer;
        transition: all 0.3s ease;
        background: var(--card-bg, #fff);
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }

      .app-card:hover {
        transform: translateY(-5px);
        box-shadow: 0 5px 15px rgba(0,0,0,0.2);
      }

      .app-icon-container {
        width: 100%;
        height: 70%;
        display: flex;
        justify-content: center;
        align-items: center;
        border-radius: 12px;
        background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
      }

      .app-icon {
        border-radius: 100%;
        max-width: 60%;
        max-height: 60%;
        object-fit: contain;
        transition: transform 0.3s ease;
      }

      .app-card:hover .app-icon {
        transform: scale(1.05);
      }

      .app-name {
        padding: 8px;
        text-align: center;
        font-size: 0.8rem;
        height: 30%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--card-bg, #fff);
        word-break: break-word;
      }

      /* أنماط الثيمات */
      .night-theme .app-card {
        --card-bg: #2c3e50;
      }
      
      .night-theme .app-name {
        color: #ecf0f1;
      }

      .night-theme .search-container {
        background: #34495e;
      }

      .night-theme .search-bar {
        background: #2c3e50;
        color: #ecf0f1;
        border-color: #7f8c8d;
      }

      /* حالة التحميل */
      .skeleton-loading {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: white;
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 5;
      }

      .skeleton-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(var(--card-size), 1fr));
        gap: 15px;
        padding: 15px;
        width: 100%;
      }

      .skeleton-card {
        width: 100%;
        aspect-ratio: 1/1;
        border-radius: 12px;
        background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
        background-size: 200% 100%;
        animation: shimmer 1.5s infinite;
      }

      @keyframes shimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }

      /* حالة الخطأ */
      .tab-error-state {
        text-align: center;
        padding: 20px;
        color: #ff6b6b;
      }
      
      .retry-btn {
        background: ${this.config.themeColor};
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        margin-top: 10px;
        cursor: pointer;
        transition: opacity 0.3s;
      }

      .retry-btn:hover {
        opacity: 0.9;
      }

      /* حالة عدم وجود نتائج */
      .empty-state {
        grid-column: 1 / -1;
        text-align: center;
        padding: 40px 20px;
        color: #7f8c8d;
      }

      /* التكيف مع أحجام الشاشات */
      @media (max-width: 768px) {
        .apps-tab-container {
          --card-size: 100px;
        }
      }

      @media (max-width: 480px) {
        .apps-tab-container {
          --card-size: 80px;
        }
      }
    `;
    document.head.appendChild(style);
  }
}
