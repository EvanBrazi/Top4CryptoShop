/**
 * @file appstab.js
 * @class AppsTab
 * @description كلاس متكامل لإنشاء وإدارة تبويب تطبيقات الدردشة مع دعم الأيقونات الحقيقية والتحديث التلقائي
 * @version 2.0
 */

class AppsTab {
  /**
   * @constructor
   * @param {Object} config - كائن التهيئة
   * @param {Object} config.taber - Instance من Taber
   * @param {string} config.containerId - ID العنصر الحاوي
   * @param {Object} config.options - خيارات إضافية
   * @param {string} [config.options.themeColor='#6a5acd'] - لون الثيم الرئيسي
   * @param {string} [config.options.dialogBgColor='#ffffff'] - لون خلفية مربع الحوار
   * @param {Array} [config.options.appsData] - بيانات التطبيقات (اختياري)
   * @param {number} [config.options.iconRefreshInterval=3600000] - فترة تحديث الأيقونات (ميلي ثانية)
   */
  constructor({ taber, containerId, options = {} }) {
    this.taber = taber;
    this.container = document.getElementById(containerId);
    this.currentPage = 1;
    this.appsPerPage = 20;
    this.filteredApps = [];
    this.iconRefreshInterval = options.iconRefreshInterval || 3600000; // ساعة واحدة افتراضياً
    
    this.options = {
      themeColor: options.themeColor || '#6a5acd',
      dialogBgColor: options.dialogBgColor || '#ffffff',
      appsData: options.appsData || this._defaultAppsData()
    };
    
    this._init();
  }

  /**
   * @method _init
   * @description تهيئة المكون
   * @private
   */
  async _init() {
    this._loadCSS();
    await this._loadIcons();
    this.render();
    this._setupIconRefresh();
  }

  /**
   * @method _setupIconRefresh
   * @description إعداد التحديث الدوري للأيقونات
   * @private
   */
  _setupIconRefresh() {
    this.iconRefreshTimer = setInterval(async () => {
      await this._loadIcons(true); // تحديث بدون إعادة تحميل الصفحة
      this.renderAppsGrid();
    }, this.iconRefreshInterval);
  }

  /**
   * @method _loadCSS
   * @description تحميل ملف الأنماط الرئيسي
   * @private
   */
  _loadCSS() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'apps-card.css';
    document.head.appendChild(link);
    
    const style = document.createElement('style');
    style.textContent = `:root { --theme-color: ${this.options.themeColor} }`;
    document.head.appendChild(style);
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
      { id: 2, name: "اهلا شات", packageName: "com.ahlan.chat", icon: null, price: "3.99" },
      { id: 3, name: "سول شيل", packageName: "com.soul.shell", icon: null, price: "5.99" },
      { id: 4, name: "يوهو شات", packageName: "com.yoho.chat", icon: null, price: "4.49" },
      { id: 5, name: "لايكي", packageName: "com.likee.video", icon: null, price: "3.99" },
      { id: 6, name: "تالك تالك", packageName: "com.talk.talk", icon: null, price: "4.99" },
      { id: 7, name: "بيغو لايف", packageName: "com.bigo.live", icon: null, price: "5.99" },
      { id: 8, name: "بارتي ستار", packageName: "com.party.star", icon: null, price: "6.99" },
      { id: 9, name: "هيا سات", packageName: "com.haya.sat", icon: null, price: "4.49" },
      { id: 10, name: "بوبوو لايف", packageName: "com.boboo.live", icon: null, price: "5.49" },
      { id: 11, name: "فورفان", packageName: "com.fourfun.app", icon: null, price: "3.99" },
      { id: 12, name: "زينا لايف", packageName: "com.zina.live", icon: null, price: "5.99" },
      { id: 13, name: "فور فان", packageName: "com.forfun.app", icon: null, price: "4.49" },
      { id: 14, name: "سوغو شات", packageName: "com.sugo.chat", icon: null, price: "3.99" },
      { id: 15, name: "ياهلا شات", packageName: "com.yahlan.chat", icon: null, price: "4.99" },
      { id: 16, name: "ميجو لايف", packageName: "com.mego.live", icon: null, price: "5.99" },
      { id: 17, name: "كوكو لايف", packageName: "com.coco.live", icon: null, price: "4.99" },
      { id: 18, name: "هابي", packageName: "com.happy.app", icon: null, price: "3.99" },
      { id: 19, name: "هوني جار", packageName: "com.honey.jar", icon: null, price: "4.49" },
      { id: 20, name: "هاي يو", packageName: "com.hi.you", icon: null, price: "3.99" },
      { id: 21, name: "ديمو شات", packageName: "com.demo.chat", icon: null, price: "4.99" },
      { id: 22, name: "ليلى شات", packageName: "com.layla.chat", icon: null, price: "5.49" },
      { id: 23, name: "تامي شات", packageName: "com.tami.chat", icon: null, price: "3.99" },
      { id: 24, name: "واهو شات", packageName: "com.wahoo.chat", icon: null, price: "4.99" },
      { id: 25, name: "ايومي شات", packageName: "com.ayumi.chat", icon: null, price: "5.99" },
      { id: 26, name: "حكي شات", packageName: "com.haki.chat", icon: null, price: "3.49" },
      { id: 27, name: "يويو شات", packageName: "com.yoyo.chat", icon: null, price: "4.99" },
      { id: 28, name: "اوهلا شات", packageName: "com.ohla.chat", icon: null, price: "5.49" },
      { id: 29, name: "ليغو لايف", packageName: "com.lego.live", icon: null, price: "6.99" },
      { id: 30, name: "لاما شات", packageName: "com.lama.chat", icon: null, price: "4.49" },
      { id: 31, name: "ازال لايف", packageName: "com.azal.live", icon: null, price: "5.99" },
      { id: 32, name: "بيلا شات", packageName: "com.bella.chat", icon: null, price: "3.99" },
      { id: 33, name: "بينمو شات", packageName: "com.binmo.chat", icon: null, price: "4.99" },
      { id: 34, name: "لامي شات", packageName: "com.lami.chat", icon: null, price: "5.49" },
      { id: 35, name: "لايت شات", packageName: "com.lite.chat", icon: null, price: "3.99" },
      { id: 36, name: "هابي شات", packageName: "com.happy.chat", icon: null, price: "4.99" },
      { id: 37, name: "تاكا شات", packageName: "com.taka.chat", icon: null, price: "5.99" },
      { id: 38, name: "واوو", packageName: "com.wawu.app", icon: null, price: "3.49" },
      { id: 39, name: "هيغو شات", packageName: "com.higo.chat", icon: null, price: "4.99" },
      { id: 40, name: "وياك شات", packageName: "com.wayak.chat", icon: null, price: "5.49" },
      { id: 41, name: "كيو لايف", packageName: "com.q.live", icon: null, price: "6.99" },
      { id: 42, name: "لييت شات", packageName: "com.leet.chat", icon: null, price: "4.49" },
      { id: 43, name: "هوبي شات", packageName: "com.hoby.chat", icon: null, price: "3.99" },
      { id: 44, name: "جيمي لايف", packageName: "com.jimmy.live", icon: null, price: "5.99" },
      { id: 45, name: "اولاميت شات", packageName: "com.olamet.chat", icon: null, price: "4.99" },
      { id: 46, name: "سعادة شات", packageName: "com.saada.chat", icon: null, price: "3.99" },
      { id: 47, name: "عمار شات", packageName: "com.ammar.chat", icon: null, price: "4.49" },
      { id: 48, name: "واكي ستار", packageName: "com.waki.star", icon: null, price: "5.99" },
      { id: 49, name: "سو ماتش", packageName: "com.so.match", icon: null, price: "3.99" },
      { id: 50, name: "يووي شات", packageName: "com.uwi.chat", icon: null, price: "4.99" },
      { id: 51, name: "سول شات", packageName: "com.soul.chat", icon: null, price: "5.49" },
      { id: 52, name: "تانغو تادا شات", packageName: "com.tango.tada", icon: null, price: "6.99" },
      { id: 53, name: "لاكي شات", packageName: "com.lucky.chat", icon: null, price: "4.49" },
      { id: 54, name: "اب فن", packageName: "com.ab.fun", icon: null, price: "3.99" },
      { id: 55, name: "توب توب", packageName: "com.top.top", icon: null, price: "4.99" },
      { id: 56, name: "توب فويس", packageName: "com.top.voice", icon: null, price: "5.99" },
      { id: 57, name: "آمو شات", packageName: "com.amu.chat", icon: null, price: "3.99" },
      { id: 58, name: "بارتي هيرو", packageName: "com.party.hero", icon: null, price: "6.49" },
      { id: 59, name: "مجلس", packageName: "com.majlis.app", icon: null, price: "4.99" },
      { id: 60, name: "اشا لايف", packageName: "com.asha.live", icon: null, price: "5.99" },
      { id: 61, name: "شاميت لايف", packageName: "com.shameet.live", icon: null, price: "4.49" },
      { id: 62, name: "هوكا شات", packageName: "com.hoka.chat", icon: null, price: "3.99" },
      { id: 63, name: "هلا مي", packageName: "com.hala.me", icon: null, price: "4.99" },
      { id: 64, name: "صدفة شات", packageName: "com.sodfa.chat", icon: null, price: "5.49" },
      { id: 65, name: "نبض شات", packageName: "com.nabd.chat", icon: null, price: "3.99" },
      { id: 66, name: "سول ستار", packageName: "com.soul.star", icon: null, price: "6.99" },
      { id: 67, name: "مولي ستار", packageName: "com.moly.star", icon: null, price: "4.49" },
      { id: 68, name: "ويغو بارتي", packageName: "com.wigo.party", icon: null, price: "5.99" },
      { id: 69, name: "يامي ستار", packageName: "com.yami.star", icon: null, price: "4.99" },
      { id: 70, name: "فوفو شات", packageName: "com.fofo.chat", icon: null, price: "3.99" },
      { id: 71, name: "بوتا لايف", packageName: "com.bota.live", icon: null, price: "5.49" },
      { id: 72, name: "كواي شات", packageName: "com.quai.chat", icon: null, price: "4.99" },
      { id: 73, name: "ميكو لايف", packageName: "com.mico.live", icon: null, price: "6.99" },
      { id: 74, name: "ديتو شات", packageName: "com.dito.chat", icon: null, price: "3.99" },
      { id: 75, name: "سويو شات", packageName: "com.suyo.chat", icon: null, price: "4.49" },
      { id: 76, name: "ايمو", packageName: "com.imo.app", icon: null, price: "5.99" },
      { id: 77, name: "سهرة شات", packageName: "com.sahra.chat", icon: null, price: "3.99" },
      { id: 78, name: "باوا لايف", packageName: "com.bawa.live", icon: null, price: "4.99" },
      { id: 79, name: "جانكو", packageName: "com.janko.app", icon: null, price: "5.49" },
      { id: 80, name: "كيسميت شات", packageName: "com.kismet.chat", icon: null, price: "6.99" },
      { id: 81, name: "سايا لايكي", packageName: "com.saya.like", icon: null, price: "4.49" },
      { id: 82, name: "دانا", packageName: "com.dana.app", icon: null, price: "3.99" },
      { id: 83, name: "ناوا لايف", packageName: "com.nawa.live", icon: null, price: "5.99" },
      { id: 84, name: "فوفا شات", packageName: "com.fufa.chat", icon: null, price: "4.99" },
      { id: 85, name: "سما شات", packageName: "com.sama.chat", icon: null, price: "3.99" },
      { id: 86, name: "هالو ستار", packageName: "com.halo.star", icon: null, price: "5.49" },
      { id: 87, name: "مي يو", packageName: "com.me.you", icon: null, price: "6.99" },
      { id: 88, name: "لايكي سايا", packageName: "com.like.saya", icon: null, price: "4.49" },
      { id: 89, name: "هايوكي شات", packageName: "com.hayuki.chat", icon: null, price: "3.99" },
      { id: 90, name: "فن اب", packageName: "com.fun.up", icon: null, price: "5.99" },
      { id: 91, name: "جويو لايف", packageName: "com.joyo.live", icon: null, price: "4.99" },
      { id: 92, name: "كيتي لايف", packageName: "com.kitty.live", icon: null, price: "3.99" },
      { id: 93, name: "سالا لايف", packageName: "com.sala.live", icon: null, price: "5.49" },
      { id: 94, name: "هامي بارتي", packageName: "com.hami.party", icon: null, price: "6.99" },
      { id: 95, name: "روستار", packageName: "com.ro.star", icon: null, price: "4.49" },
      { id: 96, name: "سوبر لايف", packageName: "com.super.live", icon: null, price: "5.99" },
      { id: 97, name: "مرحبا شات", packageName: "com.marhaba.chat", icon: null, price: "3.99" },
      { id: 98, name: "فانسي لايف", packageName: "com.fancy.live", icon: null, price: "4.99" },
      { id: 99, name: "هاي بارتي", packageName: "com.hi.party", icon: null, price: "5.49" },
      { id: 100, name: "ماذا شات", packageName: "com.matha.chat", icon: null, price: "6.99" },
      { id: 101, name: "ستار ميكر", packageName: "com.star.maker", icon: null, price: "4.49" },
      { id: 102, name: "كروان شات", packageName: "com.karwan.chat", icon: null, price: "3.99" },
      { id: 103, name: "لايام", packageName: "com.layam.app", icon: null, price: "5.99" },
      { id: 104, name: "مانغو لايف", packageName: "com.mango.live", icon: null, price: "4.99" },
      { id: 105, name: "يالا لايف", packageName: "com.yalla.live", icon: null, price: "3.99" },
      { id: 106, name: "7 ستار", packageName: "com.seven.star", icon: null, price: "5.49" },
      { id: 107, name: "شيرب شات", packageName: "com.sherb.chat", icon: null, price: "6.99" },
      { id: 108, name: "اوبا لايف", packageName: "com.oba.live", icon: null, price: "4.49" },
      { id: 109, name: "بوبو شات", packageName: "com.bobo.chat", icon: null, price: "3.99" },
      { id: 110, name: "صبا شات", packageName: "com.saba.chat", icon: null, price: "5.99" },
      { id: 111, name: "تاميل", packageName: "com.tamil.app", icon: null, price: "4.99" },
      { id: 112, name: "لايف يو", packageName: "com.live.you", icon: null, price: "3.99" },
      { id: 113, name: "ميكس يو", packageName: "com.mix.you", icon: null, price: "5.49" },
      { id: 114, name: "شيلا شات", packageName: "com.sheila.chat", icon: null, price: "6.99" },
      { id: 115, name: "الووو شات", packageName: "com.alo.chat", icon: null, price: "4.49" },
      { id: 116, name: "سلام شات", packageName: "com.salam.chat", icon: null, price: "3.99" },
      { id: 117, name: "سبارتي شات", packageName: "com.sparty.chat", icon: null, price: "5.99" },
      { id: 118, name: "هوا شات", packageName: "com.hua.chat", icon: null, price: "4.99" },
      { id: 119, name: "اب لايف", packageName: "com.ab.live", icon: null, price: "3.99" },
      { id: 120, name: "ليونس شات", packageName: "com.lions.chat", icon: null, price: "5.49" },
      { id: 121, name: "ايبي تي في", packageName: "com.iptv.app", icon: null, price: "6.99" }
    ];
  }

  /**
   * @method _loadIcons
   * @description جلب الأيقونات من API السيرفر
   * @param {boolean} [silent=false] - إذا كان true لا يعرض رسائل الخطأ
   * @returns {Promise<void>}
   * @private
   */
  async _loadIcons(silent = false) {
    try {
      const response = await fetch('/api/apps/icons', {
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
          timestamp: Date.now() // إضافة طابع زمني لتجنب التخزين المؤقت
        })
      });
      
      if (!response.ok) throw new Error('فشل جلب الأيقونات');
      
      const iconsData = await response.json();
      
      // تعبئة حقل icon في بيانات التطبيقات مع التحقق من وجود الرابط
      this.options.appsData.forEach(app => {
        const iconInfo = iconsData.find(i => i.appId === app.id);
        if (iconInfo?.url && this._isValidUrl(iconInfo.url)) {
          app.icon = iconInfo.url;
        } else {
          app.icon = this._getFallbackIcon(app.name);
        }
      });
      
    } catch (error) {
      if (!silent) {
        console.error('فشل جلب الأيقونات:', error);
      }
      // استخدام أيقونات افتراضية في حالة الخطأ
      this.options.appsData.forEach(app => {
        app.icon = this._getFallbackIcon(app.name);
      });
    }
  }

  /**
   * @method _isValidUrl
   * @description التحقق من صحة رابط الصورة
   * @param {string} url
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
   * @method _getFallbackIcon
   * @description أيقونة افتراضية عند فشل الجلب
   * @param {string} appName
   * @returns {string}
   * @private
   */
  _getFallbackIcon(appName) {
    const fallbackIcons = {
      "متجر الارقام": "https://cdn-icons-png.flaticon.com/512/3046/3046127.png",
      "اهلا شات": "https://cdn-icons-png.flaticon.com/512/3046/3046128.png",
      "سول شيل": "https://cdn-icons-png.flaticon.com/512/3046/3046129.png",
      "يوهو شات": "https://cdn-icons-png.flaticon.com/512/3046/3046130.png",
      "لايكي": "https://cdn-icons-png.flaticon.com/512/3046/3046131.png",
      "تالك تالك": "https://cdn-icons-png.flaticon.com/512/3046/3046132.png",
      "بيغو لايف": "https://cdn-icons-png.flaticon.com/512/3046/3046133.png",
      "بارتي ستار": "https://cdn-icons-png.flaticon.com/512/3046/3046134.png",
      "هيا سات": "https://cdn-icons-png.flaticon.com/512/3046/3046135.png",
      "بوبوو لايف": "https://cdn-icons-png.flaticon.com/512/3046/3046136.png",
      "فورفان": "https://cdn-icons-png.flaticon.com/512/3046/3046137.png",
      "زينا لايف": "https://cdn-icons-png.flaticon.com/512/3046/3046138.png",
      "سوغو شات": "https://cdn-icons-png.flaticon.com/512/3046/3046139.png",
      "ياهلا شات": "https://cdn-icons-png.flaticon.com/512/3046/3046140.png",
      "ميجو لايف": "https://cdn-icons-png.flaticon.com/512/3046/3046141.png",
      "كوكو لايف": "https://cdn-icons-png.flaticon.com/512/3046/3046142.png",
      "هابي": "https://cdn-icons-png.flaticon.com/512/3046/3046143.png",
      "هوني جار": "https://cdn-icons-png.flaticon.com/512/3046/3046144.png",
      "هاي يو": "https://cdn-icons-png.flaticon.com/512/3046/3046145.png",
      "ديمو شات": "https://cdn-icons-png.flaticon.com/512/3046/3046146.png",
      "ليلى شات": "https://cdn-icons-png.flaticon.com/512/3046/3046147.png",
      "تامي شات": "https://cdn-icons-png.flaticon.com/512/3046/3046148.png",
      "واهو شات": "https://cdn-icons-png.flaticon.com/512/3046/3046149.png",
      "ايومي شات": "https://cdn-icons-png.flaticon.com/512/3046/3046150.png",
      "حكي شات": "https://cdn-icons-png.flaticon.com/512/3046/3046151.png",
      "يويو شات": "https://cdn-icons-png.flaticon.com/512/3046/3046152.png",
      "اوهلا شات": "https://cdn-icons-png.flaticon.com/512/3046/3046153.png",
      "ليغو لايف": "https://cdn-icons-png.flaticon.com/512/3046/3046154.png",
      "لاما شات": "https://cdn-icons-png.flaticon.com/512/3046/3046155.png",
      "ازال لايف": "https://cdn-icons-png.flaticon.com/512/3046/3046156.png",
      "بيلا شات": "https://cdn-icons-png.flaticon.com/512/3046/3046157.png",
      "بينمو شات": "https://cdn-icons-png.flaticon.com/512/3046/3046158.png",
      "لامي شات": "https://cdn-icons-png.flaticon.com/512/3046/3046159.png",
      "لايت شات": "https://cdn-icons-png.flaticon.com/512/3046/3046160.png",
      "هابي شات": "https://cdn-icons-png.flaticon.com/512/3046/3046161.png",
      "تاكا شات": "https://cdn-icons-png.flaticon.com/512/3046/3046162.png",
      "واوو": "https://cdn-icons-png.flaticon.com/512/3046/3046163.png",
      "هيغو شات": "https://cdn-icons-png.flaticon.com/512/3046/3046164.png",
      "وياك شات": "https://cdn-icons-png.flaticon.com/512/3046/3046165.png",
      "كيو لايف": "https://cdn-icons-png.flaticon.com/512/3046/3046166.png",
      "لييت شات": "https://cdn-icons-png.flaticon.com/512/3046/3046167.png",
      "هوبي شات": "https://cdn-icons-png.flaticon.com/512/3046/3046168.png",
      "جيمي لايف": "https://cdn-icons-png.flaticon.com/512/3046/3046169.png",
      "اولاميت شات": "https://cdn-icons-png.flaticon.com/512/3046/3046170.png",
      "سعادة شات": "https://cdn-icons-png.flaticon.com/512/3046/3046171.png",
      "عمار شات": "https://cdn-icons-png.flaticon.com/512/3046/3046172.png",
      "واكي ستار": "https://cdn-icons-png.flaticon.com/512/3046/3046173.png",
      "سو ماتش": "https://cdn-icons-png.flaticon.com/512/3046/3046174.png",
      "يووي شات": "https://cdn-icons-png.flaticon.com/512/3046/3046175.png",
      "سول شات": "https://cdn-icons-png.flaticon.com/512/3046/3046176.png",
      "تانغو تادا شات": "https://cdn-icons-png.flaticon.com/512/3046/3046177.png",
      "لاكي شات": "https://cdn-icons-png.flaticon.com/512/3046/3046178.png",
      "اب فن": "https://cdn-icons-png.flaticon.com/512/3046/3046179.png",
      "توب توب": "https://cdn-icons-png.flaticon.com/512/3046/3046180.png",
      "توب فويس": "https://cdn-icons-png.flaticon.com/512/3046/3046181.png",
      "آمو شات": "https://cdn-icons-png.flaticon.com/512/3046/3046182.png",
      "بارتي هيرو": "https://cdn-icons-png.flaticon.com/512/3046/3046183.png",
      "مجلس": "https://cdn-icons-png.flaticon.com/512/3046/3046184.png",
      "اشا لايف": "https://cdn-icons-png.flaticon.com/512/3046/3046185.png",
      "شاميت لايف": "https://cdn-icons-png.flaticon.com/512/3046/3046186.png",
      "هوكا شات": "https://cdn-icons-png.flaticon.com/512/3046/3046187.png",
      "هلا مي": "https://cdn-icons-png.flaticon.com/512/3046/3046188.png",
      "صدفة شات": "https://cdn-icons-png.flaticon.com/512/3046/3046189.png",
      "نبض شات": "https://cdn-icons-png.flaticon.com/512/3046/3046190.png",
      "سول ستار": "https://cdn-icons-png.flaticon.com/512/3046/3046191.png",
      "مولي ستار": "https://cdn-icons-png.flaticon.com/512/3046/3046192.png",
      "ويغو بارتي": "https://cdn-icons-png.flaticon.com/512/3046/3046193.png",
      "يامي ستار": "https://cdn-icons-png.flaticon.com/512/3046/3046194.png",
      "فوفو شات": "https://cdn-icons-png.flaticon.com/512/3046/3046195.png",
      "بوتا لايف": "https://cdn-icons-png.flaticon.com/512/3046/3046196.png",
      "كواي شات": "https://cdn-icons-png.flaticon.com/512/3046/3046197.png",
      "ميكو لايف": "https://cdn-icons-png.flaticon.com/512/3046/3046198.png",
      "ديتو شات": "https://cdn-icons-png.flaticon.com/512/3046/3046199.png",
      "سويو شات": "https://cdn-icons-png.flaticon.com/512/3046/3046200.png",
      "ايمو": "https://cdn-icons-png.flaticon.com/512/3046/3046201.png",
      "سهرة شات": "https://cdn-icons-png.flaticon.com/512/3046/3046202.png",
      "باوا لايف": "https://cdn-icons-png.flaticon.com/512/3046/3046203.png",
      "جانكو": "https://cdn-icons-png.flaticon.com/512/3046/3046204.png",
      "كيسميت شات": "https://cdn-icons-png.flaticon.com/512/3046/3046205.png",
      "سايا لايكي": "https://cdn-icons-png.flaticon.com/512/3046/3046206.png",
      "دانا": "https://cdn-icons-png.flaticon.com/512/3046/3046207.png",
      "ناوا لايف": "https://cdn-icons-png.flaticon.com/512/3046/3046208.png",
      "فوفا شات": "https://cdn-icons-png.flaticon.com/512/3046/3046209.png",
      "سما شات": "https://cdn-icons-png.flaticon.com/512/3046/3046210.png",
      "هالو ستار": "https://cdn-icons-png.flaticon.com/512/3046/3046211.png",
      "مي يو": "https://cdn-icons-png.flaticon.com/512/3046/3046212.png",
      "لايكي سايا": "https://cdn-icons-png.flaticon.com/512/3046/3046213.png",
      "هايوكي شات": "https://cdn-icons-png.flaticon.com/512/3046/3046214.png",
      "فن اب": "https://cdn-icons-png.flaticon.com/512/3046/3046215.png",
      "جويو لايف": "https://cdn-icons-png.flaticon.com/512/3046/3046216.png",
      "كيتي لايف": "https://cdn-icons-png.flaticon.com/512/3046/3046217.png",
      "سالا لايف": "https://cdn-icons-png.flaticon.com/512/3046/3046218.png",
      "هامي بارتي": "https://cdn-icons-png.flaticon.com/512/3046/3046219.png",
      "روستار": "https://cdn-icons-png.flaticon.com/512/3046/3046220.png",
      "سوبر لايف": "https://cdn-icons-png.flaticon.com/512/3046/3046221.png",
      "مرحبا شات": "https://cdn-icons-png.flaticon.com/512/3046/3046222.png",
      "فانسي لايف": "https://cdn-icons-png.flaticon.com/512/3046/3046223.png",
      "هاي بارتي": "https://cdn-icons-png.flaticon.com/512/3046/3046224.png",
      "ماذا شات": "https://cdn-icons-png.flaticon.com/512/3046/3046225.png",
      "ستار ميكر": "https://cdn-icons-png.flaticon.com/512/3046/3046226.png",
      "كروان شات": "https://cdn-icons-png.flaticon.com/512/3046/3046227.png",
      "لايام": "https://cdn-icons-png.flaticon.com/512/3046/3046228.png",
      "مانغو لايف": "https://cdn-icons-png.flaticon.com/512/3046/3046229.png",
      "يالا لايف": "https://cdn-icons-png.flaticon.com/512/3046/3046230.png",
      "7 ستار": "https://cdn-icons-png.flaticon.com/512/3046/3046231.png",
      "شيرب شات": "https://cdn-icons-png.flaticon.com/512/3046/3046232.png",
      "اوبا لايف": "https://cdn-icons-png.flaticon.com/512/3046/3046233.png",
      "بوبو شات": "https://cdn-icons-png.flaticon.com/512/3046/3046234.png",
      "صبا شات": "https://cdn-icons-png.flaticon.com/512/3046/3046235.png",
      "تاميل": "https://cdn-icons-png.flaticon.com/512/3046/3046236.png",
      "لايف يو": "https://cdn-icons-png.flaticon.com/512/3046/3046237.png",
      "ميكس يو": "https://cdn-icons-png.flaticon.com/512/3046/3046238.png",
      "شيلا شات": "https://cdn-icons-png.flaticon.com/512/3046/3046239.png",
      "الووو شات": "https://cdn-icons-png.flaticon.com/512/3046/3046240.png",
      "سلام شات": "https://cdn-icons-png.flaticon.com/512/3046/3046241.png",
      "سبارتي شات": "https://cdn-icons-png.flaticon.com/512/3046/3046242.png",
      "هوا شات": "https://cdn-icons-png.flaticon.com/512/3046/3046243.png",
      "اب لايف": "https://cdn-icons-png.flaticon.com/512/3046/3046244.png",
      "ليونس شات": "https://cdn-icons-png.flaticon.com/512/3046/3046245.png",
      "ايبي تي في": "https://cdn-icons-png.flaticon.com/512/3046/3046246.png"
    };
    
    return fallbackIcons[appName] || "https://cdn-icons-png.flaticon.com/512/3046/3046127.png";
  }

  /**
   * @method _createAppCard
   * @description إنشاء بطاقة تطبيق مع دعم الأيقونات الديناميكية
   * @param {Object} app
   * @returns {HTMLElement}
   * @private
   */
  _createAppCard(app) {
    const card = document.createElement('div');
    card.className = 'app-card';
    card.dataset.appId = app.id;
    card.title = app.name;

    // استخدام عنصر صورة مؤقت للتحقق من صحة الرابط
    const img = new Image();
    img.src = app.icon;
    
    card.innerHTML = `
      <div class="app-icon-container">
        <img src="${img.src}" 
             class="app-icon" 
             alt="${app.name}"
             loading="lazy"
             onerror="this.src='${this._getFallbackIcon(app.name)}'">
      </div>
      <div class="app-name">${app.name}</div>
      <div class="app-footer">$${app.price}</div>
    `;

    card.addEventListener('click', () => this._showDialog(app));
    return card;
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
        <button class="dialog-btn dialog-btn-primary">شراء</button>
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
   * @method _createPagination
   * @description إنشاء عناصر ترقيم الصفحات
   * @returns {HTMLElement}
   * @private
   */
  _createPagination() {
    const totalPages = Math.ceil(this.filteredApps.length / this.appsPerPage);
    if (totalPages <= 1) return document.createElement('div');
    
    const pagination = document.createElement('div');
    pagination.className = 'pagination';
    
    const prevBtn = document.createElement('button');
    prevBtn.className = 'page-btn';
    prevBtn.textContent = 'السابق';
    prevBtn.disabled = this.currentPage === 1;
    prevBtn.addEventListener('click', () => {
      if (this.currentPage > 1) {
        this.currentPage--;
        this.renderAppsGrid();
      }
    });
    
    const nextBtn = document.createElement('button');
    nextBtn.className = 'page-btn';
    nextBtn.textContent = 'التالي';
    nextBtn.disabled = this.currentPage === totalPages;
    nextBtn.addEventListener('click', () => {
      if (this.currentPage < totalPages) {
        this.currentPage++;
        this.renderAppsGrid();
      }
    });
    
    const pageInfo = document.createElement('span');
    pageInfo.textContent = `الصفحة ${this.currentPage} من ${totalPages}`;
    pageInfo.style.margin = '0 10px';
    pageInfo.style.alignSelf = 'center';
    
    pagination.appendChild(prevBtn);
    pagination.appendChild(pageInfo);
    pagination.appendChild(nextBtn);
    
    return pagination;
  }

  /**
   * @method renderAppsGrid
   * @description تصيير شبكة التطبيقات مع الترقيم
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
    
    // تحديث الترقيم
    const existingPagination = this.container.querySelector('.pagination');
    const newPagination = this._createPagination();
    
    if (existingPagination) {
      this.container.replaceChild(newPagination, existingPagination);
    } else {
      this.container.appendChild(newPagination);
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
    clearInterval(this.iconRefreshTimer);
    this.container.innerHTML = '';
  }
}

export { AppsTab };