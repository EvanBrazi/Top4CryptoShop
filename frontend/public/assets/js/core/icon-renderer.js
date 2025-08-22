/**
 * @file icon-renderer.js
 * @description وحدة عرض الأيقونات باستخدام Blob أو objectURL، مع دعم fallback ذكي
 * @version 2.0.0
 * @license MIT
 * @author Evan Brazi
 * @updated 2025-08-22
 */

/**
 * @class IconRenderer
 * @description وحدة مسؤولة عن عرض الأيقونات داخل عناصر <img> باستخدام Blob أو objectURL
 */
export class IconRenderer {
    /**
     * توليد صورة fallback ديناميكية باستخدام Canvas
     * @param {string} text - النص الذي سيظهر داخل الصورة
     * @param {string} bgColor - لون الخلفية
     * @param {string} textColor - لون النص
     * @returns {string} رابط DataURL للصورة
     */
    generateFallbackIcon(text = '?', bgColor = '#6a5acd', textColor = '#fff') {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // خلفية مستديرة
        ctx.fillStyle = bgColor;
        ctx.beginPath();
        ctx.arc(32, 32, 30, 0, Math.PI * 2);
        ctx.fill();

        // نص في المركز
        ctx.fillStyle = textColor;
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text[0].toUpperCase(), 32, 32);

        return canvas.toDataURL();
    }

    /**
     * عرض الأيقونة من Blob داخل عنصر <img>
     * @param {Blob|null} blob - بيانات الصورة
     * @param {HTMLImageElement} imgElement - عنصر <img> الذي سيتم عرض الصورة فيه
     * @param {string} fallbackText - نص بديل عند الفشل
     */
    render(blob, imgElement, fallbackText = '!') {
        if (!(imgElement instanceof HTMLImageElement)) {
            console.error('❌ عنصر الصورة غير صالح');
            return;
        }

        // إذا كان Blob صالحاً، إنشاء objectURL وعرضه
        if (blob instanceof Blob) {
            const objectUrl = URL.createObjectURL(blob);
            imgElement.src = objectUrl;

            // تنظيف الذاكرة بعد التحميل
            imgElement.onload = () => {
                setTimeout(() => URL.revokeObjectURL(objectUrl), 100);
            };

            imgElement.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                imgElement.src = this.generateFallbackIcon(fallbackText);
            };
        } else {
            // استخدام fallback إذا لم يكن Blob صالحاً
            imgElement.src = this.generateFallbackIcon(fallbackText);
        }
    }

    /**
     * تحميل وعرض الأيقونة مباشرة من النظام
     * @param {UnifiedIconSystem} iconSystem - النظام الموحد للأيقونات
     * @param {string} iconName - اسم الأيقونة المطلوبة
     * @param {HTMLImageElement} imgElement - عنصر الصورة
     * @param {string} fallbackText - نص بديل عند الفشل
     */
    async renderFromSystem(iconSystem, iconName, imgElement, fallbackText = '!') {
        try {
            const blob = await iconSystem.getIcon(iconName);
            this.render(blob, imgElement, fallbackText);
        } catch (err) {
            console.error(`❌ Failed to render icon: ${iconName}`, err);
            imgElement.src = this.generateFallbackIcon(fallbackText);
        }
    }
}
