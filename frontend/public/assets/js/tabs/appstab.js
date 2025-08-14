/**
 * @file appstab.js
 * @class AppsTab
 * @description إدارة تبويب التطبيقات مع نظام التحميل البطيء للأيقونات ونافذة شراء متكاملة
 * @version 6.0.0
 * @license MIT
 */

export class AppsTab {
  /**
   * @constructor
   * @param {Object} config - إعدادات التهيئة
   * @param {string} config.containerId - معرف العنصر الحاوي
   * @param {Object} [options={}] - خيارات إضافية
   * @param {Array} [options.appsData=[]] - بيانات التطبيقات
   * @param {string} [options.iconsBasePath='/icons/apps/'] - المسار الأساسي للأيقونات
   * @param {string} [options.themeColor='#6a5acd'] - لون السمة الرئيسي
   */
  constructor({ containerId, options = {} }) {
    // التحقق من وجود عنصر الحاوية
    this.container = document.getElementById(containerId);
    if (!this.container) {
      throw new Error(`❌ عنصر الحاوية غير موجود: ${containerId}`);
    }

    // تعيين الخيارات مع القيم الافتراضية
    this.options = {
      appsData: options.appsData || [],
      iconsBasePath: options.iconsBasePath || '/icons/apps/',
      themeColor: options.themeColor || '#6a5acd',
      dialogBgColor: options.dialogBgColor || '#ffffff'
    };

    // ذاكرة تخزين مؤقت للعناصر
    this.cache = {
      icons: new Map(),
      elements: new Map()
    };

    // تهيئة المكون
    this._init();
  }

  /**
   * @private
   * تهيئة المكون الرئيسي
   */
  async _init() {
    this._injectStyles();
    this._renderSearchBar();
    this._renderAppsGrid();
    this._setupIntersectionObserver();
  }

  /**
   * @private
   * حقن أنماط CSS المخصصة
   */
  _injectStyles() {
    const styleId = 'apps-tab-styles';
    let style = document.getElementById(styleId);

    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }

    style.textContent = `
      .apps-tab-container {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        padding: 20px;
      }
      .search-container {
        margin-bottom: 20px;
      }
      .search-bar {
        width: 100%;
        padding: 12px 20px;
        border: 2px solid ${this.options.themeColor};
        border-radius: 25px;
        font-size: 16px;
      }
      .apps-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 20px;
      }
      .app-card {
        background: white;
        border-radius: 10px;
        padding: 15px;
        box-shadow: 0 4px 8px rgba(0,0,0,0.1);
        cursor: pointer;
        transition: transform 0.3s;
      }
      .app-card:hover {
        transform: translateY(-5px);
      }
      .app-icon {
        width: 64px;
        height: 64px;
        object-fit: contain;
        margin-bottom: 10px;
        border-radius: 12px;
      }
      .app-name {
        font-weight: bold;
        margin-bottom: 5px;
      }
      .app-price {
        color: ${this.options.themeColor};
      }
      .purchase-dialog {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: ${this.options.dialogBgColor};
        padding: 20px;
        border-radius: 10px;
        box-shadow: 0 0 20px rgba(0,0,0,0.2);
        z-index: 1000;
        width: 90%;
        max-width: 400px;
      }
      .dialog-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        z-index: 999;
      }
      .dialog-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
      }
      .dialog-icon {
        width: 80px;
        height: 80px;
        margin: 0 auto 15px;
        display: block;
      }
      .price-display {
        text-align: center;
        font-size: 18px;
        margin: 10px 0;
        color: ${this.options.themeColor};
      }
      .input-group {
        margin: 15px 0;
      }
      .input-group label {
        display: block;
        margin-bottom: 5px;
      }
      .input-group input {
        width: 100%;
        padding: 10px;
        border: 1px solid #ddd;
        border-radius: 4px;
      }
      .total-price {
        font-weight: bold;
        margin: 15px 0;
        text-align: center;
      }
      .dialog-actions {
        display: flex;
        justify-content: space-between;
        margin-top: 20px;
      }
      .dialog-btn {
        padding: 10px 20px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      }
      .buy-btn {
        background: ${this.options.themeColor};
        color: white;
      }
      .cancel-btn {
        background: #f1f1f1;
      }
    `;
  }

  /**
   * @private
   * إنشاء شريط البحث
   */
  _renderSearchBar() {
    const searchContainer = document.createElement('div');
    searchContainer.className = 'search-container';

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = '🔍 ابحث عن تطبيق...';
    searchInput.className = 'search-bar';
    searchInput.addEventListener('input', (e) => this._filterApps(e.target.value));

    searchContainer.appendChild(searchInput);
    this.container.appendChild(searchContainer);
  }

  /**
   * @private
   * تصفية التطبيقات حسب كلمة البحث
   * @param {string} term - كلمة البحث
   */
  _filterApps(term) {
    const keyword = term.toLowerCase().trim();
    this.filteredApps = keyword
      ? this.options.appsData.filter(app => 
          app.name.toLowerCase().includes(keyword) ||
          (app.description && app.description.toLowerCase().includes(keyword))
      : [...this.options.appsData];

    this._renderAppsGrid();
  }

  /**
   * @private
   * عرض شبكة التطبيقات
   */
  _renderAppsGrid() {
    // إزالة الشبكة القديمة إن وجدت
    const oldGrid = this.container.querySelector('.apps-grid');
    if (oldGrid) oldGrid.remove();

    const grid = document.createElement('div');
    grid.className = 'apps-grid';

    if (this.filteredApps && this.filteredApps.length > 0) {
      this.filteredApps.forEach(app => {
        const card = this._createAppCard(app);
        grid.appendChild(card);
      });
    } else {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;">لا توجد تطبيقات متاحة</div>';
    }

    this.container.appendChild(grid);
  }

  /**
   * @private
   * إنشاء بطاقة تطبيق
   * @param {Object} app - بيانات التطبيق
   * @returns {HTMLElement} عنصر البطاقة
   */
  _createAppCard(app) {
    const card = document.createElement('div');
    card.className = 'app-card';
    card.dataset.appId = app.id;

    // أيقونة التطبيق (سيتم تحميلها عند الظهور على الشاشة)
    const icon = document.createElement('img');
    icon.className = 'app-icon';
    icon.alt = app.name;
    icon.dataset.src = `${this.options.iconsBasePath}${app.icon || 'default.png'}`;
    icon.loading = 'lazy';

    // معلومات التطبيق
    const name = document.createElement('div');
    name.className = 'app-name';
    name.textContent = app.name;

    const price = document.createElement('div');
    price.className = 'app-price';
    price.textContent = `$${app.price?.toFixed(2) || '0.00'}`;

    // تجميع العناصر
    card.append(icon, name, price);
    
    // إضافة حدث النقر لفتح نافذة الشراء
    card.addEventListener('click', () => this._openPurchaseDialog(app));

    return card;
  }

  /**
   * @private
   * إعداد مراقبة العناصر عند ظهورها على الشاشة
   */
  _setupIntersectionObserver() {
    if (this._observer) {
      this._observer.disconnect();
    }

    this._observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          if (img.dataset.src) {
            img.src = img.dataset.src;
            img.onerror = () => {
              img.src = `${this.options.iconsBasePath}default.png`;
            };
            img.removeAttribute('data-src');
          }
          this._observer.unobserve(img);
        }
      });
    }, { threshold: 0.01 });

    document.querySelectorAll('.app-icon[data-src]').forEach(img => {
      this._observer.observe(img);
    });
  }

  /**
   * @private
   * فتح نافذة شراء التطبيق
   * @param {Object} app - بيانات التطبيق
   */
  _openPurchaseDialog(app) {
    // إغلاق أي نافذة مفتوحة حالياً
    this._closePurchaseDialog();

    // إنشاء طبقة التعتيم
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.addEventListener('click', () => this._closePurchaseDialog());

    // إنشاء نافذة الحوار
    const dialog = document.createElement('div');
    dialog.className = 'purchase-dialog';

    // محتوى النافذة
    dialog.innerHTML = `
      <div class="dialog-header">
        <h3>${app.name}</h3>
        <button class="dialog-close-btn">✕</button>
      </div>
      <img src="${this.options.iconsBasePath}${app.icon || 'default.png'}" 
           alt="${app.name}" 
           class="dialog-icon"
           onerror="this.src='${this.options.iconsBasePath}default.png'">
      <div class="price-display">السعر: $${app.price?.toFixed(2) || '0.00'}</div>
      
      <div class="input-group">
        <label for="quantity">الكمية:</label>
        <input type="number" id="quantity" min="1" value="1" class="quantity-input">
      </div>
      
      <div class="input-group">
        <label for="user-id">معرف المستخدم:</label>
        <input type="text" id="user-id" placeholder="أدخل معرفك" class="user-id-input">
      </div>
      
      <div class="total-price">المجموع: $${app.price?.toFixed(2) || '0.00'}</div>
      
      <div class="dialog-actions">
        <button class="dialog-btn cancel-btn">إلغاء</button>
        <button class="dialog-btn buy-btn">شراء</button>
      </div>
    `;

    // إضافة العناصر إلى DOM
    document.body.appendChild(overlay);
    document.body.appendChild(dialog);

    // إضافة الأحداث
    dialog.querySelector('.dialog-close-btn').addEventListener('click', () => this._closePurchaseDialog());
    dialog.querySelector('.cancel-btn').addEventListener('click', () => this._closePurchaseDialog());
    dialog.querySelector('.buy-btn').addEventListener('click', () => this._processPurchase(app));

    // تحديث السعر عند تغيير الكمية
    const quantityInput = dialog.querySelector('.quantity-input');
    const totalPriceEl = dialog.querySelector('.total-price');
    
    quantityInput.addEventListener('input', () => {
      const quantity = parseInt(quantityInput.value) || 1;
      const total = (app.price * quantity).toFixed(2);
      totalPriceEl.textContent = `المجموع: $${total}`;
    });
  }

  /**
   * @private
   * معالجة عملية الشراء
   * @param {Object} app - بيانات التطبيق
   */
  _processPurchase(app) {
    const dialog = document.querySelector('.purchase-dialog');
    const quantity = parseInt(dialog.querySelector('.quantity-input').value) || 1;
    const userId = dialog.querySelector('.user-id-input').value.trim();
    
    if (!userId) {
      alert('الرجاء إدخال معرف المستخدم');
      return;
    }

    const totalPrice = (app.price * quantity).toFixed(2);
    
    // هنا يمكنك إضافة منطق الشراء الفعلي
    console.log(`تم الشراء: 
      التطبيق: ${app.name}
      الكمية: ${quantity}
      المستخدم: ${userId}
      السعر الإجمالي: $${totalPrice}`);
    
    this._closePurchaseDialog();
    this._showPurchaseSuccess(app.name, quantity, totalPrice);
  }

  /**
   * @private
   * إغلاق نافذة الشراء
   */
  _closePurchaseDialog() {
    const overlay = document.querySelector('.dialog-overlay');
    const dialog = document.querySelector('.purchase-dialog');
    
    if (overlay) overlay.remove();
    if (dialog) dialog.remove();
  }

  /**
   * @private
   * عرض رسالة نجاح الشراء
   * @param {string} appName - اسم التطبيق
   * @param {number} quantity - الكمية
   * @param {string} totalPrice - السعر الإجمالي
   */
  _showPurchaseSuccess(appName, quantity, totalPrice) {
    const toast = document.createElement('div');
    toast.className = 'purchase-toast';
    toast.innerHTML = `
      <div style="
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #4CAF50;
        color: white;
        padding: 12px 24px;
        border-radius: 4px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        z-index: 1001;
        animation: fadeInOut 3s;
      ">
        تم شراء ${quantity} من ${appName} بنجاح - الإجمالي: $${totalPrice}
      </div>
    `;
    
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  /**
   * @public
   * تحديث بيانات التطبيقات
   * @param {Array} newAppsData - بيانات التطبيقات الجديدة
   */
  updateApps(newAppsData) {
    if (!Array.isArray(newAppsData)) {
      console.error('يجب أن تكون بيانات التطبيقات مصفوفة');
      return;
    }
    
    this.options.appsData = newAppsData;
    this.filteredApps = [...newAppsData];
    this._renderAppsGrid();
  }

  /**
   * @public
   * تنظيف الموارد عند التدمير
   */
  destroy() {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
    
    this._closePurchaseDialog();
    this.container.innerHTML = '';
    
    // إزالة الأنماط المحقونة
    const style = document.getElementById('apps-tab-styles');
    if (style) style.remove();
  }
}
