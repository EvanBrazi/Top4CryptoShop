import { STORAGE_KEYS, getFullPathByCategory } from "../utils/appUtils.js";
import { PurchaseClient } from "../utils/purchaseClient.js";

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
    this.purchaseClient = new PurchaseClient();
    this.purchaseInFlight = false;

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
    this.category = card.category || 'apps'; // apps/games/cryptos/balances
    this.cardQuantity = card.quantity || 1;
    this.cardMaxLimit = card.maxLimit || null; // الحد الأقصى للكمية
    this.cardIcon = `${getFullPathByCategory(this.category)}${card.icon || 'default.png'}`;
    this.cardMenuPrice = card.menuPrice === true;
    this.cardAvailable = card.available === true;
    this.initialQuantity = parseInt(card.quantity || 1);

    // ✅ بيانات المستخدم والثيم
    this.userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
    this.token = localStorage.getItem(STORAGE_KEYS.USER_TOKEN);
    try {
      const saved = this.purchaseClient.pending(this.userId, this.category, this.card.id);
      if (saved) {
        const { idempotencyKey, ...original } = saved.payload;
        this.pendingPurchase = original;
        this.cardAvailable = true; // A committed-key retry must survive current catalog availability changes.
      }
    } catch (_) { this.savedIntentError = true; }
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
      requestAnimationFrame(() => {
        this._setupUnavailableEvents();
      });
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
 * @description يربط الأحداث بالأزرار والمدخلات داخل مربع الحوار، ويعالج منطق التحقق والسعر حسب الفئة والحالة
 */
  _setupDialogEvents() {
    const $ = (sel) => this.overlay.querySelector(sel);
    const $$ = (sel) => this.overlay.querySelectorAll(sel);

    // إغلاق الحوار عند الضغط على زر الإغلاق أو الإلغاء
    $('.dialog-purchase-close-btn')?.addEventListener('click', () => this.close());
    $('.cancel-btn')?.addEventListener('click', () => this.close());

    // ✅ تنفيذ الطلب عند الضغط على زر التأكيد
    $('.confirm-btn')?.addEventListener('click', async () => {
      if (this.purchaseInFlight || !this._validateInputs()) return;
      const input = this.pendingPurchase || { category: this.category, productId: this.card.id,
        ...(this.cardMenuPrice ? { packageIndex: $('.price-select').selectedIndex } : { quantity: Number($('.quantity-input').value) }) };
      if (!this.pendingPurchase && this.card.requiresFulfillmentTarget) input.fulfillmentTarget = { [this.card.fulfillmentSchema]: $('#player-id').value.trim() };
      const confirmBtn = $('.confirm-btn');
      this.purchaseInFlight = true;
      confirmBtn.disabled = true;
      confirmBtn.classList.add('button-loading');
      try {
        const result = await this.purchaseClient.purchase(input, this.userId);
        alert(`تم تأكيد نتيجة الشراء ${result.orderId}. المبلغ المؤكد: USD ${result.charge}. راجع سجل الطلبات لمعرفة الحالة الحالية.`);
        this.close();
      } catch (error) {
        // Keep the dialog and persisted logical attempt on unknown outcomes. Never issue a compensating money request.
        try {
          const saved = this.purchaseClient.pending(this.userId, this.category, this.card.id);
          if (saved) {
            const { idempotencyKey, ...original } = saved.payload;
            this.pendingPurchase = original;
            this._injectCardData(); // Immediately restore and lock the unresolved intent.
          }
        } catch (_) { this.savedIntentError = true; }
        const errorElement = $('.dialog-error');
        errorElement.textContent = error.message;
        errorElement.classList.add('show');
      } finally {
        this.purchaseInFlight = false;
        confirmBtn.disabled = false;
        confirmBtn.classList.remove('button-loading');
      }
    });

    // ✅ تحديث المجموع عند تغيير الكمية أو السعر
    $$('.quantity-input, .quantity-select, .price-select, .price-input').forEach((el) => {
      el.addEventListener('input', () => {
        let quantity = parseInt($('.quantity-input')?.value || $('.quantity-select')?.value || '1', 10);
        let totalPrice = parseFloat(this.cardPrice || 0);
        let totalUnits = parseInt(this.cardQuantity || this.card?.quantity || 1, 10);

        if (this.card.menuPrice === true && Array.isArray(this.card.price)) {
          const priceSelect = $('.price-select');
          const idx = priceSelect?.selectedIndex ?? 0;
          totalPrice = parseFloat(this.card.price[idx] || 0);
          totalUnits = parseInt(this.card.quantity[idx] || 1, 10);
          quantity = totalUnits;
          $('.quantity-input').value = quantity;
        }

        const { valid, message, totalAmount } = this._validateOrder({
          category: this.category || 'apps',
          totalPrice,
          totalUnits,
          quantity
        });

        $('.dialog-total').textContent = `المجموع التقديري: $${totalAmount.toFixed(2)}`;

        const errorElement = this.overlay.querySelector('.dialog-error');
        const quantityInput = $('.quantity-input');

        if (!valid) {
          errorElement.textContent = message;
          errorElement.classList.add('show');
          quantityInput?.classList.add('input-error');
        } else {
          errorElement.textContent = '';
          errorElement.classList.remove('show');
          quantityInput?.classList.remove('input-error');
        }
      });
    });

    // ✅ توليد اسم اللاعب تلقائيًا
    $('.refresh-player-btn')?.addEventListener('click', () => {
      const input = $('#player-name');
      input.value = this._generatePlayerName();
    });

    // ✅ التحقق من معرف اللاعب عند الإدخال
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
    $('.dialog-total').textContent = `المجموع التقديري: $${(this.cardPrice).toFixed(2)}`;

    this._generateQuantityInput(this.card); // تمرير الكائن مباشرة

    const icon = $('.dialog-icon');
    if (icon) {
      icon.src = this.cardIcon;
      icon.onerror = () => {
        icon.src = `${this.options.iconsBasePath}loading.gif`;
      };
    }
    this.overlay.querySelector('.player-name-group').style.display = 'none';
    const target = $('#player-id');
    const schema = this.pendingPurchase?.fulfillmentTarget ? Object.keys(this.pendingPurchase.fulfillmentTarget)[0] : this.card.fulfillmentSchema;
    target.closest('.input-group').style.display = (this.pendingPurchase ? !!this.pendingPurchase.fulfillmentTarget : this.card.requiresFulfillmentTarget) ? 'block' : 'none';
    const labels = { playerId: 'معرف اللاعب', accountId: 'معرف الحساب', walletAddress: 'عنوان المحفظة', phone: 'رقم الهاتف بصيغة + دولية', email: 'البريد الإلكتروني' };
    this.overlay.querySelector('label[for="player-id"]').textContent = `${labels[schema] || 'وجهة التنفيذ'}${!this.pendingPurchase && this.card.fulfillmentNetwork ? ` — ${this.card.fulfillmentNetwork}` : ''}`;
    target.maxLength = schema === 'email' ? 254 : 128;
    if (this.pendingPurchase) {
      $('.dialog-total').textContent = 'إعادة محاولة الطلب الأصلي — يؤكد الخادم المبلغ والسياسة الأصليين';
      target.value = this.pendingPurchase.fulfillmentTarget?.[schema] || '';
      this.overlay.querySelector('.dialog-error').textContent = 'إعادة محاولة الطلب الأصلي بالمفتاح المحفوظ. لا تنشئ طلباً بديلاً قبل تحديد النتيجة.';
      this.overlay.querySelectorAll('input, select').forEach(element => { element.disabled = true; });
      if (this.pendingPurchase.quantity !== undefined) $('.quantity-input').value = this.pendingPurchase.quantity;
      if (this.pendingPurchase.packageIndex !== undefined && $('.price-select')) $('.price-select').selectedIndex = this.pendingPurchase.packageIndex;
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

    // استخدم الكائن الممرّر أو this.card كاحتياط
    card = card || this.card;

    // ✅ الحالة 1: menuPrice مفعّلة والسعر مصفوفة → عرض قائمة أسعار فقط، الكمية غير قابلة للتعديل
    if (card.menuPrice === true && Array.isArray(card.price)) {
      const priceSelect = document.createElement('select');
      priceSelect.className = 'price-select';

      // إضافة الخيارات
      card.price.forEach((val) => {
        const option = document.createElement('option');
        option.value = String(val);
        option.textContent = `$${parseFloat(val).toFixed(2)}`;
        priceSelect.appendChild(option);
      });

      container.appendChild(priceSelect);

      // عرض الكمية كـ input غير قابل للتعديل، ولكن قيمتها مرتبطة بمصفوفة card.quantity
      const quantityInput = document.createElement('input');
      quantityInput.type = 'number';
      quantityInput.className = 'quantity-input';
      quantityInput.readOnly = true;
      quantityInput.disabled = true;
      // إذا كانت مصفوفة الكميات متاحة، عين القيمة الأولى أو الافتراضية
      if (Array.isArray(card.quantity) && card.quantity.length > 0) {
        quantityInput.value = card.quantity[0];
      } else {
        quantityInput.value = card.quantity || 1;
      }
      container.appendChild(quantityInput);

      // ✅ تحديث المجموع عند تغيير السعر — يضبط أيضاً الكمية المتوافقة إن وُجدت
      const updateTotal = () => {
        const idx = priceSelect.selectedIndex;
        // التحقق من وجود السعر والكمية في نفس الفهرس
        const price = Array.isArray(card.price) && card.price[idx] != null
          ? parseFloat(card.price[idx])
          : 0;
        const quantity = Array.isArray(card.quantity) && card.quantity[idx] != null
          ? parseInt(card.quantity[idx], 10)
          : 1;
        quantityInput.value = quantity; // مزامنة الكمية مع السعر المختار
        // ✅ التحقق باستخدام الدالة الموحدة
        const { valid, message, totalAmount, unitPrice } = this._validateOrder({
          category: card.category || 'apps',
          totalPrice: price,
          totalUnits: quantity,
          quantity
        });
        const totalElement = this.overlay.querySelector('.dialog-total');
        if (totalElement) {
          totalElement.textContent = `المجموع التقديري: $${totalAmount.toFixed(2)}`;
        }
        const errorElement = this.overlay.querySelector('.dialog-error');
        if (!errorElement) return;

        if (!valid) {
          errorElement.textContent = message;
          errorElement.classList.add('show');
          quantityInput.classList.add('input-error');
        } else {
          errorElement.textContent = '';
          errorElement.classList.remove('show');
          quantityInput.classList.remove('input-error');
        }
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
      quantityInput.value = card.quantity || 1;
      container.appendChild(quantityInput);

      const updateTotal = () => {
        const quantity = parseInt(quantityInput.value, 10) || 0;
        const totalPrice = parseFloat(card.price || 0); // السعر الإجمالي للحزمة
        const totalUnits = parseInt(card.quantity || 1, 10); // عدد الوحدات في الحزمة
        const category = card.category || 'apps';

        const { valid, message, totalAmount, unitPrice } = this._validateOrder({
          category,
          totalPrice,
          totalUnits,
          quantity
        });

        const totalElement = this.overlay.querySelector('.dialog-total');
        if (totalElement) totalElement.textContent = `المجموع التقديري: $${totalAmount.toFixed(2)}`;

        const errorElement = this.overlay.querySelector('.dialog-error');
        if (!errorElement) return; // تأكد من وجود عنصر الخطأ

        if (!valid) {
          errorElement.textContent = message;
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

  /** تحقق من صحة ID اللاعب وعرض رسالة الخطأ المناسبة */
  _validatePlayerId(value) {
    const $ = (sel) => this.overlay?.querySelector(sel);
    const errorEl = this.overlay?.querySelector('#player-id-error');

    if (typeof value !== 'string') {
      if (errorEl) errorEl.textContent = '';
      return false;
    }

    const schema = this.card.fulfillmentSchema;
    const v = value.trim();
    const maximum = schema === 'email' ? 254 : 128;
    let valid = value.length <= maximum && /^[\x20-\x7E]+$/.test(value) && !/[<>&'"`\\]/.test(value) && v.length > 0;
    if (['playerId', 'accountId'].includes(schema)) valid = valid && /^[A-Za-z0-9_-]{3,32}$/.test(v);
    if (schema === 'phone') valid = valid && /^\+[1-9]\d{6,14}$/.test(v);
    // Wallet checksums and full email syntax are enforced authoritatively by the server.
    if (errorEl) errorEl.textContent = valid ? '' : 'وجهة التنفيذ غير صالحة لهذا المنتج';
    return valid;
  }

  /**
   * ✅ تحقق من مدخلات النموذج (الكمية و ID اللاعب إذا لزم)
   * @returns {boolean} true إذا كانت جميع المدخلات صالحة
   */
  _validateInputs() {
    if (this.savedIntentError) { alert('Saved purchase requires reconciliation before retrying.'); return false; }
    if (this.pendingPurchase) return true; // Replay is evaluated before current catalog rules on the server.
    if (!this.overlay) return false;
    const overlay = this.overlay;
    //console.log('✅ مربع الحوار موجود');
    // عنصر الخطأ الخاص بالكمية إن وُجد
    const qtyErrorEl = overlay.querySelector('.quantity-error');
    const qtyEl = overlay.querySelector('.quantity-input, .quantity-select');
    //console.log('✅ عناصر الكمية موجودة');
    // التحقق من الكمية
    const qty = qtyEl ? Number(qtyEl.value) : Number(this.initialQuantity || 1);
    if (!Number.isSafeInteger(qty) || qty < 1) {
      if (qtyErrorEl) qtyErrorEl.textContent = '⚠️ الرجاء إدخال كمية صحيحة (أكبر من 0)';
      console.warn('❌ الكمية غير صالحة');
      return false;
    }
    // تحقق من الحد الأقصى إن وُجد
    if (this.cardMaxLimit && qty > Number(this.cardMaxLimit)) {
      if (qtyErrorEl) qtyErrorEl.textContent = `⚠️ تجاوز الحد الأقصى: ${Number(this.cardMaxLimit).toLocaleString()}`;
      console.warn('❌ الكمية تتجاوز الحد الأقصى');
      return false;
    }
    if (qtyErrorEl) qtyErrorEl.textContent = '';
    //console.log('✅ الكمية صالحة:', qty);
    // ✅ تحقق من ID اللاعب دائمًا إذا كانت الخدمة تتطلبه
    const playerIdEl = overlay.querySelector('#player-id');
    if (playerIdEl && this.card.requiresFulfillmentTarget) {
      const valid = this._validatePlayerId(playerIdEl.value || '');
      //console.log('✅ التحقق من ID اللاعب:', valid);
      // _validatePlayerId يقوم بتحديث رسالة الخطأ في DOM عند الفشل
      if (!valid) return false;
    }
    console.log('✅ جميع المدخلات صالحة');
    return true;
  }

  /**
 * ✅ التحقق من الطلب حسب الفئة مع حماية من الأخطاء
 * @param {Object} params - بيانات التحقق
 * @param {string} params.category - الفئة (apps/games/cryptos/balances)
 * @param {number} params.totalPrice - السعر الإجمالي للحزمة
 * @param {number} params.totalUnits - عدد الوحدات في الحزمة
 * @param {number} params.quantity - الكمية المطلوبة من المستخدم
 * @returns {Object} - نتيجة التحقق
 */
  _validateOrder({ category, totalPrice, totalUnits, quantity }) {
    // Browser arithmetic is an estimate only; none of these monetary values is submitted.
    const unitPrice = Number(totalPrice) / Number(totalUnits);
    const totalAmount = Number.isFinite(unitPrice * quantity) ? unitPrice * quantity : 0;
    const minQuantity = this.card.minQuantity || 1;
    const maxQuantity = this.card.maxQuantity || (category === 'apps' ? 1000000 : Number.MAX_SAFE_INTEGER);
    const valid = Number.isSafeInteger(quantity) && quantity >= minQuantity && quantity <= maxQuantity && totalAmount > 0;
    return { valid, message: valid ? '' : 'الكمية خارج الحدود. السعر تقديري ويؤكده الخادم.', totalAmount, unitPrice };
  }

  /** توليد اسم لاعب عشوائي */
  _generatePlayerName() {
    const adjectives = ['Not Found'];
    const nouns = ['Player'];
    const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
    //return `${rand(adjectives)} ${rand(nouns)} ${Math.floor(Math.random() * 1000)}`;
    return '';
  }

  // PurchaseClient is the sole financial request path. No reserve/create/restore choreography.

  _setupUnavailableEvents() {
    const dialog = document.querySelector('.purchase-dialog');
    if (!dialog) return;
    const closeBtn = dialog.querySelector('.dialog-purchase-close-btn');
    const supportPhoneEl = dialog.querySelector('.support-phone');
    const whatsappBtn = dialog.querySelector('.whatsapp-btn');

    // ✅ إغلاق عند الضغط على زر الإغلاق
    closeBtn.addEventListener('click', () => {
      this.close();
    });

    // ✅ إغلاق عند الضغط خارج مربع الحوار
    document.addEventListener('click', (e) => {
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
  * ✅ توليد قالب HTML للحوار المتاح حسب نوع البطاقة
  * @returns {string} HTML
  */
  _getAvailableTemplateHTML() {
    const defaultPrice = this.cardPrices?.[0] || this.cardPrice || 0;
    const total = (defaultPrice * this.initialQuantity).toFixed(2);

    return `
    <div class="purchase-dialog ${this.category}">
      <div class="dialog-error"></div>
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
            <span class="dialog-total">المجموع التقديري: $${total}</span>
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
          <input type="text" class="player-id" id="player-id"/>
          <span id="player-id-error" class="player-id-error"></span>
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
            السعر المعروض تقديري. يؤكد الخادم المبلغ عند الشراء، ثم ينتظر الطلب مراجعة التنفيذ. لا يعني إغلاق النافذة إلغاء الطلب.
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
