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
        this._renderSkeleton();
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
        iconElement.src = ''; // سيتم تحميله لاحقًا

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
            rootMargin: '50px' // تحميل قبل الظهور بـ 50px
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
     * حقن أنماط CSS المخصصة
     * @private
     */
    _injectStyles() {
        const styleId = 'apps-tab-styles';
        if (document.getElementById(styleId)) return;

        const styles = `
            .apps-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
                gap: 16px;
                padding: 16px;
            }
            
            .app-card {
                display: flex;
                flex-direction: column;
                align-items: center;
                padding: 12px;
                border-radius: 12px;
                background: white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                transition: transform 0.2s, box-shadow 0.2s;
                cursor: pointer;
            }
            
            .app-card:hover {
                transform: translateY(-4px);
                box-shadow: 0 4px 16px rgba(0,0,0,0.15);
            }
            
            .app-icon-container {
                width: 64px;
                height: 64px;
                margin-bottom: 8px;
                border-radius: 16px;
                overflow: hidden;
                background: #f5f5f5;
            }
            
            .app-icon {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }
            
            .app-name {
                font-size: 14px;
                font-weight: 500;
                text-align: center;
                color: #333;
            }
            
            .skeleton-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
                gap: 16px;
                padding: 16px;
            }
            
            .skeleton-card {
                height: 120px;
                border-radius: 12px;
                background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
                background-size: 200% 100%;
                animation: loading 1.5s infinite;
            }
            
            @keyframes loading {
                0% { background-position: 200% 0; }
                100% { background-position: -200% 0; }
            }
        `;

        const styleElement = document.createElement('style');
        styleElement.id = styleId;
        styleElement.textContent = styles;
        document.head.appendChild(styleElement);
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
