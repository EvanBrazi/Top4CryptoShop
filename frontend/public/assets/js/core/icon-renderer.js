/**
 * @file icon-renderer.js
 * @description وحدة عرض الأيقونات باستخدام Blob أو objectURL، مع دعم fallback ذكي وتكامل مع UnifiedIconSystem
 * @version 2.0.0
 * @license MIT
 */
/**
 * @class IconRenderer
 * @description وحدة مسؤولة عن عرض الأيقونات داخل عناصر <img> باستخدام Blob أو objectURL، مع دعم fallback ذكي عند الفشل.
 * @method render - عرض الأيقونة من Blob داخل عنصر <img>
 * @method renderFromSystem - تحميل الأيقونة من النظام الموحد وعرضها مباشرة
 * @method _generateFallbackIcon - توليد صورة بديلة ديناميكية باستخدام Canvas
 */
export class IconRenderer {
    /**
     * @constructor
     * @param {string|HTMLElement} target - عنصر <img> أو محدد CSS
     * @throws {Error} إذا لم يكن العنصر صالحًا
     */
    constructor(target) {
        this.imgElement = typeof target === 'string'
            ? document.querySelector(target)
            : target;

        if (!target && !this.imgElement && !(this.imgElement instanceof HTMLImageElement)) {
            //throw new Error('❌ IconRenderer requires a valid <img> element');
        }
    }

    /**
     * توليد صورة fallback ديناميكية باستخدام Canvas
     * @param {string} title - رمز يظهر داخل الصورة (مثل أول حرف من اسم التطبيق)
     * @param {string} bgColor - لون الخلفية
     * @param {string} textColor - لون النص
     * @returns {string} رابط DataURL للصورة
     */
    _generateFallbackIcon(title = '؟', bgColor = '#6a5acd', textColor = '#fff') {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = textColor;
        ctx.font = 'bold 32px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(title[0], canvas.width / 2, canvas.height / 2);

        return canvas.toDataURL();
    }

    /**
     * عرض الأيقونة من Blob داخل عنصر <img>
     * @param {Blob|null} blob - بيانات الصورة
     * @param {string} fallbackText - رمز fallback عند الفشل
     * @param {HTMLImageElement} imgElement - عنصر <img> الذي سيتم عرض الصورة فيه
     */
    async render(blob, fallbackText = '!', imgElement = this.imgElement) {
        console.log('IconRenderer :: render : ', blob);
        
        if (!(imgElement instanceof HTMLImageElement)) return;

        if (!(blob instanceof Blob)) {
            imgElement.src = this._generateFallbackIcon(fallbackText);
            return;
        }

        const objectUrl = URL.createObjectURL(blob);
        imgElement.src = objectUrl;

        imgElement.onload = () => {
            setTimeout(() => URL.revokeObjectURL(objectUrl), 3000);
        };

        imgElement.onerror = () => {
            imgElement.src = this._generateFallbackIcon(fallbackText);
        };
    }

    /**
     * تحميل الأيقونة من النظام الموحد وعرضها مباشرة
     * @param {UnifiedIconSystem} iconSystem - النظام الموحد للأيقونات
     * @param {string} iconName - اسم الأيقونة المطلوبة
     * @param {string} fallbackText - رمز fallback عند الفشل
     */
    async renderFromSystem(iconSystem, iconName, fallbackText = '!', imgElement = this.imgElement) {
        console.log('IconRenderer :: renderFromSystem : ', iconName);
        if (!(imgElement instanceof HTMLImageElement)) return;

        try {
            const blob = await iconSystem.getIcon(iconName);
            await his.render(blob, fallbackText, imgElement);
        } catch (err) {
            imgElement.src = this._generateFallbackIcon(fallbackText);
        }
    }

}
