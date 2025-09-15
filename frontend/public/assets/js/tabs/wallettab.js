/**
 * WalletTab - إدارة تبويب "إضافة رصيد"
 * يسمح للمستخدم بإرسال دفعة ومتابعة تحديث الرصيد عند قبولها
 *
 * الكاتب: Evan Brazi
 * الإصدار: 1.1.0
 * تاريخ التحديث: 2025-08-28
 */

import { isValidImage } from "../utils/appUtils.js";

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
        //this._initWebSocket();
    }

    /**
     * تهيئة الأحداث داخل التبويب
     */
    _init() {
        this.infoBox = document.getElementById('converted-amount-box');
        this.amountInDolField = document.getElementById('amount-input-dol');
        this.amountInDolField.style.display = 'none';
        //this.infoBox.id = 'payment-info';
        //this.infoBox.className = 'payment-details-box';
        //this.select.parentNode.appendChild(this.infoBox);
        this.submitBtn.addEventListener('click', () => this._submitPayment());
        this.fileInput.addEventListener('change', () => this._previewImage());
        this.select.addEventListener('change', () => this.updatePaymentInfo());
        this.amountInput.addEventListener('input', () => this.updatePaymentInfo());
        this.exchangeRatesFromAPI = { USD: 1, SYP: 11500, USDT: 1 };
    }

    /**
     * تهيئة WebSocket لتحديث الرصيد عند قبول الدفع
     */
    //_initWebSocket() {
        // ✅ تهيئة WebSocket لاستقبال إشعارات لحظية من السيرفر
    //    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    //    const wsUrl = `${protocol}//${window.location.host}`;
    //    console.log('📡 محاولة الاتصال بـ WebSocket:', wsUrl);
    //    const socket = new WebSocket(wsUrl);
    //    socket.onmessage = (event) => {
    //        const data = JSON.parse(event.data);
    //        if (data.type === 'paymentAccepted' && data.userId === this.userId) {
    //            this._updateBalanceDisplay(data.newAmount);
    //        }
    //    };
    //}

    updateConvertedAmount() {
        const amount = parseFloat(document.getElementById('amount-input').value);
        const targetCurrency = document.getElementById('currency-select').value;
        const rate = exchangeRates[targetCurrency];
        const converted = !isNaN(amount) ? (amount * rate).toFixed(2) : '0.00';

        document.getElementById('converted-amount-box').innerHTML = `
    💱 المبلغ المحول: ${converted} ${targetCurrency}
  `;
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

    async fetchExchangeRates() {
        const API_KEY = 'e6e23214c7b41e06bc8a10d9';
        const BASE_CURRENCY = 'USD';
        try {
            const res = await fetch(`https://v6.exchangerate-api.com/v6/${API_KEY}/latest/${BASE_CURRENCY}`);
            const data = await res.json();
            const conversionRates = data['conversion_rates'];
            const syp = conversionRates['SYP'] || 11499.99999;
            //console.log('Data: ', data, ', SYP:', syp);
            if (data.result === 'success') {
                return {
                    USD: 1,
                    SYP: parseFloat(syp).toFixed(2),
                    USDT: 1 // ثابت لأن USDT مرتبط بالدولار
                };
            } else {
                throw new Error('فشل في جلب أسعار الصرف');
            }
        } catch (err) {
            console.error('❌ خطأ في جلب أسعار الصرف:', err);
            return { USD: 1, SYP: 11000, USDT: 1 }; // fallback
        }
    }


    /**
     * عرض معلومات طريقة الدفع والتحقق من حدود المبلغ
     */
    async updatePaymentInfo() {
        const method = this.select.value;
        const amount = parseFloat(this.amountInput.value);
        const details = paymentDetails[method];
        if (details.currency === 'SYP') {
            // Today: Rate of 1DOLLAR : 11500SYP
            await this.fetchExchangeRates().then(rates => {
                this.exchangeRatesFromAPI = rates;
            });
            const amountUSD = !isNaN(amount) ? (parseFloat(amount) / this.exchangeRatesFromAPI[details.currency]).toFixed(2) : '0.00';
            console.log('From fun:', amountUSD);
            this.amountInDolField.style.display = 'block';
            this.amountInDolField.value = `${amountUSD} $`;
        } else {
            this.amountInDolField.style.display = 'none';
        }

        if (!details) {
            this.infoBox.innerHTML = '';
            return;
        }

        let warning = '';
        if (!isNaN(amount)) {
            if (amount < details.min) {
                warning = `<p style="color:red;">❌ المبلغ أقل من الحد الأدنى (${details.min} ${details.currency})</p>`;
            } else if (amount > details.max) {
                warning = `<p style="color:red;">❌ المبلغ يتجاوز الحد الأعلى (${details.max} ${details.currency})</p>`;
            } else {
                warning = `<p style="color:green;">✅ المبلغ ضمن الحدود المسموحة</p>`;
            }
        }
        this.infoBox.innerHTML = `
            <p>📌 ${details.info}</p>
            <p>&#9;الحد الأدنى: ${details.min} ${details.currency}</p>
            <p>&#9;الحد الأعلى: ${details.max} ${details.currency}</p>
            <p>&#9;العمولة: 0.5%</p>
            <p>⏱️ يتم تنزيل الأموال في محفظتك خلال نصف ساعة كحد أدنى</p>
                ${warning}
        `;
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

        if (!method || !amount || !file || !isValidImage(file)) {
            alert('يرجى اختيار طريقة الدفع، إدخال المبلغ، وتحميل إشعار صالح للدفع');
            return;
        }
        const details = paymentDetails[method];
        if (amount < details.min || amount > details.max) {
            alert(`❌ المبلغ يجب أن يكون بين ${details.min} و ${details.max} ${details.currency}`);
            return;
        }
        let amountInUSD = amount;
        if (details.currency === 'SYP') {
            //console.log('Catch SYP Criedt: ', details);
            const rate = this.exchangeRatesFromAPI[details.currency] || 11500;
            amountInUSD = !isNaN(amount) ? (parseFloat(amount) / rate).toFixed(2) : '0.00';
            //console.log('amount: ', amount, ', rate: ', rate, ', amountInUSD: ', amountInUSD, ', exchangeRatesFromAPI:', this.exchangeRatesFromAPI);
            //amount = amountInUSD;
        }
        const feeRate = paymentFees[method] || 0;
        const feeAmount = parseFloat(amountInUSD) * feeRate;
        const netAmount = parseFloat(amountInUSD) - feeAmount;
        //console.log('feeRate:', feeRate, ', feeAmount:', feeAmount, ', netAmount:', netAmount);
        amountInUSD = netAmount;
        const formData = new FormData();
        formData.append('userId', this.userId);
        formData.append('method', method);
        formData.append('amount', amount);
        formData.append('amountInUSD', amountInUSD);
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
                this._resetForm();
                // ✅ استدعاء الدالة الممررة من المدير
                if (typeof this.onPaymentSent === 'function') {
                    this.onPaymentSent();
                }
            } else {
                alert('❌ فشل في إرسال الدفع');
            }
        } catch (err) {
            console.error('❌ خطأ في إرسال الدفع:', err);
            alert('حدث خطأ أثناء إرسال الدفع');
        }
        finally {
            this.isSubmitting = false;
            this.submitBtn.textContent = 'إضافة رصيد';
            this.submitBtn.disabled = false;
        }
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
        this.balanceDisplay.innerHTML = `${parseFloat(amount).toFixed(2)} <span>$</span>`;
    }
}

const exchangeRates = {
    USD: 1,
    SYP: 11500,   // 1 دولار = 2500 ل.س
    USDT: 1
};

const paymentFees = {
    visa: 0.05,        // 5%
    shamcash: 0.0,   // 0.5%
    syriatel: 0.0,
    mtn: 0.0,
    bank: 0.01,
    webmoney: 0.008,   // 0.8%
    usdt: 0.005
};

const paymentDetails = {
    visa: { info: 'تواصل مع الادارة للحصول على معلومات الدفع عبر وتساب على الرقم : ', min: 10, max: 100, currency: 'USD' },
    shamcashdol: { info: 'كود محفظة شام كاش/n 0987654321', min: 10, max: '200000', currency: 'USD' },
    shamcash: { info: 'كود محفظة شام كاش/n 0987654321', min: 10000, max: '200000000', currency: 'SYP' },
    syriatel: { info: 'رقم سيرياتيل كاش 0933123456', min: 5000, max: 550000, currency: 'SYP' },
    mtn: { info: 'رقم MTN كاش 0944123456', min: 5000, max: 550000, currency: 'SYP' },
    bank: { info: 'تواصل مع الادارة للحصول على معلومات التحويل عبر وتساب على الرقم : ', min: 50, max: 1000, currency: 'USD' },
    webmoney: { info: 'كود المحفظة Z123456789012', min: 20, max: '200000', currency: 'USD' },
    usdt: { info: 'عنوان المحفظة T123abc456xyz', min: 10, max: '200000000', currency: 'USDT' }
};
