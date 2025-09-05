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
   * @param {Object} card - كائن يمثل بيانات البطاقة (name, price, category, icon, ...)
   * @param {Object} options - خيارات إضافية للتخصيص
   * @param {string} options.iconsBasePath - المسار الأساسي للرموز
   * @param {string} options.cssPath - مسار ملف CSS الإضافي
   * @param {string} options.supportPhone - رقم الدعم الفني
   */
  constructor(card, options = {}) {
    this.card = card;

    // ✅ استخراج البيانات الأساسية من الكائن
    this.cardName = card.name || 'غير معروف';

    // ✅ تحويل السعر إلى مصفوفة آمنة
    if (Array.isArray(card.price)) {
      this.cardPrices = card.price.map(p => parseFloat(p)).filter(p => !isNaN(p));
    } else {
      const singlePrice = parseFloat(card.price || 0);
      this.cardPrices = isNaN(singlePrice) ? [0] : [singlePrice];
    }

    this.cardPrice = this.cardPrices[0]; // السعر الافتراضي
    this.category = card.category || 'default';
    this.cardIcon = `${getFullPathByCategory(this.category)}${card.icon || 'default.png'}`;
    this.cardMenuPrice = card.menuPrice === true;
    this.cardAvailable = card.available === true;
    this.initialQuantity = parseInt(card.initialQuantity || 1);

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
   * @description يمنع التكرار ويضمن تحميل الملف مرة واحدة فقط
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
 * @description ينشئ نافذة الشراء ويحقن البيانات ويمنع التكرار
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
    dialog.classList.add(this.category); // apps/games/cryptos/balances
    dialog.classList.add(this.theme);    // day/night

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
   * @description يزيل مربع الحوار ويعيد التحكم في التمرير
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
   * @description يربط الأحداث بالأزرار والمدخلات داخل مربع الحوار
   */
  _setupDialogEvents() {
    const $ = (sel) => this.overlay.querySelector(sel);
    const $$ = (sel) => this.overlay.querySelectorAll(sel);

    $('.dialog-purchase-close-btn')?.addEventListener('click', () => this.close());
    $('.cancel-btn')?.addEventListener('click', () => this.close());

    $('.confirm-btn')?.addEventListener('click', async () => {
      if (!this._validateInputs()) return;

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
          playerId,
          quantity,
          amount: totalAmount,
          method: this.category,
          service: this.cardName,
          playerName,
        });

        if (orderResult?.status === 'success') {
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

    // ✅ تحديث المجموع عند تغيير الكمية أو السعر
    $$('.quantity-input, .quantity-select, .price-select, .price-input').forEach((el) => {
      el.addEventListener('input', () => {
        this._validateQuantity();
        const quantity = parseInt($('.quantity-input')?.value || $('.quantity-select')?.value || '1');
        const price = parseFloat($('.price-select')?.value || $('.price-input')?.value || this.cardPrice);
        $('.dialog-total').textContent = `المجموع: $${(price * quantity).toFixed(2)}`;
      });
    });

    $('.refresh-player-btn')?.addEventListener('click', () => {
      const input = $('#player-name');
      input.value = this._generatePlayerName();
    });

    $('#player-id')?.addEventListener('input', (e) => {
      this._validatePlayerId(e.target.value);
    });
  }

  /**
   * ✅ حقن بيانات البطاقة داخل مربع الحوار
   * @description يملأ العناوين والأسعار والأيقونات والكمية
   */
  _injectCardData() {
    const $ = (sel) => this.overlay.querySelector(sel);

    $('.dialog-title').textContent = this.cardName;
    $('.price').textContent = `السعر: $${this.cardPrice.toFixed(2)}`;
    $('.dialog-total').textContent = `المجموع: $${(this.cardPrice * this.initialQuantity).toFixed(2)}`;

    this._generateQuantityInput(this.card); // تمرير الكائن مباشرة

    const icon = $('.dialog-icon');
    if (icon) {
      icon.src = this.cardIcon;
      icon.onerror = () => {
        icon.src = `${this.options.iconsBasePath}loading.gif`;
      };
    }

    const playerNameInput = $('.player-name');
    if (playerNameInput) {
      playerNameInput.value = this._generatePlayerName();
      playerNameInput.setAttribute('readonly', true);
    }
  }

  /**
 * ✅ توليد إدخال السعر والكمية حسب خصائص البطاقة
 * @description إذا كانت menuPrice مفعّلة، يتم عرض قائمة أسعار فقط ويُمنع تعديل الكمية. وإذا كانت غير مفعّلة، يتم عرض إدخال للكمية فقط والسعر يكون ثابتًا.
 * @param {Object} card - كائن يمثل بيانات البطاقة
 */
  _generateQuantityInput(card) {
    const container = this.overlay.querySelector('.quantity-container');
    if (!container) {
      console.warn('❌ quantity-container غير موجود في القالب');
      return;
    }

    container.innerHTML = ''; // تنظيف المحتوى السابق

    const errorElement = document.createElement('span');
    errorElement.className = 'quantity-error error-message';
    container.appendChild(errorElement);

    // ✅ الحالة 1: menuPrice مفعّلة والسعر مصفوفة → عرض قائمة أسعار فقط، الكمية غير قابلة للتعديل
    if (card.menuPrice === true && Array.isArray(card.price)) {
      const priceSelect = document.createElement('select');
      priceSelect.className = 'price-select';

      card.price.forEach((val) => {
        const option = document.createElement('option');
        option.value = val;
        option.textContent = `$${parseFloat(val).toFixed(2)}`;
        priceSelect.appendChild(option);
      });

      container.appendChild(priceSelect);

      // ✅ عرض الكمية كـ input غير قابل للتعديل
      const quantityInput = document.createElement('input');
      quantityInput.type = 'number';
      quantityInput.className = 'quantity-input';
      quantityInput.value = card.initialQuantity || 1;
      quantityInput.readOnly = true;
      quantityInput.disabled = true;
      container.appendChild(quantityInput);

      // ✅ تحديث المجموع عند تغيير السعر
      const updateTotal = () => {
        const price = parseFloat(priceSelect.value);
        const quantity = parseInt(quantityInput.value, 10);
        const total = price * quantity;

        const totalElement = this.overlay.querySelector('.dialog-total');
        totalElement.textContent = `المجموع: $${total.toFixed(2)}`;
      };

      priceSelect.addEventListener('change', updateTotal);
      updateTotal(); // أول تحديث
    }

    // ✅ الحالة 2: menuPrice غير مفعّلة أو خاطئة → عرض إدخال الكمية فقط، السعر ثابت
    else {
      const quantityInput = document.createElement('input');
      quantityInput.type = 'number';
      quantityInput.className = 'quantity-input';
      quantityInput.min = 1;
      quantityInput.step = 1;
      quantityInput.value = card.initialQuantity || 1;
      container.appendChild(quantityInput);

      const updateTotal = () => {
        const price = parseFloat(card.price || 0);
        const quantity = parseInt(quantityInput.value, 10);
        const total = price * quantity;

        const totalElement = this.overlay.querySelector('.dialog-total');
        totalElement.textContent = `المجموع: $${total.toFixed(2)}`;

        if (isNaN(quantity) || quantity < 1 || total > 1000) {
          errorElement.textContent = '⚠️ تحقق من الكمية، المجموع يجب أن يكون أقل من 1000$';
          errorElement.classList.add('show');
          quantityInput.classList.add('input-error');
        } else {
          errorElement.textContent = '';
          errorElement.classList.remove('show');
          quantityInput.classList.remove('input-error');
        }
      };

      quantityInput.addEventListener('input', updateTotal);
      updateTotal(); // أول تحديث
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

  /**
 * ✅ توليد قالب HTML للحوار المتاح حسب نوع البطاقة
 * @returns {string} HTML
 */
  _getAvailableTemplateHTML() {
    const defaultPrice = this.cardPrices?.[0] || this.cardPrice || 0;
    const total = (defaultPrice * this.initialQuantity).toFixed(2);

    return `
    <div class="purchase-dialog ${this.category}">
      <!-- ✅ رأس الحوار -->
      <div class="dialog-header">
        <img class="dialog-icon" src="${this.cardIcon}" alt="رمز المنتج" />
        <h2 class="dialog-title">إتمام الشراء</h2>
        <button type="button" class="dialog-purchase-close-btn" title="إغلاق">
          <i class="fas fa-times"></i>
        </button>
      </div>

      <!-- ✅ محتوى الحوار -->
      <div class="dialog-content">
        <!-- ✅ السعر والكمية -->
        <div class="price-quantity">
          <div class="dialog-price">
            <span class="price">السعر: $${defaultPrice.toFixed(2)}</span>
            <span class="dialog-total">المجموع: $${total}</span>
          </div>

          <label for="quantity">الكمية:</label>
          <div class="quantity-container">
            <!-- ✅ سيتم حقن input أو select حسب نوع البطاقة -->
          </div>

          <span class="quantity-error error-message"></span>
          <span class="quantity-warning hidden">⚠️ الكمية يجب أن تكون ${defaultPrice} أو أكثر</span>
        </div>

        <!-- ✅ إدخال ID اللاعب -->
        <div class="input-group">
          <label for="player-id">أدخل الـ ID:</label>
          <input type="text" id="player-id" />
          <span id="player-id-error" class="error-message"></span>
        </div>

        <!-- ✅ اسم اللاعب وتحديثه -->
        <div class="input-group player-name-group">
          <label for="player-name">اسم اللاعب:</label>
          <div style="display: flex; gap: 8px; align-items: center;">
            <input type="text" id="player-name" placeholder="اسم اللاعب" readonly />
            <button type="button" class="refresh-player-btn" title="تحديث الاسم">
              <i class="fas fa-sync-alt"></i>
            </button>
          </div>
        </div>

        <!-- ✅ وصف المنتج -->
        <div class="notes">
          <p id="product-description">
            هذا المنتج يعمل خلال 24 ساعة بشكل أوتوماتيكي، الكمية الافتراضية ${defaultPrice}
          </p>
        </div>
      </div>

      <!-- ✅ أزرار التأكيد والإلغاء -->
      <div class="dialog-footer dialog-actions">
        <button type="button" class="confirm-btn">
          <span class="loading-spinner"></span>
          شراء
        </button>
        <button type="button" class="cancel-btn">إلغاء</button>
      </div>
    </div>
  `;
  }
  /**
   * ✅ توليد قالب HTML للحوار غير المتاح
   * @returns {string} HTML
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