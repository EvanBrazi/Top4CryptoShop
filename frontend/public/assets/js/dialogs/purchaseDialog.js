import { STORAGE_KEYS, getFullPathByCategory } from "../utils/appUtils.js";

/**
 * @class DialogPurchase
 * @description نافذة حوار الشراء الديناميكية مع دعم الفئات والثيمات والتأثيرات
 * @version 3.0
 * @author فريق التطوير
 */
export class DialogPurchase {
  /**
   * إنشاء مثيل لنافذة حوار الشراء
   * @param {Object} card - كائن يمثل بيانات البطاقة (name, price, category, icon, quantity, maxLimit, ...)
   * @param {Object} options - خيارات إضافية للتخصيص
   * @param {string} options.iconsBasePath - المسار الأساسي للرموز
   * @param {string} options.cssPath - مسار ملف CSS الإضافي
   * @param {string} options.supportPhone - رقم الدعم الفني
   */
  constructor(card, options = {}) {
    this.card = card;
    this.cardName = card.name || 'غير معروف';
    this.category = card.category || 'default';
    this.cardIcon = `${getFullPathByCategory(this.category)}${card.icon || 'default.png'}`;
    this.cardMenuPrice = card.menuPrice === true;
    this.cardAvailable = card.available === true;
    
    // ✅ معالجة الكمية - دعم المصفوفة والقيمة المفردة
    if (Array.isArray(card.quantity)) {
      this.cardQuantities = card.quantity.map(q => parseInt(q)).filter(q => !isNaN(q));
    } else {
      const singleQuantity = parseInt(card.quantity || 1);
      this.cardQuantities = isNaN(singleQuantity) ? [1] : [singleQuantity];
    }
    
    // ✅ معالجة السعر - دعم المصفوفة والقيمة المفردة
    if (Array.isArray(card.price)) {
      this.cardPrices = card.price.map(p => parseFloat(p)).filter(p => !isNaN(p));
    } else {
      const singlePrice = parseFloat(card.price || 0);
      this.cardPrices = isNaN(singlePrice) ? [0] : [singlePrice];
    }
    
    this.cardMaxLimit = parseInt(card.maxLimit) || null;
    this.initialQuantity = this.cardQuantities[0];
    this.cardPrice = this.cardPrices[0];

    // ✅ بيانات المستخدم والثيم
    this.userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
    this.token = localStorage.getItem(STORAGE_KEYS.USER_TOKEN);
    this.theme = localStorage.getItem('theme') === 'night' ? 'night' : 'day';

    // ✅ خيارات إضافية
    this.options = {
      iconsBasePath: options.iconsBasePath ?? '/assets/images/',
      cssPath: options.cssPath ?? '/assets/css/purchase-dialog.css',
      supportPhone: options.supportPhone ?? '+349374836'
    };

    this._loadCSS();
  }

  /**
   * ✅ تحميل ملف CSS الخاص بالحوار
   * @description يضمن تحميل ملف CSS مرة واحدة فقط لمنع التكرار
   * @private
   */
  _loadCSS() {
    const existing = document.querySelector(`link[href="${this.options.cssPath}"]`);
    if (!existing) {
      const link = document.createElement('link');
      link.id = 'dialog-purchase-css';
      link.rel = 'stylesheet';
      link.href = this.options.cssPath;
      document.head.appendChild(link);
    }
  }

  /**
   * ✅ فتح نافذة الحوار
   * @description ينشئ ويفتح نافذة الحوار مع التحقق من عدم التكرار
   * @public
   */
  open() {
    if (this.overlay) {
      console.warn('⚠️ مربع الحوار مفتوح بالفعل');
      return;
    }

    this.overlay = document.createElement('div');
    this.overlay.className = `purchase-dialog-overlay active ${this.theme}`;
    this.overlay.style.opacity = '0';
    document.body.appendChild(this.overlay);
    document.body.style.overflow = 'hidden';

    this.overlay.innerHTML = this.cardAvailable
      ? this._getAvailableTemplateHTML()
      : this._getUnavailableTemplateHTML();

    const dialog = this.overlay.querySelector('.purchase-dialog');
    dialog.classList.add(this.category);
    dialog.classList.add(this.theme);

    requestAnimationFrame(() => {
      this.overlay.style.opacity = '1';
    });

    if (this.cardAvailable) {
      this._setupDialogEvents();
      this._injectCardData();
    } else {
      this._setupUnavailableEvents();
    }
  }

  /**
   * ✅ إغلاق نافذة الحوار
   * @description يغلق نافذة الحوار بلطف مع تأثيرات متحركة
   * @public
   */
  close() {
    if (!this.overlay) return;

    const dialog = this.overlay.querySelector('.purchase-dialog');
    if (dialog) dialog.classList.add('closing');

    this.overlay.style.opacity = '0';
    document.body.style.overflow = '';

    setTimeout(() => {
      this.overlay?.remove();
      this.overlay = null;
    }, 500);
  }

  /**
   * ✅ إعداد الأحداث للحوار المتاح
   * @description يربط جميع الأحداث بالأزرار والمدخلات داخل مربع الحوار
   * @private
   */
  _setupDialogEvents() {
    const $ = (sel) => this.overlay.querySelector(sel);
    const $$ = (sel) => this.overlay.querySelectorAll(sel);

    // ✅ أحداث الأزرار الأساسية
    $('.dialog-purchase-close-btn')?.addEventListener('click', () => this.close());
    $('.cancel-btn')?.addEventListener('click', () => this.close());

    // ✅ حدث زر التأكيد والشراء
    $('.confirm-btn')?.addEventListener('click', async () => {
      if (!this._validateAllInputs()) return;

      const quantity = parseInt($('.quantity-input')?.value || $('.quantity-select')?.value || '1');
      const price = parseFloat($('.price-select')?.value || $('.price-input')?.value || this.cardPrice);
      const totalAmount = (price * quantity).toFixed(2);

      const playerId = $('#player-id')?.value.trim();
      const playerName = $('#player-name')?.value.trim();
      const confirmBtn = $('.confirm-btn');
      
      confirmBtn.classList.add('button-loading');

      try {
        const balance = await this._getUserBalance();
        if (balance < totalAmount) {
          this._showAlert('⚠️ رصيدك غير كافٍ، سيتم تحويلك إلى تبويب الدفع', 'warning');
          return;
        }

        const reserveRes = await fetch(`/api/users/${this.userId}/reserve`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.token}`
          },
          body: JSON.stringify({ amount: totalAmount })
        });

        if (!reserveRes.ok) {
          this._showAlert('❌ فشل في حجز الرصيد', 'error');
          return;
        }

        const orderResult = await this._saveOrder({
          type: 'newOrder',
          userId: this.userId,
          playerId,
          quantity,
          amount: totalAmount,
          method: this.category,
          service: this.cardName,
          playerName,
        });

        if (orderResult?.status === 'success') {
          this._showAlert('✅ تم تنفيذ الطلب بنجاح', 'success');
          setTimeout(() => this.close(), 1500);
        } else {
          await fetch(`/api/users/${this.userId}/restore`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.token}`
            },
            body: JSON.stringify({ amount: totalAmount })
          });
          this._showAlert('❌ فشل في تنفيذ الطلب، تم استرجاع الرصيد', 'error');
        }
      } catch (error) {
        console.error('خطأ أثناء المعالجة:', error);
        this._showAlert('❌ حدث خطأ غير متوقع أثناء المعالجة', 'error');
      } finally {
        confirmBtn.classList.remove('button-loading');
      }
    });

    // ✅ تحديث المجموع عند تغيير الكمية أو السعر
    $$('.quantity-input, .quantity-select, .price-select, .price-input').forEach((el) => {
      el.addEventListener('input', () => {
        this._updateTotal();
        this._validateQuantity();
      });
    });

    // ✅ تحديث اسم اللاعب
    $('.refresh-player-btn')?.addEventListener('click', async () => {
      const playerName = await this._generatePlayerName();
      $('#player-name').value = playerName;
    });

    // ✅ التحقق من صحة ID اللاعب أثناء الكتابة
    $('#player-id')?.addEventListener('input', (e) => {
      this._validatePlayerId(e.target.value);
    });

    // ✅ منع الإدخال غير الصحيح في حقول الكمية
    $$('.quantity-input').forEach(input => {
      input.addEventListener('keydown', (e) => {
        // منع الإدخال غير الرقمي إلا للأسهم والحذف
        if (!/[0-9]|Arrow|Delete|Backspace|Tab/.test(e.key) && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
        }
      });
    });
  }

  /**
   * ✅ حقن بيانات البطاقة داخل مربع الحوار
   * @private
   */
  _injectCardData() {
    const $ = (sel) => this.overlay.querySelector(sel);

    $('.dialog-title').textContent = this.cardName;
    $('.price').textContent = `السعر: $${this.cardPrice.toFixed(2)}`;
    
    this._generateQuantityInput();
    this._updateTotal();

    const icon = $('.dialog-icon');
    if (icon) {
      icon.src = this.cardIcon;
      icon.onerror = () => {
        icon.src = `${this.options.iconsBasePath}default-icon.png`;
      };
    }

    // ✅ توليد اسم اللاعب تلقائياً
    this._generatePlayerName().then(name => {
      $('#player-name').value = name;
    });
  }

  /**
   * ✅ توليد إدخال الكمية والسعر حسب نوع البطاقة
   * @private
   */
  _generateQuantityInput() {
    const container = this.overlay.querySelector('.quantity-container');
    if (!container) return;

    container.innerHTML = '';
    const errorElement = document.createElement('span');
    errorElement.className = 'quantity-error error-message';
    container.appendChild(errorElement);

    // ✅ الحالة 1: menuPrice مفعّلة → عرض قائمة أسعار فقط
    if (this.cardMenuPrice && Array.isArray(this.cardPrices)) {
      const priceSelect = document.createElement('select');
      priceSelect.className = 'price-select';
      priceSelect.innerHTML = this.cardPrices.map(price => 
        `<option value="${price}">$${parseFloat(price).toFixed(2)}</option>`
      ).join('');
      
      container.appendChild(priceSelect);

      // ✅ إخفاء حقل الكمية أو جعله للقراءة فقط
      const quantityInput = document.createElement('input');
      quantityInput.type = 'number';
      quantityInput.className = 'quantity-input hidden';
      quantityInput.value = this.initialQuantity;
      quantityInput.readOnly = true;
      container.appendChild(quantityInput);

    } 
    // ✅ الحالة 2: menuPrice غير مفعّلة → عرض إدخال الكمية فقط
    else {
      const quantityInput = document.createElement('input');
      quantityInput.type = 'number';
      quantityInput.className = 'quantity-input';
      quantityInput.min = 1;
      quantityInput.max = this.cardMaxLimit || 1000;
      quantityInput.step = 1;
      quantityInput.value = this.initialQuantity;
      quantityInput.placeholder = 'أدخل الكمية';
      
      container.appendChild(quantityInput);

      // ✅ إضافة رسائل التوجيه للحد الأقصى
      if (this.cardMaxLimit) {
        const limitInfo = document.createElement('small');
        limitInfo.className = 'limit-info';
        limitInfo.textContent = `الحد الأقصى: ${this.cardMaxLimit.toLocaleString()}`;
        container.appendChild(limitInfo);
      }
    }
  }

  /**
   * ✅ تحديث المجموع تلقائياً
   * @private
   */
  _updateTotal() {
    const $ = (sel) => this.overlay.querySelector(sel);
    
    let quantity = 1;
    let price = this.cardPrice;

    if (this.cardMenuPrice) {
      price = parseFloat($('.price-select')?.value || this.cardPrice);
    } else {
      quantity = parseInt($('.quantity-input')?.value || this.initialQuantity);
    }

    const total = (price * quantity).toFixed(2);
    $('.dialog-total').textContent = `المجموع: $${total}`;
  }

  /**
   * ✅ التحقق من صحة جميع المدخلات
   * @returns {boolean} صحة جميع المدخلات
   * @private
   */
  _validateAllInputs() {
    const $ = (sel) => this.overlay.querySelector(sel);
    
    const quantityValid = this._validateQuantity();
    const playerIdValid = this._validatePlayerId($('#player-id')?.value);
    
    if (!quantityValid) {
      this._showAlert('⚠️ تحقق من الكمية المدخلة', 'warning');
      return false;
    }
    
    if (!playerIdValid) {
      this._showAlert('❌ تحقق من ID اللاعب', 'error');
      return false;
    }
    
    return true;
  }

  /**
   * ✅ التحقق من صحة الكمية
   * @returns {boolean} صحة الكمية المدخلة
   * @private
   */
  _validateQuantity() {
    const $ = (sel) => this.overlay.querySelector(sel);
    const errorElement = $('.quantity-error');
    
    let quantity = 1;
    if (!this.cardMenuPrice) {
      quantity = parseInt($('.quantity-input')?.value || '1');
    }

    if (isNaN(quantity) || quantity < 1) {
      errorElement.textContent = '❌ الكمية يجب أن تكون رقمًا صحيحًا موجبًا';
      errorElement.classList.add('show');
      return false;
    }

    if (this.cardMaxLimit && quantity > this.cardMaxLimit) {
      errorElement.textContent = `❌ الكمية تتجاوز الحد الأقصى (${this.cardMaxLimit.toLocaleString()})`;
      errorElement.classList.add('show');
      return false;
    }

    errorElement.textContent = '';
    errorElement.classList.remove('show');
    return true;
  }

  /**
   * ✅ التحقق من صحة ID اللاعب
   * @param {string} value - قيمة ID اللاعب المدخلة
   * @returns {boolean} صحة ID اللاعب
   * @private
   */
  _validatePlayerId(value) {
    const $ = (sel) => this.overlay.querySelector(sel);
    const errorElement = $('#player-id-error');
    const inputEl = $('#player-id');

    if (!value || value.trim().length < 3) {
      errorElement.textContent = '❌ يجب أن يحتوي ID على 3 أحرف على الأقل';
      errorElement.classList.add('show');
      inputEl.classList.add('input-error');
      return false;
    }

    // ✅ التحقق من الأحرار المسموحة (أحرف إنجليزية، أرقام، شرطة سفلية)
    if (!/^[a-zA-Z0-9_]+$/.test(value)) {
      errorElement.textContent = '❌ ID يمكن أن يحتوي فقط على أحرف إنجليزية وأرقام وشرطة سفلية';
      errorElement.classList.add('show');
      inputEl.classList.add('input-error');
      return false;
    }

    // ✅ منع الأنماط المشبوهة
    const suspiciousPatterns = [
      /(.)\1{4,}/, // تكرار حرف أكثر من 4 مرات
      /123456|654321/, // تسلسلات رقمية بسيطة
      /admin|root|system/i // كلمات محظورة
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(value)) {
        errorElement.textContent = '❌ ID غير مقبول';
        errorElement.classList.add('show');
        inputEl.classList.add('input-error');
        return false;
      }
    }

    errorElement.textContent = '';
    errorElement.classList.remove('show');
    inputEl.classList.remove('input-error');
    return true;
  }

  /**
   * ✅ توليد اسم لاعب عشوائي
   * @returns {Promise<string>} اسم لاعب عشوائي
   * @private
   */
  async _generatePlayerName() {
    try {
      // ✅ سيتم استبدال هذا بـ API حقيقي لاحقاً
      const adjectives = ['سريع', 'ذكي', 'غامض', 'قوي', 'شجاع', 'ماهر'];
      const nouns = ['نمر', 'صقر', 'ذئب', 'أسد', 'فهد', 'تنين'];
      const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
      
      return `${rand(adjectives)} ${rand(nouns)} ${Math.floor(Math.random() * 1000)}`;
    } catch (error) {
      return 'لاعب غير معروف';
    }
  }

  /**
   * ✅ عرض رسالة تنبيه للمستخدم
   * @param {string} message - نص الرسالة
   * @param {string} type - نوع الرسالة (info, success, warning, error)
   * @private
   */
  _showAlert(message, type = 'info') {
    // ✅ إنشاء عنصر التنبيه
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    
    // ✅ إضافة أنماط CSS للتنبيه
    alert.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 4px;
      color: white;
      font-weight: bold;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      max-width: 300px;
      animation: slideIn 0.3s ease;
    `;
    
    // ✅ تخصيص الألوان حسب النوع
    const colors = {
      info: '#17a2b8',
      success: '#28a745',
      warning: '#ffc107',
      error: '#dc3545'
    };
    
    alert.style.backgroundColor = colors[type] || colors.info;
    
    // ✅ إضافة إلى الوثيقة
    document.body.appendChild(alert);
    
    // ✅ إزالة بعد 3 ثواني
    setTimeout(() => {
      alert.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => {
        alert.remove();
      }, 300);
    }, 3000);
  }

  /**
   * ✅ جلب رصيد المستخدم من الخادم
   * @returns {Promise<number>} رصيد المستخدم
   * @private
   */
  async _getUserBalance() {
    try {
      const res = await fetch(`/api/users/${this.userId}/balance`, {
        headers: { Authorization: `Bearer ${this.token}` }
      });
      
      if (!res.ok) {
        throw new Error(`فشل في جلب الرصيد: ${res.status}`);
      }
      
      const data = await res.json();
      return Number(data.balance) || 0;
    } catch (err) {
      console.error('❌ فشل في جلب الرصيد:', err);
      this._showAlert('❌ فشل في جلب الرصيد', 'error');
      return 0;
    }
  }

  /**
   * ✅ حفظ الطلب في الخادم
   * @param {Object} orderData - بيانات الطلب
   * @returns {Promise<Object|null>} نتيجة حفظ الطلب
   * @private
   */
  async _saveOrder(orderData) {
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`
        },
        body: JSON.stringify(orderData)
      });
      
      if (!res.ok) {
        throw new Error(`فشل في حفظ الطلب: ${res.status}`);
      }
      
      return await res.json();
    } catch (err) {
      console.error('❌ فشل في حفظ الطلب:', err);
      this._showAlert('❌ فشل في حفظ الطلب', 'error');
      return null;
    }
  }

  /**
   * ✅ إعداد الأحداث للحوار غير المتاح
   * @private
   */
  _setupUnavailableEvents() {
    const $ = (sel) => this.overlay.querySelector(sel);
    const dialog = $('.purchase-dialog');
    if (!dialog) return;
    
    const closeBtn = $('.dialog-purchase-close-btn');
    const supportPhoneEl = $('.support-phone');
    const whatsappBtn = $('.whatsapp-btn');

    // ✅ إغلاق عند الضغط على زر الإغلاق
    closeBtn.addEventListener('click', () => {
      this.close();
    });

    // ✅ إغلاق عند الضغط خارج مربع الحوار
    this.overlay.addEventListener('click', (e) => {
      if (dialog && !dialog.contains(e.target)) {
        this.close();
      }
    });

    // ✅ فتح واتساب عند الضغط على الرقم أو الزر
    const openWhatsApp = () => {
      const phone = supportPhoneEl.textContent.replace(/\D/g, '');
      if (phone) {
        window.open(`https://wa.me/${phone}`, '_blank');
        this.close();
      }
    };

    supportPhoneEl.addEventListener('click', openWhatsApp);
    whatsappBtn.addEventListener('click', openWhatsApp);
  }

  /**
   * ✅ توليد قالب HTML للحوار المتاح
   * @returns {string} كود HTML للحوار المتاح
   * @private
   */
  _getAvailableTemplateHTML() {
    const isMenuPrice = this.cardMenuPrice;
    const priceLabel = isMenuPrice ? 'اختر السعر:' : `السعر: $${this.cardPrice.toFixed(2)}`;
    
    return `
    <div class="purchase-dialog ${this.category}">
      <div class="dialog-header">
        <img class="dialog-icon" src="${this.cardIcon}" alt="${this.cardName}" />
        <h2 class="dialog-title">${this.cardName}</h2>
        <button type="button" class="dialog-purchase-close-btn" title="إغلاق">
          <i class="fas fa-times"></i>
        </button>
      </div>

      <div class="dialog-content">
        <div class="price-quantity">
          <label>${priceLabel}</label>
          <div class="quantity-container"></div>
          <span class="dialog-total">المجموع: $0.00</span>
        </div>

        ${isMenuPrice ? '' : `
        <div class="input-group">
          <label for="player-id">أدخل الـ ID:</label>
          <input type="text" id="player-id" placeholder="مثال: player123" />
          <span id="player-id-error" class="error-message"></span>
        </div>
        `}

        <div class="input-group player-name-group">
          <label for="player-name">اسم اللاعب:</label>
          <div class="player-name-input">
            <input type="text" id="player-name" readonly />
            <button type="button" class="refresh-player-btn" title="تحديث الاسم">
              <i class="fas fa-sync-alt"></i>
            </button>
          </div>
        </div>

        <div class="notes">
          <p>⏰ المعالجة خلال 24 ساعة</p>
          ${this.cardMaxLimit ? `<p>📊 الحد الأقصى: ${this.cardMaxLimit.toLocaleString()}</p>` : ''}
        </div>
      </div>

      <div class="dialog-footer">
        <button type="button" class="confirm-btn">
          <span class="loading-spinner"></span>
          تأكيد الشراء
        </button>
        <button type="button" class="cancel-btn">إلغاء</button>
      </div>
    </div>`;
  }

  /**
   * ✅ توليد قالب HTML للحوار غير المتاح
   * @returns {string} كود HTML للحوار غير المتاح
   * @private
   */
  _getUnavailableTemplateHTML() {
    const supportPhone = this.options.supportPhone || '+000000000';

    return `
    <div class="purchase-dialog">
      <div class="dialog-header">
        <h2 class="dialog-title">غير متاح</h2>
        <button type="button" class="dialog-purchase-close-btn" title="إغلاق">
          <i class="fas fa-times"></i>
        </button>
      </div>

      <div class="dialog-unavailable">
        <p class="unavailable-message">❌ هذا المنتج غير متاح حالياً للشراء</p>
        <p class="unavailable-contact">
          📞 يمكنك التواصل مع الدعم عبر الرقم:
          <strong class="support-phone">${supportPhone}</strong>
        </p>
        <button class="whatsapp-btn">فتح واتساب</button>
      </div>
    </div>
    `;
  }
}
