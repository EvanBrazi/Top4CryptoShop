/**
 * @file gamestab.js
 * @module GamesTab
 * @author Evan Brazi
 * @version 9.1.0
 * @description تبويب الألعاب باستخدام نظام البطاقات الموحد (grid-layout + card + icon + title)
 * @license MIT
 * @updated 2025-08-26
 */

import { DialogPurchase } from "../dialogs/purchaseDialog.js";
import { SUPPORT_PHONE } from "../utils/appUtils.js";

export class GamesTab {
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
            gamesData: options.gamesData || [],
            gamesIconLoader: options.gamesIconLoader,
            fallbackUrl: options.fallbackUrl || '/icons/games/default.png',
            themeColor: options.themeColor || '#6a5acd',
            onCardClick: typeof options.onCardClick === 'function'
                ? options.onCardClick
                : () => console.log('🖱️ تم النقر على اللعبة')
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

        await this._renderGamesGrid();
        await this._setupLazyLoading();

        console.log('✅ تم تهيئة تبويب الألعاب');
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
     * عرض شبكة الألعاب باستخدام التنسيق الموحد
     * @private
     */
    async _renderGamesGrid() {
        const grid = document.createElement('div');
        grid.className = 'grid-layout'; // ✅ استخدام التنسيق الموحد

        const fragment = document.createDocumentFragment();

        const cardElements = await Promise.all(
            this.config.gamesData.map(game => this._createGameCard(game))
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
     * إنشاء بطاقة لعبة واحدة باستخدام الكلاسات الموحدة
     * @private
     * @param {Object} game - بيانات اللعبة
     * @returns {Promise<HTMLElement>}
     */
    async _createGameCard(game) {
        const card = document.createElement('div');
        card.className = 'card'; // ✅ الكلاس الموحد
        card.dataset.gameId = game.id;
        card.dataset.iconName = game.icon || 'default.png';

        // أيقونة اللعبة
        const icon = document.createElement('img');
        icon.className = 'icon'; // ✅ الكلاس الموحد
        icon.alt = game.name;
        icon.loading = 'lazy';
        icon.src = '/assets/images/loading.gif';

        // اسم اللعبة
        const title = document.createElement('div');
        title.className = 'title'; // ✅ الكلاس الموحد
        title.textContent = game.name;

        card.appendChild(icon);
        card.appendChild(title);

        card.addEventListener('click', () => {
            const dialogPurchase = new DialogPurchase(game, {
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
            await this.config.gamesIconLoader.render(iconName, img, '!');
            //console.log('✅ تم تحميل أيقونة اللعبة:', iconName);
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
        const styleId = 'games-tab-styles';
        if (document.getElementById(styleId)) return;

        const link = document.createElement('link');
        link.id = styleId;
        link.rel = 'stylesheet';
        link.href = '/assets/css/tabs-layout.css'; // ✅ استخدام ملف التنسيق الموحد
        document.head.appendChild(link);
    }

    /**
     * عرض شبكة الألعاب بعد الفلترة
     * @private
     * @param {Array} filteredGames
     */
    async _renderFilteredGrid(filteredGames) {
        const oldGrid = this.container.querySelector('.grid-layout');
        if (oldGrid) oldGrid.remove();
        const grid = document.createElement('div');
        grid.className = 'grid-layout';
        const fragment = document.createDocumentFragment();
        const cardElements = await Promise.all(
            filteredGames.map(game => this._createGameCard(game))
        );
        cardElements.forEach(card => {
            if (card instanceof HTMLElement) fragment.appendChild(card);
        });
        grid.appendChild(fragment);
        this.container.appendChild(grid);
        await this._setupLazyLoading();
    }

    /**
     * عرض رسالة فارغة عند عدم وجود نتائج
     * @private
     * @param {string} message
     */
    _renderEmptyState(message) {
        this.container.innerHTML = `
            <div class="empty-search-message">
                <i class="search-icon">🔍</i>
                <p>${message}</p>
            </div>
        `;
    }

    /**
     * فلترة الألعاب حسب نص البحث
     * @public
     * @param {string} query
     */
    filter(query) {
        const searchTerm = query.toLowerCase();
        const filtered = this.config.gamesData.filter(game =>
            game.name.toLowerCase().includes(searchTerm) ||
            (game.tags && game.tags.some(tag => tag.toLowerCase().includes(searchTerm)))
        );
        if (filtered.length === 0) {
            this._renderEmptyState(`لا توجد نتائج تطابق "${query}"`);
            return false;
        }
        this._renderFilteredGrid(filtered);
        return true;
    }


    /**
     * تحديث بيانات الألعاب وإعادة العرض
     * @public
     * @param {Array} newGamesData
     */
    async refresh(newGamesData) {
        if (Array.isArray(newGamesData)) {
            this.config.gamesData = newGamesData;
            await this._renderGamesGrid();
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
