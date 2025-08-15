/**
 * @file appstab.js
 * @class AppsTab
 * @description تبويب التطبيقات مع نظام تحميل ذكي للأيقونات باستخدام IconManager
 * @version 9.0.0
 * @license MIT
 */

import { IconManager } from '../core/iconmanager.js';

export class AppsTab {
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
      cacheSize: options.maxCachedIcons || 123,
      ttl: options.iconTTL || 24 * 60 * 60 * 1000 // 24hour
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
      cleanupInterval: null
    };

    this._init().catch(error => {
      this.options.onError(error);
    });
  }

  /* ---------------------------------- */
  /* --------- Core Functions --------- */
  /* ---------------------------------- */

  async _init() {
    try {
      this._injectStyles();
      this._renderSearchBar();
      this._renderAppsGrid();
      this._setupIntersectionObserver();
      this._setupMemoryManagement();

      if (this.options.cacheStrategy === 'eager') {
        await this._preloadVisibleIcons();
      }
    } catch (error) {
      this.state.error = error;
      console.error('فشل تهيئة تبويب التطبيقات:', error);
      this._showErrorState(error);
    }
  }

  _injectStyles() {
    const styleId = 'apps-tab-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .apps-tab-container {
        --theme-color: ${this.options.themeColor};
      }

      .apps-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
        gap: 15px;
        padding: 10px;
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
        background: var(--night-card);
      }
      
      .night-theme .app-name {
        background: var(--night-card);
        color: var(--night-text);
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
      }
    `;
    document.head.appendChild(style);
  }

  /* ------------------------------------ */
  /* -------- Icon Loading System ------- */
  /* ------------------------------------ */

  _setupIntersectionObserver() {
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

  async _loadAppIcon(cardElement) {
    const imgElement = cardElement.querySelector('.app-icon');
    const iconUrl = imgElement.dataset.src;

    // تجنب إعادة تحميل الأيقونات المرئية بالفعل
    if (imgElement.src && imgElement.src !== '') return;

    try {
      const objectUrl = await this.iconManager.load(iconUrl);
      imgElement.src = objectUrl;
    } catch (error) {
      console.warn(`فشل تحميل الأيقونة: ${iconUrl}`, error);
      imgElement.src = this._getIconPath('default.png');
    }
  }

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

    await Promise.all(
      visibleIcons.map(iconUrl => this.iconManager.load(iconUrl))
    );
  }

  /* ------------------------------------ */
  /* -------- Memory Management --------- */
  /* ------------------------------------ */

  _setupMemoryManagement() {
    // تنظيف الذاكرة كل 10 دقائق
    this.resources.cleanupInterval = setInterval(() => {
      this.iconManager.clearCache();
    }, 10 * 60 * 1000);

    // تنظيف الذاكرة عند إخفاء الصفحة
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.iconManager.clearCache();
      }
    });
  }

  /* ------------------------------------ */
  /* ---------- Rendering Methods ------- */
  /* ------------------------------------ */

  _renderSearchBar() {
    const searchContainer = document.createElement('div');
    searchContainer.className = 'search-container';

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = '🔍 ابحث عن تطبيق...';
    searchInput.className = 'search-bar';
    searchInput.addEventListener('input', (e) => this._handleSearch(e.target.value));

    searchContainer.appendChild(searchInput);
    this.container.prepend(searchContainer);
  }

  _renderAppsGrid() {
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
  }

  _createAppCard(app) {
    const card = document.createElement('div');
    card.className = 'app-card';
    card.dataset.appId = app.id;

    const iconContainer = document.createElement('div');
    iconContainer.className = 'app-icon-container';

    const icon = document.createElement('img');
    icon.className = 'app-icon';
    icon.alt = `${app.name} icon`;
    icon.dataset.src = this._getIconPath(app.icon);
    icon.loading = 'lazy';

    const name = document.createElement('div');
    name.className = 'app-name';
    name.textContent = app.name;

    iconContainer.appendChild(icon);
    card.append(iconContainer, name);
    card.addEventListener('click', () => this.options.onCardClick(app));

    return card;
  }

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
  /* ---------- Helper Methods ---------- */
  /* ------------------------------------ */

  _getIconPath(iconName) {
    return `${this.options.iconsBasePath}${iconName || 'default.png'}`;
  }

  destroy() {
    // تنظيف المراقبة
    if (this.resources.observer) {
      this.resources.observer.disconnect();
    }

    // إيقاف定时器 التنظيف
    if (this.resources.cleanupInterval) {
      clearInterval(this.resources.cleanupInterval);
    }

    // تنظيف IconManager
    this.iconManager.clearCache();

    // إزالة الأنماط
    const style = document.getElementById('apps-tab-styles');
    if (style) style.remove();

    // إزالة المحتوى
    this.container.innerHTML = '';
  }
}
