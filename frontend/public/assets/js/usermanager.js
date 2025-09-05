import { logout } from './auth.js';
import { toggleDBTheme } from './theme.js';
import { showToast } from './utils/toast.js';
import { clearBrowserData, STORAGE_KEYS } from './utils/appUtils.js';

class UserManager {
  static #instance = null;
  #user = null;

  /**
   * إنشاء نسخة واحدة فقط من UserManager
   * @returns {UserManager}
   */
  static getInstance() {
    return UserManager.#instance ??= new UserManager();
  }

  /**
   * الحصول على نسخة آمنة من بيانات المستخدم
   * @returns {Object}
   */
  getUser() {
    return { ...this.#user };
  }

  /**
   * الحصول على الرصيد من الكاش
   * @returns {number}
   */
  getCachedBalance() {
    return this.#user?.balance || 0;
  }

  /**
   * إعادة تحميل وتحديث بيانات المستخدم من السيرفر
   * @returns {Promise<void>}
   */
  async refresh() {
    await this.loadUser();
    await this.updateUserProfile();
  }

  getUserName() {
    return this.#user?.username || 'زائر';
  }

  getUserBalance() {
    return this.#user?.balance || 0;
  }

  _getToken() {
    return localStorage.getItem(STORAGE_KEYS.USER_TOKEN);
  }

  async isValidToken(token) {
    if (!token || token.length < 16) return false;
    try {
      const res = await fetch('/api/compare-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify({ clientToken: token })
      });
      const data = await res.json();
      return data.match === true;
    } catch {
      return false;
    }
  }

  /**
   * تحميل بيانات المستخدم من السيرفر والتحقق منها
   * @returns {Promise<void>}
   */
  async loadUser() {
    const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
    const token = this._getToken();
    if (!userId || !(await this.isValidToken(token))) return;
    try {
      const res = await fetch(`/api/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();

      const user = await res.json();
      if (!this.validateUser(user).valid) throw new Error();
      this.#user = user;
      this.updateUserProfile();
    } catch {
      showToast('تعذر تحميل بيانات المستخدم', 'error');
    }
  }

  /**
   * التحقق من صحة بيانات المستخدم
   * @param {Object} user
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validateUser(user) {
    const errors = [];
    if (!user || typeof user !== 'object') errors.push('كائن غير صالح');
    if (!user.username?.trim()) errors.push('الاسم غير صالح');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email || '')) errors.push('البريد غير صالح');
    if (typeof user.balance !== 'number' || user.balance < 0) errors.push('الرصيد غير صالح');
    if (![0, 1].includes(user.theme)) errors.push('الثيم غير صالح');
    if (user.phone && !/^\+?\d{7,15}$/.test(user.phone)) errors.push('رقم الهاتف غير صالح');
    return { valid: errors.length === 0, errors };
  }

  /**
   * تحديث واجهة المستخدم حسب بياناته
   * @returns {Promise<void>}
   */
  async updateUserProfile() {
    if (!this.#user) return;
    const { username, balance, theme } = this.#user;

    document.getElementById('username-display').textContent = username;
    ['balance-display', 'top-balance-display'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = balance.toFixed(2);
    });

    const avatar = document.getElementById('user-avatar');
    if (avatar) this.updateUserAvatar(avatar);

    toggleDBTheme(theme === 1 ? 'night' : 'day');
  }

  /**
   * تحديث صورة الملف الشخصي
   * @param {HTMLImageElement} img
   */
  async updateUserAvatar(img) {
    const fallback = this.getDefaultAvatar(this.#user.username);
    img.onerror = () => (img.src = fallback);

    if (this.#user.avatar?.startsWith('http')) {
      img.src = this.#user.avatar;
    } else {
      const hash = md5(this.#user.email.trim().toLowerCase());
      img.src = `https://www.gravatar.com/avatar/${hash}?d=404&s=160`;
    }
  }

  /**
   * توليد صورة افتراضية باسم المستخدم
   * @param {string} name
   * @returns {string}
   */
  getDefaultAvatar(name) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'زائر')}&background=random&size=160`;
  }

  /**
   * حفظ بيانات المستخدم في قاعدة البيانات
   * @returns {Promise<boolean>}
   */
  async saveUser() {
    const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
    const token = this._getToken();
    if (!userId || !(await this.isValidToken(token))) return false;

    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(this.#user)
      });
      if (!res.ok) throw new Error();
      showToast('✅ تم حفظ البيانات بنجاح', 'success');
      return true;
    } catch {
      showToast('❌ فشل حفظ البيانات', 'error');
      return false;
    }
  }

  /**
   * تغيير الثيم الخاص بالمستخدم
   * @param {number} theme
   */
  async setUserTheme(theme) {
    if (![0, 1].includes(theme)) return;
    this.#user.theme = theme;
    await this.saveUser();

    try {
      await fetch(`/api/users/${this.#user._id}/theme`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this._getToken()}`
        },
        body: JSON.stringify({ theme })
      });
    } catch (err) {
      console.error('فشل تحديث الثيم في السيرفر', err);
    }
  }

  /**
   * تنفيذ عملية تسجيل الخروج وتنظيف الواجهة
   */
  async _handleLogout() {
    const token = this._getToken();
    if (!token) return showToast('ليس لديك صلاحيات لتسجيل الخروج', 'error');

    if (!confirm('هل أنت متأكد من تسجيل الخروج؟')) return;

    try {
      const result = await logout();
      if (!result.success) throw new Error(result.error);

      this.#user = null;
      showToast(result.message || 'تم تسجيل الخروج بنجاح', 'success');
      clearBrowserData(false);
      setTimeout(() => window.location.replace(result.redirectTo || '/logout.html'), 100);
    } catch (err) {
      showToast(err.message || '❌ حدث خطأ أثناء تسجيل الخروج', 'error');
      clearBrowserData(false);
    }
  }

  /**
   * تنظيف واجهة المستخدم بعد تسجيل الخروج
   */
  clearUserUI() {
    document.getElementById('username-display').textContent = 'زائر';
    ['balance-display', 'top-balance-display'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '0.00';
    });
    const avatar = document.getElementById('user-avatar');
    if (avatar) avatar.src = this.getDefaultAvatar('زائر');
    toggleDBTheme('day');
  }
}
export default UserManager;
