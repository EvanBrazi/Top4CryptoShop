/**
 * @file appmanager.js
 * @class AppManager
 * @description المدير الرئيسي للتطبيق - مسؤول عن تهيئة التطبيق، تحميل البيانات، وإدارة التبويبات
 * @version 3.0.0
 * @license MIT
 */

import { HomeTab } from "./tabs/hometab.js";
import { AppsTab } from "./tabs/appstab.js";
import ApiService from './services/apiService.js';

export class AppManager {
  /**
   * @constructor
   * @param {Object} taberInstance - نسخة من نظام التبويبات
   * @param {Object} [config={}] - إعدادات التهيئة
   * @param {string} [config.apiBaseUrl=''] - رابط API الأساسي
   * @param {Object} [config.cacheOptions] - خيارات التخزين المؤقت
   */
  constructor(taberInstance, config = {}) {
    this.taber = taberInstance;
    this.api = new ApiService(config.apiBaseUrl, {
      cacheDuration: config.cacheOptions?.duration || 7,
      maxConcurrentRequests: config.cacheOptions?.maxConcurrent || 5
    });
    
    this.tabs = {};
    this.initState = {
      loaded: false,
      error: null
    };

    this._init();
  }

  /**
   * @private
   * @method _init
   * @description تهيئة التطبيق الرئيسية
   */
  async _init() {
    try {
      await this._setupTabs();
      this._setupEventListeners();
      await this._preloadEssentialData();
      this.initState.loaded = true;
    } catch (error) {
      this.initState.error = error;
      console.error('فشل تهيئة التطبيق:', error);
      this._showFatalError();
    }
  }

  /**
   * @private
   * @method _setupTabs
   * @description تهيئة تبويبات التطبيق
   */
  async _setupTabs() {
    this.tabs.home = new HomeTab({
      taber: this.taber,
      containerId: 'home-tab-cards-container',
      options: {
        apiEndpoint: '/api/cards',
        iconBasePath: '/icons/apps/',
        themeColor: '#6a5acd'
      }
    });

    await this._initAppsTab();
  }

  /**
   * @private
   * @method _initAppsTab
   * @description تهيئة تبويب التطبيقات
   */
  async _initAppsTab() {
    const [appsData, iconsList] = await Promise.all([
      this.api.fetchData('/api/apps', 'appsData').then(this._transformAppsData),
      this.api.fetchData('/api/icons-list', 'iconsList').then(res => res.icons || [])
    ]);

    this.tabs.apps = new AppsTab({
      containerId: 'apps-tab-container',
      options: {
        appsData,
        iconsBasePath: '/icons/apps/',
        iconsList,
        themeColor: '#6a5acd',
        dialogBgColor: '#ffffff',
        cacheStrategy: 'lazy' // 'eager' أو 'lazy'
      }
    });
  }

  /**
   * @private
   * @method _transformAppsData
   * @description تحويل وتنظيف بيانات التطبيقات
   * @param {Array} rawData - البيانات الخام
   * @returns {Array} - البيانات المنسقة
   */
  _transformAppsData(rawData) {
    if (!Array.isArray(rawData)) return [];
    
    return rawData.map(app => ({
      id: Number.isInteger(app.id) ? app.id : Date.now(),
      name: typeof app.name === 'string' ? app.name.trim() : 'بدون اسم',
      icon: this._validateIcon(app.icon),
      category: typeof app.category === 'string' ? app.category.trim() : 'غير مصنف',
      price: this._parsePrice(app.price),
      available: Boolean(app.available)
    }));
  }

  /**
   * @private
   * @method _validateIcon
   * @description التحقق من صلاحية أيقونة التطبيق
   * @param {string} filename - اسم ملف الأيقونة
   * @returns {string} - مسار الأيقونة الصالح
   */
  _validateIcon(filename) {
    if (typeof filename !== 'string') return 'default.png';
    const allowedExtensions = /\.(png|jpg|jpeg|svg|webp)$/i;
    return allowedExtensions.test(filename) ? filename : 'default.png';
  }

  /**
   * @private
   * @method _parsePrice
   * @description تحويل السعر إلى رقم
   * @param {any} price - قيمة السعر
   * @returns {number|null} - السعر كرقم
   */
  _parsePrice(price) {
    const parsed = parseFloat(price);
    return isNaN(parsed) ? null : Math.max(0, parsed);
  }

  /**
   * @private
   * @method _preloadEssentialData
   * @description تحميل مسبق للبيانات الأساسية
   */
  async _preloadEssentialData() {
    await Promise.all([
      this.api.fetchData('/api/essential', 'essentialData'),
      caches.open('essential-assets')
        .then(cache => cache.addAll([
          '/icons/apps/default.png',
          '/assets/images/loading.gif'
        ]))
    ]);
  }

  /**
   * @private
   * @method _setupEventListeners
   * @description إعداد مستمعي الأحداث
   */
  _setupEventListeners() {
    // أحداث التبويبات
    this.taber.onTabChange((tabId) => {
      this._handleTabChange(tabId);
    });

    // أحداث الزر الرجوع
    document.getElementById('back-btn')?.addEventListener('click', () => {
      this.taber.switchTab('home');
    });

    // أحداث تحديث البيانات
    document.addEventListener('refreshData', () => {
      this._refreshAppData();
    });
  }

  /**
   * @private
   * @method _handleTabChange
   * @description إدارة تغيير التبويبات
   * @param {string} tabId - معرّف التبويب
   */
  _handleTabChange(tabId) {
    document.querySelector('.sidebar')?.classList.remove('active');
    document.querySelector('.overlay')?.classList.remove('active');
    
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
      backBtn.style.display = tabId === 'home' ? 'none' : 'block';
    }
  }

  /**
   * @private
   * @method _refreshAppData
   * @description إعادة تحميل بيانات التطبيقات
   */
  async _refreshAppData() {
    try {
      await this.api.refreshData('/api/apps', 'appsData');
      await this._initAppsTab();
    } catch (error) {
      console.error('فشل تحديث البيانات:', error);
    }
  }

  /**
   * @private
   * @method _showFatalError
   * @description عرض رسالة خطأ فادح
   */
  _showFatalError() {
    const container = document.getElementById('app-container');
    if (container) {
      container.innerHTML = `
        <div class="fatal-error">
          <h2>حدث خطأ جسيم</h2>
          <p>${this.initState.error?.message || 'تعذر تحميل التطبيق'}</p>
          <button id="retry-btn">إعادة المحاولة</button>
        </div>
      `;
      
      document.getElementById('retry-btn')?.addEventListener('click', () => {
        window.location.reload();
      });
    }
  }

  /**
   * @method destroy
   * @description تنظيف الموارد عند تدمير التطبيق
   */
  destroy() {
    Object.values(this.tabs).forEach(tab => tab.destroy?.());
    this.api.clearCache();
    window.removeEventListener('refreshData', this._refreshAppData);
  }
}

// تصدير الدوال المساعدة
export function transformAppsData(rawData) {
  return new AppManager()._transformAppsData(rawData);
}

export function isValidImage(filename) {
  return new AppManager()._validateIcon(filename) !== 'default.png';
}
