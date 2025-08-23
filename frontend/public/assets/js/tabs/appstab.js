/**
 * @file appstab.js
 * @module AppsTab
 * @author Evan Brazi
 * @version 9.0.0
 * @description تبويب التطبيقات لعرض شبكة من البطاقات باستخدام نظام الأيقونات الموحد
 * @license MIT
 * @updated 2025-08-22
 */

export class AppsTab {
    /**
     * @constructor
     * @param {Object} config - إعدادات التهيئة
     */
    constructor({ containerId, options = {} }) {
        this.container = document.getElementById(containerId);
        if (!this.container) throw new Error(`Container "${containerId}" not found`);
        this._renderSkeleton();
        this.config = {
            appsData: options.appsData || [],
            appsIconLoader: options.appsIconLoader,
            fallbackUrl: options.fallbackUrl || '/icons/apps/default.png',
            themeColor: options.themeColor || '#6a5acd',
            onCardClick: typeof options.onCardClick === 'function'
                ? options.onCardClick
                : () => console.log('تم النقر على التطبيق')
        };

        this.observer = null;
        this.init();
    }

    /**
     * تهيئة التبويب
     * @private
     * @returns {Promise<void>}
     */
    async init() {
        this._injectStyles();
        await this._renderAppsGrid();
        this._setupLazyLoading();

        console.log('✅ تم تهيئة تبويب التطبيقات');
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
     * عرض شبكة التطبيقات
     * @private
     * @returns {Promise<void>}
     */
    async _renderAppsGrid() {
        this.container.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = 'apps-grid';

        // إنشاء البطاقات
        const cardElements = await Promise.all(
            this.config.appsData.map(app => this._createAppCard(app))
        );

        // إضافة البطاقات إلى الشبكة
        const fragment = document.createDocumentFragment();
        cardElements.forEach(card => {
            if (card instanceof HTMLElement) {
                fragment.appendChild(card);
            }
        });

        grid.appendChild(fragment);
        this.container.appendChild(grid);
    }

    /**
     * إنشاء بطاقة تطبيق واحدة
     * @private
     * @param {Object} app - بيانات التطبيق
     * @returns {Promise<HTMLElement>} عنصر بطاقة التطبيق
     */
    async _createAppCard(app) {
        const card = document.createElement('div');
        card.className = 'app-card';
        card.dataset.appId = app.id || app.name;
        card.dataset.iconName = app.icon || 'default.png';

        // حاوية الأيقونة
        const iconContainer = document.createElement('div');
        iconContainer.className = 'app-icon-container';

        // عنصر الأيقونة
        const iconElement = document.createElement('img');
        iconElement.className = 'app-icon';
        iconElement.alt = app.name;
        iconElement.loading = 'lazy';
        // عرض placeholder أولاً
        iconElement.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiB2aWV3Qm94PSIwIDAgMTAwIDEwMCI+PHJlY3Qgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxMDAiIGZpbGw9IiNlZWVlZWUiLz48L3N2Zz4=';

        iconContainer.appendChild(iconElement);
        card.appendChild(iconContainer);

        // اسم التطبيق
        const nameElement = document.createElement('div');
        nameElement.className = 'app-name';
        nameElement.textContent = app.name;
        card.appendChild(nameElement);

        // مستمع حدث النقر
        card.addEventListener('click', () => this.config.onCardClick(app));
        return card;
    }

    /**
     * تفعيل تحميل الأيقونات عند ظهور البطاقة
     * @private
     */
    _setupLazyLoading() {
        // إيقاف المراقبة السابقة إذا كانت موجودة
        if (this.observer) {
            this.observer.disconnect();
        }

        // إنشاء مراقب جديد للتقاطع
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
            rootMargin: '100px' // تحميل قبل الظهور بـ 50px
        });

        // بدء مراقبة جميع البطاقات
        this.container.querySelectorAll('.app-card').forEach(card => {
            this.observer.observe(card);
        });
    }

    /**
     * تحميل أيقونة البطاقة
     * @private
     * @param {HTMLElement} card - عنصر البطاقة
     * @returns {Promise<void>}
     */
    async _loadCardIcon(card) {
        const img = card.querySelector('.app-icon');
        const iconName = card.dataset.iconName;
        //const appId = card.dataset.appId;
        console.log('AppsTab :: _loadCardIcon(card) : ', img, iconName);

        if (!img || !iconName) return;

        try {
            // استخدام نظام الأيقونات الموحد لتحميل وعرض الأيقونة
            await this.config.appsIconLoader.render(
                iconName,
                img,
                '!'
            );

            console.log('✅ تم تحميل الأيقونة:', iconName);
        } catch (error) {
            console.error('❌ خطأ أثناء تحميل الأيقونة:', iconName, error);
            img.src = this.config.fallbackUrl;
        }
    }

    /**
 * تحميل ملف CSS خارجي إذا لم يكن محمّلًا مسبقًا
 * @private
 */
    _injectStyles() {
        const styleId = 'apps-tab-styles';
        if (document.getElementById(styleId)) return;

        const link = document.createElement('link');
        link.id = styleId;
        link.rel = 'stylesheet';
        link.href = '/assets/css/apps-tab.css'; // تأكد من المسار الصحيح حسب بنية مشروعك
        document.head.appendChild(link);
    }


    /**
     * تحديث بيانات التطبيقات
     * @public
     * @param {Array} newAppsData - بيانات التطبيقات الجديدة
     */
    async refresh(newAppsData) {
        if (Array.isArray(newAppsData)) {
            this.config.appsData = newAppsData;
            await this._renderAppsGrid();
            this._setupLazyLoading();
        }
    }

    /**
     * تنظيف المراقب والموارد
     * @public
     */
    destroy() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    }
}
