/**
 * @class SecurityTab
 * @description 🛡️ تبويب الحماية مع دعم الثيم وتفاعل ديناميكي حسب حالة الحماية
 */
export default class SecurityTab {
  constructor(tabId, userId, options = {}) {
    this.tabId = tabId;
    this.userId = userId;
    this.theme = localStorage.getItem('theme') === 'night' ? 'night' : 'day';
    this.container = document.getElementById(tabId);
    this.is2FAEnabled = false; // ← يتم تحديثه من الخادم لاحقًا
    this._init();
  }

  /**
   * تهيئة التبويب وربط الأحداث
   */
  async _init() {
    await this._fetchStatus(); // ← جلب حالة الحماية من الخادم
    this._applyTheme();
    this._bindEvents();
    this._updateUI();
  }

  /**
   * جلب حالة الحماية من الخادم
   */
  async _fetchStatus() {
    try {
      const res = await fetch('/api/security/status');
      const data = await res.json();
      this.is2FAEnabled = data.enabled;
    } catch (err) {
      console.warn('⚠️ فشل جلب حالة الحماية:', err);
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
    document.getElementById('enable-2fa-btn')?.addEventListener('click', () => this._generateQR());
    document.getElementById('verify-2fa-btn')?.addEventListener('click', () => this._verifyToken());
    document.getElementById('confirm-disable-btn')?.addEventListener('click', () => this._confirmDisable());

    document.getElementById('send-2fa-email-btn')?.addEventListener('click', () => this._sendEmailKey());
    document.getElementById('verify-2fa-email-btn')?.addEventListener('click', () => this._verifyEmailToken());
  }
  
  async _sendEmailKey() {
    const res = await fetch('/api/security/send-2fa-email', { method: 'POST' });
    const data = await res.json();
    document.getElementById('status-message').textContent = data.message;
  }

  async _verifyEmailToken() {
    const token = document.getElementById('email-token-input').value.trim();
    const res = await fetch('/api/security/verify-2fa-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const result = await res.json();
    document.getElementById('status-message').textContent = result.success
      ? '✅ تم التحقق وتفعيل الحماية'
      : '❌ رمز غير صحيح';
  }

  /**
   * تحديث الواجهة حسب حالة الحماية
   */
  _updateUI() {
    const enableBtn = document.getElementById('enable-2fa-btn');
    const disableSection = document.getElementById('disable-section');

    if (this.is2FAEnabled) {
      enableBtn.style.display = 'none';
      disableSection.style.display = 'block';
    } else {
      enableBtn.style.display = 'inline-block';
      disableSection.style.display = 'none';
    }
  }

  async _generateQR() {
    const res = await fetch('/api/security/generate-qr');
    const data = await res.json();
    const qrContainer = document.getElementById('qr-container');
    const status = document.getElementById('status-message');
    if (data.success) {
      qrContainer.innerHTML = `<img src="${data.qr}" alt="رمز QR" />`;
      status.textContent = '📲 امسح الرمز باستخدام تطبيق Google Authenticator';
    } else {
      status.textContent = '❌ فشل توليد رمز QR';
    }
  }

  async _verifyToken() {
    const token = document.getElementById('token-input').value.trim();
    const status = document.getElementById('status-message');
    if (!token) return alert('يرجى إدخال رمز التحقق');

    const res = await fetch('/api/security/verify-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const result = await res.json();
    if (result.success) {
      this.is2FAEnabled = true;
      this._updateUI();
      status.textContent = '✅ تم التحقق بنجاح وتفعيل الحماية';
    } else {
      status.textContent = '❌ رمز غير صحيح، حاول مرة أخرى';
    }
  }

  async _confirmDisable() {
    const authInput = document.getElementById('auth-confirm-input').value.trim();
    const status = document.getElementById('status-message');
    if (!authInput) return alert('يرجى إدخال رمز التوثيق لإلغاء الحماية');

    const res = await fetch('/api/security/disable-2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmCode: authInput })
    });
    const result = await res.json();
    if (result.success) {
      this.is2FAEnabled = false;
      this._updateUI();
      status.textContent = '🛡️ تم تعطيل المصادقة الثنائية بنجاح';
    } else {
      status.textContent = '❌ فشل التوثيق، تحقق من الرمز أو كلمة المرور';
    }
  }
}
