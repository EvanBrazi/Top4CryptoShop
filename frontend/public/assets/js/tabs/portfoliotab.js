export class PortfolioTab {
    constructor(containerId, userId, options = {}) {
        this.containerId = containerId;
        this.userId = userId;
        this.token = localStorage.getItem('userToken');
        this.themeColor = options.themeColor || '#2196F3';
        this.chartInstance = null;
        this.render();
    }

    render() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        // لا حاجة لإنشاء HTML لأنك وفرته مسبقًا داخل #portfolio-tab
        // فقط نربط الأحداث ونبدأ بجلب البيانات

        const filter = container.querySelector('#time-filter');
        if (filter) {
            filter.addEventListener('change', (e) => {
                const days = parseInt(e.target.value);
                this.fetchData(days);
            });
        }

        this.fetchData(30); // تحميل افتراضي لآخر شهر
    }

    async fetchData(days = 30) {
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - days);
        const fromISO = fromDate.toISOString();

        try {
            // ✅ الرصيد
            const balanceRes = await fetch(`/api/users/${this.userId}/balance`, {
                headers: { Authorization: `Bearer ${this.token}` }
            });
            const balanceData = await balanceRes.json();
            document.getElementById('balance-amount').textContent = `$${balanceData.balance.toFixed(2)}`;

            // ✅ الدفع
            const paymentsRes = await fetch(`/api/payments?userId=${this.userId}`, {
                headers: { Authorization: `Bearer ${this.token}` }
            });
            const payments = (await paymentsRes.json()).filter(p => new Date(p.createdAt) >= new Date(fromISO));
            const totalPayments = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
            document.getElementById('total-payments').textContent = `$${totalPayments.toFixed(2)}`;

            // ✅ الشراء
            const ordersRes = await fetch(`/api/orders?userId=${this.userId}`, {
                headers: { Authorization: `Bearer ${this.token}` }
            });
            const orders = (await ordersRes.json()).filter(o => new Date(o.createdAt) >= new Date(fromISO));
            const totalPurchases = orders.reduce((sum, o) => sum + parseFloat(o.amount), 0);
            document.getElementById('total-purchases').textContent = `$${totalPurchases.toFixed(2)}`;

            // ✅ التفاعل الشهري
            const monthlyStats = {};
            [...payments, ...orders].forEach(op => {
                const date = new Date(op.createdAt);
                const label = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                monthlyStats[label] = (monthlyStats[label] || 0) + 1;
            });

            const labels = Object.keys(monthlyStats);
            const values = Object.values(monthlyStats);

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

        } catch (err) {
            console.error('❌ فشل تحميل بيانات المحفظة:', err);
        }
    }
}
