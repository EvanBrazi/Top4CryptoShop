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
     * حقن بيانات المستخدم داخل النموذج، بما في ذلك صورة افتراضية ديناميكية حسب الثيم
     */
    injectUserData() {
        const nameInput = document.getElementById('user-name');
        const emailInput = document.getElementById('user-email');
        const phoneInput = document.getElementById('user-phone');
        const avatarPreview = document.getElementById('avatar-preview');

        if (!nameInput || !emailInput || !phoneInput || !avatarPreview) return;

        nameInput.value = this.user.username || '';
        emailInput.value = this.user.email || '';
        phoneInput.value = this.user.phone || '';

        // ✅ صورة افتراضية ديناميكية من DiceBear حسب الثيم
        const theme = this.user.theme === 1 ? 'dark' : 'light';
        const defaultAvatar = `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(this.user.username)}&backgroundColor=${theme === 'dark' ? '1c1c1c' : 'fefefe'}`;

        avatarPreview.src = this.user.avatar || defaultAvatar;
    }

    /**
     * ✅ ربط الأحداث بالنموذج مع التحقق من الصورة وكلمة المرور
     */
    bindEvents() {
        const form = document.getElementById('settings-form');
        const avatarInput = document.getElementById('avatar-input');
        const avatarPreview = document.getElementById('avatar-preview');
        const removeBtn = document.getElementById('remove-avatar-btn');
        const passwordInput = document.getElementById('newPassword');
        const confirmInput = document.getElementById('confirmPassword');
        // 🧠 التحقق من تطابق كلمة المرور قبل الحفظ
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const password = passwordInput?.value.trim();
            const confirm = confirmInput?.value.trim();
            if (password || confirm) {
                if (password.length < 6) {
                    showToast('❌ كلمة المرور يجب أن تكون 6 أحرف على الأقل.', 'error');
                    return;
                }
                if (password !== confirm) {
                    showToast('❌ كلمة المرور وتأكيدها غير متطابقين.', 'error');
                    return;
                }
            }
            this.saveProfile(); // ✅ تابع الحفظ إذا كان التحقق ناجحًا
        });
        // 🖼️ تحميل الصورة والتحقق منها
        avatarInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) {
                avatarPreview.src = '';
                removeBtn.style.display = 'none';
                return;
            }
            const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
            const maxSize = 2 * 1024 * 1024; // 2MB
            if (!allowedTypes.includes(file.type)) {
                showToast('❌ نوع الصورة غير مدعوم. الرجاء استخدام JPG أو PNG أو WEBP.', 'error');
                e.target.value = '';
                avatarPreview.src = '';
                removeBtn.style.display = 'none';
                return;
            }
            if (file.size > maxSize) {
                showToast('❌ حجم الصورة كبير جدًا. الحد الأقصى هو 2MB.', 'error');
                e.target.value = '';
                avatarPreview.src = '';
                removeBtn.style.display = 'none';
                return;
            }
            this.avatarFile = file;
            const reader = new FileReader();
            reader.onload = () => {
                avatarPreview.src = reader.result;
                removeBtn.style.display = 'inline-block'; // ✅ إظهار زر الإزالة
            };
            reader.readAsDataURL(file);
        });
        // 🗑️ إزالة الصورة
        removeBtn.addEventListener('click', () => {
            avatarPreview.src = '';
            avatarInput.value = '';
            removeBtn.style.display = 'none';
            this.avatarFile = null;
        });
    }

    /**
     * @method uploadAvatarToServer
     * @description يرفع الصورة الشخصية إلى الخادم ويعيد رابطها
     * @returns {Promise<string|null>} رابط الصورة أو null في حال الفشل
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
        const name = document.getElementById('user-name')?.value.trim();
        const email = document.getElementById('user-email')?.value.trim();
        const phone = document.getElementById('user-phone')?.value.trim();
        const password = document.getElementById('newPassword')?.value.trim();

        const payload = { name, email, phone };
        if (password && password.length >= 6) payload.password = password;

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
            await this.userManager.refresh();
        } catch (err) {
            console.error('❌ خطأ في حفظ الإعدادات:', err);
            showToast('حدث خطأ أثناء حفظ البيانات', 'error');
        }
    }
}
