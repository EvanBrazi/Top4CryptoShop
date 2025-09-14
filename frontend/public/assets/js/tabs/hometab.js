/**
 * @file hometab.js
 * @module HomeTab
 * @author Evan Brazi
 * @version 5.0.0
 * @description تبويب الصفحة الرئيسية لعرض البطاقات الأساسية باستخدام نظام الأيقونات الموحد
 * @license MIT
 * @updated 2025-08-22
 */

export class HomeTab {
    /**
     * @constructor
     * @param {Object} config - إعدادات التهيئة
     * @param {Object} config.taber - كائن إدارة التبويبات
     * @param {string} config.containerId - معرف عنصر الحاوية
     * @param {Function} config.whichCardClick - دالة يتم استدعاؤها عند النقر على بطاقة
     * @param {Object} config.options - إعدادات إضافية
     */
    constructor({ taber, containerId, whichCardClick, options = {} }) {
        if (!taber) throw new Error('Taber instance is required');
        this.taber = taber;

        this.container = document.getElementById(containerId);
        if (!this.container) throw new Error(`Container "${containerId}" not found`);
        this._renderSkeletonLoading();
        this.whichCardClick = typeof whichCardClick === 'function' ? whichCardClick : () => { };

        this.options = {
            cardsData: options.cardsData || this._defaultCards(),
            homeIconLoader: options.homeIconLoader,
            CSSLink: options.CSSLink || 'card-grid.css',
            fallbackUrl: options.fallbackUrl || '/icons/apps/default.png',
            themeColor: options.themeColor || '#6a5acd'
        };

        this._initializeComponent();
    }

    /**
     * تهيئة المكون
     * @private
     * @returns {Promise<void>}
     */
    async _initializeComponent() {
        try {
            await this._loadCSS();
            await this.render();
        } catch (err) {
            console.warn('❌ HomeTab init error:', err);
            this._showErrorState();
        }
    }

    /**
     * عرض هيكل تحميل مؤقت
     * @private
     */
    _renderSkeletonLoading() {
        this.container.innerHTML = `
            <div class="skeleton-loading">
                <div class="skeleton-grid">
                    ${Array(6).fill('<div class="skeleton-card"></div>').join('')}
                </div>
            </div>
        `;
    }

    /**
     * تحميل CSS ديناميكيًا
     * @private
     * @returns {Promise<void>}
     */
    _loadCSS() {
        const href = this.options.CSSLink;
        if (document.querySelector(`link[href*="${href}"]`)) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            link.onload = resolve;
            link.onerror = () => reject(new Error(`Failed to load CSS: ${href}`));
            document.head.appendChild(link);
        });
    }

    /**
     * عرض البطاقات في الشبكة
     * @public
     * @returns {Promise<void>}
     */
    async render() {
        this.container.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = 'big-card-grid-container';

        // إنشاء وعرض البطاقات
        const cardElements = await Promise.all(
            this.options.cardsData.map(async (card, index) =>
                await this._createCardElement(card, index))
        );

        // إضافة البطاقات إلى الشبكة
        cardElements.forEach(cardEl => {
            if (cardEl instanceof HTMLElement) {
                grid.appendChild(cardEl);
            }
        });

        this.container.appendChild(grid);
        this._adjustCardsToScreenSize();

        console.log('✅ تم عرض بطاقات الصفحة الرئيسية');
    }

    /**
     * إنشاء عنصر بطاقة واحدة
     * @private
     * @param {Object} card - بيانات البطاقة
     * @param {number} index - فهرس البطاقة
     * @returns {Promise<HTMLElement>} عنصر البطاقة
     */
    async _createCardElement(card, index) {
        const cardEl = document.createElement('div');
        cardEl.className = 'big-card';
        cardEl.dataset.index = index;
        cardEl.setAttribute('role', 'button');
        cardEl.setAttribute('tabindex', '0');
        cardEl.setAttribute('aria-label', card.title || 'بطاقة');

        // إضافة الأيقونة
        await this._addCardIcon(card, cardEl);

        // إضافة العنوان
        this._addCardTitle(card, cardEl);

        // إضافة مستمعات الأحداث
        this._addCardEventListeners(cardEl, index, card);

        return cardEl;
    }

    /**
     * إضافة أيقونة البطاقة
     * @private
     * @param {Object} card - بيانات البطاقة
     * @param {HTMLElement} cardEl - عنصر البطاقة
     * @returns {Promise<void>}
     */
    async _addCardIcon(card, cardEl) {
        const iconName = card.icon || (Array.isArray(card.icons) ? card.icons[0] : null);
        if (!iconName) return;

        const iconContainer = document.createElement('div');
        iconContainer.className = 'big-card-icon-container';

        const iconElement = document.createElement('img');
        iconElement.className = 'big-card-icon';
        iconElement.alt = card.title || 'Icon';
        iconElement.loading = 'lazy';
        iconElement.src = '/assets/images/loading.gif'; // ⏳ صورة مؤقتة
        iconContainer.appendChild(iconElement);
        cardEl.appendChild(iconContainer); // ✅ عرض البطاقة فورًا

        // 🎯 تحميل الأيقونة لاحقًا بدون تأخير العرض
        this.options.homeIconLoader.render(iconName, iconElement, '!')
            .catch(error => {
                console.warn('❌ فشل تحميل الأيقونة:', iconName, error);
                iconElement.src = this.options.fallbackUrl;
            });
    }

    /**
     * إضافة عنوان البطاقة
     * @private
     * @param {Object} card - بيانات البطاقة
     * @param {HTMLElement} cardEl - عنصر البطاقة
     */
    _addCardTitle(card, cardEl) {
        const titleEl = document.createElement('h3');
        titleEl.className = 'big-card-title';
        titleEl.textContent = card.title || 'بطاقة';
        cardEl.appendChild(titleEl);
    }

    /**
     * إضافة مستمعات الأحداث للبطاقة
     * @private
     * @param {HTMLElement} cardEl - عنصر البطاقة
     * @param {number} index - فهرس البطاقة
     * @param {Object} card - بيانات البطاقة
     */
    _addCardEventListeners(cardEl, index, card) {
        cardEl.style.cursor = 'pointer';

        // النقر بالماوس
        cardEl.addEventListener('click', () => this._handleCardClick(index, card));

        // النقر بلوحة المفاتيح
        cardEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this._handleCardClick(index, card);
            }
        });
    }

    /**
     * التعامل مع النقر على البطاقة
     * @private
     * @param {number} index - فهرس البطاقة
     * @param {Object} card - بيانات البطاقة
     */
    _handleCardClick(index, card) {
        // إزالة النشط من جميع البطاقات
        this.container.querySelectorAll('.big-card').forEach(c =>
            c.classList.remove('active'));

        // إضافة النشط للبطاقة المختارة
        const clickedCard = this.container.querySelector(`.big-card[data-index="${index}"]`);
        if (clickedCard) clickedCard.classList.add('active');

        // تفعيل التبويب المحدد
        if (card.whichTab && this.taber) {
            this.taber.activateTab(card.whichTab);
        }

        // استدعاء الدالة المخصصة
        this.whichCardClick(index, card);
    }

    /**
     * ضبط حجم البطاقات حسب الشاشة
     * @private
     */
    _adjustCardsToScreenSize() {
        const cards = this.container.querySelectorAll('.big-card');
        if (cards.length === 0) return;

        const screenWidth = window.innerWidth;
        let cardWidth, cardHeight;

        if (screenWidth < 768) {
            // هواتف
            cardWidth = screenWidth * 0.4;
            cardHeight = screenWidth * 0.3;
        } else if (screenWidth < 1024) {
            // ألواح
            cardWidth = screenWidth * 0.3;
            cardHeight = screenWidth * 0.25;
        } else {
            // أجهزة مكتبية
            cardWidth = screenWidth * 0.2;
            cardHeight = screenWidth * 0.15;
        }

        cards.forEach(card => {
            card.style.width = `${cardWidth}px`;
            card.style.height = `${cardHeight}px`;
        });
    }

    async _renderFilteredGrid(filteredCards) {
        this.container.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = 'big-card-grid-container';
        const cardElements = await Promise.all(
            filteredCards.map(async (card, index) =>
                await this._createCardElement(card, index))
        );
        cardElements.forEach(cardEl => {
            if (cardEl instanceof HTMLElement) {
                grid.appendChild(cardEl);
            }
        });
        this.container.appendChild(grid);
        this._adjustCardsToScreenSize();
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

    filter(query) {
        const searchTerm = query.toLowerCase();
        const filtered = this.options.cardsData.filter(card =>
            card.title.toLowerCase().includes(searchTerm) ||
            (card.tags && card.tags.some(tag => tag.toLowerCase().includes(searchTerm)))
        );
        if (filtered.length === 0) {
            this._renderEmptyState(`لا توجد نتائج تطابق "${query}"`);
            return false;
        }
        this._renderFilteredGrid(filtered);
        return true;
    }

    /**
     * عرض حالة خطأ في الواجهة
     * @private
     */
    _showErrorState() {
        this.container.innerHTML = `
            <div class="cards-error-state">
                <i class="error-icon">⚠️</i>
                <p>تعذر تحميل البطاقات. حاول لاحقًا.</p>
                <button class="retry-button">إعادة المحاولة</button>
            </div>
        `;

        this.container.querySelector('.retry-button').addEventListener('click', () => {
            this._initializeComponent();
        });
    }

    /**
     * بيانات افتراضية للبطاقات
     * @private
     * @returns {Array} مصفوفة البطاقات الافتراضية
     */
    _defaultCards() {
        return [
            {
                whichTab: "apps",
                title: "التطبيقات",
                icons: ["chat_saya.png", "com_taka_vhgyk.png", "default.png"]
            },
            {
                whichTab: "smallCards",
                title: "الألعاب",
                icon: "default.png"
            },
            {
                whichTab: "smallCards",
                title: "العملات الرقمية",
                icon: "default.png"
            },
            {
                whichTab: "smallCards",
                title: "تعبئة رصيد",
                icon: "default.png"
            }
        ];
    }

    /**
     * تحديث بيانات البطاقات
     * @public
     * @param {Array} newCardsData - بيانات البطاقات الجديدة
     */
    async updateCards(newCardsData) {
        if (Array.isArray(newCardsData)) {
            this.options.cardsData = newCardsData;
            await this.render();
        }
    }

    /**
     * حذف الشبكة الحالية
     * @private
     */
    _deleteGrid() {
        this.container.innerHTML = '';
    }

    /**
     * إعادة عرض الشبكة (مثلاً بعد تغيير البيانات الخارجية)
     * @public
     */
    async refresh() {
        this._deleteGrid();
        await this.render();
    }
}
