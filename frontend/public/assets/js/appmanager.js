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
import { WalletTab } from "./tabs/wallettab.js";
import { PortfolioTab } from "./tabs/portfoliotab.js"
import { OrdersTab } from "./tabs/orderstab.js";
import { PaymentsTab } from "./tabs/paymentstab.js";
import { SettingsTab } from "./tabs/settingstab.js";
import SecurityTab from "./tabs/securitytab.js";
import { AppsTab } from "./tabs/appstab.js";
import { GamesTab } from "./tabs/gamestab.js";
import { CryptosTab } from "./tabs/cryptostab.js";
import { BalancesTab } from "./tabs/balancestab.js";
import { IconLoader } from "./core/icon-loader.js";
import { SearchManager } from "./core/search-manager.js";
import { UnifiedIconSystem } from './core/unified-icon-system.js';
import { IconRenderer } from './core/icon-renderer.js';
import { CardsService } from "./core/cards.js";
import { STORAGE_KEYS } from "./utils/appUtils.js";
import { AdsManager } from "./utils/adsManager.js";

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
    constructor(taberInstance, userManager, config = {}) {
        if (!taberInstance) throw new Error('Taber instance is required');
        this.taber = taberInstance;
        if (!userManager) throw new Error('No user found!')
        this.userManager = userManager;
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

        this.gamesTabIcons = new UnifiedIconSystem({
            basePath: '/icons/games/',
            fallback: '/icons/games/default.png'
        });

        this.cryptosTabIcons = new UnifiedIconSystem({
            basePath: '/icons/cryptos/',
            fallback: '/icons/cryptos/default.png'
        });

        this.balancesTabIcons = new UnifiedIconSystem({
            basePath: '/icons/balances/',
            fallback: '/icons/balances/default.png'
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

        this.gamesIconLoader = new IconLoader({
            system: this.gamesTabIcons,
            renderer: this.iconRenderer
        });

        this.cryptosIconLoader = new IconLoader({
            system: this.cryptosTabIcons,
            renderer: this.iconRenderer
        });

        this.balancesIconLoader = new IconLoader({
            system: this.balancesTabIcons,
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
            await this.initAdsManager();
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


    async initAdsManager() {
        // تهيئة مدير الإعلانات
        const adsManager = new AdsManager("#adsWrapper");
        // تحميل مسبق لأيقونات التبويب الرئيسي
        //await this.homeTabIcons.preloadIcons(essentialIcons);

        // تحميل مسبق لأيقونات تبويب التطبيقات
        //await this.appsTabIcons.preloadIcons(essentialIcons);

        console.log('✅ تم التحميل المسبق للأيقونات الأساسية');
    }

    /**
     * تهيئة التبويبات وربطها بالنظام الموحد
     * @returns {Promise<void>}
     */
    async initTabs() {
        this.cardsData = await fetchCards();
        this.appsData = await new CardsService('/api/apps', '/icons/apps/').fetchCards();
        this.gamesData = await new CardsService('/api/games', '/icons/games/').fetchCards();
        this.cryptosData = await new CardsService('/api/cryptos', '/icons/cryptos/').fetchCards();
        this.balancesData = await new CardsService('/api/balances', '/icons/balances/').fetchCards();
        this.userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
        this.tabs = {
            home: new HomeTab({
                taber: this.taber,
                containerId: 'home-tab-container',
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
            }),
            games: new GamesTab({
                containerId: 'games-tab-container',
                options: {
                    gamesData: this.gamesData,
                    gamesIconLoader: this.gamesIconLoader,
                    fallbackUrl: '/icons/games/default.png',
                    onCardClick: (game) => this.handleAppsCardsClick(game),
                    themeColor: this.config.themeColor
                }
            }),
            cryptos: new CryptosTab({
                containerId: 'cryptos-tab-container',
                options: {
                    cryptosData: this.cryptosData,
                    cryptosIconLoader: this.cryptosIconLoader,
                    fallbackUrl: '/icons/cryptos/default.png',
                    onCardClick: (crypto) => this.handleAppsCardsClick(crypto),
                    themeColor: this.config.themeColor
                }
            }),
            balances: new BalancesTab({
                containerId: 'balances-tab-container',
                options: {
                    balancesData: this.balancesData,
                    balancesIconLoader: this.balancesIconLoader,
                    fallbackUrl: '/icons/balances/default.png',
                    onCardClick: (balance) => this.handleAppsCardsClick(balance),
                    themeColor: this.config.themeColor
                }
            }),
            orders: new OrdersTab(
                'orders-tab',
                this.userId, {
                themeColor: this.config.themeColor,
                fallbackImage: '/icons/orders/default.png'
            }),
            payments: new PaymentsTab(
                'payments-tab',
                this.userId, {
                themeColor: this.config.themeColor,
                fallbackImage: '/icons/payments/default.png'
            }),
            wallet: new WalletTab(
                'wallet-tab',
                this.userId,
                this._postPaymentMessage.bind(this)
            ),
            portfolio: new PortfolioTab(
                'portfolio-tab',
                this.userId, {
                themeColor: this.config.themeColor,
            }
            ),
            settings: new SettingsTab(
                'settings-tab',
                this.userManager
            ),
            // ✅ تبويب الحماية الجديد
            security: new SecurityTab(
                'security-tab',
                this.userId, {
                themeColor: this.config.themeColor
            })
        };
        // مدير البحث (بعد أن يصبح AppManager جاهزاً)
        setTimeout(() => {
            this.searchManager = new SearchManager(this);
        }, 1000);
        console.log('✅ تم تهيئة التبويبات بنجاح');
    }
    /**
     * التعامل مع رسالة تحديث الطلبات
     * @private
     */
    async _postOrderMessage() {
        await this.tabs.orders.loadOrders();
    }

    /**
     * التعامل مع رسالة تحديث المدفوعات
     * @private
     */
    async _postPaymentMessage() {
        await this.tabs.payments.loadPayments();
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
        console.log('Clicked Tab : ', tabId);
        document.querySelector('.sidebar')?.classList.remove('active');
        document.querySelector('.overlay')?.classList.remove('active');
        this.updateBackBtnVisibility(tabId);
        //this._updateSearchBarVisibility(tabId); // ✅ تفعيل شريط البحث حسب التبويب
        console.log(`🔀 تم تغيير التبويب إلى: ${tabId}`);
    }

    /**
     * Hide the back button
     * @public
     */
    hideBackBtn() {
        const backBtn = document.getElementById('back-btn');
        if (backBtn.style.display === 'none') return;
        backBtn.style.display = 'none';
    }

    /**
     * تحديث حالة ظهور زر الرجوع
     * @public
     * @param {string} tabId - معرف التبويب الحالي
     */
    updateBackBtnVisibility(tabId = this.getActiveTabId()) {
        const backBtn = document.getElementById('back-btn');
        if (backBtn) {
            backBtn.style.display = tabId === 'home' ? 'none' : 'block';
        }
    }

    /**
     * تحديث حالة ظهور شريط البحث حسب التبويب النشط
     * @private
     * @param {string} tabId
     */
    _updateSearchBarVisibility(tabId) {
        const searchBar = document.getElementById('globalSearchBar');
        const allowedTabs = ['home', 'apps', 'games', 'cryptos', 'balances'];
        if (searchBar) {
            searchBar.style.display = allowedTabs.includes(tabId) ? 'block' : 'none';
        }
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
     * @param {Object} card - بيانات التطبيق
     */
    handleAppsCardsClick(card) {
        console.log('📱 تم النقر على التطبيق:', card.name);
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
     * الحصول على معرف التبويب النشط
     * @returns {string} معرف التبويب النشط
     */
    getActiveTabId() {
        return this.taber.getActiveTab().id;
    }

    /**
     * تحديث التبويب النشط
     */
    refreshCurrentTab() {
        const activeTabId = this.getActiveTabId();
        const activeTab = this.tabs[activeTabId];
        if (activeTab && typeof activeTab.refresh === 'function') {
            activeTab.refresh();
            console.log(`🔄 تم تحديث التبويب النشط: ${activeTabId}`);
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
        this.tabs.portfolio.destroy();
        // تنظيف أنظمة الأيقونات
        this.homeTabIcons.clearCache();
        this.appsTabIcons.clearCache();
        this.tabs.OrdersTab.stopAutoRefresh();
        // إزالة مستمعات الأحداث
        document.removeEventListener('refreshData', this._eventHandlers.refreshData);
        console.log('🧹 تم تنظيف موارد AppManager');
    }
}
