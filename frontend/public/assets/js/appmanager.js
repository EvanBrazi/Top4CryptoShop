/**
 * @file appmanager.js
 * @module AppManager
 * @author Evan Brazi
 * @version 7.0.0
 * @description مدير التبويبات المركزي، يهيئ النظام الموحد للأيقونات ويدير التفاعل بين التبويبات مع دعم التخزين والتحليل
 * @license MIT
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
        duration: 7, // أيام
        maxConcurrent: 5 // أقصى عدد من الطلبات المتزامنة
    }
};

/* ---------------------------------- */
/* --------- وظائف المساعدة --------- */
/* ---------------------------------- */

/**
 * تحميل بيانات البطاقات من السيرفر
 * @returns {Promise<Array>} مصفوفة بيانات البطاقات
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
 * @returns {Promise<Array>} مصفوفة بيانات التطبيقات
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

/* ---------------------------------- */
/* --------- الفئة الرئيسية --------- */
/* ---------------------------------- */

export class AppManager {
    /**
     * @constructor
     * @param {Object} taberInstance - كائن إدارة التبويبات
     * @param {Object} config - إعدادات التهيئة
     */
    constructor(taberInstance, config = {}) {
        if (!taberInstance) throw new Error('Taber instance is required');
        this.taber = taberInstance;

        // دمج الإعدادات المخصصة مع الإعدادات الافتراضية
        this.config = { ...DEFAULT_CONFIG, ...config };

        // 🧠 تهيئة النظام الموحد للأيقونات
        this.homeTabIcons = new UnifiedIconSystem({
            basePath: '/icons/hometab/',
            fallback: this.config.fallbackIcon
        });

        this.appsTabIcons = new UnifiedIconSystem({
            basePath: this.config.iconsBasePath,
            fallback: this.config.fallbackIcon
        });

        // 🎨 وحدة عرض الأيقونات
        this.iconRenderer = new IconRenderer();

        // 🎯 محملي الأيقونات لكل تبويب
        this.homeIconLoader = new IconLoader({
            system: this.homeTabIcons,
            renderer: this.iconRenderer
        });

        this.appsIconLoader = new IconLoader({
            system: this.appsTabIcons,
            renderer: this.iconRenderer
        });

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

        // بدء التهيئة
        this.initComponents();
    }

    /**
     * تهيئة المكونات الأساسية
     * @returns {Promise<void>}
     */
    async initComponents() {
        if (this.initState.isInitializing) return;
        this.initState.isInitializing = true;

        try {
            this._setupEventListeners();
            await this.preloadEssentialIcons();
            await this.initTabs();

            this.initState.loaded = true;
            this.initState.error = null;
            console.log('✅ تم تهيئة AppManager بنجاح');
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
     * @returns {Promise<void>}
     */
    async preloadEssentialIcons() {
        const essentialIcons = [
            'default.png',
            'chat_saya.png',
            'com_taka_vhgyk.png'
        ];
        
        // تحميل مسبق لأيقونات التبويب الرئيسي
        await this.homeTabIcons.preloadIcons(essentialIcons);
        
        // تحميل مسبق لأيقونات تبويب التطبيقات
        await this.appsTabIcons.preloadIcons(essentialIcons);
        
        console.log('✅ تم التحميل المسبق للأيقونات الأساسية');
    }

    /**
     * تهيئة التبويبات وربطها بالنظام الموحد
     * @returns {Promise<void>}
     */
    async initTabs() {
        this.cardsData = await fetchCards();
        this.appsData = await _fetchAppsData();

        this.tabs = {
            home: new HomeTab({
                taber: this.taber,
                containerId: 'home-tab-cards-container',
                whichCardClick: (index, card) => this._whichCardClick(index, card),
                options: {
                    cardsData: this.cardsData,
                    homeIconLoader: this.homeIconLoader,
                    fallbackUrl: '/icons/apps/default.png',
                    themeColor: this.config.themeColor
                }
            }),
            apps: new AppsTab({
                containerId: 'apps-tab-container',
                options: {
                    appsData: this.appsData,
                    appsIconLoader: this.appsIconLoader,
                    fallbackUrl: '/icons/apps/default.png',
                    onCardClick: (app) => this.handleAppsCardsClick(app),
                    themeColor: this.config.themeColor
                }
            })
        };

        console.log('✅ تم تهيئة التبويبات بنجاح');
    }

    /**
     * إعداد مستمعات الأحداث
     * @private
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
     * @param {string} tabId - معرف التبويب
     * @private
     */
    _handleTabChange(tabId) {
        document.querySelector('.sidebar')?.classList.remove('active');
        document.querySelector('.overlay')?.classList.remove('active');

        const backBtn = document.getElementById('back-btn');
        if (backBtn) {
            backBtn.style.display = tabId === 'home' ? 'none' : 'block';
        }

        console.log(`🔀 تم تغيير التبويب إلى: ${tabId}`);
    }

    /**
     * التعامل مع النقر على بطاقة في تبويب الصفحة الرئيسية
     * @param {number} index - فهرس البطاقة
     * @param {Object} card - بيانات البطاقة
     * @private
     */
    _whichCardClick(index, card) {
        console.log('🃏 نقر على بطاقة:', card.title, '، الفهرس:', index);
        
        // تفعيل التبويب المحدد في البطاقة
        if (card.whichTab && this.taber) {
            this.taber.activateTab(card.whichTab);
        }
    }

    /**
     * التعامل مع النقر على بطاقة تطبيق
     * @param {Object} app - بيانات التطبيق
     */
    handleAppsCardsClick(app) {
        console.log('📱 تم النقر على التطبيق:', app.name);
        // لاحقًا: this.dialogs.purchase.open(app) أو favoritesManager.add(app)
    }

    /**
     * تحديث بيانات التطبيقات
     * @private
     * @returns {Promise<void>}
     */
    async _refreshAppData() {
        try {
            console.log('🔄 جاري تحديث بيانات التطبيقات...');
            this.appsData = await _fetchAppsData();
            
            if (this.tabs.apps && typeof this.tabs.apps.refresh === 'function') {
                this.tabs.apps.refresh(this.appsData);
            }
            
            console.log('✅ تم تحديث بيانات التطبيقات بنجاح');
        } catch (error) {
            console.error('❌ فشل تحديث بيانات التطبيقات:', error);
        }
    }

    /**
     * عرض خطأ فادح في الواجهة
     * @param {Error} error - كائن الخطأ
     * @private
     */
    _showFatalError(error) {
        const errorContainer = document.createElement('div');
        errorContainer.className = 'fatal-error';
        errorContainer.innerHTML = `
            <div class="error-content">
                <h3>❌ خطأ في التطبيق</h3>
                <p>حدث خطأ غير متوقع. يرجى تحديث الصفحة.</p>
                <button onclick="location.reload()">تحديث الصفحة</button>
                <details>
                    <summary>تفاصيل التقنيّة</summary>
                    <pre>${error.message}</pre>
                </details>
            </div>
        `;
        
        document.body.appendChild(errorContainer);
    }

    /**
     * تنظيف الكاش والموارد عند الإغلاق
     */
    destroy() {
        // تنظيف أنظمة الأيقونات
        this.homeTabIcons.clearCache();
        this.appsTabIcons.clearCache();
        
        // إزالة مستمعات الأحداث
        document.removeEventListener('refreshData', this._eventHandlers.refreshData);
        
        console.log('🧹 تم تنظيف موارد AppManager');
    }
}
