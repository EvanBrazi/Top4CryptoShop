/**
 * @file hometab.js
 * @module HomeTab
 * @author Evan Brazi
 * @version 4.3.0
 * @description تبويب الصفحة الرئيسية لعرض البطاقات الأساسية باستخدام نظام الأيقونات الموحد مع دعم تعدد الأيقونات وتحليل الأداء
 * @license MIT
 * @created 2024-12-01
 * @updated 2025-08-22
 */

class HomeTab {
  /**
   * @constructor
   * @param {Object} config - إعدادات التهيئة
   * @param {Object} config.taber - كائن إدارة التبويبات
   * @param {string} config.containerId - معرف عنصر الحاوية
   * @param {Function} [config.whichCardClick] - دالة يتم استدعاؤها عند النقر على بطاقة
   * @param {Object} [config.options={}] - إعدادات إضافية
   * @param {Object} [config.options.homeTabIcons] - نظام الأيقونات الموحد
   * @param {Object} [config.options.iconRenderer] - وحدة عرض الأيقونات
   * @param {Array} [config.options.cardsData] - بيانات البطاقات
   * @param {string} [config.options.CSSLink='card-grid.css'] - مسار ملف CSS
   * @param {string} [config.options.fallbackUrl='/icons/appstab/apps_tab.png'] - أيقونة بديلة عند الفشل
   */
  constructor({ taber, containerId, whichCardClick, options = {} }) {
    if (!taber) throw new Error('Taber instance is required');
    this.taber = taber;

    this.container = document.getElementById(containerId);
    if (!this.container) throw new Error(`Container "${containerId}" not found`);

    this.whichCardClick = typeof whichCardClick === 'function' ? whichCardClick : () => { };
    this.homeIconLoader = options.homeIconLoader;

    this.options = {
      cardsData: options.cardsData || this._defaultCards(),
      CSSLink: options.CSSLink || 'apps-cards.css',
      fallbackUrl: options.fallbackUrl || '/icons/appstab/apps_tab.png'
    };

    this._initializeComponent();
  }

  /**
   * عرض هيكل تحميل مؤقت
   * @private
   */
  _renderSkeletonLoading() {
    const skeleton = document.createElement('div');
    skeleton.className = 'skeleton-loading';
    skeleton.innerHTML = `
      <div class="skeleton-grid">
        ${Array(12).fill('<div class="skeleton-card"></div>').join('')}
      </div>
    `;
    this.container.appendChild(skeleton);
    setTimeout(() => skeleton.remove(), 500);
  }

  /**
   * تهيئة المكون
   * @private
   */
  async _initializeComponent() {
    this._renderSkeletonLoading();
    try {
      await this._loadCSS();
      this.render();
    } catch (err) {
      console.warn('HomeTab init error:', err);
      this._showErrorState();
    }
  }

  /**
   * تحميل CSS ديناميكيًا
   * @private
   */
  _loadCSS() {
    const href = this.options.CSSLink;
    if (document.querySelector(`link[href*="${href}"]`)) return Promise.resolve();

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
   */
  async render() {
    this.container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'card-grid-container';

    const cardElements = await Promise.all(
      this.options.cardsData.map(async (card, index) => await this._createCardElement(card, index))
    );

    cardElements.forEach(el => {
      if (el instanceof Node) {
        grid.appendChild(el);
      } else {
        console.warn(`❌ عنصر البطاقة رقم ${el?.dataset?.index ?? 'غير معروف'} غير صالح`, el);
      }
    });

    this.container.appendChild(grid);
    this._adjustCardsToScreenSize();
  }

  /**
   * إنشاء عنصر بطاقة واحدة
   * @private
   */
  async _createCardElement(card, index) {
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.index = index;
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', card.title || 'بطاقة');

    // 🖼️ تحميل الأيقونة
    const iconName = card.icon || (Array.isArray(card.icons) ? card.icons[0] : null);
    console.log('HomeTab ::: _createCardElement : iconName : ', iconName);

    if (iconName) {
      const icon = document.createElement('img');
      icon.className = 'card-icon';
      icon.alt = card.title || 'Icon';
      icon.loading = 'lazy';

      try {
        this.appsIconLoader.render(iconName, img, this.options.fallbackUrl);

        icon.onload = () => {
          console.log('✅ تم تحميل الصورة بنجاح:', icon.src);
        };
        icon.onerror = () => {
          console.error('❌ فشل تحميل الصورة:', icon.src);
        };

        el.appendChild(icon);
      } catch (error) {
        console.warn('❌ فشل تحميل الأيقونة:', iconName, error);
      }
    }

    // 📝 عنوان البطاقة
    const title = document.createElement('h3');
    title.className = 'card-title';
    title.textContent = card.title || 'بطاقة';
    el.appendChild(title);

    // 💡 تفاعل المستخدم
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => this._handleCardClick(index, card));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this._handleCardClick(index, card);
      }
    });

    return el;
  }

  /**
   * التعامل مع النقر على البطاقة
   * @private
   */
  _handleCardClick(index, card) {
    this.container.querySelectorAll('.card').forEach(c => c.classList.remove('active'));
    const clickedCard = this.container.querySelector(`.card[data-index="${index}"]`);
    if (clickedCard) clickedCard.classList.add('active');

    if (this.taber) this.taber.activateTab(card.whichTab);
    this.whichCardClick(index, card);
  }

  /**
   * ضبط حجم البطاقات حسب الشاشة
   * @private
   */
  _adjustCardsToScreenSize() {
    const w = window.innerWidth * 0.4;
    const h = window.innerHeight * 0.3;
    this.container.querySelectorAll('.card').forEach(card => {
      card.style.width = `${w}px`;
      card.style.height = `${h}px`;
    });
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
}

export { HomeTab };
