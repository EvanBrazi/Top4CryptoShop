/**
 * @file appstab.js
 * @class AppsTab
 * @description إدارة تبويب التطبيقات مع تحميل الأيقونات وتحسين الأداء
 * @version 5.2.0
 * @license MIT
 */

import ApiService from '../services/apiService.js';

/**
 * @typedef {Object} AppData
 * @property {string} name - اسم التطبيق
 * @property {string} icon - اسم ملف الأيقونة
 * @property {number} [price] - سعر التطبيق (اختياري)
 * @property {string} [description] - وصف التطبيق (اختياري)
 * @property {string} [packageName] - اسم الحزمة (اختياري)
 */

/**
 * @typedef {Object} AppsTabOptions
 * @property {AppData[]} [appsData=[]] - مصفوفة بيانات التطبيقات
 * @property {string} [iconsBasePath='/icons/apps/'] - المسار الأساسي للأيقونات
 * @property {string} [logoUrl='./assets/images/logo.png'] - رابط الشعار
 * @property {number} [lazyLoadThreshold=100] - حد التحميل البطيء
 * @property {string} [themeColor='#6a5acd'] - لون السمة الرئيسي
 * @property {string} [dialogBgColor='#ffffff'] - لون خلفية النافذة المنبثقة
 * @property {number} [maxQuantity=10] - الحد الأقصى للكمية
 * @property {function} [cacheIcon=fetch] - دالة مخصصة لتخزين الأيقونات
 */

export class AppsTab {
  /**
   * @constructor
   * @param {Object} config - إعدادات التهيئة
   * @param {string} config.containerId - معرف العنصر الحاوي
   * @param {AppsTabOptions} [options={}] - خيارات إضافية
   * @throws {Error} إذا كان عنصر الحاوية غير موجود
   */
  constructor({ containerId, options = {} }) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      throw new Error(`❌ عنصر الحاوية غير موجود: ${containerId}`);
    }

    /** @type {AppsTabOptions} */
    this.options = {
      appsData: options.appsData || [],
      iconsBasePath: options.iconsBasePath || '/icons/apps/',
      iconsList: options.iconsList || [],
      logoUrl: options.logoUrl || './assets/images/logo.png',
      lazyLoadThreshold: options.lazyLoadThreshold || 100,
      themeColor: options.themeColor || '#6a5acd',
      dialogBgColor: options.dialogBgColor || '#ffffff',
      maxQuantity: options.maxQuantity || 10,
      cacheIcon: options.cacheIcon || fetch
    };

    /** @type {AppData[]} */
    this.filteredApps = [...this.options.appsData];

    /** @type {Object.<string, string>} */
    this._iconCache = {};

    /** @type {IntersectionObserver|null} */
    this._observer = null;

    /** @type {boolean} */
    this._isFetching = false;

    /** @type {boolean} */
    this._iconsLoaded = false;

    /** @type {string} */
    this._cachedFallbackIcon = '';

    /** @type {Map} */
    this._iconExistenceCache = new Map();

    this._init();
  }

  /**
   * @private
   * تهيئة الكلاس وتحميل الأيقونات
   * @returns {Promise<void>}
   */
  async _init() {
    try {
      this._injectStyles();
      await this._loadIcons();
      this._renderSearchBar();
      this._renderAppsGrid();
      this._setupIntersectionObserver();
    } catch (error) {
      console.error('❌ فشل تهيئة AppsTab:', error);
      this._showErrorMessage('حدث خطأ أثناء تحميل التطبيقات. يرجى تحديث الصفحة.');
    }
  }



  /**
 * @private
 * تحميل الأيقونات بشكل مجمّع مع إدارة الذاكرة
 * @returns {Promise<void>}
 */
  async _loadIcons() {
    if (this._iconsLoaded) return;
    this._iconsLoaded = true;

    const batchSize = 3;
    const delayMs = 300;
    const cacheIconFn = this.options.cacheIcon;
    const apps = this.options.appsData;
    this._iconCache = this._iconCache || {};
    this._failedIcons = this._failedIcons || new Set();

    // تحميل الأيقونة الافتراضية مرة واحدة فقط
    if (!this._cachedFallbackIcon) {
      try {
        const fallbackResponse = await cacheIconFn('/icons/apps/default.png');
        if (!fallbackResponse.ok) throw new Error('Fallback icon not found');
        const fallbackBlob = await fallbackResponse.blob();
        this._cachedFallbackIcon = URL.createObjectURL(fallbackBlob);
        this._iconCache['default'] = this._cachedFallbackIcon;
      } catch (error) {
        console.warn('❌ فشل تحميل الأيقونة الافتراضية:', error);
        this._cachedFallbackIcon = '/icons/apps/default.png';
      }
    }

    // تقسيم التطبيقات إلى دفعات وتحميلها بتأخير
    for (let i = 0; i < apps.length; i += batchSize) {
      const batch = apps.slice(i, i + batchSize);
      const hadErrors = await this._loadIconBatch(batch, cacheIconFn);

      // إذا ظهرت أخطاء، زد التأخير لتخفيف الضغط
      if (hadErrors) delayMs += 300;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }


  /**
 * @private
 * تحميل دفعة من الأيقونات
 * @param {AppData[]} batch - دفعة التطبيقات
 * @param {Function} cacheIconFn - دالة التخزين
 * @returns {Promise<void>}
 */
  async _loadIconBatch(batch, cacheIconFn) {
    const iconCache = this.options?.iconCache;
    const fallbackIcon = this._cachedFallbackIcon || '/icons/apps/default.png';

    for (const app of batch) {
      const fileName = app?.icon;
      if (!fileName || typeof fileName !== 'string') {
        app.icon = fallbackIcon;
        continue;
      }

      if (this._failedIcons.has(fileName)) {
        app.icon = fallbackIcon;
        continue;
      }

      if (this._iconCache[fileName]) {
        app.icon = this._iconCache[fileName];
        continue;
      }

      try {
        const iconUrl = this._getIconUrl(fileName);
        console.log('Icon url : ' + iconUrl);

        let blob = null;
        if (iconCache?.get instanceof Function) {
          blob = await iconCache.get(iconUrl);
        }

        if (!blob) {
          const response = await fetch(iconUrl);
          if (!response.ok) throw new Error(`❌ لم يتم العثور على الأيقونة: ${fileName}`);
          blob = await response.blob();

          if (iconCache?.set instanceof Function) {
            await iconCache.set(iconUrl, blob);
          }
        }

        const objectUrl = URL.createObjectURL(blob);
        app.icon = objectUrl;
        this._iconCache[fileName] = objectUrl;
      } catch (error) {
        console.warn(`⚠️ فشل تحميل أيقونة ${app.name || fileName}:`, error);
        this._failedIcons.add(fileName);
        app.icon = this._getIconUrl(fileName);
      }
    }
  }


  /**
 * @private
 * توليد رابط الأيقونة بناءً على اسم الملف
 * @param {string} fileName
 * @returns {string}
 */
  _getIconUrl(fileName) {
    if (this._iconExistenceCache.has(fileName)) {
      return this._iconExistenceCache.get(fileName);
    }

    console.log('File name in _getIconUrl: ' + fileName + ", iconsBasePath : " + this.options.iconsBasePath);

    const exists = this.options.iconsList.includes(fileName);
    const url = exists
      ? `${this.options.iconsBasePath}${fileName}`
      : `${this.options.iconsBasePath}default.png`;

    this._iconExistenceCache.set(fileName, url);
    return url;
  }



  /**
   * @private
   * إعداد IntersectionObserver للتحميل البطيء
   */
  _setupIntersectionObserver() {
    if (this._observer) {
      this._observer.disconnect();
    }

    this._observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          this._observer?.unobserve(img);
        }
      });
    }, {
      rootMargin: '200px',
      threshold: 0.01
    });

    document.querySelectorAll('.app-icon[data-src]').forEach(img => {
      this._observer?.observe(img);
    });
  }

  /**
   * @private
   * حقن الأنماط الخاصة بالتبويب
   */
  _injectStyles() {
    const styleId = 'apps-tab-styles';
    let style = document.getElementById(styleId);

    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }

    style.textContent = `
      :root {
        --theme-color: ${this.options.themeColor};
        --dialog-bg-color: ${this.options.dialogBgColor};
      }
      .apps-tab-container {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      }
      .search-container {
        margin: 20px 0;
        padding: 0 15px;
      }
      .search-bar {
        width: 100%;
        padding: 12px 20px;
        border: 2px solid var(--theme-color);
        border-radius: 25px;
        font-size: 16px;
        outline: none;
        transition: all 0.3s;
      }
      .search-bar:focus {
        box-shadow: 0 0 8px var(--theme-color);
      }
      .apps-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 20px;
        padding: 15px;
      }
      .app-card {
        background: white;
        border-radius: 10px;
        padding: 15px;
        box-shadow: 0 4px 8px rgba(0,0,0,0.1);
        cursor: pointer;
        transition: transform 0.3s ease, box-shadow 0.3s ease;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
      }
      .app-card:hover {
        transform: scale(1.05);
        box-shadow: 0 6px 12px rgba(0,0,0,0.15);
      }
      .app-icon {
        width: 64px;
        height: 64px;
        object-fit: contain;
        margin-bottom: 10px;
        border-radius: 12px;
      }
      .app-name {
        font-weight: bold;
        margin-bottom: 5px;
        color: #333;
      }
      .app-price {
        color: var(--theme-color);
        font-size: 14px;
      }
      .app-dialog {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 90%;
        max-width: 500px;
        background: var(--dialog-bg-color);
        border-radius: 15px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.2);
        z-index: 1000;
        padding: 20px;
      }
      .dialog-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        border-bottom: 1px solid #eee;
        padding-bottom: 10px;
      }
      .dialog-header h2 {
        margin: 0;
        color: var(--theme-color);
      }
      .close-btn {
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: #777;
      }
      .dialog-body {
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .dialog-icon {
        width: 100px;
        height: 100px;
        object-fit: contain;
        margin-bottom: 20px;
        border-radius: 20px;
      }
      .buy-btn {
        background: var(--theme-color);
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 5px;
        margin-top: 20px;
        cursor: pointer;
        font-size: 16px;
        transition: opacity 0.3s;
      }
      .buy-btn:hover {
        opacity: 0.9;
      }
      .toast-message {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #333;
        color: white;
        padding: 12px 24px;
        border-radius: 4px;
        z-index: 1001;
        animation: fadeInOut 3s ease-in-out;
      }
      @keyframes fadeInOut {
        0% { opacity: 0; }
        10% { opacity: 1; }
        90% { opacity: 1; }
        100% { opacity: 0; }
      }
      .error-message {
        padding: 20px;
        background: #ffebee;
        color: #c62828;
        border-radius: 5px;
        text-align: center;
        margin: 20px;
      }
    `;
  }

  /**
   * @private
   * إنشاء شريط البحث وإضافته للحاوية
   */
  _renderSearchBar() {
    const searchContainer = document.createElement('div');
    searchContainer.className = 'search-container';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '🔍 ابحث عن تطبيق...';
    input.className = 'search-bar';
    input.setAttribute('aria-label', 'بحث عن التطبيقات');
    input.addEventListener('input', (e) => this._filterApps(e.target.value));

    searchContainer.appendChild(input);
    this.container.appendChild(searchContainer);
  }

  /**
   * @private
   * تصفية التطبيقات حسب الاسم أو الوصف
   * @param {string} term - مصطلح البحث
   */
  _filterApps(term) {
    const keyword = term.toLowerCase().trim();
    this.filteredApps = !keyword
      ? [...this.options.appsData]
      : this.options.appsData.filter(app =>
        app.name.toLowerCase().includes(keyword) ||
        (app.description && app.description.toLowerCase().includes(keyword)) ||
        (app.packageName && app.packageName.toLowerCase().includes(keyword))
      );

    this._renderAppsGrid();
  }

  /**
   * @private
   * عرض شبكة التطبيقات بعد التصفية
   */
  _renderAppsGrid() {
    // إزالة الشبكة القديمة إذا كانت موجودة
    const oldGrid = this.container.querySelector('.apps-grid');
    if (oldGrid) oldGrid.remove();

    const grid = document.createElement('div');
    grid.className = 'apps-grid';

    if (this.filteredApps.length === 0) {
      grid.innerHTML = '<div class="no-results">لا توجد تطبيقات مطابقة للبحث</div>';
    } else {
      this.filteredApps.forEach(app => {
        const card = this._createAppCard(app);
        grid.appendChild(card);
      });
    }

    this.container.appendChild(grid);
    this._setupIntersectionObserver();
  }

  /**
   * @private
   * إنشاء بطاقة تطبيق واحدة لعرضها في الشبكة
   * @param {AppData} app - بيانات التطبيق
   * @returns {HTMLElement} - عنصر البطاقة الجاهز للإدراج
   */
  _createAppCard(app) {
    const card = document.createElement('div');
    card.className = 'app-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `فتح تفاصيل تطبيق ${app.name}`);

    // أيقونة التطبيق مع التحميل البطيء
    const icon = document.createElement('img');
    icon.className = 'app-icon';
    icon.alt = `${app.name} icon`;
    icon.loading = 'lazy';
    icon.dataset.src = app.icon || '/icons/apps/default.png';
    icon.src = ''; // سيتم تحميله عبر IntersectionObserver

    // fallback في حال فشل تحميل الأيقونة
    icon.onerror = () => {
      icon.src = this._cachedFallbackIcon || '/icons/apps/default.png';
    };

    // اسم التطبيق
    const name = document.createElement('div');
    name.className = 'app-name';
    name.textContent = app.name || 'بدون اسم';

    // السعر
    const price = document.createElement('div');
    price.className = 'app-price';
    price.textContent = app.price !== null
      ? app.price.toFixed(2) + ' 💵'
      : 'غير متوفر';

    // التفاعل عند النقر
    card.addEventListener('click', () => this._openAppDialog(app));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        this._openAppDialog(app);
      }
    });

    // تجميع العناصر
    card.append(icon, name, price);
    return card;
  }

  /**
   * @private
   * عرض نافذة تفاصيل التطبيق عند النقر
   * @param {AppData} app - بيانات التطبيق
   */
  async _openAppDialog(app) {
    // إغلاق أي نافذة مفتوحة حالياً
    const existingDialog = document.querySelector('.app-dialog');
    if (existingDialog) existingDialog.remove();

    const dialog = document.createElement('div');
    dialog.className = 'app-dialog';
    dialog.style.backgroundColor = this.options.dialogBgColor || '#fff';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'dialog-title');

    // إضافة طبقة شفافة خلف النافذة
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
    overlay.style.zIndex = '999';
    overlay.addEventListener('click', () => {
      dialog.remove();
      overlay.remove();
    });

    // تحميل الأيقونة fallback إذا كانت مفقودة
    let iconSrc = app.icon;
    if (!iconSrc || iconSrc === '/icons/apps/default.png') {
      iconSrc = this._cachedFallbackIcon || '/icons/apps/default.png';
    }

    dialog.innerHTML = `
      <div class="dialog-header">
        <h2 id="dialog-title">${app.name || 'تطبيق غير معروف'}</h2>
        <button class="close-btn" aria-label="إغلاق">✖</button>
      </div>
      <div class="dialog-body">
        <img src="${iconSrc}" alt="${app.name}" class="dialog-icon" />
        <p><strong>السعر:</strong> ${app.price ? `$${app.price.toFixed(2)}` : 'مجاني'}</p>
        ${app.description ? `<p><strong>الوصف:</strong> ${app.description}</p>` : ''}
        ${app.packageName ? `<p><strong>اسم الحزمة:</strong> ${app.packageName}</p>` : ''}
        <button class="buy-btn">شراء الآن</button>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(dialog);

    // التركيز على النافذة المنبثقة للأكسيسيبيلتي
    dialog.focus();

    // إغلاق النافذة
    const closeBtn = dialog.querySelector('.close-btn');
    closeBtn.onclick = () => {
      dialog.remove();
      overlay.remove();
    };

    // إغلاق بالضغط على ESC
    dialog.onkeydown = (e) => {
      if (e.key === 'Escape') {
        dialog.remove();
        overlay.remove();
      }
    };

    // تنفيذ عملية الشراء
    dialog.querySelector('.buy-btn').onclick = () => {
      this._handlePurchase(app);
      dialog.remove();
      overlay.remove();
    };
  }

  /**
   * @private
   * عرض إشعار مؤقت للمستخدم
   * @param {string} message - نص الإشعار
   */
  _showToast(message) {
    // إزالة أي إشعارات سابقة
    const existingToasts = document.querySelectorAll('.toast-message');
    existingToasts.forEach(toast => toast.remove());

    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.textContent = message;
    toast.setAttribute('aria-live', 'polite');

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  /**
   * @private
   * التعامل مع عملية الشراء
   * @param {AppData} app - بيانات التطبيق
   */
  _handlePurchase(app) {
    if (!app || typeof app !== 'object') {
      console.warn('⚠️ بيانات التطبيق غير صالحة للشراء.');
      this._showToast('تعذر تنفيذ العملية: بيانات التطبيق غير صالحة.');
      return;
    }

    if (window.AppManager && typeof window.AppManager.purchaseApp === 'function') {
      try {
        window.AppManager.purchaseApp(app);
        this._showToast(`✅ تم تنفيذ عملية شراء ${app.name}`);

        // تسجيل الحدث للتحليلات
        if (typeof gtag === 'function') {
          gtag('event', 'purchase', {
            'app_name': app.name,
            'app_price': app.price || 0
          });
        }
      } catch (error) {
        console.error(`❌ فشل تنفيذ الشراء لـ ${app.name}:`, error);
        this._showToast('حدث خطأ أثناء تنفيذ عملية الشراء.');
      }
    } else {
      console.warn('⚠️ AppManager غير متوفر أو غير متوافق.');
      this._showToast('نظام الشراء غير متاح حالياً.');
    }
  }

  /**
   * @public
   * تحميل التطبيقات من API خارجي
   * @param {string} endpoint - رابط الخدمة
   * @returns {Promise<void>}
   */
  async fetchAppsFromApi(endpoint) {
    if (this._isFetching) {
      console.warn('⚠️ عملية تحميل التطبيقات جارية بالفعل.');
      return;
    }

    this._isFetching = true;
    this._showToast('جاري تحميل التطبيقات...');

    try {
      const response = await ApiService.get(endpoint);

      if (!Array.isArray(response)) {
        throw new Error('البيانات المستلمة غير صالحة.');
      }

      // التحقق من صحة البيانات الأساسية
      const validApps = response.filter(app =>
        app && typeof app === 'object' && app.name && app.icon
      );

      if (validApps.length !== response.length) {
        console.warn('⚠️ بعض بيانات التطبيقات غير صالحة وتم تصفيتها.');
      }

      // تحديث البيانات
      this.options.appsData = validApps;
      this.filteredApps = [...validApps];

      // إعادة تحميل الأيقونات
      this._iconsLoaded = false;
      await this._loadIcons();

      // إعادة عرض الشبكة
      this._renderAppsGrid();

      this._showToast(`تم تحميل ${validApps.length} تطبيق بنجاح`);
    } catch (error) {
      console.error('❌ فشل تحميل التطبيقات من API:', error);
      this._showErrorMessage('حدث خطأ أثناء تحميل التطبيقات. يرجى المحاولة لاحقًا.');

      // إعادة تعيين حالة التحميل الفاشل
      this._iconsLoaded = false;
    } finally {
      this._isFetching = false;
    }
  }

  /**
   * @private
   * عرض رسالة خطأ داخل التاب
   * @param {string} message - نص الرسالة
   */
  _showErrorMessage(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" style="vertical-align: middle; margin-left: 5px;">
        <path fill="#c62828" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
      </svg>
      <span>${message}</span>
      <button id="retry-btn" style="margin-left: 10px; background: #c62828; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer;">
        إعادة المحاولة
      </button>
    `;

    // إزالة المحتوى الحالي
    this.container.innerHTML = '';
    this.container.appendChild(errorDiv);

    // إضافة حدث إعادة المحاولة
    document.getElementById('retry-btn')?.addEventListener('click', () => {
      this._init();
    });
  }

  /**
   * @public
   * إعادة تحميل التطبيقات يدويًا
   * @param {AppData[]} [newData=[]] - بيانات جديدة للتطبيقات
   * @returns {Promise<void>}
   */
  async reloadApps(newData = []) {
    if (!Array.isArray(newData)) {
      console.warn('⚠️ بيانات التطبيقات الجديدة يجب أن تكون مصفوفة');
      return;
    }

    this.options.appsData = newData;
    this.filteredApps = [...newData];

    try {
      await this._loadIcons();
      this._renderAppsGrid();
    } catch (error) {
      console.error('❌ فشل إعادة تحميل التطبيقات:', error);
      this._showErrorMessage('حدث خطأ أثناء إعادة تحميل التطبيقات.');
    }
  }

  /**
   * @public
   * تفعيل الوضع التجريبي أو تخصيص الإعدادات
   * @param {AppsTabOptions} newOptions - إعدادات جديدة
   */
  updateOptions(newOptions = {}) {
    this.options = { ...this.options, ...newOptions };
    this._injectStyles();
    this._renderAppsGrid();
  }

  /**
   * @public
   * تنظيف الموارد عند التدمير
   */
  destroy() {
    // تحرير عناوين URL للأيقونات المخزنة
    Object.values(this._iconCache).forEach(URL.revokeObjectURL);

    if (this._cachedFallbackIcon) {
      URL.revokeObjectURL(this._cachedFallbackIcon);
    }

    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }

    // إزالة الأنماط المحقونة
    const style = document.getElementById('apps-tab-styles');
    if (style) style.remove();

    // إزالة المحتوى من الحاوية
    this.container.innerHTML = '';

    console.log('✅ تم تنظيف موارد AppsTab بنجاح');
  }
}