import { STORAGE_KEYS, getFullPathByCategory } from "../utils/appUtils.js";

/**
         * @class DialogPurchase
         * @description نافذة حوار الشراء الديناميكية مع دعم الفئات والثيمات والتأثيرات
         * @version 2.0
         * @author فريق التطوير
         */
export class DialogPurchase {
  /**
   * إنشاء مثيل لنافذة حوار الشراء
   * @param {HTMLElement} element - عنصر البطاقة الذي تم النقر عليه
   * @param {Object} options - خيارات إضافية للتخصيص
   * @param {string} options.iconsBasePath - المسار الأساسي للرموز
   * @param {string} options.cssPath - مسار ملف CSS الإضافي
   * @param {string} options.supportPhone - رقم الدعم الفني
   */
  constructor(element, options = {}) {
    this.element = element;

    // استخراج بيانات البطاقة من العنصر
    this.cardName = element.querySelector('.title')?.textContent.trim() || 'غير معروف';
    this.cardPrice = parseFloat(element.dataset.price || 0);
    this.category = element.dataset.category || 'default';
    this.cardIcon = `${getFullPathByCategory(this.category)}${element.dataset.iconName || 'default.png'}`;
    this.cardAvailable = element.dataset.isAvailable === 'true';
    this.initialQuantity = parseInt(element.dataset.quantity || '') || 1;

    // بيانات المستخدم والثيم
    this.userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
    this.token = localStorage.getItem(STORAGE_KEYS.USER_TOKEN);
    console.log('Theme : ', localStorage.getItem('theme'));
    this.theme = localStorage.getItem('theme') === 'dark' ? 'night' : 'day';

    // خيارات إضافية
    this.options = {
      iconsBasePath: options.iconsBasePath ?? '/assets/images/',
      cssPath: options.cssPath ?? '/assets/css/purchase-dialog.css',
      supportPhone: options.supportPhone ?? '+349374836'
    };

    this._loadCSS();
  }

  /** تحميل ملف CSS */
  _loadCSS() {
    if (!document.getElementById('dialog-purchase-css')) {
      const link = document.createElement('link');
      link.id = 'dialog-purchase-css';
      link.rel = 'stylesheet';
      link.href = this.options.cssPath;
      document.head.appendChild(link);
    }
  }

  /** فتح نافذة الحوار */
  open() {
    this.overlay = document.createElement('div');
    this.overlay.className = `purchase-dialog-overlay active ${this.theme}`;
    this.overlay.style.opacity = '0';
    document.body.appendChild(this.overlay);
    document.body.style.overflow = 'hidden';

    this.overlay.innerHTML = this.cardAvailable
      ? this._getAvailableTemplateHTML()
      : this._getUnavailableTemplateHTML();

    const dialog = this.overlay.querySelector('.purchase-dialog');
    dialog.classList.add(this.category); // apps/games/cryptos/balances
    dialog.classList.add(this.theme);    // day/night

    requestAnimationFrame(() => {
      this.overlay.style.opacity = '1';
    });

    this.cardAvailable
      ? this._setupDialogEvents()
      : this._setupUnavailableEvents();

    this._injectCardData();
  }

  /** إغلاق الحوار */
  close() {
    const dialog = this.overlay.querySelector('.purchase-dialog');
    if (dialog) dialog.classList.add('closing');
    this.overlay.style.opacity = '0';
    document.body.style.overflow = '';
    setTimeout(() => {
      this.overlay?.remove();
      this.overlay = null;
    }, 500);
  }

  /** إعداد الأحداث للحوار المتاح */
  _setupDialogEvents() {
    const $ = (sel) => this.overlay.querySelector(sel);

    $('.dialog-purchase-close-btn')?.addEventListener('click', () => this.close());
    $('.cancel-btn')?.addEventListener('click', () => this.close());

    $('.confirm-btn')?.addEventListener('click', async () => {
      if (!this._validateInputs()) return;
      const quantity = Math.max(1, parseInt($('.quantity-input')?.value || '1'));
      const playerId = $('#player-id')?.value.trim();
      const playerName = $('#player-name')?.value.trim();
      const totalAmount = (this.cardPrice * quantity).toFixed(2);

      // عرض حالة التحميل
      const confirmBtn = $('.confirm-btn');
      confirmBtn.classList.add('button-loading');

      try {
        const balance = await this._getUserBalance();
        if (balance < totalAmount) {
          alert('⚠️ رصيدك غير كافٍ، سيتم تحويلك إلى تبويب الدفع');
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
          alert('❌ فشل في حجز الرصيد');
          return;
        }

        const orderResult = await this._saveOrder({
          type: 'newOrder',
          userId: this.userId,
          playerId: playerId,
          quantity: quantity,
          amount: totalAmount,
          method: this.category,
          service: this.cardName,
          playerName: playerName,
        });

        if (orderResult?.status === 'success') {
          //alert('✅ تم تنفيذ الطلب بنجاح');
          this.close();
        } else {
          await fetch(`/api/users/${this.userId}/restore`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.token}`
            },
            body: JSON.stringify({ amount: totalAmount })
          });
          alert('❌ فشل في تنفيذ الطلب، تم استرجاع الرصيد');
        }
      } catch (error) {
        console.error('خطأ أثناء المعالجة:', error);
        alert('❌ حدث خطأ غير متوقع أثناء المعالجة');
      } finally {
        confirmBtn.classList.remove('button-loading');
        this.close();
      }
    });

    $('.quantity-input')?.addEventListener('input', (e) => {
      this._validateQuantity(e.target.value);
      const qty = Math.max(1, parseInt(e.target.value) || 1);
      $('.dialog-total').textContent = `المجموع: $${(this.cardPrice * qty).toFixed(2)}`;
      $('.quantity-warning')?.classList.toggle('hidden', qty >= 2);
    });

    $('.refresh-player-btn')?.addEventListener('click', () => {
      const input = $('#player-name');
      input.value = this._generatePlayerName();
    });

    // إضافة تحقق أثناء الكتابة
    $('#player-id')?.addEventListener('input', (e) => {
      this._validatePlayerId(e.target.value);
    });
  }

  /**
   * التحقق من صحة المدخلات
   * @returns {boolean} صحة جميع المدخلات
   */
  _validateInputs() {
    const $ = (sel) => this.overlay.querySelector(sel);
    const quantityValid = this._validateQuantity($('.quantity-input')?.value);
    const playerIdValid = this._validatePlayerId($('#player-id')?.value);

    return quantityValid && playerIdValid;
  }

  /**
   * التحقق من صحة الكمية
   * @param {string} value - قيمة الكمية المدخلة
   * @returns {boolean} صحة الكمية
   */
  _validateQuantity(value) {
    const $ = (sel) => this.overlay.querySelector(sel);
    const quantity = parseInt(value);
    const errorElement = $('.quantity-error');

    if (isNaN(quantity) || quantity < 1) {
      $('.quantity-input').classList.add('input-error');
      errorElement.textContent = 'الكمية يجب أن تكون رقمًا صحيحًا أكبر من الصفر';
      errorElement.classList.add('show');
      return false;
    }

    $('.quantity-input').classList.remove('input-error');
    errorElement.classList.remove('show');
    return true;
  }

  /**
   * التحقق من صحة معرف اللاعب
   * @param {string} value - قيمة المعرف المدخلة
   * @returns {boolean} صحة المعرف
   */
  _validatePlayerId(value) {
    const $ = (sel) => this.overlay.querySelector(sel);
    const errorElement = $('#player-id-error');

    if (!value || value.trim().length < 3) {
      $('#player-id').classList.add('input-error');
      errorElement.textContent = 'معرف اللاعب يجب أن يحتوي على 3 أحرف على الأقل';
      errorElement.classList.add('show');
      return false;
    }

    $('#player-id').classList.remove('input-error');
    errorElement.classList.remove('show');
    return true;
  }

  /** إعداد الأحداث للحوار غير المتاح */
  _setupUnavailableEvents() {
    const $ = (sel) => this.overlay.querySelector(sel);
    $('.dialog-purchase-close-btn')?.addEventListener('click', () => this.close());
    $('.whatsapp-btn')?.addEventListener('click', () => {
      const phone = this.options.supportPhone.replace(/\D/g, '');
      window.open(`https://wa.me/${phone}`, '_blank');
    });
  }

  /** حقن بيانات البطاقة */
  _injectCardData() {
    const $ = (sel) => this.overlay.querySelector(sel);
    $('.dialog-title').textContent = this.cardName;
    $('.product-name').textContent = this.cardName;
    $('.price').textContent = `السعر: $${this.cardPrice.toFixed(2)}`;
    $('.dialog-total').textContent = `المجموع: $${(this.cardPrice * this.initialQuantity).toFixed(2)}`;
    $('.quantity-input').value = this.initialQuantity;

    const icon = $('.dialog-icon');
    if (icon) {
      icon.src = this.cardIcon;
      icon.onerror = () => {
        icon.src = `${this.options.iconsBasePath}loading.gif`;
      };
    }

    const playerNameInput = $('#player-name');
    if (playerNameInput) {
      playerNameInput.value = this._generatePlayerName();
      playerNameInput.setAttribute('readonly', true);
    }
  }
  
  /** توليد اسم لاعب عشوائي */
  _generatePlayerName() {
    const adjectives = ['سريع', 'ذكي', 'غامض', 'قوي'];
    const nouns = ['نمر', 'صقر', 'ذئب', 'أسد'];
    const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
    return `${rand(adjectives)} ${rand(nouns)} ${Math.floor(Math.random() * 1000)}`;
  }

  /** جلب رصيد المستخدم */
  async _getUserBalance() {
    try {
      const res = await fetch(`/api/users/${this.userId}/balance`, {
        headers: { Authorization: `Bearer ${this.token}` }
      });
      const data = await res.json();
      return Number(data.balance) || 0;
    } catch (err) {
      console.error('❌ فشل في جلب الرصيد:', err);
      return 0;
    }
  }

  /** حفظ الطلب */
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
      return await res.json();
    } catch (err) {
      console.error('❌ فشل في حفظ الطلب:', err);
      return null;
    }
  }

  /** قالب HTML للحوار المتاح */
  _getAvailableTemplateHTML() {
    return `
                    <div class="purchase-dialog">
                        <div class="dialog-header">
                            <h2 class="dialog-title">إتمام الشراء</h2>
                            <button type="button" class="dialog-purchase-close-btn" title="إغلاق">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>

                        <div class="dialog-content">
                            <div class="product-info">
                                <img class="dialog-icon" src="${this.cardIcon}" alt="رمز المنتج" />
                                <span class="product-name">${this.cardName}</span>
                            </div>

                            <div class="price-quantity">
                                <span class="price">السعر: $${this.cardPrice.toFixed(2)}</span>
                                <label for="quantity">الكمية:</label>
                                <input type="number" class="quantity-input" min="1" value="${this.initialQuantity}" />
                                <span class="quantity-error error-message"></span>
                                <span class="quantity-warning hidden">⚠️ الكمية يجب أن تكون 2 أو أكثر للحصول على خصم</span>
                            </div>

                            <div class="input-group">
                                <label for="player-id">أدخل الـ ID:</label>
                                <input type="text" id="player-id" />
                                <span id="player-id-error" class="error-message"></span>
                            </div>

                            <div class="input-group player-name-group">
                                <label for="player-name">اسم اللاعب:</label>
                                <div style="display: flex; gap: 8px; align-items: center;">
                                    <input type="text" id="player-name" placeholder="اسم اللاعب" readonly />
                                    <button type="button" class="refresh-player-btn" title="تحديث الاسم">
                                        <i class="fas fa-sync-alt"></i>
                                    </button>
                                </div>
                            </div>

                            <div class="notes">
                                <p id="product-description">
                                    هذا المنتج يعمل خلال 24 ساعة بشكل أوتوماتيكي، الكمية الافتراضية 1000
                                </p>
                            </div>
                        </div>

                        <div class="dialog-footer">
                            <span class="dialog-total">المجموع: $${(this.cardPrice * this.initialQuantity).toFixed(2)}</span>
                            <button type="button" class="confirm-btn">
                                <span class="loading-spinner"></span>
                                شراء
                            </button>
                            <button type="button" class="cancel-btn">إلغاء</button>
                        </div>
                    </div>
                `;
  }

  _getUnavailableTemplateHTML() {
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
                            <strong class="support-phone">${this.options.supportPhone}</strong>
                        </p>
                        <button class="whatsapp-btn">فتح واتساب</button>
                    </div>
                </div>
            `;
  }
}
