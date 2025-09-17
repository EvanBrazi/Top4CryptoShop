import { STORAGE_KEYS } from '../utils/appUtils.js'
export class PortfolioTab {
    constructor(containerId, userId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!containerId || !this.container) return;
        this.userId = userId;
        this.token = localStorage.getItem(STORAGE_KEYS.USER_TOKEN);
        this.themeColor = options.themeColor || '#2196F3';
        this.chartInstance = null;
        this._initComponents();
    }

    async _initComponents() {
        this.chartLoading = document.getElementById('small-chart-loading');
        this.chartError = document.getElementById('small-chart-error');
        this.interactionChart = document.getElementById('small-interactionChart');
        this.balanceAmountEl = document.getElementById('balance-amount');
        this.totalPaymentsEl = document.getElementById('total-payments');
        this.totalPurchasesEl = document.getElementById('total-purchases');
        this.retryBtn = document.getElementById('retry');
        this.render();
        this.init();
    }

    render() {
        this.retryBtn.addEventListener('click', () => this._renderData());
        const filter = this.container.querySelector('#time-filter');
        if (filter) {
            filter.addEventListener('change', (e) => {
                const days = parseInt(e.target.value);
                this._renderData(days);
                this.fetchData(days);
            });
        }

        this._renderData(30);
        this.fetchData();
    }

    async _fetchData(days = 30) {
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - days);
        const fromISO = fromDate.toISOString();
        try {
            // محاكاة وقت التحميل
            await new Promise(resolve => setTimeout(resolve, 1000));
            // ✅ الرصيد
            const balanceRes = await fetch(`/api/users/${this.userId}/balance`, {
                headers: { Authorization: `Bearer ${this.token}` }
            });
            const balanceData = await balanceRes.json();

            // ✅ الدفع
            const paymentsRes = await fetch(`/api/payments?userId=${this.userId}`, {
                headers: { Authorization: `Bearer ${this.token}` }
            });
            const payments = (await paymentsRes.json()).filter(p => new Date(p.createdAt) >= new Date(fromISO));
            const totalPayments = payments.reduce((sum, p) => sum + parseFloat(p.amountInUSD), 0);

            // ✅ الشراء
            const ordersRes = await fetch(`/api/orders?userId=${this.userId}`, {
                headers: { Authorization: `Bearer ${this.token}` }
            });
            const orders = (await ordersRes.json()).filter(o => new Date(o.createdAt) >= new Date(fromISO));
            const totalPurchases = orders.reduce((sum, o) => sum + parseFloat(o.amount), 0);

            return { balanceData, totalPayments, totalPurchases, payments, orders };
        } catch (error) {
            console.error('❌ فشل تحميل بيانات المحفظة:', error);
            this.chartLoading.style.display = 'none';
            this.chartError.style.display = 'flex';
            return null;
        }
    }

    async _renderData(days = 30) {
        const data = await this._fetchData(days);
        if (!data) return;

        this.balanceAmountEl.textContent = `$${data.balanceData.balance.toFixed(2)}`;
        this.totalPaymentsEl.textContent = `$${data.totalPayments.toFixed(2)}`;
        this.totalPurchasesEl.textContent = `$${data.totalPurchases.toFixed(2)}`;

        this.createChartData(data.payments, data.orders, days);
    }


    createChartData(payments, orders, days) {
        // إنشاء بيانات للرسم البياني حسب الفترة الزمنية
        let labels = [];
        let paymentData = [];
        let orderData = [];

        if (days <= 30) {
            // بيانات يومية للفترات القصيرة
            for (let i = days - 1; i >= 0; i--) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                const label = `${date.getDate()}/${date.getMonth() + 1}`;
                labels.push(label);

                const dateStr = date.toISOString().split('T')[0];
                const dayPayments = payments.filter(p => p.createdAt.split('T')[0] === dateStr)
                    .reduce((sum, p) => sum + parseFloat(p.amountInUSD), 0);
                const dayOrders = orders.filter(o => o.createdAt.split('T')[0] === dateStr)
                    .reduce((sum, o) => sum + parseFloat(o.amount), 0);

                paymentData.push(dayPayments);
                orderData.push(dayOrders);
            }
        } else {
            // بيانات شهرية للفترات الطويلة
            const monthMap = {};
            const currentDate = new Date();

            for (let i = 0; i < 12; i++) {
                const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
                const label = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                monthMap[label] = { payments: 0, orders: 0 };
            }

            // تجميع البيانات
            payments.forEach(p => {
                const date = new Date(p.createdAt);
                const label = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                if (monthMap[label]) {
                    monthMap[label].payments += parseFloat(p.amountInUSD);
                }
            });

            orders.forEach(o => {
                const date = new Date(o.createdAt);
                const label = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                if (monthMap[label]) {
                    monthMap[label].orders += parseFloat(o.amount);
                }
            });

            // تحضير البيانات للرسم البياني
            labels = Object.keys(monthMap).reverse();
            paymentData = labels.map(label => monthMap[label].payments);
            orderData = labels.map(label => monthMap[label].orders);
        }

        this.renderChart(labels, paymentData, orderData);
    }

    renderChart(labels, paymentData, orderData) {
        const ctx = this.interactionChart.getContext('2d');

        // إخفاء حالة التحميل وإظهار الرسم البياني
        this.chartLoading.style.display = 'none';
        this.interactionChart.style.display = 'block';

        if (this.chartInstance) {
            this.chartInstance.destroy();
        }

        this.chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'المدفوعات',
                        data: paymentData,
                        backgroundColor: '#4CAF50',
                        borderColor: '#4CAF50',
                        borderWidth: 1
                    },
                    {
                        label: 'المشتريات',
                        data: orderData,
                        backgroundColor: '#F44336',
                        borderColor: '#F44336',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function (value) {
                                return '$' + value;
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                        rtl: true
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                return context.dataset.label + ': $' + context.raw;
                            }
                        }
                    }
                }
            }
        });
    }
    init() {
        this.bindEvents();
        this.loadData();

        // تطبيق الثيم الحالي
        this.applyTheme(localStorage.getItem('theme') || 'day');
    }

    getUserId() {
        // في تطبيق حقيقي، قد يتم الحصول على ID المستخدم من التوكن أو من الخادم
        return this.userId;
    }

    bindEvents() {
        // حدث تغيير الفلتر الزمني
        document.getElementById('time-filter').addEventListener('change', (e) => {
            this.currentFilter = e.target.value;
            this.loadData();
        });

        // حدث زر التحديث
        document.getElementById('refresh-chart').addEventListener('click', () => {
            this.loadData();
        });

        // حدث زر إعادة المحاولة
        document.getElementById('retry-loading').addEventListener('click', () => {
            this.loadData();
        });

        // حدث زر التصدير (تنفيذ بسيط)
        document.getElementById('export-chart').addEventListener('click', () => {
            this.exportChart();
        });
    }

    async loadData() {
        this.showLoading();

        try {
            // محاكاة وقت التحميل
            await new Promise(resolve => setTimeout(resolve, 1000));

            // في التطبيق الحقيقي، استخدم:
            // const data = await this.fetchDataFromServer();

            // بيانات تجريبية لمحاكاة الخادم
            const data = await this.generateRealData();
            this.updateMetrics(data);
            this._renderChart(data);
            this.renderTransactions(data.transactions);

        } catch (error) {
            console.error('فشل في تحميل بيانات المحفظة:', error);
            this.showError();
        }
    }

    async generateRealData(days = 30) {
        const data = await this._fetchData(days);
        if (!data) return null;

        const { balanceData, totalPayments, totalPurchases, payments, orders } = data;

        // توليد المعاملات الحقيقية
        const transactions = this.generateRealTransactions(payments, orders);

        // توليد بيانات الرسم البياني الحقيقية
        const chartData = this.generateChartData(payments, orders, days);

        return {
            balance: balanceData.balance,
            totalPayments,
            totalPurchases,
            transactions,
            chartData
        };
    }

    generateRealTransactions(payments, orders) {
        const transactions = [];

        payments.forEach((p, index) => {
            transactions.push({
                id: `payment-${index + 1}`,
                type: 'payment',
                amount: parseFloat(p.amount),
                amountInUSD: parseFloat(p.amountInUSD),
                description: p.description || 'عملية إيداع',
                date: p.createdAt,
                status: p.status || 'completed'
            });
        });

        orders.forEach((o, index) => {
            transactions.push({
                id: `order-${index + 1}`,
                type: 'order',
                amount: parseFloat(o.amount),
                description: o.description || 'عملية شراء',
                date: o.createdAt,
                status: o.status || 'completed'
            });
        });

        // ترتيب حسب التاريخ تنازليًا
        return transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    generateChartData(payments, orders, days = 30) {
        const labels = [];
        const paymentData = [];
        const orderData = [];

        for (let i = days - 1; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const label = `${date.getDate()}/${date.getMonth() + 1}`;
            labels.push(label);

            const dateStr = date.toISOString().split('T')[0];

            const dayPayments = payments.filter(p => p.createdAt.split('T')[0] === dateStr)
                .reduce((sum, p) => sum + parseFloat(p.amountInUSD), 0);

            const dayOrders = orders.filter(o => o.createdAt.split('T')[0] === dateStr)
                .reduce((sum, o) => sum + parseFloat(o.amount), 0);

            paymentData.push(dayPayments);
            orderData.push(dayOrders);
        }

        return { labels, paymentData, orderData };
    }

    updateMetrics(data) {
        //document.getElementById('balance-amount').textContent = `$${data.balance.toFixed(2)}`;
        //document.getElementById('total-payments').textContent = `$${data.totalPayments.toFixed(2)}`;
        //document.getElementById('total-purchases').textContent = `$${data.totalPurchases.toFixed(2)}`;
    }

    _renderChart(data) {
        const ctx = document.getElementById('interactionChart').getContext('2d');

        // إخفاء حالات التحميل والأخطاء
        this.hideAllStates();

        if (this.chartInstance) {
            this.chartInstance.destroy();
        }

        this.chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.chartData.labels,
                datasets: [
                    {
                        label: 'المدفوعات',
                        data: data.chartData.paymentData,
                        backgroundColor: 'rgba(76, 175, 80, 0.2)',
                        borderColor: '#4CAF50',
                        borderWidth: 2,
                        tension: 0.3,
                        fill: true
                    },
                    {
                        label: 'المشتريات',
                        data: data.chartData.orderData,
                        backgroundColor: 'rgba(244, 67, 54, 0.2)',
                        borderColor: '#F44336',
                        borderWidth: 2,
                        tension: 0.3,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function (value) {
                                return '$' + value;
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                        rtl: true,
                        labels: {
                            usePointStyle: true,
                            padding: 20
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function (context) {
                                return context.dataset.label + ': $' + context.raw;
                            }
                        }
                    }
                }
            }
        });
    }

    renderTransactions(transactions) {
        const container = document.getElementById('transactions-container');
        container.innerHTML = '';

        if (transactions.length === 0) {
            container.innerHTML = `
                        <div class="chart-empty">
                            <i class="fas fa-receipt fa-2x"></i>
                            <p>لا توجد معاملات لعرضها</p>
                        </div>
                    `;
            return;
        }

        transactions.slice(0, 6).forEach(transaction => {
            const isPayment = transaction.type === 'payment';
            if (isPayment) this.amountDisplay = transaction.amount === transaction.amountInUSD ? `${transaction.amount} USD 💵` : `${transaction.amount} ≈ ${transaction.amountInUSD} USD 💵`;
            else this.amountDisplay = transaction.amount;
            const date = new Date(transaction.date).toLocaleDateString('ar-EG');

            const transactionEl = document.createElement('div');
            transactionEl.className = 'transaction-card';
            transactionEl.innerHTML = `
                        <div class="transaction-header">
                            <span class="transaction-type ${isPayment ? 'income' : 'expense'}">
                                ${isPayment ? 'إيداع' : 'شراء'}
                            </span>
                            <span class="transaction-date">${date}</span>
                        </div>
                        <div class="transaction-amount">
                            ${isPayment ? '+' : '-'} $${this.amountDisplay}
                        </div>
                        <div class="transaction-desc">
                            ${transaction.description}
                        </div>
                        <span class="transaction-status status-${transaction.status}">
                            ${this.getStatusText(transaction.status)}
                        </span>
                    `;

            container.appendChild(transactionEl);
        });
    }

    getStatusText(status) {
        const statusMap = {
            'completed': 'مكتمل',
            'pending': 'قيد المعالجة',
            'failed': 'فاشل'
        };
        return statusMap[status] || status;
    }

    showLoading() {
        document.getElementById('chart-loading').style.display = 'flex';
        document.getElementById('chart-error').style.display = 'none';
        document.getElementById('chart-empty').style.display = 'none';
        document.getElementById('interactionChart').style.display = 'none';
    }

    showError() {
        document.getElementById('chart-loading').style.display = 'none';
        document.getElementById('chart-error').style.display = 'flex';
        document.getElementById('chart-empty').style.display = 'none';
        document.getElementById('interactionChart').style.display = 'none';
    }

    hideAllStates() {
        document.getElementById('chart-loading').style.display = 'none';
        document.getElementById('chart-error').style.display = 'none';
        document.getElementById('chart-empty').style.display = 'none';
        document.getElementById('interactionChart').style.display = 'block';
    }

    exportChart() {
        // تنفيذ بسيط لتصدير الرسم البياني
        if (this.chartInstance) {
            const imageLink = document.createElement('a');
            imageLink.href = this.chartInstance.toBase64Image();
            imageLink.download = 'تحليلات-المحفظة.png';
            imageLink.click();
        } else {
            alert('لا يوجد رسم بياني لتصديره');
        }
    }

    applyTheme(theme) {
        if (theme === 'night') {
            document.body.classList.add('night-theme');
            document.body.classList.remove('day-theme');
        } else {
            document.body.classList.add('day-theme');
            document.body.classList.remove('night-theme');
        }

        // إذا كان الرسم البياني موجودًا، أعد رسمه لتطبيق الألوان الجديدة
        if (this.chartInstance) {
            this.chartInstance.update();
        }
    }

    async fetchData(days = 30) {
        const data = await this._fetchData(days);
        if (!data) return;

        const { balanceData, totalPayments, totalPurchases, payments, orders } = data;

        // ✅ تحديث عناصر الواجهة
        document.getElementById('balance-amount').textContent = `$${balanceData.balance.toFixed(2)}`;
        document.getElementById('total-payments').textContent = `$${totalPayments.toFixed(2)}`;
        document.getElementById('total-purchases').textContent = `$${totalPurchases.toFixed(2)}`;

        // ✅ بناء بيانات الرسم البياني الشهري
        const monthlyStats = {};
        [...payments, ...orders].forEach(op => {
            const date = new Date(op.createdAt);
            const label = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            monthlyStats[label] = (monthlyStats[label] || 0) + 1;
        });

        const labels = Object.keys(monthlyStats);
        const values = Object.values(monthlyStats);

        // ✅ رسم الرسم البياني
        const ctx = document.getElementById('interactionChart').getContext('2d');
        if (this.chartInstance) this.chartInstance.destroy();
        this.chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'عدد العمليات',
                    data: values,
                    backgroundColor: this.themeColor
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    }
}
