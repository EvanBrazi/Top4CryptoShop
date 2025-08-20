/**
 * @file icon-renderer.js
 * @description وحدة عرض الأيقونات باستخدام Blob وتحويلها إلى objectURL
 * @version 1.0.0
 * @license MIT
 */

export class IconRenderer {
    /**
     * @param {string|HTMLElement} target - عنصر <img> أو محدد CSS
     */
    constructor(target) {
        this.imgElement = typeof target === 'string'
            ? document.querySelector(target)
            : target;

        if (!target && !this.imgElement && !(this.imgElement instanceof HTMLImageElement)) {
            throw new Error('IconRenderer requires a valid <img> element');
        }
    }

    /**
     * عرض الأيقونة من Blob داخل عنصر <img> محدد
     * @param {Blob|null} blob - بيانات الصورة
     * @param {string} fallbackUrl - رابط الصورة البديلة عند الفشل
     * @param {HTMLImageElement} imgElement - عنصر <img> الذي سيتم عرض الصورة فيه
     */
    render(blob, fallbackUrl, imgElement) {
        if (!(imgElement instanceof HTMLImageElement)) {
            console.warn('❌ عنصر غير صالح في IconRenderer.render');
            return;
        }

        if (!blob) {
            imgElement.src = fallbackUrl;
            return;
        }

        const objectUrl = URL.createObjectURL(blob);
        imgElement.src = objectUrl;

        imgElement.onload = () => {
            setTimeout(() => URL.revokeObjectURL(objectUrl), 3000);
        };
    }
}
