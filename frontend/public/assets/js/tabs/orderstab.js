/**
 * كلاس مسؤول عن إدارة تبويب "طلباتي" للمستخدم
 * يعرض الطلبات حسب الحالة، ويدير نافذة التفاصيل
 */
import { OrderClient } from '../utils/orderClient.js';
export class OrdersTab {
    /**
     * @param {string} containerId - معرف عنصر التبويب في DOM
     * @param {string} userId - معرف المستخدم الحالي
     * @param {object} options - إعدادات إضافية (اختياري)
     */
    constructor(containerId, userId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) throw new Error(`Container "${containerId}" غير موجود`);

        this.tbody = this.container.querySelector('tbody');
        this.filterSelect = this.container.querySelector('#order-filter');
        this.userId = userId;
        this.options = options;
        this.pollInterval = 10000;
        this.orders = [];
        this.client = new OrderClient();
        this.onPurchase = () => this.loadOrders();
        document.addEventListener('purchaseConfirmed', this.onPurchase);
        if (this.filterSelect) {
            this.filterSelect.replaceChildren();
            for (const [value, label] of [['all', 'الكل'], ['pending', 'بانتظار التنفيذ'], ['completed', 'تم التنفيذ'], ['cancelled', 'ملغي ومسترد'], ['reconciliation_required', 'قديم — مراجعة']]) {
                const option = document.createElement('option'); option.value = value; option.textContent = label; this.filterSelect.appendChild(option);
            }
        }
        this.init();
    }

    /**
     * تهيئة التبويب: تحميل البيانات وربط الفلاتر
     */
    init() {
        this.loadOrders();
        // يمكن تفعيل التحديث التلقائي لاحقًا
        // this.startAutoRefresh();

        if (this.filterSelect) {
            this.filterSelect.addEventListener('change', () => this.renderOrders());
        }
    }

    /**
     * تحميل الطلبات من السيرفر
     */
    async loadOrders() {
        try {
            await this.client.verifyOwner(this.userId);
            const data = await this.client.read('/api/orders?limit=100');
            this.orders = Array.isArray(data) ? data : [];
            this.renderOrders();
            this.renderSavedPurchases();
        } catch (_) {
            this.orders = [];
            this.tbody.replaceChildren();
            const row = document.createElement('tr'), cell = document.createElement('td');
            cell.colSpan = 5; cell.textContent = 'تعذر تحميل الطلبات — تحقق من تسجيل الدخول'; row.appendChild(cell); this.tbody.appendChild(row);
        }
    }

    renderSavedPurchases() {
        this.container.querySelector('.saved-purchases')?.remove();
        const box = document.createElement('div'); box.className = 'saved-purchases';
        for (const attempt of this.client.pendingPurchases(this.userId)) {
            const { idempotencyKey, ...input } = attempt.payload;
            const button = document.createElement('button'); button.textContent = `إعادة محاولة الطلب المحفوظ: ${input.category} #${input.productId}`;
            button.onclick = async () => {
                button.disabled = true;
                try { await this.client.purchase(input, this.userId); await this.loadOrders(); }
                catch (_) { button.textContent = 'النتيجة غير محددة — أعد نفس الطلب المحفوظ'; }
                finally { button.disabled = false; }
            };
            box.appendChild(button);
        }
        this.container.prepend(box);
    }

    /**
     * عرض الطلبات في الجدول حسب الفلتر المحدد
     */
    renderOrders() {
        const statusFilter = this.filterSelect?.value || 'all';
        const filtered = statusFilter === 'all'
            ? this.orders
            : this.orders.filter(o => o.status === statusFilter);

        this.tbody.innerHTML = '';

        if (filtered.length === 0) {
            const emptyRow = document.createElement('tr');
            emptyRow.className = 'empty-row';
            emptyRow.innerHTML = `<td colspan="5">لا توجد طلبات مطابقة</td>`;
            this.tbody.appendChild(emptyRow);
            return;
        }

        filtered.forEach(order => {
            const row = document.createElement('tr');
            for (const text of [order.orderId, this.formatDate(order.createdAt), this.translateStatus(order.status), order.legacy ? 'غير موثق' : `USD ${order.charge}`]) {
                const cell = document.createElement('td'); cell.textContent = text ?? '-'; row.appendChild(cell);
            }
            const cell = document.createElement('td'), button = document.createElement('button');
            button.className = 'details-btn'; button.dataset.id = order.orderId; button.textContent = 'عرض التفاصيل'; cell.appendChild(button); row.appendChild(cell);
            this.tbody.appendChild(row);
        });

        this.attachDetailsHandlers();
    }

    /**
     * ربط أزرار "عرض التفاصيل" بكل طلب
     */
    attachDetailsHandlers() {
        const buttons = this.tbody.querySelectorAll('.details-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                const orderId = btn.dataset.id;
                const order = this.orders.find(o => o.orderId === orderId);
                this.showDetailsModal(order);
            });
        });
    }

    /**
     * عرض نافذة تفاصيل الطلب
     * @param {object} order - بيانات الطلب المحدد
     */
    showDetailsModal(order) {
        const modal = document.getElementById('order-details-modal');
        const modalContent = modal.querySelector('.modal-content');
        const closeBtn = modal.querySelector('.orders-close-btn');
        // إعادة تعيين المودال قبل الفتح
        modal.style.display = 'flex';
        modal.classList.remove('exit');
        modalContent.classList.remove('exit');
        // تعبئة البيانات
        const body = modal.querySelector('.modal-body'); body.replaceChildren();
        for (const [label, value] of [['رقم العملية', order.orderId], ['الخدمة', order.service], ['الكمية', order.quantity], ['المبلغ USD', order.legacy ? 'غير موثق' : order.charge], ['الحالة', this.translateStatus(order.status)], ['التاريخ', this.formatDate(order.createdAt)]]) {
            const line = document.createElement('p'); line.textContent = `${label}: ${value ?? '-'}`; body.appendChild(line);
        }
        const target = document.createElement('p'); target.textContent = order.legacy ? 'بيانات قديمة غير موثقة' : 'جاري تحميل بيانات التسليم'; body.appendChild(target);
        if (!order.legacy) this.client.read(`/api/orders/${encodeURIComponent(order.orderId)}/fulfillment`).then(({ fulfillmentSnapshot: snapshot }) => {
            target.textContent = snapshot ? `${snapshot.schema}${snapshot.network ? ` (${snapshot.network})` : ''}: ${snapshot.target[snapshot.schema]}` : 'لا توجد وجهة تسليم مطلوبة';
        }).catch(() => { target.textContent = 'تعذر تحميل بيانات التسليم'; });
        // إظهار المودال
        setTimeout(() => modal.classList.add('show'), 10);
        // إغلاق بزر الإغلاق
        closeBtn.onclick = () => this._closeModal(modal);
        // إغلاق بالضغط خارج المحتوى
        modal.onclick = (e) => { if (e.target === modal) this._closeModal(modal); };
        // إغلاق بزر Escape
        document.onkeydown = (e) => { if (e.key === 'Escape') this._closeModal(modal); };
        // دعم السحب
        let isDragging = false, offsetX = 0, offsetY = 0;
        modalContent.addEventListener('mousedown', (e) => {
            isDragging = true;
            offsetX = e.clientX - modalContent.offsetLeft;
            offsetY = e.clientY - modalContent.offsetTop;
            modalContent.style.position = 'absolute';
            modalContent.style.margin = '0';
        });
        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                modalContent.style.left = `${e.clientX - offsetX}px`;
                modalContent.style.top = `${e.clientY - offsetY}px`;
            }
        });
        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }

    _closeModal(modal) {
        const content = modal.querySelector('.modal-content');
        // أضف كلاس الخروج
        content.classList.add('exit');
        modal.classList.add('exit');
        // بعد انتهاء الأنيميشن، أخفِ المودال فعليًا
        setTimeout(() => {
            modal.classList.remove('show', 'exit');
            content.classList.remove('exit');
            modal.style.display = 'none'; // ضروري لإخفاء المودال فعليًا
        }, 100); // نفس مدة الأنيميشن
    }

    /**
     * تنسيق التاريخ للعرض العربي
     */
    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('ar-EG', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * ترجمة حالة الطلب إلى نص عربي
     */
    translateStatus(status) {
        switch (status) {
            case 'pending': return '⏳ قيد الانتظار';
            case 'completed': return '✅ تم التنفيذ';
            case 'cancelled': return '↩️ ملغي — مسترد بالكامل';
            case 'reconciliation_required': return 'طلب قديم — يتطلب مراجعة';
            default: return '❔ غير معروف';
        }
    }

    /**
     * بدء التحديث التلقائي للطلبات
     */
    startAutoRefresh() {
        this.refreshTimer = setInterval(() => this.loadOrders(), this.pollInterval);
    }

    /**
     * إيقاف التحديث التلقائي
     */
    stopAutoRefresh() {
        clearInterval(this.refreshTimer);
    }
}
