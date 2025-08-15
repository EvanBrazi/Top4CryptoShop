/**
 * @file appstab.js
 * @class AppsTab
 * @description تبويب التطبيقات مع نظام تحميل ذكي للأيقونات ونافذة شراء متقدمة
 * @version 7.1.0
 * @license MIT
 */

export class AppsTab {
  /**
   * @constructor
   * @param {Object} config - إعدادات التهيئة
   * @param {string} config.containerId - معرف العنصر الحاوي
   * @param {Object} [options={}] - خيارات إضافية
   * @param {Array} [options.appsData=[]] - بيانات التطبيقات
   * @param {string} [options.iconsBasePath='/icons/apps/'] - مسار الأيقونات
   * @param {string} [options.themeColor='#6a5acd'] - لون السمة الرئيسي
   * @param {number} [options.maxConcurrentLoads=3] - الحد الأقصى لطلبات التحميل المتزامنة
   */
  constructor({ containerId, options = {} }) {
    if (!containerId) throw new Error('معرف الحاوية مطلوب');

    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.error(`العنصر غير موجود: ${containerId}`);
      throw new Error(`❌ عنصر الحاوية غير موجود: ${containerId}`);
    }

    this.options = {
      appsData: Array.isArray(options.appsData) ? options.appsData : [],
      iconsBasePath: options.iconsBasePath?.endsWith('/')
        ? options.iconsBasePath
        : `${options.iconsBasePath}/`,
      themeColor: options.themeColor || '#6a5acd',
      dialogBgColor: options.dialogBgColor || '#ffffff',
      maxConcurrentLoads: options.maxConcurrentLoads || 3,
      cacheStrategy: options.cacheStrategy || 'lazy' // 'lazy' أو 'eager'
    };

    this.state = {
      loading: false,
      error: null,
      filteredApps: [...this.options.appsData]
    };

    this.resources = {
      iconCache: new Map(),
      requestQueue: [],
      activeRequests: 0,
      observer: null
    };

    this._init();
  }

  /* ---------------------------------- */
  /* --------- Core Functions --------- */
  /* ---------------------------------- */

  /**
   * @private
   * @method _init
   * @description تهيئة المكون الرئيسي
   */
  async _init() {
    try {
      this._injectStyles();
      this._renderSearchBar();
      this._renderAppsGrid();
      this._setupIntersectionObserver();

      if (this.options.cacheStrategy === 'eager') {
        await this._preloadIcons();
      }
    } catch (error) {
      this.state.error = error;
      console.error('فشل تهيئة تبويب التطبيقات:', error);
      this._showErrorState();
    }
  }

  /**
 * تضيف أنماط CSS مخصصة لتبويب التطبيقات.
 * الهدف: تحسين العرض البصري وضمان توافق الستايل مع الثيم العام.
 */
  _injectStyles() {
    const styleId = 'apps-tab-styles';

    // منع التكرار إذا كانت الأنماط قد أُضيفت مسبقًا
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
    .apps-tab-container {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      padding: 12px;
    }

    .app-card {
      background-color: var(--card-bg, #fff);
      border-radius: 8px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.1);
      transition: transform 0.2s ease;
    }

    .app-card:hover {
      transform: scale(1.03);
    }

    .app-card .title {
      font-size: 1rem;
      font-weight: bold;
      margin: 8px;
    }

    .app-card .buy-button {
      background-color: var(--primary-color, #007bff);
      color: white;
      border: none;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
    }

    .app-card .buy-button:hover {
      background-color: var(--primary-hover, #0056b3);
    }
  `;
    document.head.appendChild(style);
  }

  /**
 * تعرض واجهة خطأ تفاعلية عند فشل تحميل تبويب التطبيقات.
 * @param {Error} error - كائن الخطأ الذي تم التقاطه.
 */
  _showErrorState(error) {
    console.error('AppsTab Error:', error);

    const container = document.querySelector('.apps-tab-container');
    if (!container) return;

    container.innerHTML = `
    <div class="error-ui">
      <h2>⚠️ حدث خطأ أثناء تحميل التطبيقات</h2>
      <p>تعذر تحميل المحتوى. قد يكون السبب مشكلة في الاتصال أو خلل مؤقت.</p>
      <button id="retry-btn">🔄 إعادة المحاولة</button>
    </div>
  `;

    // إعادة المحاولة عند الضغط على الزر
    const retryBtn = document.getElementById('retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        container.innerHTML = '<p>🔄 جاري إعادة التحميل...</p>';
        this._init(); // إعادة تهيئة التبويب
      });
    }
  }


  /**
   * @public
   * @method updateApps
   * @description تحديث بيانات التطبيقات
   * @param {Array} newAppsData - بيانات جديدة
   * @param {boolean} [resetFilters=true] - إعادة تعيين الفلاتر
   */
  updateApps(newAppsData, resetFilters = true) {
    if (!Array.isArray(newAppsData)) {
      console.error('يجب أن تكون البيانات مصفوفة');
      return;
    }

    this.options.appsData = newAppsData;
    this.state.filteredApps = resetFilters
      ? [...newAppsData]
      : this._applyCurrentFilter(newAppsData);

    this._renderAppsGrid();
  }

  /**
   * @public
   * @method destroy
   * @description تنظيف الموارد
   */
  destroy() {
    // تنظيف المراقبة
    if (this.resources.observer) {
      this.resources.observer.disconnect();
    }

    // تحرير ذاكرة التخزين المؤقت
    this.resources.iconCache.forEach(url => URL.revokeObjectURL(url));
    this.resources.iconCache.clear();

    // إزالة الأنماط
    const style = document.getElementById('apps-tab-styles');
    if (style) style.remove();

    // إزالة الأحداث
    this.container.innerHTML = '';
  }

  /* ------------------------------------ */
  /* --------- Rendering Methods -------- */
  /* ------------------------------------ */

  /**
   * @private
   * @method _renderSearchBar
   * @description عرض شريط البحث
   */
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

  /**
   * @private
   * @method _renderAppsGrid
   * @description عرض شبكة التطبيقات
   */
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

  /**
   * @private
   * @method _createAppCard
   * @description إنشاء بطاقة تطبيق
   * @param {Object} app - بيانات التطبيق
   * @returns {HTMLElement}
   */
  _createAppCard(app) {
    const card = document.createElement('div');
    card.className = 'app-card';
    card.dataset.appId = app.id;

    const icon = document.createElement('img');
    icon.className = 'app-icon';
    icon.alt = `${app.name} icon`;
    icon.dataset.src = this._getIconPath(app.icon);
    icon.loading = 'lazy';

    const name = document.createElement('div');
    name.className = 'app-name';
    name.textContent = app.name;

    const price = document.createElement('div');
    price.className = 'app-price';
    price.textContent = `$${this._formatPrice(app.price)}`;

    card.append(icon, name, price);
    card.addEventListener('click', () => this._openPurchaseDialog(app));

    return card;
  }

  /**
   * @private
   * @method _createEmptyState
   * @description عرض حالة عدم وجود نتائج
   * @returns {string}
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
  /* ----------- Icon Loading ----------- */
  /* ------------------------------------ */

  /**
   * @private
   * @method _setupIntersectionObserver
   * @description تهيئة مراقبة ظهور العناصر
   */
  _setupIntersectionObserver() {
    this.resources.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          this._loadIcon(img);
          this.resources.observer.unobserve(img);
        }
      });
    }, { threshold: 0.01, rootMargin: '200px' });

    document.querySelectorAll('.app-icon[data-src]').forEach(img => {
      this.resources.observer.observe(img);
    });
  }

  /**
   * @private
   * @method _loadIcon
   * @description تحميل أيقونة التطبيق
   * @param {HTMLImageElement} imgElement - عنصر الصورة
   */
  async _loadIcon(imgElement) {
    const iconUrl = imgElement.dataset.src;

    if (this.resources.iconCache.has(iconUrl)) {
      imgElement.src = this.resources.iconCache.get(iconUrl);
      return;
    }

    this.resources.requestQueue.push({ imgElement, iconUrl });
    this._processIconQueue();
  }

  /**
   * @private
   * @method _processIconQueue
   * @description معالجة طابور تحميل الأيقونات
   */
  async _processIconQueue() {
    while (this.resources.requestQueue.length > 0 &&
      this.resources.activeRequests < this.options.maxConcurrentLoads) {

      const { imgElement, iconUrl } = this.resources.requestQueue.shift();
      this.resources.activeRequests++;

      try {
        const response = await fetch(iconUrl, { cache: 'force-cache' });

        if (response.ok) {
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);

          this.resources.iconCache.set(iconUrl, objectUrl);
          imgElement.src = objectUrl;
          imgElement.onload = () => imgElement.classList.add('loaded');
        } else {
          throw new Error('فشل تحميل الأيقونة');
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

  /**
   * @private
   * @method _preloadIcons
   * @description تحميل مسبق للأيقونات
   */
  async _preloadIcons() {
    const iconUrls = [...new Set(
      this.options.appsData.map(app => this._getIconPath(app.icon))
    )];

    await Promise.all(
      iconUrls.map(url => {
        return new Promise((resolve) => {
          const img = new Image();
          img.src = url;
          img.onload = resolve;
          img.onerror = resolve;
        });
      })
    );
  }

  /* ------------------------------------ */
  /* -------- Purchase Dialog ----------- */
  /* ------------------------------------ */

  /**
   * @private
   * @method _openPurchaseDialog
   * @description فتح نافذة الشراء
   * @param {Object} app - بيانات التطبيق
   */
  _openPurchaseDialog(app) {
    this._closePurchaseDialog();

    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.addEventListener('click', () => this._closePurchaseDialog());

    const dialog = document.createElement('div');
    dialog.className = 'purchase-dialog';
    dialog.innerHTML = this._createPurchaseDialogHTML(app);

    document.body.append(overlay, dialog);
    this._setupDialogEvents(dialog, app);
  }

  /**
   * @private
   * @method _createPurchaseDialogHTML
   * @description إنشاء محتوى نافذة الشراء
   * @param {Object} app - بيانات التطبيق
   * @returns {string}
   */
  _createPurchaseDialogHTML(app) {
    return `
      <div class="dialog-header">
        <h3>${app.name}</h3>
        <button class="dialog-close-btn" aria-label="إغلاق">✕</button>
      </div>
      <img src="${this._getIconPath(app.icon)}" 
           alt="${app.name}" 
           class="dialog-icon"
           onerror="this.src='${this._getIconPath('default.png')}'">
      <div class="price-display">السعر: $${this._formatPrice(app.price)}</div>
      
      <div class="input-group">
        <label for="quantity">الكمية:</label>
        <input type="number" id="quantity" min="1" value="1" class="quantity-input">
      </div>
      
      <div class="input-group">
        <label for="user-id">معرف المستخدم:</label>
        <input type="text" id="user-id" placeholder="أدخل معرفك" class="user-id-input">
      </div>
      
      <div class="total-price">المجموع: $${this._formatPrice(app.price)}</div>
      
      <div class="dialog-actions">
        <button class="dialog-btn cancel-btn">إلغاء</button>
        <button class="dialog-btn buy-btn">شراء</button>
      </div>
    `;
  }

  /**
   * @private
   * @method _setupDialogEvents
   * @description إعداد أحداث نافذة الشراء
   * @param {HTMLElement} dialog - عنصر النافذة
   * @param {Object} app - بيانات التطبيق
   */
  _setupDialogEvents(dialog, app) {
    // أحداث الإغلاق
    dialog.querySelector('.dialog-close-btn').addEventListener('click', () => this._closePurchaseDialog());
    dialog.querySelector('.cancel-btn').addEventListener('click', () => this._closePurchaseDialog());

    // حدث الشراء
    dialog.querySelector('.buy-btn').addEventListener('click', () => {
      const quantity = parseInt(dialog.querySelector('.quantity-input').value) || 1;
      const userId = dialog.querySelector('.user-id-input').value.trim();

      if (!userId) {
        this._showToast('الرجاء إدخال معرف المستخدم', 'error');
        return;
      }

      this._processPurchase(app, quantity, userId);
    });

    // تحديث السعر
    dialog.querySelector('.quantity-input').addEventListener('input', (e) => {
      const quantity = parseInt(e.target.value) || 1;
      const total = (app.price * quantity).toFixed(2);
      dialog.querySelector('.total-price').textContent = `المجموع: $${total}`;
    });
  }

  /* ------------------------------------ */
  /* ---------- Helper Methods --------- */
  /* ------------------------------------ */

  /**
   * @private
   * @method _getIconPath
   * @description الحصول على مسار الأيقونة
   * @param {string} iconName - اسم ملف الأيقونة
   * @returns {string}
   */
  _getIconPath(iconName) {
    return `${this.options.iconsBasePath}${iconName || 'default.png'}`;
  }

  /**
   * @private
   * @method _formatPrice
   * @description تنسيق السعر
   * @param {number} price - السعر
   * @returns {string}
   */
  _formatPrice(price) {
    return Number(price || 0).toFixed(2);
  }

  /**
   * @private
   * @method _showToast
   * @description عرض رسالة toast
   * @param {string} message - الرسالة
   * @param {string} type - نوع الرسالة (success, error, info)
   */
  _showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 3000);
  }
}
