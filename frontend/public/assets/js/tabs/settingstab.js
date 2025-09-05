import { showToast } from '../utils/toast.js';
import { STORAGE_KEYS } from '../utils/appUtils.js';

export class SettingsTab {
    constructor(containerId, userManager) {
        this.containerId = containerId;
        this.userManager = userManager;
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

        const template = document.getElementById('settings-template');
        if (!template) return;

        const clone = template.content.cloneNode(true);
        const wrapper = clone.querySelector('.settings-tab');

        // ✅ تطبيق الثيم مباشرة
        const theme = this.user.theme === 1 ? 'night-theme' : 'day-theme';
        wrapper.classList.add(theme);

        container.innerHTML = ''; // تنظيف التبويب
        container.appendChild(clone);

        this.injectUserData();
        this.bindEvents();
    }

    /**
     * حقن بيانات المستخدم داخل النموذج
     */
    injectUserData() {
        document.getElementById('user-name').value = this.user.username || '';
        document.getElementById('user-email').value = this.user.email || '';
        document.getElementById('user-phone').value = this.user.phone || '';
        document.getElementById('avatar-preview').src = this.user.avatar || this.userManager.getDefaultAvatar(this.user.username);
    }

    /**
     * ربط الأحداث بالنموذج
     */
    bindEvents() {
        document.getElementById('settings-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveProfile();
        });
        document.getElementById('avatar-input').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
            const maxSize = 2 * 1024 * 1024; // 2MB

            if (!allowedTypes.includes(file.type)) {
                showToast('❌ نوع الصورة غير مدعوم. الرجاء استخدام JPG أو PNG أو WEBP.', 'error');
                e.target.value = '';
                return;
            }

            if (file.size > maxSize) {
                showToast('❌ حجم الصورة كبير جدًا. الحد الأقصى هو 2MB.', 'error');
                e.target.value = '';
                return;
            }

            this.avatarFile = file;
            const reader = new FileReader();
            reader.onload = () => {
                document.getElementById('avatar-preview').src = reader.result;
            };
            reader.readAsDataURL(file);
        });
        document.getElementById('remove-avatar-btn').addEventListener('click', () => {
            this.removeAvatar();
        });
    }

    /**
     * رفع الصورة إلى Cloudinary وإرجاع الرابط
     * @returns {Promise<string|null>}
     */
    async uploadAvatarToServer() {
        if (!this.avatarFile) return null;

        const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
        const formData = new FormData();
        formData.append('avatar', this.avatarFile);

        try {
            const res = await fetch(`/api/users/${userId}/avatar`, {
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
        const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
        const confirmed = confirm('هل أنت متأكد أنك تريد إزالة الصورة الشخصية؟');

        if (!confirmed) return;

        try {
            const res = await fetch(`/api/users/${userId}/avatar/remove`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${this.token}` }
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'فشل إزالة الصورة');

            const fallback = this.userManager.getDefaultAvatar(this.user.username);
            document.getElementById('avatar-preview').src = fallback;
            showToast('✅ تم إزالة الصورة الشخصية', 'success');
            await this.userManager.refresh();
        } catch (err) {
            console.error('❌ خطأ في إزالة الصورة:', err);
            showToast('حدث خطأ أثناء إزالة الصورة', 'error');
        }
    }

    /**
     * حفظ البيانات المعدّلة في قاعدة البيانات
     */
    async saveProfile() {
        const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
        const name = document.getElementById('user-name').value.trim();
        const email = document.getElementById('user-email').value.trim();
        const phone = document.getElementById('user-phone').value.trim();
        const password = document.getElementById('user-password').value;

        const payload = { name, email, phone };
        if (password.length >= 6) payload.password = password;

        const avatarUrl = await this.uploadAvatarToServer();
        if (avatarUrl) payload.avatar = avatarUrl;

        try {
            const res = await fetch(`/api/users/${userId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.token}`
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error('فشل حفظ البيانات');
            showToast('✅ تم حفظ التغييرات بنجاح', 'success');
            await this.userManager.refresh(); // تحديث الواجهة بعد الحفظ
        } catch (err) {
            console.error('❌ خطأ في حفظ الإعدادات:', err);
            showToast('حدث خطأ أثناء حفظ البيانات', 'error');
        }
    }
}
