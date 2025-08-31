import { getFullPathByCategory, STORAGE_KEYS } from "../utils/appUtils.js";

/**
 * @class DialogPurchase
 * @description نافذة حوار الشراء الديناميكية مع دعم الفئات والثيمات والتأثيرات
 */
export class DialogPurchase {
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
      const quantity = Math.max(1, parseInt($('.quantity-input')?.value || '1'));
      const playerId = $('#player-id')?.value.trim();
      const playerName = $('#player-name')?.value.trim();
      const totalAmount = (this.cardPrice * quantity).toFixed(2);

      if (!playerId) return alert('يرجى إدخال الـ ID الخاص بك');

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
        userId: this.userId,
        playerId,
        amount: totalAmount,
        method: 'wallet',
        service: this.cardName,
        playerName
      });

      if (orderResult?.status === 'success') {
        alert('✅ تم تنفيذ الطلب بنجاح');
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
    });

    $('.quantity-input')?.addEventListener('input', (e) => {
      const qty = Math.max(1, parseInt(e.target.value));
      $('.dialog-total').textContent = `المجموع: $${(this.cardPrice * qty).toFixed(2)}`;
      $('.quantity-warning')?.classList.toggle('hidden', qty > 1);
    });

    $('.refresh-player-btn')?.addEventListener('click', () => {
      const input = $('#player-name');
      input.value = this._generatePlayerName();
    });
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
    $('.price').textContent = `السعر: $${this.cardPrice}`;
    $('.dialog-total').textContent = `المجموع: $${this.cardPrice}`;
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

  _showOrderDetails(contentHTML = '') {
    const modal = document.getElementById('order-details-modal');
    const body = modal.querySelector('.order-modal-body');
    body.innerHTML = contentHTML;
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';

    const closeBtn = modal.querySelector('.order-close-btn');
    closeBtn.onclick = () => {
      modal.classList.remove('show');
      document.body.style.overflow = '';
    };
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
            <span class="price">السعر: $${this.cardPrice}</span>
            <label for="quantity">الكمية:</label>
            <input type="number" class="quantity-input" min="1" value="${this.initialQuantity}" />
            <span class="quantity-warning hidden">⚠️ الكمية يجب أن تكون 2 أو أكثر للحصول على خصم</span>
          </div>

          <div class="input-group">
            <label for="player-id">أدخل الـ ID:</label>
            <input type="text" id="player-id" />
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
          <span class="dialog-total">المجموع: $${this.cardPrice}</span>
          <button type="button" class="confirm-btn">شراء</button>
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
