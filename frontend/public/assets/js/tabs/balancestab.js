/**
 * @file balancestab.js
 * @module BalancesTab
 * @author Evan Brazi
 * @version 9.1.0
 * @description تبويب الرصيد باستخدام نظام البطاقات الموحد (grid-layout + card + icon + title)
 * @license MIT
 * @updated 2025-08-26
 */

import { DialogPurchase } from "../dialogs/purchaseDialog.js";
import { SUPPORT_PHONE } from "../utils/appUtils.js";

export class BalancesTab {
    /**
     * @constructor
     * @param {Object} config - إعدادات التهيئة
     */
    constructor({ containerId, options = {} }) {
        this.container = document.getElementById(containerId);
        if (!this.container) throw new Error(`Container "${containerId}" not found`);

        // ✅ عرض هيكل مؤقت فقط إذا لم تكن هناك بطاقات مسبقًا
        const hasCards = this.container.querySelectorAll('.card').length > 0;
        if (!hasCards) this._renderSkeleton();

        this.config = {
            balancesData: options.balancesData || [],
            balancesIconLoader: options.balancesIconLoader,
            fallbackUrl: options.fallbackUrl || '/icons/balances/default.png',
            themeColor: options.themeColor || '#6a5acd',
            onCardClick: typeof options.onCardClick === 'function'
                ? options.onCardClick
                : () => console.log('🖱️ تم النقر على الرصيد')
        };

        this.isInitialized = false;
        this.observer = null;
        this.init();
    }

    /**
     * تهيئة التبويب وتحميل الشبكة والستايل
     * @private
     */
    async init() {
        if (this.isInitialized) return;

        this._injectStyles();

        // ✅ منع التهيئة إذا كانت الشبكة موجودة مسبقًا
        if (this.container.querySelector('.grid-layout')) {
            console.log('⚠️ الشبكة موجودة مسبقًا، لن تتم إعادة التهيئة');
            return;
        }

        await this._renderBalancesGrid();
        await this._setupLazyLoading();

        console.log('✅ تم تهيئة تبويب الرصيد');
        this.isInitialized = true;
    }

    /**
     * عرض هيكل مؤقت أثناء التحميل
     * @private
     */
    _renderSkeleton() {
        this.container.innerHTML = `
            <div class="skeleton-grid">
                ${Array(12).fill('<div class="skeleton-card"></div>').join('')}
            </div>
        `;
    }

    /**
     * عرض شبكة الرصيد باستخدام التنسيق الموحد
     * @private
     */
    async _renderBalancesGrid() {
        const grid = document.createElement('div');
        grid.className = 'grid-layout'; // ✅ استخدام التنسيق الموحد

        const fragment = document.createDocumentFragment();

        const cardElements = await Promise.all(
            this.config.balancesData.map(balance => this._createBalanceCard(balance))
        );

        cardElements.forEach(card => {
            if (card instanceof HTMLElement) fragment.appendChild(card);
        });

        const skeleton = this.container.querySelector('.skeleton-grid');
        if (skeleton) skeleton.remove();

        grid.appendChild(fragment);
        this.container.appendChild(grid);
    }

    /**
     * إنشاء بطاقة رصيد واحدة باستخدام الكلاسات الموحدة
     * @private
     * @param {Object} balance - بيانات الرصيد
     * @returns {Promise<HTMLElement>}
     */
    async _createBalanceCard(balance) {
        const card = document.createElement('div');
        card.className = 'card'; // ✅ الكلاس الموحد
        card.dataset.balanceId = balance.id;
        card.dataset.price = balance.price;
        card.dataset.isAvailable = balance.available;
        card.dataset.category = balance.category;
        card.dataset.iconName = balance.icon || 'default.png';

        // أيقونة الرصيد
        const icon = document.createElement('img');
        icon.className = 'icon'; // ✅ الكلاس الموحد
        icon.alt = balance.name;
        icon.loading = 'lazy';
        icon.src = '/assets/images/loading.gif';
        // اسم الرصيد
        const title = document.createElement('div');
        title.className = 'title'; // ✅ الكلاس الموحد
        title.textContent = balance.name;

        card.appendChild(icon);
        card.appendChild(title);

        card.addEventListener('click', () => {
            const dialogPurchase = new DialogPurchase(card, {
                iconsBasePath: '/assets/images/',
                cssPath: '/assets/css/purchase-dialog.css',
                supportPhone: SUPPORT_PHONE
            });
            dialogPurchase.open();
        });
        return card;
    }

    /**
     * تفعيل تحميل الأيقونات عند ظهور البطاقة
     * @private
     */
    async _setupLazyLoading() {
        if (this.observer) this.observer.disconnect();

        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(async entry => {
                if (entry.isIntersecting) {
                    const card = entry.target;
                    await this._loadCardIcon(card);
                    this.observer.unobserve(card);
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '50px'
        });

        this.container.querySelectorAll('.card').forEach(card => {
            this.observer.observe(card);
        });
    }

    /**
     * تحميل أيقونة البطاقة باستخدام نظام الأيقونات الموحد
     * @private
     * @param {HTMLElement} card
     */
    async _loadCardIcon(card) {
        const img = card.querySelector('.icon');
        const iconName = card.dataset.iconName;

        if (!img || !iconName) return;

        try {
            await this.config.balancesIconLoader.render(iconName, img, '!');
            //console.log('✅ تم تحميل أيقونة الرصيد:', iconName);
        } catch (error) {
            console.error('❌ خطأ أثناء تحميل الأيقونة:', iconName, error);
            img.src = this.config.fallbackUrl;
        }
    }

    /**
     * تحميل ملف CSS خارجي خاص بالتبويب
     * @private
     */
    _injectStyles() {
        const styleId = 'balances-tab-styles';
        if (document.getElementById(styleId)) return;

        const link = document.createElement('link');
        link.id = styleId;
        link.rel = 'stylesheet';
        link.href = '/assets/css/tabs-layout.css'; // ✅ استخدام ملف التنسيق الموحد
        document.head.appendChild(link);
    }

    /**
     * تحديث بيانات الرصيد وإعادة العرض
     * @public
     * @param {Array} newBalancesData
     */
    async refresh(newBalancesData) {
        if (Array.isArray(newBalancesData)) {
            this.config.balancesData = newBalancesData;
            await this._renderBalancesGrid();
            await this._setupLazyLoading();
        }
    }

    /**
     * تنظيف الموارد والمراقب
     * @public
     */
    destroy() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    }
}
