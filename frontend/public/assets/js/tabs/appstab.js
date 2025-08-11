/**
 * @file appstab.js
 * @class AppsTab
 * @description كلاس متكامل لإدارة تبويب تطبيقات الدردشة مع دعم متقدم للأيقونات والتأثيرات ثلاثية الأبعاد
 * @version 5.0.0
 * @author Top Al-9mh
 * @feature_loading مؤشر تحميل أثناء جلب البيانات
 * @feature_3d تأثيرات ثلاثية الأبعاد للبطاقات
 * @feature_logo إدارة شعار التطبيق في الزاوية
 * @feature_security تحسينات الأمان وإدارة الأخطاء
 * @feature_performance تحسينات الأداء
 * @feature_accessibility تحسينات الوصول والإتاحة
 */

class AppsTab {
  /**
   * @constructor
   * @param {Object} config - كائن التهيئة
   * @param {Object} [config.taber] - Instance من Taber (اختياري)
   * @param {string} config.containerId - ID العنصر الحاوي
   * @param {Object} [config.options={}] - خيارات إضافية
   * @param {string} [config.options.themeColor='#6a5acd'] - لون الثيم الرئيسي
   * @param {string} [config.options.dialogBgColor='#ffffff'] - لون خلفية مربع الحوار
   * @param {Array} [config.options.appsData] - بيانات التطبيقات (اختياري)
   * @param {string} [config.options.logoUrl] - رابط شعار التطبيق (اختياري)
   * @param {string} [config.options.iconsBasePath='/icons/apps/'] - المسار الأساسي للأيقونات
   * @throws {Error} إذا كان عنصر الحاوية غير موجود
   */
  constructor({ taber, containerId, options = {} }) {
    // [غير معدل] البنية الأساسية للكونستركتور
    this.taber = taber || {};
    this.container = document.getElementById(containerId);

    if (!this.container) {
      const errorMsg = `عنصر الحاوية غير موجود بالـ ID المحدد: ${containerId}`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    // إعدادات النظام الأساسية
    this.appsPerPage = 1000;
    this.currentPage = 1;
    this.options = {
      themeColor: options.themeColor || '#6a5acd',
      dialogBgColor: options.dialogBgColor || '#ffffff',
      appsData: options.appsData || this._defaultAppsData(),
      logoUrl: options.logoUrl || './assets/images/logo.png',
      iconsBasePath: options.iconsBasePath || '/icons/apps/',
      maxQuantity: options.maxQuantity || 10,
      enableServiceWorker: options.enableServiceWorker !== false,
      enableWebWorker: options.enableWebWorker !== false,
      lazyLoadThreshold: options.lazyLoadThreshold || 100
    };

    // أنظمة التحسين
    this._initPerformanceMonitor();
    this._initCacheSystem();
    this._initWorkerSystem();
    this._initLazyLoading();

    this.filteredApps = [...this.options.appsData];
    this._init();
  }

  /* ------------------------------------------ */
  /* -------------- الأنظمة الأساسية ----------- */
  /* ------------------------------------------ */

  /**
   * @method _init
   * @description تهيئة المكون الرئيسي
   * @private
   */
  async _init() {
    this._showLoading();
    this._loadCSS();
    await this._registerServiceWorker();
    await this._initWorkerSystem();
    this._initLazyLoading();
    await this._loadIcons();
    this.render();
    this._hideLoading();
  }

  /* ----------------------------------------- */
  /* ----------- نظام Service Worker --------- */
  /* ----------------------------------------- */

  /**
   * @method _registerServiceWorker
   * @description تسجيل Service Worker للتخزين المؤقت
   * @private
   */
  async _registerServiceWorker() {
    if (!this.options.enableServiceWorker) return;

    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.register('/sw-apps.js');
        console.log('ServiceWorker registration successful:', registration.scope);
      }
    } catch (error) {
      console.error('ServiceWorker registration failed:', error);
    }
  }

  /* ----------------------------------------- */
  /* ----------- نظام Web Worker ------------- */
  /* ----------------------------------------- */

  /**
   * @method _initWorkerSystem
   * @description تهيئة نظام Web Workers
   * @private
   */
  _initWorkerSystem() {
    if (!this.options.enableWebWorker) return;

    this._worker = new Worker('/js/apps-worker.js');
    this._worker.onmessage = (e) => {
      const { type, data } = e.data;
      if (type === 'icon-loaded') {
        this._handleIconLoaded(data);
      }
    };
  }

  /**
   * @method _processInWorker
   * @description معالجة المهمة في Web Worker
   * @param {Object} task 
   * @private
   */
  _processInWorker(task) {
    if (!this.options.enableWebWorker) {
      return this._processLocally(task);
    }

    this._worker.postMessage({
      type: 'process-icon',
      data: task
    });
  }

  /* ----------------------------------------- */
  /* ----------- نظام التحميل التدريجي -------- */
  /* ----------------------------------------- */

  /**
   * @method _initLazyLoading
   * @description تهيئة نظام التحميل عند الظهور
   * @private
   */
  _initLazyLoading() {
    this._observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const card = entry.target;
          this._loadCardIcon(card);
          this._observer.unobserve(card);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '100px'
    });
  }

  /**
   * @method _loadCardIcon
   * @description تحميل أيقونة البطاقة عند الحاجة
   * @param {HTMLElement} card 
   * @private
   */
  async _loadCardIcon(card) {
    const appId = card.dataset.appId;
    const app = this.options.appsData.find(a => a.id == appId);
    if (!app) return;

    const iconImg = card.querySelector('.app-icon');
    if (!iconImg) return;

    try {
      const iconPath = this._getLocalIconPath(app.packageName);
      iconImg.src = iconPath;
    } catch (error) {
      console.error('Error lazy loading icon:', error);
    }
  }

  /* ----------------------------------------- */
  /* ----------- نظام الذاكرة المؤقتة --------- */
  /* ----------------------------------------- */

  /**
   * @method _initCacheSystem
   * @description تهيئة نظام الذاكرة المؤقتة
   * @private
   */
  _initCacheSystem() {
    this._iconCache = JSON.parse(localStorage.getItem('appsIconCache')) || {};
    this._requestQueue = [];
    this._activeRequests = 0;
    this._maxConcurrentRequests = 3;
  }

  /**
   * @method _saveToCache
   * @description حفظ البيانات في الذاكرة المؤقتة
   * @param {string} key 
   * @param {any} value 
   * @private
   */
  _saveToCache(key, value) {
    this._iconCache[key] = value;
    localStorage.setItem('appsIconCache', JSON.stringify(this._iconCache));
  }

  /* ----------------------------------------- */
  /* ----------- نظام مراقبة الأداء ---------- */
  /* ----------------------------------------- */

  /**
   * @method _initPerformanceMonitor
   * @description تهيئة نظام مراقبة الأداء
   * @private
   */
  _initPerformanceMonitor() {
    this._performance = {
      timers: {},
      marks: {},
      measures: {}
    };
  }

  /**
   * @method _startTimer
   * @description بدء مؤقت أداء
   * @param {string} name 
   * @private
   */
  _startTimer(name) {
    this._performance.timers[name] = performance.now();
  }

  /**
   * @method _endTimer
   * @description إنهاء مؤقت أداء وتسجيل النتيجة
   * @param {string} name 
   * @private
   */
  _endTimer(name) {
    if (this._performance.timers[name]) {
      const duration = performance.now() - this._performance.timers[name];
      console.log(`[Performance] ${name}: ${duration.toFixed(2)}ms`);
      return duration;
    }
    return 0;
  }

  /* ----------------------------------------- */
  /* ----------- معالجة الأيقونات ------------ */
  /* ----------------------------------------- */

  /**
   * @method _getLocalIconPath
   * @description الحصول على مسار الأيقونة مع معالجة خاصة للأسماء
   * @param {string} packageName 
   * @returns {string}
   * @private
   */
  _getLocalIconPath(packageName) {
    if (!packageName) return this._getFallbackIcon();

    // معالجة خاصة لأسماء الملفات
    let iconName = packageName
      .toLowerCase()
      .replace(/\./g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .replace(/_+/g, '_');

    // تحويل أسماء مثل "7.star" إلى "7_star"
    iconName = iconName.replace(/(\d)\.(\w)/g, '$1_$2');

    return `${this.options.iconsBasePath}${iconName}.png`;
  }

  /**
   * @method _loadIcons
   * @description تحميل الأيقونات مع جميع التحسينات
   * @private
   */
  async _loadIcons() {
    this._startTimer('icons-loading');

    const fallbackIcon = this._getFallbackIcon();
    this.options.appsData.forEach(app => {
      app.icon = fallbackIcon; // القيمة الافتراضية أولاً
    });

    // تحميل الأيقونات على دفعات
    const batchSize = 10;
    for (let i = 0; i < this.options.appsData.length; i += batchSize) {
      const batch = this.options.appsData.slice(i, i + batchSize);
      await Promise.all(batch.map(app => this._loadAppIcon(app)));

      // إضافة تأخير بين الدفعات
      if (i + batchSize < this.options.appsData.length) {
        await new Promise(r => setTimeout(r, 50));
      }
    }

    this._endTimer('icons-loading');
  }

  /**
   * @method _loadAppIcon
   * @description تحميل أيقونة تطبيق معين
   * @param {Object} app 
   * @private
   */
  async _loadAppIcon(app) {
    if (!app.packageName) return;

    try {
      const iconPath = this._getLocalIconPath(app.packageName);

      // التحقق من الذاكرة المؤقتة أولاً
      if (this._iconCache[app.packageName]) {
        app.icon = this._iconCache[app.packageName];
        return;
      }

      if (await this._checkIconExists(iconPath)) {
        app.icon = iconPath;
        this._saveToCache(app.packageName, iconPath);
      }
    } catch (error) {
      console.error(`Error loading icon for ${app.name}:`, error);
    }
  }

  /**
   * @method _showLoading
   * @description عرض مؤشر التحميل
   * @private
   */
  _showLoading() {
    const loadingHTML = `
      <div class="loading-overlay">
        <div class="loading-spinner"></div>
        <div class="loading-text">جاري تحميل التطبيقات...</div>
      </div>
    `;
    this.loadingElement = this._createElementFromHTML(loadingHTML);
    document.body.appendChild(this.loadingElement);
  }

  /**
   * @method _hideLoading
   * @description إخفاء مؤشر التحميل
   * @private
   */
  _hideLoading() {
    if (this.loadingElement && document.body.contains(this.loadingElement)) {
      document.body.removeChild(this.loadingElement);
    }
  }

  /**
   * @method _loadCSS
   * @description تحميل ملفات الأنماط مع تحسينات الأداء
   * @private
   */
  _loadCSS() {
    // [معدل] تحسين تحميل CSS
    const existingStyles = document.querySelector('link[href*="apps-cards.css"]');
    if (existingStyles) return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './assets/css/apps-cards.css';
    document.head.appendChild(link);

    const style = document.createElement('style');
    style.textContent = `
      :root { 
        --theme-color: ${this.options.themeColor};
        --dialog-bg-color: ${this.options.dialogBgColor};
      }
      
      .loading-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(255,255,255,0.9);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 1000;
      }
      
      .loading-spinner {
        width: 50px;
        height: 50px;
        border: 5px solid #f3f3f3;
        border-top: 5px solid var(--theme-color);
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }
      
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      
      .loading-text {
        margin-top: 15px;
        font-size: 1.2rem;
        color: #333;
      }
      
      .app-logo {
        position: absolute;
        top: 10px;
        right: 10px;
        width: 20px;
        height: 20px;
        border-radius: 100%;
        background: none;
        padding: 2px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 3;
        background-image: url("./assets/images/logo.png");
        background-size: contain;
        background-repeat: no-repeat;
        background-position: center;
      }

      .dialog-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
      }

      .dialog-content {
        background-color: var(--dialog-bg-color);
        border-radius: 10px;
        width: 400px;
        max-width: 90%;
        box-shadow: 0 5px 15px rgba(0,0,0,0.3);
        overflow: hidden;
      }

      .dialog-header {
        padding: 20px;
        display: flex;
        align-items: center;
        border-bottom: 1px solid #eee;
      }

      .dialog-icon {
        width: 60px;
        height: 60px;
        border-radius: 15px;
        margin-left: 15px;
      }

      .dialog-title {
        font-size: 1.3rem;
        font-weight: bold;
      }

      .dialog-body {
        padding: 20px;
      }

      .quantity-selector {
        display: flex;
        align-items: center;
        margin: 20px 0;
      }

      .quantity-btn {
        width: 40px;
        height: 40px;
        border: 1px solid #ddd;
        background: #f5f5f5;
        font-size: 1.2rem;
        cursor: pointer;
      }

      .quantity-input {
        width: 60px;
        height: 40px;
        text-align: center;
        border: 1px solid #ddd;
        margin: 0 5px;
      }

      .dialog-footer {
        display: flex;
        justify-content: flex-end;
        padding: 15px;
        border-top: 1px solid #eee;
      }

      .dialog-btn {
        padding: 10px 20px;
        border-radius: 5px;
        margin-left: 10px;
        cursor: pointer;
        border: none;
        font-weight: bold;
      }

      .dialog-btn-secondary {
        background: #f5f5f5;
        color: #333;
      }

      .dialog-btn-primary {
        background-color: var(--theme-color);
        color: white;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * @method _createElementFromHTML
   * @description إنشاء عنصر DOM من سلسلة HTML
   * @param {string} htmlString - سلسلة HTML
   * @returns {HTMLElement}
   * @private
   */
  _createElementFromHTML(htmlString) {
    const div = document.createElement('div');
    div.innerHTML = htmlString.trim();
    return div.firstChild;
  }

  /**
   * @method _loadPersistentCache
   * @description تحميل الذاكرة المؤقتة من localStorage
   * @param {string} key - مفتاح التخزين
   * @returns {Object}
   * @private
   */
  _loadPersistentCache(key) {
    try {
      return JSON.parse(localStorage.getItem(key)) || {};
    } catch (e) {
      console.error('Failed to load cache:', e);
      return {};
    }
  }

  /**
   * @method _savePersistentCache
   * @description حفظ الذاكرة المؤقتة في localStorage
   * @param {string} key - مفتاح التخزين
   * @param {Object} data - البيانات للحفظ
   * @private
   */
  _savePersistentCache(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save cache:', e);
    }
  }

  /**
   * @method _checkIconExists
   * @description التحقق من وجود الأيقونة مع نظام متقدم لإدارة الطلبات
   * @param {string} url - مسار الأيقونة
   * @returns {Promise<boolean>}
   * @private
   */
  async _checkIconExists(url) {
    // تخطي التحقق للمسارات المحلية
    if (!url.startsWith('http')) {
      return true;
    }

    return new Promise((resolve) => {
      const processRequest = async () => {
        this._startPerformanceTimer('icon-check');
        this._activeRequests++;

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);

          const response = await fetch(url, {
            method: 'HEAD',
            cache: 'force-cache',
            signal: controller.signal
          });

          clearTimeout(timeoutId);
          resolve(response.ok);
        } catch (error) {
          if (error.name !== 'AbortError') {
            console.warn(`Request failed for ${url}:`, error);
          }
          resolve(false);
        } finally {
          this._activeRequests--;
          this._logPerformance('icon-check');
          this._processQueue();
        }
      };

      if (this._activeRequests < this._maxConcurrentRequests) {
        processRequest();
      } else {
        this._requestQueue.push(processRequest);
      }
    });
  }

  /**
   * @method _startPerformanceTimer
   * @description بدء قياس أداء عملية معينة
   * @param {string} timerName - اسم المؤقت
   * @private
   */
  _startPerformanceTimer(timerName) {
    if (this._enablePerformanceLogging) {
      this._performanceTimers[timerName] = performance.now();
    }
  }

  /**
   * @method _logPerformance
   * @description تسجيل وقت أداء عملية
   * @param {string} timerName - اسم المؤقت
   * @private
   */
  _logPerformance(timerName) {
    if (this._enablePerformanceLogging && this._performanceTimers[timerName]) {
      const duration = performance.now() - this._performanceTimers[timerName];
      console.log(`[Performance] ${timerName}: ${duration.toFixed(2)}ms`);
    }
  }

  /**
   * @method _getFallbackIcon
   * @description الحصول على أيقونة افتراضية
   * @param {string} [appName] - اسم التطبيق (اختياري)
   * @returns {string} رابط الأيقونة الافتراضية
   * @private
   */
  _getFallbackIcon(appName = '') {
    return '/icons/apps/default.png';
  }

  /**
   * @method _createSearchBar
   * @description إنشاء شريط البحث مع تحسينات الوصول
   * @returns {HTMLElement}
   * @private
   */
  _createSearchBar() {
    // [معدل] مع تحسينات الوصول
    const searchContainer = document.createElement('div');
    searchContainer.className = 'search-container';

    const searchBar = document.createElement('input');
    searchBar.type = 'text';
    searchBar.placeholder = 'ابحث عن تطبيق...';
    searchBar.className = 'search-bar';
    searchBar.setAttribute('aria-label', 'بحث عن التطبيقات');
    searchBar.addEventListener('input', (e) => this._filterApps(e.target.value));

    searchContainer.appendChild(searchBar);
    return searchContainer;
  }

  /**
   * @method _filterApps
   * @description تصفية التطبيقات حسب نص البحث مع تحسينات الأداء
   * @param {string} searchTerm
   * @private
   */
  _filterApps(searchTerm) {
    // [معدل] مع تحسينات الأداء
    const term = searchTerm.toLowerCase().trim();

    if (!term) {
      this.filteredApps = [...this.options.appsData];
    } else {
      this.filteredApps = this.options.appsData.filter(app => {
        const appName = app.name.toLowerCase();
        const packageName = app.packageName?.toLowerCase() || '';
        return appName.includes(term) || packageName.includes(term);
      });
    }

    this.currentPage = 1;
    this.renderAppsGrid();
  }

  /**
   * @method _defaultAppsData
   * @description إنشاء بيانات افتراضية للتطبيقات
   * @returns {Array}
   * @private
   */
  _defaultAppsData() {
    return [
      { id: 1, name: "متجر الارقام", packageName: "com.arkan.store", icon: null, price: "4.99" },
      { id: 2, name: "Bigo Live", packageName: "com.bigo.live", icon: null, price: "3.99" },
      { id: 3, name: "Likee", packageName: "com.likee.video", icon: null, price: "5.99" },
      { id: 4, name: "MICO", packageName: "com.mico.live", icon: null, price: "4.49" },
      { id: 5, name: "Yoyo", packageName: "com.yy.hiyo", icon: null, price: "3.99" },
      { id: 6, name: "LIKE", packageName: "com.like.like", icon: null, price: "4.99" },
      { id: 7, name: "TalkTalk", packageName: "com.talktalk.talk", icon: null, price: "5.99" },
      { id: 8, name: "PartyStar", packageName: "com.partystar.app", icon: null, price: "6.99" },
      { id: 9, name: "Hiya", packageName: "com.hiya.app", icon: null, price: "4.49" },
      { id: 10, name: "Bobo Live", packageName: "com.bobo.live", icon: null, price: "5.49" },
      { id: 11, name: "4Fun", packageName: "com.4fun.app", icon: null, price: "3.99" },
      { id: 12, name: "Zina Live", packageName: "com.zina.live", icon: null, price: "5.99" },
      { id: 13, name: "Sugo Chat", packageName: "com.sugo.chat", icon: null, price: "4.49" },
      { id: 14, name: "Yahla Chat", packageName: "com.yahla.chat", icon: null, price: "3.99" },
      { id: 15, name: "Mego Live", packageName: "com.mego.live", icon: null, price: "4.99" },
      { id: 16, name: "Coco Live", packageName: "com.coco.live", icon: null, price: "5.99" },
      { id: 17, name: "Happy", packageName: "com.happy.app", icon: null, price: "4.99" },
      { id: 18, name: "HoneyJar", packageName: "com.honeyjar.app", icon: null, price: "3.99" },
      { id: 19, name: "HiYo", packageName: "com.hiyo.app", icon: null, price: "4.49" },
      { id: 20, name: "Demo Chat", packageName: "com.demo.chat", icon: null, price: "3.99" },
      { id: 21, name: "Layla Chat", packageName: "com.layla.chat", icon: null, price: "5.49" },
      { id: 22, name: "Tami Chat", packageName: "com.tami.chat", icon: null, price: "3.99" },
      { id: 23, name: "Wahoo Chat", packageName: "com.wahoo.chat", icon: null, price: "4.99" },
      { id: 24, name: "Ayumi Chat", packageName: "com.ayumi.chat", icon: null, price: "5.99" },
      { id: 25, name: "Haki Chat", packageName: "com.haki.chat", icon: null, price: "3.49" },
      { id: 26, name: "Yoyo Chat", packageName: "com.yoyo.chat", icon: null, price: "4.99" },
      { id: 27, name: "Ohla Chat", packageName: "com.ohla.chat", icon: null, price: "5.49" },
      { id: 28, name: "Lego Live", packageName: "com.lego.live", icon: null, price: "6.99" },
      { id: 29, name: "Lama Chat", packageName: "com.lama.chat", icon: null, price: "4.49" },
      { id: 30, name: "Azal Live", packageName: "com.azal.live", icon: null, price: "5.99" },
      { id: 31, name: "Bella Chat", packageName: "com.bella.chat", icon: null, price: "3.99" },
      { id: 32, name: "Binmo Chat", packageName: "com.binmo.chat", icon: null, price: "4.99" },
      { id: 33, name: "Lami Chat", packageName: "com.lami.chat", icon: null, price: "5.49" },
      { id: 34, name: "Lite Chat", packageName: "com.lite.chat", icon: null, price: "3.99" },
      { id: 35, name: "Happy Chat", packageName: "com.happy.chat", icon: null, price: "4.99" },
      { id: 36, name: "Taka Chat", packageName: "com.taka.chat", icon: null, price: "5.99" },
      { id: 37, name: "Wawu", packageName: "com.wawu.app", icon: null, price: "3.49" },
      { id: 38, name: "Higo Chat", packageName: "com.higo.chat", icon: null, price: "4.99" },
      { id: 39, name: "Wayak Chat", packageName: "com.wayak.chat", icon: null, price: "5.49" },
      { id: 40, name: "Q Live", packageName: "com.q.live", icon: null, price: "6.99" },
      { id: 41, name: "Leet Chat", packageName: "com.leet.chat", icon: null, price: "4.49" },
      { id: 42, name: "Hoby Chat", packageName: "com.hoby.chat", icon: null, price: "3.99" },
      { id: 43, name: "Jimmy Live", packageName: "com.jimmy.live", icon: null, price: "5.99" },
      { id: 44, name: "Olamet Chat", packageName: "com.olamet.chat", icon: null, price: "4.99" },
      { id: 45, name: "Saada Chat", packageName: "com.saada.chat", icon: null, price: "3.99" },
      { id: 46, name: "Ammar Chat", packageName: "com.ammar.chat", icon: null, price: "4.49" },
      { id: 47, name: "Waki Star", packageName: "com.waki.star", icon: null, price: "5.99" },
      { id: 48, name: "So Match", packageName: "com.so.match", icon: null, price: "3.99" },
      { id: 49, name: "Uwi Chat", packageName: "com.uwi.chat", icon: null, price: "4.99" },
      { id: 50, name: "Soul Chat", packageName: "com.soul.chat", icon: null, price: "5.49" },
      { id: 51, name: "Tango Tada Chat", packageName: "com.tango.tada", icon: null, price: "6.99" },
      { id: 52, name: "Lucky Chat", packageName: "com.lucky.chat", icon: null, price: "4.49" },
      { id: 53, name: "Ab Fun", packageName: "com.ab.fun", icon: null, price: "3.99" },
      { id: 54, name: "Top Top", packageName: "com.top.top", icon: null, price: "4.99" },
      { id: 55, name: "Top Voice", packageName: "com.top.voice", icon: null, price: "5.99" },
      { id: 56, name: "Amu Chat", packageName: "com.amu.chat", icon: null, price: "3.99" },
      { id: 57, name: "Party Hero", packageName: "com.party.hero", icon: null, price: "6.49" },
      { id: 58, name: "Majlis", packageName: "com.majlis.app", icon: null, price: "4.99" },
      { id: 59, name: "Asha Live", packageName: "com.asha.live", icon: null, price: "5.99" },
      { id: 60, name: "Shameet Live", packageName: "com.shameet.live", icon: null, price: "4.49" },
      { id: 61, name: "Hoka Chat", packageName: "com.hoka.chat", icon: null, price: "3.99" },
      { id: 62, name: "Hala Me", packageName: "com.hala.me", icon: null, price: "4.99" },
      { id: 63, name: "Sodfa Chat", packageName: "com.sodfa.chat", icon: null, price: "5.49" },
      { id: 64, name: "Nabd Chat", packageName: "com.nabd.chat", icon: null, price: "3.99" },
      { id: 65, name: "Soul Star", packageName: "com.soul.star", icon: null, price: "6.99" },
      { id: 66, name: "Moly Star", packageName: "com.moly.star", icon: null, price: "4.49" },
      { id: 67, name: "Wigo Party", packageName: "com.wigo.party", icon: null, price: "5.99" },
      { id: 68, name: "Yami Star", packageName: "com.yami.star", icon: null, price: "4.99" },
      { id: 69, name: "Fofo Chat", packageName: "com.fofo.chat", icon: null, price: "3.99" },
      { id: 70, name: "Bota Live", packageName: "com.bota.live", icon: null, price: "5.49" },
      { id: 71, name: "Quai Chat", packageName: "com.quai.chat", icon: null, price: "4.99" },
      { id: 72, name: "Mico Live", packageName: "com.mico.live", icon: null, price: "6.99" },
      { id: 73, name: "Dito Chat", packageName: "com.dito.chat", icon: null, price: "3.99" },
      { id: 74, name: "Suyo Chat", packageName: "com.suyo.chat", icon: null, price: "4.49" },
      { id: 75, name: "IMO", packageName: "com.imo.app", icon: null, price: "5.99" },
      { id: 76, name: "Sahra Chat", packageName: "com.sahra.chat", icon: null, price: "3.99" },
      { id: 77, name: "Bawa Live", packageName: "com.bawa.live", icon: null, price: "4.99" },
      { id: 78, name: "Janko", packageName: "com.janko.app", icon: null, price: "5.49" },
      { id: 79, name: "Kismet Chat", packageName: "com.kismet.chat", icon: null, price: "6.99" },
      { id: 80, name: "Saya Like", packageName: "com.saya.like", icon: null, price: "4.49" },
      { id: 81, name: "Dana", packageName: "com.dana.app", icon: null, price: "3.99" },
      { id: 82, name: "Nawa Live", packageName: "com.nawa.live", icon: null, price: "5.99" },
      { id: 83, name: "Fufa Chat", packageName: "com.fufa.chat", icon: null, price: "4.99" },
      { id: 84, name: "Sama Chat", packageName: "com.sama.chat", icon: null, price: "3.99" },
      { id: 85, name: "Halo Star", packageName: "com.halo.star", icon: null, price: "5.49" },
      { id: 86, name: "Me You", packageName: "com.me.you", icon: null, price: "6.99" },
      { id: 87, name: "Like Saya", packageName: "com.like.saya", icon: null, price: "4.49" },
      { id: 88, name: "Hayuki Chat", packageName: "com.hayuki.chat", icon: null, price: "3.99" },
      { id: 89, name: "Fun Up", packageName: "com.fun.up", icon: null, price: "5.99" },
      { id: 90, name: "Joyo Live", packageName: "com.joyo.live", icon: null, price: "4.99" },
      { id: 91, name: "Kitty Live", packageName: "com.kitty.live", icon: null, price: "3.99" },
      { id: 92, name: "Sala Live", packageName: "com.sala.live", icon: null, price: "5.49" },
      { id: 93, name: "Hami Party", packageName: "com.hami.party", icon: null, price: "6.99" },
      { id: 94, name: "RoStar", packageName: "com.ro.star", icon: null, price: "4.49" },
      { id: 95, name: "Super Live", packageName: "com.super.live", icon: null, price: "5.99" },
      { id: 96, name: "Marhaba Chat", packageName: "com.marhaba.chat", icon: null, price: "3.99" },
      { id: 97, name: "Fancy Live", packageName: "com.fancy.live", icon: null, price: "4.99" },
      { id: 98, name: "Hi Party", packageName: "com.hi.party", icon: null, price: "5.49" },
      { id: 99, name: "Matha Chat", packageName: "com.matha.chat", icon: null, price: "6.99" },
      { id: 100, name: "Star Maker", packageName: "com.star.maker", icon: null, price: "4.49" },
      { id: 101, name: "Karwan Chat", packageName: "com.karwan.chat", icon: null, price: "3.99" },
      { id: 102, name: "Layam", packageName: "com.layam.app", icon: null, price: "5.99" },
      { id: 103, name: "Mango Live", packageName: "com.mango.live", icon: null, price: "4.99" },
      { id: 104, name: "Yalla Live", packageName: "com.yalla.live", icon: null, price: "3.99" },
      { id: 105, name: "7 Star", packageName: "com.seven.star", icon: null, price: "5.49" },
      { id: 106, name: "Sherb Chat", packageName: "com.sherb.chat", icon: null, price: "6.99" },
      { id: 107, name: "Oba Live", packageName: "com.oba.live", icon: null, price: "4.49" },
      { id: 108, name: "Bobo Chat", packageName: "com.bobo.chat", icon: null, price: "3.99" },
      { id: 109, name: "Saba Chat", packageName: "com.saba.chat", icon: null, price: "5.99" },
      { id: 110, name: "Tamil", packageName: "com.tamil.app", icon: null, price: "4.99" },
      { id: 111, name: "Live You", packageName: "com.live.you", icon: null, price: "3.99" },
      { id: 112, name: "Mix You", packageName: "com.mix.you", icon: null, price: "5.49" },
      { id: 113, name: "Sheila Chat", packageName: "com.sheila.chat", icon: null, price: "6.99" },
      { id: 114, name: "Alo Chat", packageName: "com.alo.chat", icon: null, price: "4.49" },
      { id: 115, name: "Salam Chat", packageName: "com.salam.chat", icon: null, price: "3.99" },
      { id: 116, name: "Sparty Chat", packageName: "com.sparty.chat", icon: null, price: "5.99" },
      { id: 117, name: "Hua Chat", packageName: "com.hua.chat", icon: null, price: "4.99" },
      { id: 118, name: "Ab Live", packageName: "com.ab.live", icon: null, price: "3.99" },
      { id: 119, name: "Lions Chat", packageName: "com.lions.chat", icon: null, price: "5.49" },
      { id: 120, name: "IPTV", packageName: "com.iptv.app", icon: null, price: "6.99" }
    ];
  }

  /**
   * @method _createAppCard
   * @description إنشاء بطاقة تطبيق بتأثيرات 3D مع تحسينات كاملة
   * @param {Object} app - بيانات التطبيق
   * @returns {HTMLElement} عنصر بطاقة التطبيق
   * @private
   */
  _createAppCard(app) {
    // [معدل] مع تحسينات كاملة
    const card = document.createElement('div');
    card.className = 'app-card';
    card.dataset.appId = app.id;

    const iconImg = document.createElement('img');
    iconImg.className = 'app-icon';
    iconImg.alt = `${app.name} icon`;
    iconImg.loading = 'lazy';
    iconImg.decoding = 'async';

    // إذا كان التحميل التدريجي معطلاً، تحميل الأيقونة مباشرة
    if (!this.options.lazyLoadThreshold ||
      this.filteredApps.length <= this.options.lazyLoadThreshold) {
      iconImg.src = app.icon;
    } else {
      // وضع صورة فارغة أولاً
      iconImg.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48L3N2Zz4=';
    }
    card.setAttribute('aria-label', `تطبيق ${app.name}`);
    card.setAttribute('role', 'button');
    card.tabIndex = 0;

    // تأثيرات 3D
    card.style.transformStyle = 'preserve-3d';
    card.style.transition = 'transform 0.5s ease, box-shadow 0.3s ease';

    // إنشاء المحتوى
    const iconContainer = document.createElement('div');
    iconContainer.className = 'app-icon-container';

    iconImg.onerror = () => {
      // حل مشكلة: منع التحميل اللانهائي بواسطة إيقاف المحاولات بعد الخطأ
      iconImg.src = this._getFallbackIcon();
      // إزالة معالج الأخطاء بعد الأستخدام
      iconImg.onerror = null;
    }

    iconContainer.appendChild(iconImg);

    const nameElement = document.createElement('div');
    nameElement.className = 'app-name';
    nameElement.textContent = app.name;

    const footerElement = document.createElement('div');
    footerElement.className = 'app-footer';
    footerElement.textContent = `$${app.price}`;

    const logoElement = document.createElement('div');
    logoElement.className = 'app-logo';
    logoElement.style.backgroundImage = `url(${this.options.logoUrl})`;
    logoElement.setAttribute('aria-hidden', 'true');

    // تجميع العناصر
    card.append(iconContainer, nameElement, footerElement, logoElement);

    // إضافة تأثيرات التحويم 3D
    this._setup3DHoverEffects(card);

    // أحداث النقر والضغط بالزر
    card.addEventListener('click', () => this._showDialog(app));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        this._showDialog(app);
      }
    });

    return card;
  }

  /**
   * @method _setup3DHoverEffects
   * @description إعداد تأثيرات التحويم ثلاثية الأبعاد مع تحسينات الأداء
   * @param {HTMLElement} card - عنصر بطاقة التطبيق
   * @private
   */
  _setup3DHoverEffects(card) {
    // [معدل] مع تحسينات الأداء
    let animationFrame;

    const handleMouseMove = (e) => {
      cancelAnimationFrame(animationFrame);

      animationFrame = requestAnimationFrame(() => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const angleX = (y - centerY) / 20;
        const angleY = (centerX - x) / 20;

        card.style.transform = `perspective(1000px) rotateX(${angleX}deg) rotateY(${angleY}deg) scale(1.05)`;
        card.style.boxShadow = '0 15px 30px rgba(0,0,0,0.3)';
      });
    };

    const handleMouseLeave = () => {
      cancelAnimationFrame(animationFrame);
      card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale(1)';
      card.style.boxShadow = '0 10px 20px rgba(0,0,0,0.2)';
    };

    card.addEventListener('mousemove', handleMouseMove);
    card.addEventListener('mouseleave', handleMouseLeave);

    // تنظيف المعالج عند التدمير
    card._cleanup3DEffects = () => {
      card.removeEventListener('mousemove', handleMouseMove);
      card.removeEventListener('mouseleave', handleMouseLeave);
      cancelAnimationFrame(animationFrame);
    };
  }

  /**
   * @method _showDialog
   * @description عرض مربع حوار تفاصيل التطبيق مع تحسينات كاملة
   * @param {Object} app
   * @private
   */
  _showDialog(app) {
    // [معدل] مع تحسينات كاملة
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'dialog-title');

    const dialog = document.createElement('div');
    dialog.className = 'dialog-content';

    // إنشاء محتوى مربع الحوار بشكل آمن
    const header = document.createElement('div');
    header.className = 'dialog-header';

    const iconImg = document.createElement('img');
    iconImg.src = app.icon;
    iconImg.className = 'dialog-icon';
    iconImg.alt = app.name;
    iconImg.onerror = () => {
      iconImg.src = this._getFallbackIcon(app.name);
    };

    const titleElement = document.createElement('div');
    titleElement.className = 'dialog-title';
    titleElement.textContent = app.name;

    header.appendChild(iconImg);
    header.appendChild(titleElement);

    const body = document.createElement('div');
    body.className = 'dialog-body';

    const priceElement = document.createElement('p');
    priceElement.textContent = `سعر التطبيق: $${app.price}`;

    const quantityContainer = document.createElement('div');
    quantityContainer.className = 'quantity-selector';

    const minusBtn = document.createElement('button');
    minusBtn.className = 'quantity-btn minus';
    minusBtn.textContent = '-';

    const quantityInput = document.createElement('input');
    quantityInput.type = 'number';
    quantityInput.className = 'quantity-input';
    quantityInput.value = '1';
    quantityInput.min = '1';
    quantityInput.max = '10';

    const plusBtn = document.createElement('button');
    plusBtn.className = 'quantity-btn plus';
    plusBtn.textContent = '+';

    quantityContainer.appendChild(minusBtn);
    quantityContainer.appendChild(quantityInput);
    quantityContainer.appendChild(plusBtn);

    body.appendChild(priceElement);
    body.appendChild(quantityContainer);

    const footer = document.createElement('div');
    footer.className = 'dialog-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'dialog-btn dialog-btn-secondary';
    cancelBtn.textContent = 'إلغاء';

    const buyBtn = document.createElement('button');
    buyBtn.className = 'dialog-btn dialog-btn-primary';
    buyBtn.style.backgroundColor = this.options.themeColor;
    buyBtn.textContent = 'شراء';

    footer.appendChild(cancelBtn);
    footer.appendChild(buyBtn);

    // تجميع العناصر
    dialog.appendChild(header);
    dialog.appendChild(body);
    dialog.appendChild(footer);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // إضافة معالجات الأحداث
    minusBtn.addEventListener('click', () => {
      const value = parseInt(quantityInput.value);
      if (value > 1) quantityInput.value = value - 1;
    });

    plusBtn.addEventListener('click', () => {
      const value = parseInt(quantityInput.value);
      if (value < 10) quantityInput.value = value + 1;
    });

    cancelBtn.addEventListener('click', () => {
      document.body.removeChild(overlay);
    });

    buyBtn.addEventListener('click', () => {
      const quantity = parseInt(quantityInput.value);
      this._processOrder(app, quantity);
      document.body.removeChild(overlay);
    });

    // إغلاق النافذة عند النقر خارجها
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        document.body.removeChild(overlay);
      }
    });
    requestAnimationFrame(() => {
      buyBtn.focus();
    });
  }

  /**
   * @method _processOrder
   * @description معالجة طلب الشراء مع تحسينات الأمان
   * @param {Object} app
   * @param {number} quantity
   * @private
   */
  _processOrder(app, quantity) {
    // [معدل] مع تحسينات الأمان
    if (!app || !quantity || quantity < 1 || quantity > this.options.maxQuantity) {
      console.error('بيانات الطلب غير صالحة');
      return;
    }

    const totalPrice = (parseFloat(app.price) * quantity).toFixed(2);
    console.log(`تم طلب ${quantity} من تطبيق ${app.name} بسعر إجمالي $${totalPrice}`);
    // يمكن إضافة منطق إرسال الطلب إلى السيرفر هنا
  }

  /**
   * @method renderAppsGrid
   * @description تصيير شبكة التطبيقات مع تحسينات الأداء
   * @private
   */
  renderAppsGrid() {
    // [معدل] مع تحسينات الأداء
    const appsGrid = document.createElement('div');
    appsGrid.className = 'apps-grid';

    const fragment = document.createDocumentFragment();
    this.filteredApps.forEach(app => {
      fragment.appendChild(this._createAppCard(app));
    });

    appsGrid.appendChild(fragment);

    const existingGrid = this.container.querySelector('.apps-grid');
    if (existingGrid) {
      this.container.replaceChild(appsGrid, existingGrid);
    } else {
      this.container.appendChild(appsGrid);
    }
  }

  /* ----------------------------------------- */
  /* ----------- الوظائف الأساسية ------------ */
  /* ----------------------------------------- */

  // ... (بقية الدوال الأساسية كما هي مع التحسينات)

  /**
   * @method render
   * @description تصيير المكون الرئيسي مع دعم التحميل التدريجي
   * @public
   */
  render() {
    this.container.innerHTML = '';
    this.container.className = 'apps-tab-container';

    this.container.appendChild(this._createSearchBar());

    const appsGrid = document.createElement('div');
    appsGrid.className = 'apps-grid';

    this.filteredApps.forEach(app => {
      const card = this._createAppCard(app);
      if (this.options.lazyLoadThreshold &&
        this.filteredApps.length > this.options.lazyLoadThreshold) {
        this._observer.observe(card);
      }
      appsGrid.appendChild(card);
    });

    this.container.appendChild(appsGrid);
  }

  /**
   * @method destroy
   * @description تنظيف الموارد والمؤقتات
   * @public
   */
  destroy() {
    this._hideLoading();
    
    if (this._worker) {
      this._worker.terminate();
    }
    
    if (this._observer) {
      this._observer.disconnect();
    }
    
    const cards = this.container.querySelectorAll('.app-card');
    cards.forEach(card => {
      card.removeEventListener('click', this._handleCardClick);
      card.removeEventListener('keydown', this._handleCardKeydown);
    });
    
    this.container.innerHTML = '';
  }
}

if (typeof window !== 'undefined') {
  window.AppsTab = AppsTab;
}

export { AppsTab };