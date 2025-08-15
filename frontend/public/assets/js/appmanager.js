/**
 * @file appmanager.js
 * @class AppManager
 * @description المدير الرئيسي للتطبيق - مسؤول عن تهيئة التطبيق، تحميل البيانات، وإدارة التبويبات
 * @version 5.0.0
 * @license MIT
 * 
 * التحسينات الرئيسية:
 * - تحسين إدارة الأخطاء والصلابة
 * - إضافة نظام التخزين المؤقت المحسن
 * - تحسين أداء تحميل التبويبات
 * - إضافة التوثيق الشامل
 * - تحسين إدارة الذاكرة
 */

import { HomeTab } from "./tabs/hometab.js";
import { AppsTab } from "./tabs/appstab.js";
import ApiService from './services/apiService.js';
import { _transformAppsData } from './utils/appUtils.js';
import { PurchaseDialog } from './dialogs/purchaseDialog.js';

// ثوابت التطبيق
const DEFAULT_CONFIG = {
  themeColor: '#6a5acd',
  cacheOptions: {
    duration: 7, // أيام
    maxConcurrent: 5
  },
  iconsBasePath: '/icons/apps/',
  defaultIcon: 'default.png'
};

export class AppManager {
  /**
   * @constructor
   * @param {Object} taberInstance - كائن Taber لإدارة التبويبات
   * @param {Object} config - إعدادات التهيئة
   * @param {string} config.apiBaseUrl - رابط API الأساسي
   * @param {Object} config.cacheOptions - خيارات التخزين المؤقت
   * @param {string} config.themeColor - لون الثيم الرئيسي
   */
  constructor(taberInstance, config = {}) {
    // دمج الإعدادات مع القيم الافتراضية
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // تهيئة الخدمات الأساسية
    this.taber = taberInstance;
    this.api = new ApiService(this.config.apiBaseUrl, {
      cacheDuration: this.config.cacheOptions.duration,
      maxConcurrentRequests: this.config.cacheOptions.maxConcurrent
    });
    
    // تهيئة الحالات
    this.tabs = {};
    this.dialogs = { purchase: null };
    this.initState = {
      loaded: false,
      error: null,
      isInitializing: false
    };

    // إعداد مستمعات الأحداث
    this._eventHandlers = {
      refreshData: () => this._refreshAppData(),
      tabChange: (tabId) => this._handleTabChange(tabId),
      backButton: () => this.taber.activateTab('home')
    };

    // بدء التهيئة
    this._init();
  }

  /* ---------------------------------- */
  /* --------- Initialization --------- */
  /* ---------------------------------- */

  /**
   * تهيئة التطبيق الرئيسية
   * @private
   * @returns {Promise<void>}
   */
  async _init() {
    if (this.initState.isInitializing) return;
    this.initState.isInitializing = true;

    try {
      // تهيئة المكونات بالترتيب الصحيح
      this._initDialogs();
      await this._setupTabs();
      this._setupEventListeners();
      await this._preloadEssentialData();

      this.initState.loaded = true;
      this.initState.error = null;
    } catch (error) {
      this.initState.error = error;
      console.error('فشل تهيئة التطبيق:', error);
      this._showFatalError(error);
    } finally {
      this.initState.isInitializing = false;
    }
  }

  /**
   * تهيئة مربعات الحوار
   * @private
   */
  _initDialogs() {
    this.dialogs.purchase = new PurchaseDialog({
      themeColor: this.config.themeColor,
      onPurchase: (app, quantity, userId) => this._handlePurchase(app, quantity, userId)
    });
  }

  /**
   * إعداد التبويبات الرئيسية
   * @private
   * @returns {Promise<void>}
   */
  async _setupTabs() {
    try {
      // تحميل التبويب الرئيسي أولاً
      this.tabs.home = new HomeTab({
        taber: this.taber,
        containerId: 'home-tab-cards-container',
        options: {
          apiEndpoint: '/api/cards',
          iconBasePath: this.config.iconsBasePath,
          themeColor: this.config.themeColor
        }
      });

      // ثم تحميل تبويب التطبيقات
      await this._initAppsTab();
    } catch (error) {
      console.error('فشل تحميل التبويبات:', error);
      throw error;
    }
  }

  /**
   * تهيئة تبويب التطبيقات
   * @private
   * @returns {Promise<void>}
   */
  async _initAppsTab() {
    try {
      // جلب البيانات بشكل متوازي
      const [appsData, iconsList] = await Promise.all([
        this._fetchAppsData(),
        this._fetchIconsList()
      ]);

      // إنشاء تبويب التطبيقات
      this.tabs.apps = new AppsTab({
        containerId: 'apps-tab-container',
        options: {
          appsData,
          iconsBasePath: this.config.iconsBasePath,
          iconsList,
          themeColor: this.config.themeColor,
          dialogBgColor: '#ffffff',
          cacheStrategy: 'lazy',
          maxConcurrentLoads: 5,
          maxCachedIcons: 100,
          onCardClick: (app) => this._handleAppCardClick(app),
          onError: (error) => this._handleAppsTabError(error)
        }
      });
    } catch (error) {
      console.error('فشل تحميل تبويب التطبيقات:', error);
      this._handleAppsTabError(error);
      throw error;
    }
  }

  /**
   * جلب بيانات التطبيقات
   * @private
   * @returns {Promise<Array>}
   */
  async _fetchAppsData() {
    try {
      const data = await this.api.fetchData('/api/apps', 'appsData');
      return _transformAppsData(data);
    } catch (error) {
      console.error('فشل جلب بيانات التطبيقات:', error);
      return []; // إرجاع مصفوفة فارغة بدلاً من إيقاف التطبيق
    }
  }

  /**
   * جلب قائمة الأيقونات
   * @private
   * @returns {Promise<Array>}
   */
  async _fetchIconsList() {
    try {
      const response = await this.api.fetchData('/api/icons-list', 'iconsList');
      return response.icons || [];
    } catch (error) {
      console.error('فشل جلب قائمة الأيقونات:', error);
      return []; // إرجاع مصفوفة فارغة بدلاً من إيقاف التطبيق
    }
  }

  /* ---------------------------------- */
  /* --------- Event Handling --------- */
  /* ---------------------------------- */

  /**
   * إعداد مستمعات الأحداث
   * @private
   */
  _setupEventListeners() {
    // مستمع تغيير التبويب
    this.taber.onTabChange(this._eventHandlers.tabChange);

    // زر الرجوع
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', this._eventHandlers.backButton);
    }

    // حدث تحديث البيانات
    document.addEventListener('refreshData', this._eventHandlers.refreshData);
  }

  /**
   * معالجة تغيير التبويب
   * @private
   * @param {string} tabId - معرف التبويب
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
   * معالجة النقر على بطاقة التطبيق
   * @private
   * @param {Object} app - بيانات التطبيق
   */
  _handleAppCardClick(app) {
    try {
      this.dialogs.purchase.open(app);
    } catch (error) {
      console.error('فشل فتح مربع حوار الشراء:', error);
      this._showToast('فشل فتح صفحة الشراء', 'error');
    }
  }

  /* ---------------------------------- */
  /* --------- Data Management -------- */
  /* ---------------------------------- */

  /**
   * تحميل مسبق للبيانات الأساسية
   * @private
   * @returns {Promise<void>}
   */
  async _preloadEssentialData() {
    try {
      await Promise.all([
        this.api.fetchData('/api/essential', 'essentialData'),
        caches.open('essential-assets').then(cache => cache.addAll([
          `${this.config.iconsBasePath}${this.config.defaultIcon}`,
          '/assets/images/loading.gif'
        ]))
      ]);
    } catch (error) {
      console.error('فشل تحميل البيانات الأساسية:', error);
    }
  }

  /**
   * تحديث بيانات التطبيقات
   * @private
   * @returns {Promise<void>}
   */
  async _refreshAppData() {
    try {
      await this.api.refreshData('/api/apps', 'appsData');
      await this._initAppsTab();
      this._showToast('تم تحديث البيانات بنجاح', 'success');
    } catch (error) {
      console.error('فشل تحديث البيانات:', error);
      this._showToast('فشل في تحديث البيانات', 'error');
    }
  }

  /**
   * معالجة عملية الشراء
   * @private
   * @param {Object} app - بيانات التطبيق
   * @param {number} quantity - الكمية
   * @param {string} userId - معرف المستخدم
   * @returns {Promise<void>}
   */
  async _handlePurchase(app, quantity, userId) {
    try {
      // هنا يمكنك إضافة منطق معالجة الشراء
      console.log(`تم طلب شراء ${quantity} من ${app.name} للمستخدم ${userId}`);
      
      // عرض رسالة نجاح
      this._showToast('تمت عملية الشراء بنجاح', 'success');
      
      // إغلاق مربع الحوار
      this.dialogs.purchase.close();
    } catch (error) {
      console.error('فشل عملية الشراء:', error);
      this._showToast('فشل في عملية الشراء', 'error');
    }
  }

  /* ---------------------------------- */
  /* --------- UI Management --------- */
  /* ---------------------------------- */

  /**
   * عرض رسالة toast
   * @private
   * @param {string} message - نص الرسالة
   * @param {string} type - نوع الرسالة (success/error)
   */
  _showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, 2700);
  }

  /**
   * معالجة خطأ تبويب التطبيقات
   * @private
   * @param {Error} error - كائن الخطأ
   */
  _handleAppsTabError(error) {
    const container = document.getElementById('apps-tab-container');
    if (!container) return;

    container.innerHTML = `
      <div class="tab-error-state">
        <div class="error-icon">⚠️</div>
        <h3>حدث خطأ في تحميل التطبيقات</h3>
        <p>${error.message || 'تعذر تحميل قائمة التطبيقات'}</p>
        <button id="retry-apps-btn" class="retry-btn">
          <i class="refresh-icon">↻</i> إعادة المحاولة
        </button>
      </div>
    `;

    document.getElementById('retry-apps-btn')?.addEventListener('click', () => {
      this._initAppsTab();
    });
  }

  /**
   * عرض خطأ جسيم
   * @private
   * @param {Error} error - كائن الخطأ
   */
  _showFatalError(error) {
    const container = document.getElementById('app-container');
    if (!container) return;

    container.innerHTML = `
      <div class="fatal-error">
        <h2>حدث خطأ جسيم</h2>
        <p>${error?.message || 'تعذر تحميل التطبيق'}</p>
        <button id="retry-btn" class="retry-btn">
          <i class="refresh-icon">↻</i> إعادة المحاولة
        </button>
      </div>
    `;
    
    document.getElementById('retry-btn')?.addEventListener('click', () => {
      window.location.reload();
    });
  }

  /* ---------------------------------- */
  /* --------- Cleanup Methods -------- */
  /* ---------------------------------- */

  /**
   * تدمير المكون وتنظيف الموارد
   */
  destroy() {
    // تدمير التبويبات
    Object.values(this.tabs).forEach(tab => {
      try {
        tab.destroy?.();
      } catch (error) {
        console.error('فشل تدمير التبويب:', error);
      }
    });

    // تدمير مربعات الحوار
    Object.values(this.dialogs).forEach(dialog => {
      try {
        dialog.destroy?.();
      } catch (error) {
        console.error('فشل تدمير مربع الحوار:', error);
      }
    });

    // تنظيف التخزين المؤقت
    try {
      this.api.clearCache();
    } catch (error) {
      console.error('فشل تنظيف التخزين المؤقت:', error);
    }

    // إزالة مستمعات الأحداث
    this.taber.offTabChange(this._eventHandlers.tabChange);
    document.removeEventListener('refreshData', this._eventHandlers.refreshData);
    document.getElementById('back-btn')?.removeEventListener('click', this._eventHandlers.backButton);
  }
}
