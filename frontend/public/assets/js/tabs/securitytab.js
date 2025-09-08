/**
 * @class SecurityTab
 * @description 🛡️ تبويب الحماية: إدارة البريد الإلكتروني والمصادقة الثنائية مع دعم الثيم والتوسع المستقبلي
 */
export default class SecurityTab {
  constructor(tabId, userId, options = {}) {
    this.tabId = tabId;
    this.userId = userId;
    this.theme = localStorage.getItem('theme') === 'night' ? 'night' : 'day';
    this.container = document.getElementById(tabId);

    // الحالة الداخلية
    this.state = {
      emailVerified: false,
      twoFAEnabled: false
    };

    this._init();
  }

  /**
   * تهيئة التبويب: جلب الحالة، تطبيق الثيم، ربط الأحداث، تحديث الواجهة
   */
  async _init() {
    await this._fetchStatus();
    this._applyTheme();
    this._bindEvents();
    this._renderState();
  }

  /**
   * جلب حالة البريد والمصادقة من الخادم
   */
  async _fetchStatus() {
    try {
      const res = await fetch('/api/security/status');
      const data = await res.json();
      this.state.emailVerified = data.emailVerified;
      this.state.twoFAEnabled = data.twoFAEnabled;
    } catch (err) {
      console.warn('⚠️ فشل جلب الحالة:', err);
    }
  }

  /**
   * تطبيق الثيم على التبويب
   */
  _applyTheme() {
    this.container.classList.add(this.theme === 'night' ? 'theme-night' : 'theme-day');
  }

  /**
   * ربط الأحداث بالواجهة
   */
  _bindEvents() {
    document.getElementById('verify-email-btn')?.addEventListener('click', () => this._sendEmailVerification());
    document.getElementById('toggle-2fa')?.addEventListener('change', e => this._toggle2FA(e.target.checked));
    document.getElementById('enable-2fa-qr-btn')?.addEventListener('click', () => this._generateQR());
    document.getElementById('verify-2fa-btn')?.addEventListener('click', () => this._verifyToken());
    document.getElementById('send-2fa-email-btn')?.addEventListener('click', () => this._sendEmailKey());
    document.getElementById('verify-2fa-email-btn')?.addEventListener('click', () => this._verifyEmailToken());
    document.getElementById('confirm-disable-btn')?.addEventListener('click', () => this._confirmDisable());
  }

  /**
   * تحديث الواجهة حسب الحالة
   */
  _renderState() {
    const emailStatus = document.getElementById('email-status');
    const twoFAStatus = document.getElementById('2fa-status');
    const toggle2FA = document.getElementById('toggle-2fa');
    const options2FA = document.getElementById('2fa-options');
    const disableSection = document.getElementById('disable-2fa-section');

    // حالة البريد
    if (this.state.emailVerified) {
      emailStatus.textContent = 'مفعل';
      emailStatus.classList.add('active');
    } else {
      emailStatus.textContent = 'غير مفعل';
      emailStatus.classList.remove('active');
    }

    // حالة المصادقة الثنائية
    if (this.state.twoFAEnabled) {
      twoFAStatus.textContent = 'مفعلة';
      twoFAStatus.classList.add('active');
      toggle2FA.checked = true;
      options2FA.style.display = 'none';
      disableSection.style.display = 'block';
    } else {
      twoFAStatus.textContent = 'غير مفعلة';
      twoFAStatus.classList.remove('active');
      toggle2FA.checked = false;
      options2FA.style.display = 'none';
      disableSection.style.display = 'none';
    }
  }

  /**
   * إرسال رابط تفعيل البريد
   */
  async _sendEmailVerification() {
    const res = await fetch('/api/auth/send-email-verification', { method: 'POST' });
    const result = await res.json();
    this._setStatus(result.message);
  }

  /**
   * تفعيل أو إلغاء عرض خيارات المصادقة الثنائية
   */
  _toggle2FA(enabled) {
    const options2FA = document.getElementById('2fa-options');
    options2FA.style.display = enabled ? 'block' : 'none';
  }

  /**
   * توليد رمز QR
   */
  async _generateQR() {
    const res = await fetch('/api/security/generate-qr');
    const data = await res.json();
    const qrContainer = document.getElementById('qr-container');
    if (data.success) {
      qrContainer.innerHTML = `<img src="${data.qr}" alt="رمز QR" />`;
      this._setStatus('📲 امسح الرمز باستخدام تطبيق Google Authenticator');
    } else {
      this._setStatus('❌ فشل توليد رمز QR');
    }
  }

  /**
   * التحقق من رمز QR
   */
  async _verifyToken() {
    const token = document.getElementById('token-input').value.trim();
    if (!token) return alert('يرجى إدخال رمز التحقق');

    const res = await fetch('/api/security/verify-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const result = await res.json();
    if (result.success) {
      this.state.twoFAEnabled = true;
      this._renderState();
      this._setStatus('✅ تم التحقق وتفعيل الحماية');
    } else {
      this._setStatus('❌ رمز غير صحيح، حاول مرة أخرى');
    }
  }

  /**
   * إرسال مفتاح المصادقة عبر البريد
   */
  async _sendEmailKey() {
    const res = await fetch('/api/security/send-2fa-email', { method: 'POST' });
    const data = await res.json();
    this._setStatus(data.message);
  }

  /**
   * التحقق من رمز البريد
   */
  async _verifyEmailToken() {
    const token = document.getElementById('email-token-input').value.trim();
    const res = await fetch('/api/security/verify-2fa-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const result = await res.json();
    if (result.success) {
      this.state.twoFAEnabled = true;
      this._renderState();
    }
    this._setStatus(result.message);
  }

  /**
   * حذف المصادقة الثنائية
   */
  async _confirmDisable() {
    const code = document.getElementById('auth-confirm-input').value.trim();
    if (!code) return alert('يرجى إدخال رمز التوثيق');

    const res = await fetch('/api/security/disable-2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmCode: code })
    });
    const result = await res.json();
    if (result.success) {
      this.state.twoFAEnabled = false;
      this._renderState();
    }
    this._setStatus(result.message);
  }

  /**
   * عرض رسالة الحالة
   */
  _setStatus(message) {
    document.getElementById('status-message').textContent = message;
  }
}
