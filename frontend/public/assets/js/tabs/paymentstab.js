/**
 * PaymentsTab - إدارة تبويب "دفعاتي" للمستخدم
 * يعرض جميع الدفعات حسب الحالة، ويدير نافذة التفاصيل مع معاينة صورة إشعار الدفع
 *
 * الكاتب: Evan Brazi
 * تاريخ الإنشاء: 2025-08-28
 * الإصدار: 1.1.0
 */

export class PaymentsTab {
    /**
     * @param {string} containerId - معرف عنصر التبويب في DOM
     * @param {string} userId - معرف المستخدم الحالي
     * @param {object} options - إعدادات إضافية (اختياري)
     */
    constructor(containerId, userId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) throw new Error(`❌ العنصر "${containerId}" غير موجود في DOM`);

        this.tbody = this.container.querySelector('tbody');
        this.filterSelect = this.container.querySelector('#payment-filter');
        this.userId = userId;
        this.options = options;
        this.pollInterval = 10000;
        this.payments = [];

        this.init();
    }

    /**
     * تهيئة التبويب: تحميل البيانات وربط الفلاتر
     */
    init() {
        this.loadPayments();

        if (this.filterSelect) {
            this.filterSelect.addEventListener('change', () => this.renderPayments());
        }
    }

    /**
     * تحميل الدفعات من السيرفر باستخدام userId
     */
    async loadPayments() {
        try {
            const res = await fetch(`/api/payments?userId=${this.userId}`);
            const data = await res.json();
            this.payments = Array.isArray(data) ? data : [];
            this.renderPayments();
        } catch (err) {
            console.error('❌ فشل تحميل الدفعات:', err);
        }
    }

    /**
     * عرض الدفعات في الجدول حسب الفلتر المحدد
     */
    renderPayments() {
        const statusFilter = this.filterSelect?.value || 'all';
        const filtered = statusFilter === 'all'
            ? this.payments
            : this.payments.filter(p => p.status === statusFilter);

        this.tbody.innerHTML = '';

        if (filtered.length === 0) {
            const emptyRow = document.createElement('tr');
            emptyRow.className = 'empty-row';
            emptyRow.innerHTML = `<td colspan="5">لا توجد دفعات مطابقة</td>`;
            this.tbody.appendChild(emptyRow);
            return;
        }

        filtered.forEach(payment => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${payment.paymentId}</td>
                <td>${this.formatDate(payment.createdAt)}</td>
                <td><span class="status ${payment.status}">${this.translateStatus(payment.status)}</span></td>
                <td>${payment.amountInUSD} 💵</td>
                <td><img src="${payment.receiptImage}" style="width:40px; border-radius:4px;" /></td>
                <td><button class="details-btn" data-id="${payment.paymentId}">عرض التفاصيل</button></td>
            `;
            this.tbody.appendChild(row);
        });

        this.attachDetailsHandlers();
    }

    /**
     * ربط أزرار "عرض التفاصيل" بكل دفعة
     */
    attachDetailsHandlers() {
        const buttons = this.tbody.querySelectorAll('.details-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                const paymentId = btn.dataset.id;
                const payment = this.payments.find(p => p.paymentId === paymentId);
                this.showDetailsModal(payment);
            });
        });
    }

    /**
     * عرض نافذة تفاصيل الدفع مع معاينة صورة الإشعار والملاحظات
     * @param {object} payment - بيانات الدفعة المحددة
     */
    showDetailsModal(payment) {
        const modal = document.getElementById('payment-details-modal');
        const modalContent = modal.querySelector('.modal-content');
        const closeBtn = modal.querySelector('.payments-close-btn');
        // إعادة تعيين المودال قبل الفتح
        modal.style.display = 'flex';
        modal.classList.remove('exit');
        modalContent.classList.remove('exit');
        const amountDisplay = payment.amount === payment.amountInUSD
            ? `${payment.amount} USD 💵`
            : `${payment.amount} ≈ ${payment.amountInUSD} USD 💵`;
        modal.querySelector('.modal-body').innerHTML = `
  <div class="modal-info-grid">
    <div><span>💵 المبلغ:</span><strong>${amountDisplay}</strong></div>
    <div><span>💳 الطريقة:</span><strong>${payment.method}</strong></div>
    <div><span>📌 الحالة:</span><strong class="status ${payment.status}">${this.translateStatus(payment.status)}</strong></div>
    <div><span>📅 التاريخ:</span><strong>${this.formatDate(payment.createdAt)}</strong></div>
    ${payment.note ? `<div><span>📝 ملاحظة:</span><strong>${payment.note}</strong></div>` : ''}
    ${payment.status === 'pending' ? `<div class="pending-warning">⚠️ هذه الدفعة بانتظار مراجعة الأدمن</div>` : ''}
    <div class="receipt-image-container">
      <span>🖼️ إشعار الدفع:</span>
      <img src="${payment.receiptImage || payment.paymentId + '.png'}" alt="إشعار الدفع" />
    </div>
  </div>
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
     * @param {string} dateString - التاريخ بصيغة ISO
     * @returns {string} - التاريخ بصيغة عربية
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
     * ترجمة حالة الدفع إلى نص عربي مع رمز
     * @param {string} status - الحالة الأصلية
     * @returns {string} - الحالة المترجمة
     */
    translateStatus(status) {
        switch (status) {
            case 'pending': return '⏳ قيد المعالجة';
            case 'accepted': return '✅ تم القبول';
            case 'rejected': return '❌ تم الرفض';
            default: return '❔ غير معروف';
        }
    }

    /**
     * بدء التحديث التلقائي للدفعات كل pollInterval ميلي ثانية
     */
    startAutoRefresh() {
        this.refreshTimer = setInterval(() => this.loadPayments(), this.pollInterval);
    }

    /**
     * إيقاف التحديث التلقائي
     */
    stopAutoRefresh() {
        clearInterval(this.refreshTimer);
    }
}
