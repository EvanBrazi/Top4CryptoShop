/**
 * @file UserManager.js
 * @description إدارة بيانات المستخدم باستخدام نمط Singleton، مع حماية الخصائص، تحميل وتحديث وتوثيق الجلسة، وتحديث الواجهة
 * @version 4.0.0
 * @license MIT
 * @author Evan Brazi
 */

import { logout } from './auth.js';
import { toggleDBTheme } from './theme.js';
import { showToast } from './utils/toast.js';
import { clearBrowserData } from './utils/appUtils.js';
import { secureFetch } from './securefetch.js';

// مفاتيح التخزين المحلي
const STORAGE_KEYS = {
  USER_ID: 'userId',
  USER_TOKEN: 'userToken'
};

class UserManager {
  // 🛡️ الخصائص الخاصة
  static #instance = null;
  #currentUser = null;

  /**
   * إنشاء كائن واحد فقط من UserManager
   * @returns {UserManager}
   */
  static getInstance() {
    if (!UserManager.#instance) {
      UserManager.#instance = new UserManager();
    }
    return UserManager.#instance;
  }

  /**
   * التحقق من صحة التوكن
   * @param {string} token
   * @returns {Promise<boolean>}
   */
  async isValidToken(token) {
    if (typeof token !== 'string' || token.length < 16) return false;

    try {
      const res = await fetch('/api/compare-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify({ clientToken: token })
      });

      const data = await res.json();
      return data.match === true;
    } catch (err) {
      console.error('❌ خطأ في التحقق من التوكن:', err);
      return false;
    }
  }

  /**
   * تحميل بيانات المستخدم من السيرفر
   * @returns {Promise<void>}
   */
  async loadUser() {
    const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
    const token = localStorage.getItem(STORAGE_KEYS.USER_TOKEN);

    if (!userId || !(await this.isValidToken(token))) {
      console.warn('⚠️ لا يوجد توكن صالح أو معرف مستخدم');
      return;
    }

    try {
      const res = await fetch(`/api/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('فشل تحميل بيانات المستخدم');

      const userData = await res.json();
      const validation = this.validateUser(userData);

      if (validation.valid) {
        this.#currentUser = userData;
        await this.updateUserProfile();
      } else {
        throw new Error(validation.errors.join(', '));
      }
    } catch (error) {
      console.error('❌ خطأ في تحميل المستخدم:', error.message);
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

    if (!user || typeof user !== 'object') {
      errors.push('المدخل ليس كائنًا صالحًا');
      return { valid: false, errors };
    }

    const name = user.name || user.username;
    if (typeof name !== 'string' || name.trim() === '') errors.push('الاسم غير صالح');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(user.email || '')) errors.push('البريد الإلكتروني غير صالح');

    if (typeof user.balance !== 'number' || user.balance < 0) errors.push('الرصيد غير صالح');

    if (![0, 1].includes(user.theme)) errors.push('قيمة الثيم غير مدعومة');

    if (user.phone && !/^\+?\d{7,15}$/.test(user.phone)) errors.push('رقم الهاتف غير صالح');

    return { valid: errors.length === 0, errors };
  }

  /**
   * تحديث واجهة المستخدم حسب بياناته
   * @returns {Promise<void>}
   */
  async updateUserProfile() {
    if (!this.#currentUser) return;

    const { name, balance, theme } = this.#currentUser;

    const usernameDisplay = document.getElementById('username-display');
    if (usernameDisplay) usernameDisplay.textContent = name;

    const balanceElements = [
      document.getElementById('balance-display'),
      document.getElementById('top-balance-display')
    ].filter(Boolean);

    balanceElements.forEach(el => {
      el.textContent = balance.toFixed(2);
    });

    const userAvatar = document.getElementById('user-avatar');
    if (userAvatar) await this.updateUserAvatar(userAvatar);

    toggleDBTheme(theme === 1 ? 'night' : 'day');
  }

  /**
   * تحديث صورة الملف الشخصي
   * @param {HTMLImageElement} imgElement
   * @returns {Promise<void>}
   */
  async updateUserAvatar(imgElement) {
    try {
      const fallbackSrc = this.getDefaultAvatar(this.#currentUser.name);
      let hasFailedOnce = false;

      imgElement.onerror = () => {
        if (!hasFailedOnce) {
          hasFailedOnce = true;
          imgElement.src = fallbackSrc;
        }
      };

      if (this.#currentUser.avatar?.startsWith('http')) {
        imgElement.src = this.#currentUser.avatar;
      } else {
        const emailHash = this.generateEmailHash(this.#currentUser.email);
        imgElement.src = `https://www.gravatar.com/avatar/${emailHash}?d=404&s=160`;
      }
    } catch (error) {
      imgElement.src = this.getDefaultAvatar(this.#currentUser?.name);
    }
  }

  /**
   * إنشاء هاش MD5 للبريد الإلكتروني
   * @param {string} email
   * @returns {string}
   */
  generateEmailHash(email) {
    return md5(email.trim().toLowerCase());
  }

  /**
   * الحصول على صورة افتراضية باسم المستخدم
   * @param {string} name
   * @returns {string}
   */
  getDefaultAvatar(name) {
    const encoded = encodeURIComponent(name || 'زائر');
    return `https://ui-avatars.com/api/?name=${encoded}&background=random&size=160`;
  }

  /**
   * حفظ بيانات المستخدم في قاعدة البيانات
   * @returns {Promise<boolean>}
   */
  async saveUser() {
    const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
    const token = localStorage.getItem(STORAGE_KEYS.USER_TOKEN);

    if (!userId || !(await this.isValidToken(token))) {
      showToast('لا يمكن حفظ البيانات بدون توكن صالح', 'error');
      return false;
    }

    try {
      const res = await secureFetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(this.#currentUser)
      });

      if (!res.ok) throw new Error('فشل حفظ البيانات');
      showToast('✅ تم حفظ البيانات بنجاح', 'success');
      return true;
    } catch (error) {
      showToast('حدث خطأ أثناء حفظ البيانات', 'error');
      return false;
    }
  }

  /**
   * تنفيذ عملية تسجيل الخروج وتنظيف الواجهة
   * @returns {Promise<void>}
   */
  async handleLogout() {
    const token = localStorage.getItem(STORAGE_KEYS.USER_TOKEN);
    if (!token) throw new Error('ليس لديك صلاحيات لتسجيل الخروج');

    try {
      if (!confirm('هل أنت متأكد من تسجيل الخروج؟')) return;

      const result = await logout();
      if (!result.success) throw new Error(result.error || 'فشل تسجيل الخروج');

      this.#currentUser = null;
      this.clearUserUI();

      showToast('تم تسجيل الخروج بنجاح', 'success');
      clearBrowserData(false);
      setTimeout(() => window.location.replace('/logout.html'), 100);
    } catch (error) {
      showToast('حدث خطأ أثناء تسجيل الخروج', 'error');
    }
  }

  /**
   * تنظيف واجهة المستخدم بعد تسجيل الخروج
   */
  clearUserUI() {
    const usernameDisplay = document.getElementById('username-display');
    if (usernameDisplay) usernameDisplay.textContent = 'زائر';

    const balanceElements = [
      document.getElementById('balance-display'),
      document.getElementById('top-balance-display')
    ].filter(Boolean);

    balanceElements.forEach(el => {
      el.textContent = '0.00';
    });

    const userAvatar = document.getElementById('user-avatar');
    if (userAvatar) userAvatar.src = this.getDefaultAvatar('زائر');

        toggleDBTheme('day');
  }

  /**
   * تعيين الثيم
   * @param {number} theme
   */
  setUserTheme(theme) {
    if ([0, 1].includes(theme)) {
      this.#currentUser.theme = theme;
      this.saveUser();
    }
  }

  /**
   * تعيين الرصيد
   * @param {number} balance
   * @returns {boolean}
   */
  setUserBalance(balance) {
    const newBalance = parseFloat(balance);
    if (!isNaN(newBalance) && newBalance >= 0) {
      this.#currentUser.balance = parseFloat(newBalance.toFixed(2));
      return true;
    }
    return false;
  }

  /**
   * الحصول على اسم المستخدم
   * @returns {string}
   */
  getUserName() {
    return this.#currentUser?.name || 'زائر';
  }

  /**
   * الحصول على الرصيد
   * @returns {number}
   */
  getUserBalance() {
    return this.#currentUser?.balance || 0.00;
  }
}

export default UserManager;
