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
            console.log('render new Order: ', order);
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
        const modalContent = modal.querySelector('.modal-content');
        const closeBtn = modal.querySelector('.orders-close-btn');
        // إعادة تعيين المودال قبل الفتح
        modal.style.display = 'flex';
        modal.classList.remove('exit');
        modalContent.classList.remove('exit');
        // تعبئة البيانات
        modal.querySelector('.modal-body').innerHTML = `
            <p><strong>الخدمة:</strong> ${order.service}</p>
            <p><strong>المبلغ:</strong> ${order.amount} 💵</p>
            <p><strong>طريقة الدفع:</strong> ${order.method}</p>
            <p><strong>الحالة:</strong> ${this.translateStatus(order.status)}</p>
            <p><strong>التاريخ:</strong> ${this.formatDate(order.createdAt)}</p>
        `;
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
