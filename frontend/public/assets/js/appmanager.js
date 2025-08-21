/**
 * @file appmanager.js
 * @module AppManager
 * @author Evan Brazi
 * @version 6.1.0
 * @description مدير التبويبات المركزي، يهيئ النظام الموحد للأيقونات ويدير التفاعل بين التبويبات
 * @license MIT
 * @created 2024-12-01
 * @updated 2025-08-20
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
import { UnifiedIconSystem } from './core/unified-icon-system.js';
import { IconRenderer } from './core/icon-renderer.js';

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

/**
 * @function fetchCards
 * @description تحميل بيانات البطاقات من السيرفر
 * @returns {Promise<Array>} مصفوفة البطاقات أو مصفوفة فارغة عند الفشل
 */
async function fetchCards() {
    try {
        const response = await fetch('/api/cards'); // تأكد أن المسار يطابق إعدادات السيرفر
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const cards = await response.json();
        return Array.isArray(cards) ? cards : [];
    } catch (err) {
        console.warn('❌ فشل تحميل البطاقات:', err);
        return [];
    }
}

/**
   * جلب بيانات التطبيقات
   * @private
   * @returns {Promise<Array>}
   */
async function _fetchAppsData() {
    try {
        const response = await fetch('/api/apps');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const appsData = await response.json();
        return Array.isArray(appsData) ? appsData : [];
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
async function _fetchIconsList() {
    try {
        const response = await fetch('/icons-list.json');
        return response.icons || [];
    } catch (error) {
        console.error('فشل جلب قائمة الأيقونات:', error);
        return []; // إرجاع مصفوفة فارغة بدلاً من إيقاف التطبيق
    }
}


/**
 * @class AppManager
 * @classdesc مسؤول عن تهيئة التبويبات وربطها بنظام الأيقونات الموحد، ويعمل كطبقة تحكم مركزية
 */
export class AppManager {
    /**
     * @constructor
     * @param {Object} taberInstance - كائن إدارة التبويبات
     * @param {Object} config - إعدادات التهيئة
     * @param {string} [config.iconBasePath='/icons/apps/'] - المسار الأساسي للأيقونات
     * @param {string} [config.fallbackIcon='default.png'] - اسم الأيقونة الافتراضية عند الفشل
     */
    constructor(taberInstance, config = {}) {
        if (!taberInstance) throw new Error('Taber instance is required');

        this.taber = taberInstance;

        this.homeTabIcons = new UnifiedIconSystem({
            basePath: '/icons/hometab/',
            fallback: 'default.png'
        });

        this.appsTabIcons = new UnifiedIconSystem({
            basePath: '/icons/apps/',
            fallback: 'default.png'
        });
        this.iconRenderer = new IconRenderer({
            fallback: config.fallbackIcon || '/icons/apps/default.png'
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

        this.initComponents();
    }

    /* ---------------------------------- */
    /* --------- Initialization --------- */
    /* ---------------------------------- */

    /**
     * تهيئة المكونات الأساسية
     * @private
     * @returns {Promise<void>}
     */
    async initComponents() {
        if (this.initState.isInitializing) return;
        this.initState.isInitializing = true;

        try {
            // تهيئة المكونات بالترتيب الصحيح
            //this._initDialogs();
            //await this._setupTabs();
            this._setupEventListeners();
            await this.preloadEssentialIcons();
            this.initTabs();

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
     * تحميل مسبق للأيقونات الأساسية المستخدمة في الواجهة
     * @returns {Promise<void>}
     */
    async preloadEssentialIcons() {
        const essentialIcons = [
            'default.png',
            'chat_saya.png',
            'com_taka_vhgyk.png'
        ];
        await this.appsTabIcons.preloadIcons(essentialIcons);
    }

    /**
     * تهيئة التبويبات وربطها بالنظام الموحد
     * @private
     */
    async initTabs() {
        this.cardsData = await fetchCards();
        this.appsData = await _fetchAppsData();
        this.tabs = {
            home: new HomeTab({
                taber: this.taber,
                containerId: 'home-tab-cards-container',
                whichCardClick: this._whichCardClick,
                options: {
                    apiEndpoint: '/api/cards',
                    cardsData: this.cardsData,
                    homeTabIcons: this.homeTabIcons,
                    iconRenderer: this.iconRenderer,
                    fallbackUrl: '/icons/appstab/apps_tab.png',
                    themeColor: '#6a5acd'
                }
            }),
            apps: new AppsTab({
                containerId: 'apps-tab-container',
                options: {
                    appsTabIcons: this.appsTabIcons,
                    appsData: this.appsData,
                    onCardClick: (app) => this.handleAppsCardsClick(app),
                    themeColor: '#6a5acd'
                }
            })
        };
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

    _whichCardClick(index, card) {
        console.log('AppManager_whichCardClick :: Card Clicked : ', card.title, ' ,index ' + index);
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

    /**
     * معالجة النقر على بطاقة تطبيق
     * @param {Object} app - بيانات التطبيق
     */
    handleAppsCardsClick(app) {
        console.log('تم النقر على التطبيق:', app.name);
        // لاحقًا: dialogpurchase.open(app) أو favoritesManager.add(app)
    }

    /**
     * تنظيف الكاش والموارد عند الإغلاق
     * @public
     */
    destroy() {
        this.homeTabIcons.clearCache();
        this.appsTabIcons.clearCache();
    }
}
