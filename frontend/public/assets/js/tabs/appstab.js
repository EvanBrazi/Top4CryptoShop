/**
 * @file appstab.js
 * @class AppsTab
 * @description تبويب التطبيقات مع نظام تحميل ذكي للأيقونات باستخدام IconManager
 * @version 10.0.0
 * @license MIT
 */

import { IconManager } from '../core/iconmanager.js';

export class AppsTab {
  /**
   * @constructor
   * @param {Object} params - معاملات التهيئة
   * @param {string} params.containerId - معرف عنصر الحاوية
   * @param {Object} params.options - خيارات التهيئة
   * @param {Array} params.options.appsData - بيانات التطبيقات
   * @param {string} params.options.iconsBasePath - المسار الأساسي للأيقونات
   * @param {string} params.options.themeColor - لون الثيم
   * @param {number} params.options.maxConcurrentLoads - الحد الأقصى للتحميلات المتزامنة
   * @param {string} params.options.cacheStrategy - استراتيجية الكاش (lazy/eager)
   * @param {Function} params.options.onCardClick - دالة معالجة النقر على البطاقة
   * @param {Function} params.options.onError - دالة معالجة الأخطاء
   */
  constructor({ containerId, options = {} }) {
    this.container = document.getElementById(containerId);
    if (!this.container) throw new Error(`❌ عنصر الحاوية غير موجود: ${containerId}`);

    // إعدادات التهيئة
    this.options = {
      appsData: Array.isArray(options.appsData) ? options.appsData : [],
      iconsBasePath: options.iconsBasePath?.endsWith('/') ? options.iconsBasePath : `${options.iconsBasePath}/`,
      themeColor: options.themeColor || '#6a5acd',
      maxConcurrentLoads: options.maxConcurrentLoads || 4,
      cacheStrategy: options.cacheStrategy || 'lazy',
      onCardClick: options.onCardClick || (() => {}),
      onError: options.onError || (() => {})
    };

    // تهيئة IconManager
    this.iconManager = new IconManager({
      maxConcurrent: this.options.maxConcurrentLoads,
      maxItems: options.maxCachedIcons || 200,
      ttl: options.iconTTL || 24 * 60 * 60 * 1000, // 24 ساعة
      defaultIconUrl: this._getIconPath('default.png')
    });

    // حالة التبويب
    this.state = {
      loading: false,
      error: null,
      filteredApps: [...this.options.appsData],
      visibleApps: new Set()
    };

    // موارد النظام
    this.resources = {
      observer: null,
      cleanupInterval: null,
      resizeObserver: null
    };

    this._init().catch(error => {
      this.options.onError(error);
    });
  }

  /* ---------------------------------- */
  /* --------- Core Functions --------- */
  /* ---------------------------------- */

  /**
   * تهيئة تبويب التطبيقات
   * @private
   * @returns {Promise<void>}
   */
  async _init() {
    try {
      this.state.loading = true;
      this._injectStyles();
      this._renderSkeletonLoading();
      await this._renderSearchBar();
      await this._renderAppsGrid();
      this._setupIntersectionObserver();
      this._setupMemoryManagement();
      this._setupResponsiveBehavior();

      if (this.options.cacheStrategy === 'eager') {
        await this._preloadVisibleIcons();
      }
    } catch (error) {
      this.state.error = error;
      console.error('فشل تهيئة تبويب التطبيقات:', error);
      this._showErrorState(error);
    } finally {
      this.state.loading = false;
    }
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
        --theme-color: ${this.options.themeColor};
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
        border-color: ${this.options.themeColor};
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
        border-radius: 12px;
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
        background: ${this.options.themeColor};
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

  /* ------------------------------------ */
  /* -------- Icon Loading System ------- */
  /* ------------------------------------ */

  /**
   * إعداد مراقبة تقاطع العناصر (Intersection Observer)
   * @private
   */
  _setupIntersectionObserver() {
    if (this.resources.observer) {
      this.resources.observer.disconnect();
    }

    this.resources.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const appId = entry.target.dataset.appId;
        
        if (entry.isIntersecting) {
          this.state.visibleApps.add(appId);
          this._loadAppIcon(entry.target);
        } else {
          this.state.visibleApps.delete(appId);
        }
      });
    }, { 
      threshold: 0.01,
      rootMargin: '200px'
    });

    document.querySelectorAll('.app-card').forEach(card => {
      this.resources.observer.observe(card);
    });
  }

  /**
   * تحميل أيقونة التطبيق
   * @private
   * @param {HTMLElement} cardElement - عنصر بطاقة التطبيق
   * @returns {Promise<void>}
   */
  async _loadAppIcon(cardElement) {
    const imgElement = cardElement.querySelector('.app-icon');
    const iconUrl = imgElement.dataset.src;

    // تجنب إعادة تحميل الأيقونات المرئية بالفعل
    if (imgElement.src && imgElement.src !== '') return;

    try {
      const objectUrl = await this.iconManager.getIcon(iconUrl);
      imgElement.src = objectUrl;
      imgElement.onerror = () => {
        imgElement.src = this._getIconPath('default.png');
      };
    } catch (error) {
      console.warn(`فشل تحميل الأيقونة: ${iconUrl}`, error);
      imgElement.src = this._getIconPath('default.png');
    }
  }

  /**
   * تحميل مسبق للأيقونات المرئية
   * @private
   * @returns {Promise<void>}
   */
  async _preloadVisibleIcons() {
    const visibleIcons = Array.from(document.querySelectorAll('.app-card'))
      .filter(card => {
        const rect = card.getBoundingClientRect();
        return (
          rect.top < window.innerHeight &&
          rect.bottom > 0 &&
          rect.left < window.innerWidth &&
          rect.right > 0
        );
      })
      .map(card => card.querySelector('.app-icon').dataset.src);

    await this.iconManager.preloadIcons(visibleIcons);
  }

  /* ------------------------------------ */
  /* -------- Memory Management --------- */
  /* ------------------------------------ */

  /**
   * إدارة الذاكرة والتنظيف التلقائي
   * @private
   */
  _setupMemoryManagement() {
    // تنظيف الذاكرة كل 10 دقائق
    if (this.resources.cleanupInterval) {
      clearInterval(this.resources.cleanupInterval);
    }

    this.resources.cleanupInterval = setInterval(() => {
      this.iconManager.clearCache();
    }, 10 * 60 * 1000);

    // تنظيف الذاكرة عند إخفاء الصفحة
    document.addEventListener('visibilitychange', this._handleVisibilityChange);
  }

  /**
   * معالجة تغيير حالة رؤية الصفحة
   * @private
   */
  _handleVisibilityChange = () => {
    if (document.hidden) {
      this.iconManager.clearCache();
    }
  }

  /**
   * إعداد سلوك التكيف مع أحجام الشاشات
   * @private
   */
  _setupResponsiveBehavior() {
    if (this.resources.resizeObserver) {
      this.resources.resizeObserver.disconnect();
    }

    this.resources.resizeObserver = new ResizeObserver(() => {
      this._adjustGridLayout();
    });

    this.resources.resizeObserver.observe(this.container);
  }

  /**
   * ضبط تخطيط الشبكة حسب حجم الشاشة
   * @private
   */
  _adjustGridLayout() {
    const containerWidth = this.container.clientWidth;
    const cardSize = Math.max(80, Math.min(120, containerWidth / 4 - 20));
    this.container.style.setProperty('--card-size', `${cardSize}px`);
  }

  /* ------------------------------------ */
  /* ---------- Rendering Methods ------- */
  /* ------------------------------------ */

  /**
   * عرض حالة التحميل المؤقت
   * @private
   */
  _renderSkeletonLoading() {
    const skeleton = document.createElement('div');
    skeleton.className = 'skeleton-loading';
    skeleton.innerHTML = `
      <div class="skeleton-grid">
        ${Array(12).fill('<div class="skeleton-card"></div>').join('')}
      </div>
    `;
    this.container.appendChild(skeleton);

    // إزالة الهيكل بعد التحميل
    setTimeout(() => {
      skeleton.remove();
    }, 500);
  }

  /**
   * عرض شريط البحث
   * @private
   * @returns {Promise<void>}
   */
  async _renderSearchBar() {
    return new Promise((resolve) => {
      const searchContainer = document.createElement('div');
      searchContainer.className = 'search-container';

      const searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.placeholder = '🔍 ابحث عن تطبيق...';
      searchInput.className = 'search-bar';
      searchInput.addEventListener('input', (e) => this._handleSearch(e.target.value));

      searchContainer.appendChild(searchInput);
      this.container.appendChild(searchContainer);
      resolve();
    });
  }

  /**
   * عرض شبكة التطبيقات
   * @private
   * @returns {Promise<void>}
   */
  async _renderAppsGrid() {
    return new Promise((resolve) => {
      this.container.querySelector('.apps-grid')?.remove();

      const grid = document.createElement('div');
      grid.className = 'apps-grid';

      if (this.state.filteredApps.length === 0) {
        grid.innerHTML = this._createEmptyState();
      } else {
        this.state.filteredApps.forEach(app => {
          grid.appendChild(this._createAppCard(app));
        });
      }

      this.container.appendChild(grid);
      resolve();
    });
  }

  /**
   * إنشاء بطاقة تطبيق
   * @private
   * @param {Object} app - بيانات التطبيق
   * @returns {HTMLElement} عنصر بطاقة التطبيق
   */
  _createAppCard(app) {
    const card = document.createElement('div');
    card.className = 'app-card';
    card.dataset.appId = app.id;
    card.title = app.name;

    const iconContainer = document.createElement('div');
    iconContainer.className = 'app-icon-container';

    const icon = document.createElement('img');
    icon.className = 'app-icon';
    icon.alt = `${app.name} icon`;
    icon.dataset.src = this._getIconPath(app.icon);
    icon.loading = 'lazy';
    icon.onerror = () => {
      icon.src = this._getIconPath('default.png');
    };

    const name = document.createElement('div');
    name.className = 'app-name';
    name.textContent = app.name;

    iconContainer.appendChild(icon);
    card.append(iconContainer, name);
    card.addEventListener('click', () => this.options.onCardClick(app));

    return card;
  }

  /**
   * عرض حالة الخطأ
   * @private
   * @param {Error} error - كائن الخطأ
   */
  _showErrorState(error) {
    this.container.innerHTML = `
      <div class="tab-error-state">
        <h3>حدث خطأ في تحميل التطبيقات</h3>
        <p>${error.message || 'تعذر تحميل البيانات'}</p>
        <button class="retry-btn">إعادة المحاولة</button>
      </div>
    `;

    this.container.querySelector('.retry-btn').addEventListener('click', () => {
      this._init();
    });
  }

  /**
   * إنشاء حالة عدم وجود تطبيقات
   * @private
   * @returns {string} HTML لعرض الحالة الفارغة
   */
  _createEmptyState() {
    return `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24">
          <path fill="#999" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
        </svg>
        <p>لا توجد تطبيقات متاحة</p>
      </div>
    `;
  }

  /* ------------------------------------ */
  /* --------- Event Handlers ----------- */
  /* ------------------------------------ */

  /**
   * معالجة البحث عن التطبيقات
   * @private
   * @param {string} query - نص البحث
   */
  _handleSearch(query) {
    const searchTerm = query.trim().toLowerCase();
    
    if (!searchTerm) {
      this.state.filteredApps = [...this.options.appsData];
    } else {
      this.state.filteredApps = this.options.appsData.filter(app => 
        app.name.toLowerCase().includes(searchTerm) ||
        (app.tags && app.tags.some(tag => tag.toLowerCase().includes(searchTerm)))
      );
    }

    this._renderAppsGrid().then(() => {
      this._setupIntersectionObserver();
    });
  }

  /* ------------------------------------ */
  /* ---------- Helper Methods ---------- */
  /* ------------------------------------ */

  /**
   * الحصول على المسار الكامل للأيقونة
   * @private
   * @param {string} iconName - اسم ملف الأيقونة
   * @returns {string} المسار الكامل للأيقونة
   */
  _getIconPath(iconName) {
    return `${this.options.iconsBasePath}${iconName || 'default.png'}`;
  }

  /**
   * تحديث بيانات التطبيقات
   * @param {Array} appsData - بيانات التطبيقات الجديدة
   */
  updateAppsData(appsData) {
    if (Array.isArray(appsData)) {
      this.options.appsData = appsData;
      this.state.filteredApps = [...appsData];
      this._renderAppsGrid().then(() => {
        this._setupIntersectionObserver();
      });
    }
  }

  /**
   * تدمير المكون وتنظيف الموارد
   */
  destroy() {
    // تنظيف المراقبة
    if (this.resources.observer) {
      this.resources.observer.disconnect();
    }

    // إيقاف الموقتات
    if (this.resources.cleanupInterval) {
      clearInterval(this.resources.cleanupInterval);
    }

    // إيقاف مراقبة تغيير الحجم
    if (this.resources.resizeObserver) {
      this.resources.resizeObserver.disconnect();
    }

    // إزالة مستمع الأحداث
    document.removeEventListener('visibilitychange', this._handleVisibilityChange);

    // تنظيف IconManager
    this.iconManager.clearCache();

    // إزالة الأنماط
    const style = document.getElementById('apps-tab-styles');
    if (style) style.remove();

    // إزالة المحتوى
    this.container.innerHTML = '';
  }
}
