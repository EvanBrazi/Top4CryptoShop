/**
 * كلاس مسؤول عن إدارة تبويب "طلباتي" للمستخدم
 * يعرض الطلبات حسب الحالة، ويدير نافذة التفاصيل
 */
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
        await fetch(`/api/orders?userId=${this.userId}`)
            .then(async res => await res.json())
            .then(data => {
                this.orders = Array.isArray(data) ? data : [];
                this.renderOrders();
            })
            .catch(err => console.error('❌ فشل تحميل الطلبات:', err));
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
            row.innerHTML = `
                <td>${order.orderId}</td>
                <td>${this.formatDate(order.createdAt)}</td>
                <td>${this.translateStatus(order.status)}</td>
                <td>${order.amount} 💵</td>
                <td><button class="details-btn" data-id="${order.orderId}">عرض التفاصيل</button></td>
            `;
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
        const closeBtn = modal.querySelector('.close-btn');
        closeBtn.onclick = () => modal.classList.remove('show');

        modal.querySelector('.modal-body').innerHTML = `
            <p><strong>الخدمة:</strong> ${order.service}</p>
            <p><strong>المبلغ:</strong> ${order.amount} 💵</p>
            <p><strong>طريقة الدفع:</strong> ${order.method}</p>
            <p><strong>الحالة:</strong> ${this.translateStatus(order.status)}</p>
            <p><strong>التاريخ:</strong> ${this.formatDate(order.createdAt)}</p>
        `;
        modal.classList.add('show');
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
            case 'accepted': return '✅ تم القبول';
            case 'rejected': return '❌ تم الرفض';
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
