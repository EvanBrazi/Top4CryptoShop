// CardComponent.js

// تعريف الكلاس الرئيسي للمكون
export class CardComponent {
    /**
     * @param {Object} config - إعدادات البطاقة
     * @param {Object} config.data - بيانات العنصر (اسم، أيقونة، إلخ)
     * @param {Object} config.iconLoader - كائن مسؤول عن تحميل الأيقونات
     * @param {string} config.fallbackUrl - رابط أيقونة بديلة في حال الفشل
     * @param {Function} config.onClick - دالة تُنفذ عند الضغط على البطاقة
     * @param {string} config.themeColor - لون حدود البطاقة
     * @param {Array} config.actions - أزرار تفاعلية داخل البطاقة [{label, icon, handler}]
     */
    constructor({ data, iconLoader, fallbackUrl, onClick, themeColor, actions = [] }) {
        this.data = data;
        this.iconLoader = iconLoader;
        this.fallbackUrl = fallbackUrl;
        this.onClick = onClick;
        this.themeColor = themeColor;
        this.actions = actions; // [{ label: 'شراء', icon: 'buy.svg', handler: fn }]
    }

    /**
   * ينشئ عنصر <img> للأيقونة ويحمّلها باستخدام iconLoader
   * @returns {HTMLImageElement}
   */
    createIcon() {
        const icon = document.createElement('img');
        icon.className = 'card-icon';
        icon.alt = this.data.name || 'App';
        icon.loading = 'lazy';
        icon.src = this.fallbackUrl; // مؤقتًا حتى يتم تحميل الأيقونة

        // تحميل الأيقونة الحقيقية بطريقة ذكية
        this.iconLoader.render(this.data.iconName, icon, this.fallbackUrl);
        return icon;
    }

    /**
 * ينشئ عنصر <div> لعرض اسم العنصر داخل البطاقة
 * @returns {HTMLDivElement}
 */
    createTitle() {
        const title = document.createElement('div');
        title.className = 'card-title';
        title.textContent = this.data.name || 'بدون اسم';
        return title;
    }

    /**
 * ينشئ مجموعة أزرار تفاعلية داخل البطاقة (شراء، حفظ، تقييم...)
 * @returns {HTMLDivElement}
 */
    createActions() {
        const container = document.createElement('div');
        container.className = 'card-actions';

        this.actions.forEach(action => {
            const btn = document.createElement('button');
            btn.className = 'card-action-btn';
            btn.innerHTML = `<img src="${action.icon}" alt="${action.label}" /> ${action.label}`;
            btn.onclick = () => action.handler(this.data);
            container.appendChild(btn);
        });

        return container;
    }

    /**
 * ينشئ البطاقة النهائية ويجمع كل العناصر داخلها
 * @returns {HTMLDivElement}
 */
    render() {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.borderColor = this.themeColor || '#ccc';

        const icon = this.createIcon();
        const title = this.createTitle();
        const actions = this.createActions();

        card.appendChild(icon);
        card.appendChild(title);
        card.appendChild(actions);

        // ربط حدث الضغط على البطاقة
        card.addEventListener('click', () => {
            if (typeof this.onClick === 'function') {
                this.onClick(this.data);
            }
        });

        return card;
    }
}
