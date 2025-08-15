/**
 * @file appmanager.js
 * @class AppManager
 * @description المدير الرئيسي للتطبيق - مسؤول عن تهيئة التطبيق، تحميل البيانات، وإدارة التبويبات
 * @version 4.0.0
 * @license MIT
 */

import { HomeTab } from "./tabs/hometab.js";
import { AppsTab } from "./tabs/appstab.js";
import ApiService from './services/apiService.js';
import { _transformAppsData } from './utils/appUtils.js';
import { PurchaseDialog } from './dialogs/purchaseDialog.js'; // سيتم إنشاء هذا الملف

export class AppManager {
  constructor(taberInstance, config = {}) {
    this.taber = taberInstance;
    this.api = new ApiService(config.apiBaseUrl, {
      cacheDuration: config.cacheOptions?.duration || 7,
      maxConcurrentRequests: config.cacheOptions?.maxConcurrent || 5
    });
    
    this.tabs = {};
    this.dialogs = {
      purchase: null
    };
    this.initState = {
      loaded: false,
      error: null
    };

    this._init();
  }

  async _init() {
    try {
      // تهيئة مربعات الحوار أولاً
      this._initDialogs();
      
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

  _initDialogs() {
    // تهيئة مربع حوار الشراء
    this.dialogs.purchase = new PurchaseDialog({
      themeColor: '#6a5acd',
      onPurchase: (app, quantity, userId) => this._handlePurchase(app, quantity, userId)
    });
  }

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

  async _initAppsTab() {
    try {
      const [appsData, iconsList] = await Promise.all([
        this.api.fetchData('/api/apps', 'appsData').then(_transformAppsData),
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
    }
  }

  _handleAppCardClick(app) {
    this.dialogs.purchase.open(app);
  }

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

  _showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 3000);
  }

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

  _setupEventListeners() {
    this.taber.onTabChange((tabId) => {
      this._handleTabChange(tabId);
    });

    document.getElementById('back-btn')?.addEventListener('click', () => {
      this.taber.activateTab('home');
    });

    document.addEventListener('refreshData', () => {
      this._refreshAppData();
    });
  }

  _handleTabChange(tabId) {
    document.querySelector('.sidebar')?.classList.remove('active');
    document.querySelector('.overlay')?.classList.remove('active');
    
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
      backBtn.style.display = tabId === 'home' ? 'none' : 'block';
    }
  }

  async _refreshAppData() {
    try {
      await this.api.refreshData('/api/apps', 'appsData');
      await this._initAppsTab();
    } catch (error) {
      console.error('فشل تحديث البيانات:', error);
      this._showToast('فشل في تحديث البيانات', 'error');
    }
  }

  _showFatalError() {
    const container = document.getElementById('app-container');
    if (container) {
      container.innerHTML = `
        <div class="fatal-error">
          <h2>حدث خطأ جسيم</h2>
          <p>${this.initState.error?.message || 'تعذر تحميل التطبيق'}</p>
          <button id="retry-btn" class="retry-btn">
            <i class="refresh-icon">↻</i> إعادة المحاولة
          </button>
        </div>
      `;
      
      document.getElementById('retry-btn')?.addEventListener('click', () => {
        window.location.reload();
      });
    }
  }

  destroy() {
    Object.values(this.tabs).forEach(tab => tab.destroy?.());
    Object.values(this.dialogs).forEach(dialog => dialog.destroy?.());
    this.api.clearCache();
    window.removeEventListener('refreshData', this._refreshAppData);
  }
}
