/**
 * WalletTab - إدارة تبويب "إضافة رصيد"
 * يسمح للمستخدم بإرسال دفعة ومتابعة تحديث الرصيد عند قبولها
 *
 * الكاتب: Evan Brazi
 * الإصدار: 1.1.0
 * تاريخ التحديث: 2025-08-28
 */

export class WalletTab {
    constructor(containerId, userId, onPaymentSent) {
        this.container = document.getElementById(containerId);
        if (!this.container) throw new Error("❌ عنصر التبويب غير موجود");
        this.userId = userId;
        this.onPaymentSent = onPaymentSent; // ← حفظ المرجع للدالة
        // عناصر النموذج
        this.select = this.container.querySelector('#payment-method-select');
        this.amountInput = this.container.querySelector('#amount-input');
        this.fileInput = this.container.querySelector('#receipt-upload');
        this.noteInput = this.container.querySelector('#note-input');
        this.previewImage = this.container.querySelector('#receipt-preview');
        this.submitBtn = this.container.querySelector('.add-funds-btn');
        this.balanceDisplay = this.container.querySelector('.balance-amount');

        this.isSubmitting = false;

        this._init();
        this._initWebSocket();
    }

    /**
     * تهيئة الأحداث داخل التبويب
     */
    _init() {
        this.submitBtn.addEventListener('click', () => this._submitPayment());
        this.fileInput.addEventListener('change', () => this._previewImage());
    }

    /**
     * تهيئة WebSocket لتحديث الرصيد عند قبول الدفع
     */
    _initWebSocket() {
        const socket = new WebSocket('ws://localhost:10000');

        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'balanceUpdate' && data.userId === this.userId) {
                this._updateBalanceDisplay(data.newAmount);
            }
        };
    }

    /**
     * معاينة صورة الإشعار قبل الإرسال
     */
    _previewImage() {
        const file = this.fileInput.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = () => {
                this.previewImage.src = reader.result;
                this.previewImage.style.display = 'block';
            };
            reader.readAsDataURL(file);
        } else {
            this.previewImage.style.display = 'none';
        }
    }

    /**
     * إرسال دفعة جديدة إلى السيرفر
     */
    async _submitPayment() {
        if (this.isSubmitting) return;

        const method = this.select.value;
        const amount = this.amountInput.value;
        const file = this.fileInput.files[0];
        const note = this.noteInput.value;

        if (!method || !amount || !file) {
            alert('يرجى اختيار طريقة الدفع، إدخال المبلغ، وتحميل إشعار الدفع');
            return;
        }

        const formData = new FormData();
        formData.append('userId', this.userId);
        formData.append('method', method);
        formData.append('amount', amount);
        formData.append('receipt', file);
        formData.append('note', note);

        this.isSubmitting = true;
        this.submitBtn.textContent = 'جارٍ الإرسال...';
        this.submitBtn.disabled = true;

        try {
            const res = await fetch('/api/payments', {
                method: 'POST',
                body: formData
            });
            const result = await res.json();
            if (result.status === 'success') {
                alert('✅ تم إرسال الدفع بنجاح');
                this._resetForm();
                // ✅ استدعاء الدالة الممررة من المدير
                if (typeof this.onPaymentSent === 'function') {
                    this.onPaymentSent();
                    console.log('onPaymentSent : ', typeof this.onPaymentSent);
                }
            } else {
                alert('❌ فشل في إرسال الدفع');
            }
        } catch (err) {
            console.error('❌ خطأ في إرسال الدفع:', err);
            alert('حدث خطأ أثناء إرسال الدفع');
        }
        finally {

        }
        this.isSubmitting = false;
        this.submitBtn.textContent = 'إضافة رصيد';
        this.submitBtn.disabled = false;
    }

    /**
     * إعادة تعيين النموذج بعد الإرسال
     */
    _resetForm() {
        this.select.value = '';
        this.amountInput.value = '';
        this.fileInput.value = '';
        this.noteInput.value = '';
        this.previewImage.src = '';
        this.previewImage.style.display = 'none';
    }

    /**
     * تحديث الرصيد الظاهري عند قبول الدفع من الأدمن
     * @param {number|string} amount
     */
    _updateBalanceDisplay(amount) {
        if (!this.balanceDisplay) return;
        this.balanceDisplay.innerHTML = `${parseFloat(amount).toFixed(2)} <span>ر.س</span>`;
    }
}
