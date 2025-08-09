/**
 * @file appstab.js
 * @class AppsTab
 * @description كلاس متكامل لإدارة تبويب تطبيقات الدردشة مع دعم متقدم للأيقونات والتخزين المؤقت والتأثيرات ثلاثية الأبعاد
 * @version 3.5
 * @feature_cache نظام تخزين مؤقت للأيقونات
 * @feature_loading مؤشر تحميل أثناء جلب البيانات
 * @feature_3d تأثيرات ثلاثية الأبعاد للبطاقات
 * @feature_logo إدارة شعار التطبيق في الزاوية
 */

class AppsTab {
  /**
   * @constructor
   * @param {Object} config - كائن التهيئة
   * @param {Object} config.taber - Instance من Taber (اختياري)
   * @param {string} config.containerId - ID العنصر الحاوي
   * @param {Object} config.options - خيارات إضافية
   * @param {string} [config.options.themeColor='#6a5acd'] - لون الثيم الرئيسي
   * @param {string} [config.options.dialogBgColor='#ffffff'] - لون خلفية مربع الحوار
   * @param {Array} [config.options.appsData] - بيانات التطبيقات (اختياري)
   * @param {number} [config.options.iconRefreshInterval=3600000] - فترة تحديث الأيقونات (ميلي ثانية)
   * @param {string} [config.options.logoUrl] - رابط شعار التطبيق (اختياري)
   */
  constructor({ taber, containerId, options = {} }) {
    this.taber = taber || {};
    this.container = document.getElementById(containerId);
    
    if (!this.container) {
      console.error("عنصر الحاوية غير موجود بالـ ID المحدد:", containerId);
      alert('خطأ: عنصر الحاوية غير موجود');
      return;
    }
    
    // إعدادات التخزين المؤقت
    this.iconCache = {};
    this.cacheExpiry = 24 * 60 * 60 * 1000; // 24 ساعة
    
    // إعدادات العرض
    this.appsPerPage = 1000; // عرض جميع التطبيقات دون ترقيم
    this.currentPage = 1;
    this.options = {
      themeColor: options.themeColor || '#6a5acd',
      dialogBgColor: options.dialogBgColor || '#ffffff',
      appsData: options.appsData || this._defaultAppsData(),
      logoUrl: options.logoUrl || './assets/images/logo.png',
      iconRefreshInterval: options.iconRefreshInterval || 3600000
    };
    
    this.filteredApps = [...this.options.appsData];
    this.iconsDownloaded = false;
    this._init();
  }

  /**
   * @method _init
   * @description تهيئة المكون الرئيسي
   * @private
   */
  async _init() {
    this._showLoading();
    this._loadCSS();
    
    // التحقق مما إذا كانت الأيقونات تم تحميلها
    const iconsStatus = await this._checkIconsStatus();
    if (!iconsStatus) {
      // إذا لم تتم تحميل الأيقونات، نبدأ بتحميلها
      await this._downloadAllIcons();
    }
    
    await this._loadIcons();
    this.render();
    this._setupIconRefresh();
    this._hideLoading();
  }

  /**
   * @method _showLoading
   * @description عرض مؤشر التحميل
   * @private
   */
  _showLoading() {
    this.loadingElement = document.createElement('div');
    this.loadingElement.className = 'loading-overlay';
    this.loadingElement.innerHTML = `
      <div class="loading-spinner"></div>
      <div class="loading-text">جاري تحميل التطبيقات...</div>
    `;
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
   * @description تحميل ملفات الأنماط
   * @private
   */
  _loadCSS() {
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

.app-logo img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
    `;
    document.head.appendChild(style);
  }

  /**
   * @method _setupIconRefresh
   * @description إعداد التحديث الدوري للأيقونات
   * @private
   */
  _setupIconRefresh() {
    if (this.iconRefreshTimer) {
      clearInterval(this.iconRefreshTimer);
    }
    this.iconRefreshTimer = setInterval(async () => {
      await this._loadIcons(true);
      this.renderAppsGrid();
    }, this.options.iconRefreshInterval);
  }

  /**
   * @method _checkIconsStatus
   * @description التحقق مما إذا كانت الأيقونات تم تحميلها بالكامل
   * @returns {Promise<boolean>}
   * @private
   */
  async _checkIconsStatus() {
    try {
      const response = await fetch('/api/icons/apps/icons/status');
      if (response.ok) {
        const result = await response.json();
        this.iconsDownloaded = result.downloaded;
        return result.downloaded;
      }
      return false;
    } catch (error) {
      console.error('خطأ في التحقق من حالة تحميل الأيقونات:', error);
      return false;
    }
  }

  /**
   * @method _downloadAllIcons
   * @description تحميل جميع الأيقونات تلقائياً
   * @returns {Promise<void>}
   * @private
   */
  async _downloadAllIcons() {
    try {
      const response = await fetch('/api/icons/apps/icons/download-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          apps: this.options.appsData
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log(result.message);
        this.iconsDownloaded = true;
      } else {
        console.error('فشل في بدء تحميل الأيقونات');
      }
    } catch (error) {
      console.error('خطأ في تحميل جميع الأيقونات:', error);
    }
  }

  /**
   * @method _loadIcons
   * @description جلب الأيقونات مع دعم التخزين المؤقت
   * @param {boolean} [silent=false] - منع عرض رسائل الخطأ
   * @returns {Promise<void>}
   * @private
   */
  async _loadIcons(silent = false) {
    try {
      // محاولة جلب الأيقونات من الكاش أولاً
      const cachedIcons = this._getCachedIcons();
      if (cachedIcons) {
        this._applyIcons(cachedIcons);
        if (!silent) console.log('تم تحميل الأيقونات من الذاكرة المؤقتة');
        return;
      }

      // جلب الأيقونات من السيرفر
      const response = await fetch('/api/icons/apps/icons', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify({
          apps: this.options.appsData.map(app => ({
            id: app.id,
            packageName: app.packageName,
            name: app.name
          })),
          timestamp: Date.now()
        })
      });
      
      if (!response.ok) throw new Error('فشل جلب الأيقونات');
      
      const iconsData = await response.json();
      
      // حفظ الأيقونات في الكاش
      this._cacheIcons(iconsData);
      
      // تطبيق الأيقونات
      this._applyIcons(iconsData);
      
    } catch (error) {
      if (!silent) console.error('فشل جلب الأيقونات:', error);
      this._applyFallbackIcons();
    }
  }

  /**
   * @method _getCachedIcons
   * @description جلب الأيقونات من التخزين المؤقت المحلي
   * @returns {Array|null} مصفوفة بيانات الأيقونات أو null إذا لم توجد
   * @private
   */
  _getCachedIcons() {
    try {
      const cached = localStorage.getItem('appsIconsCache');
      if (!cached) return null;
      
      const { timestamp, data } = JSON.parse(cached);
      if (Date.now() - timestamp > this.cacheExpiry) return null;
      
      return data;
    } catch (e) {
      return null;
    }
  }

  /**
   * @method _cacheIcons
   * @description حفظ الأيقونات في التخزين المؤقت المحلي
   * @param {Array} iconsData - مصفوفة بيانات الأيقونات
   * @private
   */
  _cacheIcons(iconsData) {
    try {
      const cacheData = {
        timestamp: Date.now(),
        data: iconsData
      };
      localStorage.setItem('appsIconsCache', JSON.stringify(cacheData));
    } catch (e) {
      console.error('فشل حفظ الأيقونات في الكاش:', e);
    }
  }

  /**
   * @method _applyIcons
   * @description تطبيق الأيقونات على بيانات التطبيقات
   * @param {Array} iconsData - مصفوفة بيانات الأيقونات
   * @private
   */
  _applyIcons(iconsData) {
    this.options.appsData.forEach(app => {
      const iconInfo = iconsData.find(i => i.appId === app.id);
      if (iconInfo?.icon) {
        app.icon = iconInfo.icon;
      } else {
        app.icon = this._getFallbackIcon(app.name);
      }
    });
  }

  /**
   * @method _applyFallbackIcons
   * @description تطبيق الأيقونات الافتراضية عند فشل الجلب
   * @private
   */
  _applyFallbackIcons() {
    this.options.appsData.forEach(app => {
      app.icon = this._getFallbackIcon(app.name);
    });
  }

  /**
   * @method _isValidUrl
   * @description التحقق من صحة رابط الصورة
   * @param {string} url - رابط الصورة
   * @returns {boolean}
   * @private
   */
  _isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * @method _darkenColor
   * @description تظليل اللون بنسبة معينة
   * @param {string} color - اللون الأساسي
   * @param {number} percent - النسبة المئوية للتظليل
   * @returns {string}
   * @private
   */
  _darkenColor(color, percent) {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) - amt;
    const G = (num >> 8 & 0x00FF) - amt;
    const B = (num & 0x0000FF) - amt;
    return `#${(
      0x1000000 +
      (R < 0 ? 0 : R) * 0x10000 +
      (G < 0 ? 0 : G) * 0x100 +
      (B < 0 ? 0 : B)
    ).toString(16).slice(1)}`;
  }

  /**
   * @method _getFallbackIcon
   * @description الحصول على أيقونة افتراضية للتطبيق
   * @param {string} appName - اسم التطبيق
   * @returns {string} رابط الأيقونة الافتراضية
   * @private
   */
  _getFallbackIcon(appName) {
    const fallbackIcons = {
      "متجر الارقام": "https://cdn-icons-png.flaticon.com/512/3046/3046127.png",
      "Bigo Live": "https://cdn-icons-png.flaticon.com/512/3046/3046128.png",
      "Likee": "https://cdn-icons-png.flaticon.com/512/3046/3046129.png",
      "MICO": "https://cdn-icons-png.flaticon.com/512/3046/3046130.png",
      "Yoyo": "https://cdn-icons-png.flaticon.com/512/3046/3046131.png",
      "LIKE": "https://cdn-icons-png.flaticon.com/512/3046/3046132.png",
      "TalkTalk": "https://cdn-icons-png.flaticon.com/512/3046/3046133.png",
      "PartyStar": "https://cdn-icons-png.flaticon.com/512/3046/3046134.png",
      "Hiya": "https://cdn-icons-png.flaticon.com/512/3046/3046135.png",
      "Bobo Live": "https://cdn-icons-png.flaticon.com/512/3046/3046136.png",
      "4Fun": "https://cdn-icons-png.flaticon.com/512/3046/3046137.png",
      "Zina Live": "https://cdn-icons-png.flaticon.com/512/3046/3046138.png",
      "Sugo Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046139.png",
      "Yahla Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046140.png",
      "Mego Live": "https://cdn-icons-png.flaticon.com/512/3046/3046141.png",
      "Coco Live": "https://cdn-icons-png.flaticon.com/512/3046/3046142.png",
      "Happy": "https://cdn-icons-png.flaticon.com/512/3046/3046143.png",
      "HoneyJar": "https://cdn-icons-png.flaticon.com/512/3046/3046144.png",
      "HiYo": "https://cdn-icons-png.flaticon.com/512/3046/3046145.png",
      "Demo Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046146.png",
      "Layla Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046147.png",
      "Tami Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046148.png",
      "Wahoo Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046149.png",
      "Ayumi Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046150.png",
      "Haki Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046151.png",
      "Yoyo Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046152.png",
      "Ohla Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046153.png",
      "Lego Live": "https://cdn-icons-png.flaticon.com/512/3046/3046154.png",
      "Lama Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046155.png",
      "Azal Live": "https://cdn-icons-png.flaticon.com/512/3046/3046156.png",
      "Bella Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046157.png",
      "Binmo Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046158.png",
      "Lami Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046159.png",
      "Lite Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046160.png",
      "Happy Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046161.png",
      "Taka Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046162.png",
      "Wawu": "https://cdn-icons-png.flaticon.com/512/3046/3046163.png",
      "Higo Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046164.png",
      "Wayak Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046165.png",
      "Q Live": "https://cdn-icons-png.flaticon.com/512/3046/3046166.png",
      "Leet Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046167.png",
      "Hoby Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046168.png",
      "Jimmy Live": "https://cdn-icons-png.flaticon.com/512/3046/3046169.png",
      "Olamet Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046170.png",
      "Saada Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046171.png",
      "Ammar Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046172.png",
      "Waki Star": "https://cdn-icons-png.flaticon.com/512/3046/3046173.png",
      "So Match": "https://cdn-icons-png.flaticon.com/512/3046/3046174.png",
      "Uwi Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046175.png",
      "Soul Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046176.png",
      "Tango Tada Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046177.png",
      "Lucky Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046178.png",
      "Ab Fun": "https://cdn-icons-png.flaticon.com/512/3046/3046179.png",
      "Top Top": "https://cdn-icons-png.flaticon.com/512/3046/3046180.png",
      "Top Voice": "https://cdn-icons-png.flaticon.com/512/3046/3046181.png",
      "Amu Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046182.png",
      "Party Hero": "https://cdn-icons-png.flaticon.com/512/3046/3046183.png",
      "Majlis": "https://cdn-icons-png.flaticon.com/512/3046/3046184.png",
      "Asha Live": "https://cdn-icons-png.flaticon.com/512/3046/3046185.png",
      "Shameet Live": "https://cdn-icons-png.flaticon.com/512/3046/3046186.png",
      "Hoka Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046187.png",
      "Hala Me": "https://cdn-icons-png.flaticon.com/512/3046/3046188.png",
      "Sodfa Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046189.png",
      "Nabd Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046190.png",
      "Soul Star": "https://cdn-icons-png.flaticon.com/512/3046/3046191.png",
      "Moly Star": "https://cdn-icons-png.flaticon.com/512/3046/3046192.png",
      "Wigo Party": "https://cdn-icons-png.flaticon.com/512/3046/3046193.png",
      "Yami Star": "https://cdn-icons-png.flaticon.com/512/3046/3046194.png",
      "Fofo Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046195.png",
      "Bota Live": "https://cdn-icons-png.flaticon.com/512/3046/3046196.png",
      "Quai Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046197.png",
      "Mico Live": "https://cdn-icons-png.flaticon.com/512/3046/3046198.png",
      "Dito Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046199.png",
      "Suyo Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046200.png",
      "IMO": "https://cdn-icons-png.flaticon.com/512/3046/3046201.png",
      "Sahra Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046202.png",
      "Bawa Live": "https://cdn-icons-png.flaticon.com/512/3046/3046203.png",
      "Janko": "https://cdn-icons-png.flaticon.com/512/3046/3046204.png",
      "Kismet Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046205.png",
      "Saya Like": "https://cdn-icons-png.flaticon.com/512/3046/3046206.png",
      "Dana": "https://cdn-icons-png.flaticon.com/512/3046/3046207.png",
      "Nawa Live": "https://cdn-icons-png.flaticon.com/512/3046/3046208.png",
      "Fufa Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046209.png",
      "Sama Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046210.png",
      "Halo Star": "https://cdn-icons-png.flaticon.com/512/3046/3046211.png",
      "Me You": "https://cdn-icons-png.flaticon.com/512/3046/3046212.png",
      "Like Saya": "https://cdn-icons-png.flaticon.com/512/3046/3046213.png",
      "Hayuki Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046214.png",
      "Fun Up": "https://cdn-icons-png.flaticon.com/512/3046/3046215.png",
      "Joyo Live": "https://cdn-icons-png.flaticon.com/512/3046/3046216.png",
      "Kitty Live": "https://cdn-icons-png.flaticon.com/512/3046/3046217.png",
      "Sala Live": "https://cdn-icons-png.flaticon.com/512/3046/3046218.png",
      "Hami Party": "https://cdn-icons-png.flaticon.com/512/3046/3046219.png",
      "RoStar": "https://cdn-icons-png.flaticon.com/512/3046/3046220.png",
      "Super Live": "https://cdn-icons-png.flaticon.com/512/3046/3046221.png",
      "Marhaba Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046222.png",
      "Fancy Live": "https://cdn-icons-png.flaticon.com/512/3046/3046223.png",
      "Hi Party": "https://cdn-icons-png.flaticon.com/512/3046/3046224.png",
      "Matha Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046225.png",
      "Star Maker": "https://cdn-icons-png.flaticon.com/512/3046/3046226.png",
      "Karwan Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046227.png",
      "Layam": "https://cdn-icons-png.flaticon.com/512/3046/3046228.png",
      "Mango Live": "https://cdn-icons-png.flaticon.com/512/3046/3046229.png",
      "Yalla Live": "https://cdn-icons-png.flaticon.com/512/3046/3046230.png",
      "7 Star": "https://cdn-icons-png.flaticon.com/512/3046/3046231.png",
      "Sherb Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046232.png",
      "Oba Live": "https://cdn-icons-png.flaticon.com/512/3046/3046233.png",
      "Bobo Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046234.png",
      "Saba Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046235.png",
      "Tamil": "https://cdn-icons-png.flaticon.com/512/3046/3046236.png",
      "Live You": "https://cdn-icons-png.flaticon.com/512/3046/3046237.png",
      "Mix You": "https://cdn-icons-png.flaticon.com/512/3046/3046238.png",
      "Sheila Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046239.png",
      "Alo Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046240.png",
      "Salam Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046241.png",
      "Sparty Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046242.png",
      "Hua Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046243.png",
      "Ab Live": "https://cdn-icons-png.flaticon.com/512/3046/3046244.png",
      "Lions Chat": "https://cdn-icons-png.flaticon.com/512/3046/3046245.png",
      "IPTV": "https://cdn-icons-png.flaticon.com/512/3046/3046246.png"
    };
    
    return fallbackIcons[appName] || "https://cdn-icons-png.flaticon.com/512/3046/3046127.png";
  }

  /**
   * @method _createSearchBar
   * @description إنشاء شريط البحث
   * @returns {HTMLElement}
   * @private
   */
  _createSearchBar() {
    const searchContainer = document.createElement('div');
    searchContainer.className = 'search-container';
    
    const searchBar = document.createElement('input');
    searchBar.type = 'text';
    searchBar.placeholder = 'ابحث عن تطبيق...';
    searchBar.className = 'search-bar';
    searchBar.addEventListener('input', (e) => this._filterApps(e.target.value));
    
    searchContainer.appendChild(searchBar);
    return searchContainer;
  }

  /**
   * @method _filterApps
   * @description تصفية التطبيقات حسب نص البحث
   * @param {string} searchTerm
   * @private
   */
  _filterApps(searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    this.filteredApps = term === '' 
      ? [...this.options.appsData] 
      : this.options.appsData.filter(app => 
          app.name.toLowerCase().includes(term) || 
          (app.packageName && app.packageName.toLowerCase().includes(term))
        );
    
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
   * @description إنشاء بطاقة تطبيق بتأثيرات 3D
   * @param {Object} app - بيانات التطبيق
   * @returns {HTMLElement} عنصر بطاقة التطبيق
   * @private
   */
  _createAppCard(app) {
    const card = document.createElement('div');
    card.className = 'app-card';
    card.dataset.appId = app.id;
    card.title = app.name;
    
    // إعداد تأثيرات 3D
    card.style.transformStyle = 'preserve-3d';
    card.style.transition = 'transform 0.5s ease, box-shadow 0.3s ease';
    card.style.boxShadow = '0 10px 20px rgba(0,0,0,0.2)';
    
    card.innerHTML = `
      <div class="app-icon-container">
        <img src="${app.icon}" 
             class="app-icon" 
             alt="${app.name}"
             loading="lazy"
             onerror="this.src='${this._getFallbackIcon(app.name)}'">
      </div>
      <div class="app-name">${app.name}</div>
      <div class="app-footer">$${app.price}</div>
      <div class="app-logo">
        <img src="${this.options.logoUrl}" alt="Logo" onerror="this.style.display='none'">
      </div>
    `;
    
    // إضافة تأثيرات التحويم 3D
    this._setup3DHoverEffects(card);
    card.addEventListener('click', () => this._showDialog(app));
    return card;
  }

  /**
   * @method _setup3DHoverEffects
   * @description إعداد تأثيرات التحويم ثلاثية الأبعاد
   * @param {HTMLElement} card - عنصر بطاقة التطبيق
   * @private
   */
  _setup3DHoverEffects(card) {
    card.addEventListener('mousemove', (e) => {
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
    
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale(1)';
      card.style.boxShadow = '0 10px 20px rgba(0,0,0,0.2)';
    });
  }

  /**
   * @method _showDialog
   * @description عرض مربع حوار تفاصيل التطبيق
   * @param {Object} app
   * @private
   */
  _showDialog(app) {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    
    const dialog = document.createElement('div');
    dialog.className = 'dialog-content';
    dialog.style.backgroundColor = this.options.dialogBgColor;
    
    dialog.innerHTML = `
      <div class="dialog-header">
        <img src="${app.icon}" class="dialog-icon" alt="${app.name}" 
             onerror="this.src='${this._getFallbackIcon(app.name)}'">
        <div class="dialog-title">${app.name}</div>
      </div>
      <div class="dialog-body">
        <p>سعر التطبيق: $${app.price}</p>
        <div class="quantity-selector">
          <button class="quantity-btn minus">-</button>
          <input type="number" class="quantity-input" value="1" min="1" max="10">
          <button class="quantity-btn plus">+</button>
        </div>
      </div>
      <div class="dialog-footer">
        <button class="dialog-btn dialog-btn-secondary">إلغاء</button>
        <button class="dialog-btn dialog-btn-primary" style="background-color: ${this.options.themeColor}">شراء</button>
      </div>
    `;
    
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    
    // إضافة معالجات الأحداث
    const minusBtn = dialog.querySelector('.minus');
    const plusBtn = dialog.querySelector('.plus');
    const quantityInput = dialog.querySelector('.quantity-input');
    const cancelBtn = dialog.querySelector('.dialog-btn-secondary');
    const buyBtn = dialog.querySelector('.dialog-btn-primary');
    
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
  }

  /**
   * @method _processOrder
   * @description معالجة طلب الشراء
   * @param {Object} app
   * @param {number} quantity
   * @private
   */
  _processOrder(app, quantity) {
    console.log(`تم طلب ${quantity} من تطبيق ${app.name} بسعر إجمالي $${(app.price * quantity).toFixed(2)}`);
    // هنا يمكنك إضافة منطق إرسال الطلب إلى السيرفر
  }

  /**
   * @method renderAppsGrid
   * @description تصيير شبكة التطبيقات
   * @private
   */
  renderAppsGrid() {
    const startIdx = (this.currentPage - 1) * this.appsPerPage;
    const endIdx = startIdx + this.appsPerPage;
    const appsToShow = this.filteredApps.slice(startIdx, endIdx);
    
    const appsGrid = document.createElement('div');
    appsGrid.className = 'apps-grid';
    
    appsToShow.forEach(app => {
      appsGrid.appendChild(this._createAppCard(app));
    });
    
    // تحديث الشبكة فقط إذا كانت موجودة
    const existingGrid = this.container.querySelector('.apps-grid');
    if (existingGrid) {
      this.container.replaceChild(appsGrid, existingGrid);
    } else {
      this.container.appendChild(appsGrid);
    }
  }

  /**
   * @method render
   * @description تصيير المكون الرئيسي
   * @public
   */
  render() {
    this.container.innerHTML = '';
    this.container.className = 'apps-tab-container';
    
    this.container.appendChild(this._createSearchBar());
    this.renderAppsGrid();
  }

  /**
   * @method destroy
   * @description تنظيف الموارد والمؤقتات
   * @public
   */
  destroy() {
    if (this.iconRefreshTimer) {
      clearInterval(this.iconRefreshTimer);
    }
    this._hideLoading();
    this.container.innerHTML = '';
  }
}

if (typeof window !== 'undefined') {
  window.AppsTab = AppsTab;
}

export { AppsTab };