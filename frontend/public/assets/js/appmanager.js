/**
 * @file appmanager.js
 * @module AppManager
 * @author Evan Brazi
 * @version 6.2.0
 * @description مدير التبويبات المركزي، يهيئ النظام الموحد للأيقونات ويدير التفاعل بين التبويبات مع دعم التخزين والتحليل
 * @license MIT
 * @created 2024-12-01
 * @updated 2025-08-22
 */

import { HomeTab } from "./tabs/hometab.js";
import { AppsTab } from "./tabs/appstab.js";
import { IconLoader } from "./core/icon-loader.js";
import { UnifiedIconSystem } from './core/unified-icon-system.js';
import { IconRenderer } from './core/icon-renderer.js';

/* ---------------------------------- */
/* --------- إعدادات التطبيق -------- */
/* ---------------------------------- */

const DEFAULT_CONFIG = {
    themeColor: '#6a5acd',
    fallbackIcon: 'default.png',
    iconsBasePath: '/icons/apps/',
    cacheOptions: {
        duration: 7,
        maxConcurrent: 5
    }
};

/* ---------------------------------- */
/* --------- وظائف المساعدة --------- */
/* ---------------------------------- */

/**
 * تحميل بيانات البطاقات من السيرفر
 */
async function fetchCards() {
    try {
        const response = await fetch('/api/cards');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const cards = await response.json();
        return Array.isArray(cards) ? cards : [];
    } catch (err) {
        console.warn('❌ فشل تحميل البطاقات:', err);
        return [];
    }
}

/**
 * تحميل بيانات التطبيقات من السيرفر
 */
async function _fetchAppsData() {
    try {
        const response = await fetch('/api/apps');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const appsData = await response.json();
        return Array.isArray(appsData) ? appsData : [];
    } catch (error) {
        console.error('❌ فشل جلب بيانات التطبيقات:', error);
        return [];
    }
}

/**
 * تحميل قائمة الأيقونات من ملف JSON
 */
async function _fetchIconsList() {
    try {
        const response = await fetch('/icons-list.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const iconsList = await response.json();
        return Array.isArray(iconsList) ? iconsList : [];
    } catch (error) {
        console.error('❌ فشل جلب قائمة الأيقونات:', error);
        return [];
    }
}

/* ---------------------------------- */
/* --------- الفئة الرئيسية --------- */
/* ---------------------------------- */

export class AppManager {
    constructor(taberInstance, config = {}) {
        if (!taberInstance) throw new Error('Taber instance is required');
        this.taber = taberInstance;

        // 🧠 تهيئة النظام الموحد للأيقونات
        this.homeTabIcons = new UnifiedIconSystem({
            basePath: '/icons/hometab/',
            fallback: config.fallbackIcon || DEFAULT_CONFIG.fallbackIcon
        });

        this.appsTabIcons = new UnifiedIconSystem({
            basePath: DEFAULT_CONFIG.iconsBasePath,
            fallback: config.fallbackIcon || DEFAULT_CONFIG.fallbackIcon
        });

        // 🎨 وحدة عرض الأيقونات
        this.iconRenderer = new IconRenderer({
            fallback: config.fallbackIcon || '/icons/apps/default.png'
        });

        this.homeIconLoader = new IconLoader({
            system: this.homeTabIcons,
            renderer: this.iconRenderer
        });
        this.appsIconLoader = new IconLoader({
            system: this.appsTabIcons,
            renderer: this.iconRenderer
        })

        // 🧩 الحالة الداخلية
        this.tabs = {};
        this.dialogs = { purchase: null };
        this.initState = {
            loaded: false,
            error: null,
            isInitializing: false
        };

        // 🎯 مستمعات الأحداث
        this._eventHandlers = {
            refreshData: () => this._refreshAppData(),
            tabChange: (tabId) => this._handleTabChange(tabId),
            backButton: () => this.taber.activateTab('home')
        };

        this.initComponents();
    }

    /**
     * تهيئة المكونات الأساسية
     */
    async initComponents() {
        if (this.initState.isInitializing) return;
        this.initState.isInitializing = true;

        try {
            // يتم تحميل الأيقونات الأساسية وتخزينها في Service Worker Cache عبر UnifiedIconSystem
            // يتم تضمين X-Timestamp تلقائيًا لضمان صلاحية التخزين وتحليل الأداء
            this._setupEventListeners();
            await this.preloadEssentialIcons();
            await this.initTabs();

            this.initState.loaded = true;
            this.initState.error = null;
        } catch (error) {
            this.initState.error = error;
            console.error('❌ فشل تهيئة التطبيق:', error);
            this._showFatalError(error);
        } finally {
            this.initState.isInitializing = false;
        }
    }

    /**
     * تحميل مسبق للأيقونات الأساسية
     * يدعم تعدد الأيقونات عبر cardsData[].icons[]
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
                    cardsData: this.cardsData,
                    homeTabIcons: this.homeTabIcons,
                    iconRenderer: this.iconRenderer,
                    fallbackUrl: '/icons/appstab/apps_tab.png',
                    themeColor: DEFAULT_CONFIG.themeColor
                }
            }),
            apps: new AppsTab({
                containerId: 'apps-tab-container',
                options: {
                    appsData: this.appsData,
                    appsTabIcons: this.appsTabIcons,
                    iconRenderer: this.iconRenderer,
                    fallbackUrl: '/icons/apps/default.png',
                    onCardClick: (app) => this.handleAppsCardsClick(app),
                    themeColor: DEFAULT_CONFIG.themeColor
                }
            })
        };
    }

    /**
     * إعداد مستمعات الأحداث
     */
    _setupEventListeners() {
        this.taber.onTabChange(this._eventHandlers.tabChange);

        const backBtn = document.getElementById('back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', this._eventHandlers.backButton);
        }

        document.addEventListener('refreshData', this._eventHandlers.refreshData);
    }

    /**
     * التعامل مع تغيير التبويب
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
     * التعامل مع النقر على بطاقة في تبويب الصفحة الرئيسية
     */
    _whichCardClick(index, card) {
        console.log('AppManager_whichCardClick :: Card Clicked : ', card.title, ' ,index ' + index);
    }

    /**
     * التعامل مع النقر على بطاقة تطبيق
     */
    handleAppsCardsClick(app) {
        console.log('تم النقر على التطبيق:', app.name);
        // لاحقًا: this.dialogs.purchase.open(app) أو favoritesManager.add(app)
    }

    /**
     * تنظيف الكاش والموارد عند الإغلاق
     */
    destroy() {
        this.homeTabIcons.clearCache();
        this.appsTabIcons.clearCache();
    }
}
