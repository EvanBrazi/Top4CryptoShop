/**
 * @file appstab.js
 * @class AppsTab
 * @description تبويب التطبيقات مع نظام تحميل ذكي للأيقونات وإدارة الذاكرة
 * @version 8.0.0
 * @license MIT
 */

export class AppsTab {
  constructor({ containerId, options = {} }) {
    this.container = document.getElementById(containerId);
    if (!this.container) throw new Error(`❌ عنصر الحاوية غير موجود: ${containerId}`);

    // إعدادات التهيئة
    this.options = {
      appsData: Array.isArray(options.appsData) ? options.appsData : [],
      iconsBasePath: options.iconsBasePath?.endsWith('/') ? options.iconsBasePath : `${options.iconsBasePath}/`,
      themeColor: options.themeColor || '#6a5acd',
      maxConcurrentLoads: options.maxConcurrentLoads || 3,
      cacheStrategy: options.cacheStrategy || 'lazy',
      maxCachedIcons: options.maxCachedIcons || 30,
      iconTTL: options.iconTTL || 24 * 60 * 60 * 1000, // 24 ساعة
      onCardClick: options.onCardClick || (() => {}),
      onError: options.onError || (() => {})
    };

    // حالة التبويب
    this.state = {
      loading: false,
      error: null,
      filteredApps: [...this.options.appsData],
      visibleApps: new Set()
    };

    // موارد النظام
    this.resources = {
      iconCache: new Map(), // تخزين مؤقت للأيقونات
      requestQueue: [], // طابور الطلبات
      activeRequests: 0, // الطلبات النشطة
      observer: null, // مراقب العناصر
      lastCleanup: Date.now() // آخر عملية تنظيف
    };

    this._init().catch(error => {
      this.onError(error);
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
      this._showErrorState();
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
        --dialog-bg-color: ${this.options.dialogBgColor || '#ffffff'};
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
          this._unloadAppIconIfNeeded(entry.target);
        }
      });
    }, { threshold: 0.01, rootMargin: '200px' });

    document.querySelectorAll('.app-card').forEach(card => {
      this.resources.observer.observe(card);
    });
  }

  async _loadAppIcon(cardElement) {
    const imgElement = cardElement.querySelector('.app-icon');
    const iconUrl = imgElement.dataset.src;

    // إذا كانت الأيقونة محملة بالفعل
    if (imgElement.src && imgElement.src !== '') return;

    // إذا كانت الأيقونة في الكاش
    if (this.resources.iconCache.has(iconUrl)) {
      imgElement.src = this.resources.iconCache.get(iconUrl);
      return;
    }

    // إضافة الطلب إلى الطابور
    this.resources.requestQueue.push({ imgElement, iconUrl, cardElement });
    this._processIconQueue();
  }

  _unloadAppIconIfNeeded(cardElement) {
    if (this._shouldFreeMemory()) {
      const imgElement = cardElement.querySelector('.app-icon');
      if (imgElement.src && imgElement.src !== '') {
        imgElement.src = '';
      }
    }
  }

  async _processIconQueue() {
    // التحقق من الحد الأقصى للطلبات المتزامنة
    while (this.resources.requestQueue.length > 0 &&
           this.resources.activeRequests < this.options.maxConcurrentLoads) {
      
      const { imgElement, iconUrl, cardElement } = this.resources.requestQueue.shift();
      this.resources.activeRequests++;

      try {
        // تحميل الأيقونة
        const response = await fetch(iconUrl, { cache: 'force-cache' });

        if (response.ok) {
          const blob = await response.blob();
          
          // تحرير الذاكرة إذا لزم الأمر
          if (this._shouldFreeMemory()) {
            this._cleanupIconCache();
          }

          // تخزين الأيقونة في الكاش
          const objectUrl = URL.createObjectURL(blob);
          this.resources.iconCache.set(iconUrl, objectUrl);
          
          // تحديث العنصر فقط إذا كان مرئيًا
          if (this.state.visibleApps.has(cardElement.dataset.appId)) {
            imgElement.src = objectUrl;
            imgElement.onload = () => imgElement.classList.add('loaded');
          }
        }
      } catch (error) {
        console.warn(`فشل تحميل الأيقونة: ${iconUrl}`, error);
        imgElement.src = this._getIconPath('default.png');
      } finally {
        this.resources.activeRequests--;
        this._processIconQueue();
      }
    }
  }

  /* ------------------------------------ */
  /* -------- Memory Management --------- */
  /* ------------------------------------ */

  _setupMemoryManagement() {
    // تنظيف الذاكرة كل 5 دقائق
    this.memoryCleanupInterval = setInterval(() => {
      this._cleanupIconCache();
    }, 5 * 60 * 1000);

    // إدارة الذاكرة عند تغيير التبويب
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this._cleanupIconCache(true); // تنظيف قوي عند ترك الصفحة
      }
    });

    // إدارة الذاكرة عند تغيير الحجم
    window.addEventListener('resize', () => {
      this._cleanupIconCache();
    });
  }

  _shouldFreeMemory() {
    // تحرير الذاكرة إذا تجاوزنا الحد الأقصى للأيقونات المخزنة
    return this.resources.iconCache.size > this.options.maxCachedIcons;
  }

  _cleanupIconCache(force = false) {
    const now = Date.now();
    
    // لا نقوم بالتنظيف أكثر من مرة كل دقيقة إلا إذا كان تنظيفًا قويًا
    if (!force && now - this.resources.lastCleanup < 60 * 1000) return;

    this.resources.lastCleanup = now;

    // نحدد الأيقونات التي يمكن تحريرها (غير مرئية أو منتهية الصلاحية)
    const iconsToRemove = [];
    
    this.resources.iconCache.forEach((url, key) => {
      const isVisible = Array.from(document.querySelectorAll('.app-icon'))
        .some(img => img.src === url);
      
      if (!isVisible) {
        iconsToRemove.push(key);
      }
    });

    // تحرير الذاكرة
    iconsToRemove.slice(0, 10).forEach(key => { // نحرر 10 أيقونات كحد أقصى في كل مرة
      URL.revokeObjectURL(this.resources.iconCache.get(key));
      this.resources.iconCache.delete(key);
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
    card.addEventListener('click', () => this.onCardClick(app));

    return card;
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

  _formatPrice(price) {
    return Number(price || 0).toFixed(2);
  }

  destroy() {
    clearInterval(this.memoryCleanupInterval);
    
    if (this.resources.observer) {
      this.resources.observer.disconnect();
    }

    this.resources.iconCache.forEach(url => URL.revokeObjectURL(url));
    this.resources.iconCache.clear();

    const style = document.getElementById('apps-tab-styles');
    if (style) style.remove();

    this.container.innerHTML = '';
  }
}
