import { showToast } from '../utils/toast.js';
import { STORAGE_KEYS, validateAndVisualizeField, updateFieldVisual } from '../utils/appUtils.js';

export class SettingsTab {
    constructor(containerId, userManager) {
        this.containerId = containerId;
        this.userManager = userManager;
        this.userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
        this.token = localStorage.getItem(STORAGE_KEYS.USER_TOKEN);
        this.avatarFile = null;
        this.user = userManager.getUser();
        this.render();
    }

    /**
     * عرض واجهة الإعدادات داخل العنصر المحدد
     */
    render() {
        const container = document.getElementById(this.containerId);
        if (!container) return;
        this.form = document.getElementById('settings-form');
        this.avatarInput = document.getElementById('avatar-input');
        this.avatarPreview = document.getElementById('avatar-preview');
        this.changeAvatarBtn = document.getElementById('accept-avatar-btn');
        this.removeAvatarBtn = document.getElementById('remove-avatar-btn');
        this.nameInput = document.getElementById('fullName');
        this.emailInput = document.getElementById('email');
        this.phoneInput = document.getElementById('phone');
        this.avatarPreview = document.getElementById('avatar-preview');
        this.passwordInput = document.getElementById('newPassword');
        this.confirmInput = document.getElementById('confirmPassword');
        this.injectUserData();
        this.bindEvents();
    }

    /**
     * حقن بيانات المستخدم داخل النموذج، بما في ذلك صورة افتراضية ديناميكية حسب الثيم
     */
    injectUserData() {
        if (!this.nameInput || !this.emailInput || !this.phoneInput || !this.avatarPreview) return;

        this.nameInput.value = this.user.username || '';
        this.emailInput.value = this.user.email || '';
        this.phoneInput.value = this.user.phone || '';

        // ✅ صورة افتراضية ديناميكية من DiceBear حسب الثيم
        const theme = this.user.theme === 1 ? 'night' : 'day';
        const defaultAvatar = `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(this.user.username)}&backgroundColor=${theme === 'night' ? '1c1c1c' : 'fefefe'}`;

        this.avatarPreview.src = this.user.avatar || defaultAvatar;
    }

    /**
     * @method bindEvents
     * @description ربط الأحداث بالنموذج، بما في ذلك:
     * - التحقق التلقائي أثناء الكتابة لكل حقل
     * - التحقق عند الإرسال
     * - تحميل الصورة والتحقق منها
     * - إزالة الصورة الشخصية
     **/
    bindEvents() {
        // ✅ التحقق التلقائي أثناء الكتابة لكل حقل
        ['name', 'email', 'phone', 'password', 'confirm'].forEach(key => {
            const input = this[`${key}Input`];
            if (input) {
                input.addEventListener('input', () => {
                    const value = input.value.trim();
                    const passwordRef = this.passwordInput?.value.trim();
                    validateAndVisualizeField(key, value, passwordRef);
                });
            }
        });

        // ✅ التحقق عند إرسال النموذج
        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            const fields = {
                name: this.nameInput?.value.trim(),
                email: this.emailInput?.value.trim(),
                phone: this.phoneInput?.value.trim(),
                password: this.passwordInput?.value.trim(),
                confirm: this.confirmInput?.value.trim()
            };

            let validPassword = null;
            let hasErrors = false;

            Object.entries(fields).forEach(([key, value]) => {
                const result = validateAndVisualizeField(key, value, fields.password);
                if (!result.valid) {
                    showToast(`❌ ${result.message}`, 'error');
                    hasErrors = true;
                } else if (key === 'password') {
                    validPassword = value;
                }
            });

            this.saveProfile(validPassword); // ✅ تابع الحفظ حتى لو كان هناك أخطاء جزئية
        });

        // 🖼️ تحميل الصورة والتحقق منها
        this.avatarInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) {
                this.avatarPreview.src = '';
                this.removeAvatarBtn.style.display = 'none';
                return;
            }

            const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
            const maxSize = 2 * 1024 * 1024;

            if (!allowedTypes.includes(file.type)) {
                showToast('❌ نوع الصورة غير مدعوم. الرجاء استخدام JPG أو PNG أو WEBP.', 'error');
                e.target.value = '';
                this.avatarPreview.src = '';
                this.removeAvatarBtn.style.display = 'none';
                return;
            }

            if (file.size > maxSize) {
                showToast('❌ حجم الصورة كبير جدًا. الحد الأقصى هو 2MB.', 'error');
                e.target.value = '';
                this.avatarPreview.src = '';
                this.removeAvatarBtn.style.display = 'none';
                return;
            }

            this.avatarFile = file;
            const reader = new FileReader();
            reader.onload = () => {
                this.avatarPreview.src = reader.result;
                this.removeAvatarBtn.style.display = 'inline-block';
            };
            reader.readAsDataURL(file);
        });

        // ✅ فتح نافذة اختيار الصورة
        this.changeAvatarBtn.addEventListener('click', () => {
            this.avatarInput.click();
        });

        // 🗑️ إزالة الصورة
        this.removeAvatarBtn.addEventListener('click', () => this.removeAvatar());
    }

    /**
     * @method uploadAvatarToServer
     * @description يرفع الصورة الشخصية إلى الخادم ويعيد رابطها
     * @returns {Promise<string|null>} رابط الصورة أو null في حال الفشل
     */
    async uploadAvatarToServer() {
        if (!this.avatarFile) return null;
        const formData = new FormData();
        formData.append('avatar', this.avatarFile);

        try {
            const res = await fetch(`/api/users/${this.userId}/avatar`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${this.token}` },
                body: formData
            });

            const data = await res.json();
            return data.avatar || null;
        } catch (err) {
            console.error('❌ فشل رفع الصورة إلى الخادم:', err);
            showToast('فشل رفع الصورة الشخصية', 'error');
            return null;
        }
    }

    async removeAvatar() {
        const confirmed = confirm('هل أنت متأكد أنك تريد إزالة الصورة الشخصية؟');

        if (!confirmed) return;

        try {
            const res = await fetch(`/api/users/${this.userId}/avatar/remove`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${this.token}` }
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'فشل إزالة الصورة');

            const fallback = this.userManager.getDefaultAvatar(this.user.username);
            this.avatarPreview.src = fallback;
            showToast('✅ تم إزالة الصورة الشخصية', 'success');
            this.avatarPreview.src = '';
            this.avatarInput.value = '';
            this.removeAvatarBtn.style.display = 'none';
            this.avatarFile = null;
            await this.userManager.refresh();
        } catch (err) {
            console.error('❌ خطأ في إزالة الصورة:', err);
            showToast('حدث خطأ أثناء إزالة الصورة', 'error');
        }
    }

    /**
     * @method saveProfile
     * @description حفظ البيانات المعدّلة في قاعدة البيانات، مع عرض مؤشرات نجاح لكل حقل.
     * @param {string|null} validPassword - كلمة المرور إذا كانت صالحة، أو null إذا كانت غير صالحة.
     **/
    async saveProfile(validPassword = null) {
        const name = this.nameInput?.value.trim();
        const email = this.emailInput?.value.trim();
        const phone = this.phoneInput?.value.trim();

        const payload = {};
        if (name) payload.name = name;
        if (email) payload.email = email;
        if (phone) payload.phone = phone;
        if (validPassword) payload.password = validPassword;

        const avatarUrl = await this.uploadAvatarToServer();
        if (avatarUrl) payload.avatar = avatarUrl;

        try {
            const res = await fetch(`/api/users/${this.userId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.token}`
                },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'فشل حفظ البيانات');

            // ✅ عرض مؤشرات نجاح لكل حقل تم حفظه
            if (Array.isArray(data.details)) {
                data.details.forEach(msg => {
                    const type = msg.startsWith('✅') ? 'success' : 'error';
                    showToast(msg, type);

                    const fieldMatch = msg.match(/تم حفظ (.+?) بنجاح/);
                    if (fieldMatch) {
                        const fieldKey = {
                            'الاسم': 'name',
                            'البريد الإلكتروني': 'email',
                            'كلمة المرور': 'password',
                            'رقم الهاتف': 'phone',
                            'الصورة الشخصية': 'avatar'
                        }[fieldMatch[1]];
                        if (fieldKey) updateFieldVisual(fieldKey, 'success');
                    }
                });
            } else {
                showToast('✅ تم حفظ التغييرات بنجاح', 'success');
            }

            await this.userManager.refresh();
        } catch (err) {
            console.error('❌ خطأ في حفظ الإعدادات:', err);
            showToast(err.message || 'حدث خطأ أثناء حفظ البيانات', 'error');
        }
    }
}
