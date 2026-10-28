/**
 * PortfolioTab - فئة لإدارة تبويب المحفظة
 * تقوم بجلب البيانات الحقيقية من الخوادم وعرضها بطريقة تفاعلية
 */
import { STORAGE_KEYS } from '../utils/appUtils.js';
import { OrderClient } from '../utils/orderClient.js';
export class PortfolioTab {
    /**
     * @constructor
     * @param {string} containerId - معرف عنصر DOM الحاوية الرئيسية
     * @param {string} userId - معرف المستخدم
     * @param {Object} config - كائن التكوين
     */
    constructor(containerId, userId, config) {
        this.containerId = containerId;
        this.userId = userId;
        this.config = config;
        this.token = localStorage.getItem(STORAGE_KEYS.USER_TOKEN) || '';
        this.orderClient = new OrderClient();
        document.addEventListener('purchaseConfirmed', () => this.loadData(30));
        this.theme = localStorage.getItem('theme') || 'day';

        // عناصر DOM
        this.elements = {};

        // بيانات المحفظة
        this.data = {
            balance: 0,
            change: 0,
            changePercent: 0,
            payments: [],
            orders: [],
            performanceData: [],
            distributionData: []
        };

        // المخططات
        this.charts = {
            performance: null,
            distribution: null,
            threeD: null
        };

        // تهيئة التبويب
        this.init();
    }

    /**
     * تهيئة التبويب وعناصره
     */
    init() {
        this.initComponents();
        this.initEventListeners();
        this.applyTheme();
        this.loadData(30); // تحميل بيانات 30 يوم افتراضياً
    }

    /**
     * تهيئة عناصر DOM
     */
    initComponents() {
        this.elements.container = document.getElementById(this.containerId);
        if (!(this.elements.container instanceof Element)) {
            console.error(`❌ العنصر #${this.containerId} غير موجود أو غير صالح في DOM`);
            return;
        }

        // العناصر الرئيسية
        this.elements.balanceAmount = this.elements.container.querySelector('.balance-amount');
        this.elements.balanceChange = this.elements.container.querySelector('.balance-change');
        this.elements.changePositive = this.elements.container.querySelector('.change-positive');

        // أزرار التصفية
        this.elements.filterButtons = this.elements.container.querySelectorAll('.filter-btn');

        // أزرار الإجراءات
        this.elements.refreshBtn = this.elements.container.querySelector('#refresh-portfolio');
        this.elements.exportBtn = this.elements.container.querySelector('#export-portfolio');
        this.elements.exportOptions = this.elements.container.querySelectorAll('.export-options button');

        // عناصر التحميل والأخطاء
        this.elements.chartLoading = this.createLoadingIndicator();
        this.elements.chartError = this.createErrorIndicator();

        // الرسوم البيانية
        this.elements.performanceChart = this.elements.container.querySelector('#performance-chart');
        this.elements.distributionChart = this.elements.container.querySelector('#distribution-chart');
        this.elements.threeDChart = this.elements.container.querySelector('#three-dis-chart');

        // تصفية العمليات
        this.elements.transFilterButtons = this.elements.container.querySelectorAll('.trans-filter-btn');
        this.elements.transactionsList = this.elements.container.querySelector('.transactions-list');

        // إضافة عناصر التحميل والأخطاء إلى DOM
        this.elements.performanceChart.parentNode.appendChild(this.elements.chartLoading);
        this.elements.performanceChart.parentNode.appendChild(this.elements.chartError);
    }

    /**
     * إنشاء مؤشر تحميل
     * @returns {HTMLElement} عنصر مؤشر التحميل
     */
    createLoadingIndicator() {
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'chart-loading';
        loadingDiv.innerHTML = `
            <div class="loading-spinner"></div>
            <p>جاري تحميل البيانات...</p>
        `;
        loadingDiv.style.display = 'none';
        return loadingDiv;
    }

    /**
     * إنشاء مؤشر خطأ
     * @returns {HTMLElement} عنصر مؤشر الخطأ
     */
    createErrorIndicator() {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'chart-error';
        errorDiv.innerHTML = `
            <i class="fas fa-exclamation-triangle"></i>
            <p>فشل في تحميل البيانات. <button class="retry-btn">إعادة المحاولة</button></p>
        `;
        errorDiv.style.display = 'none';

        // إضافة مستمع حدث لإعادة المحاولة
        errorDiv.querySelector('.retry-btn').addEventListener('click', () => {
            this.loadData(30);
        });

        return errorDiv;
    }

    /**
     * تهيئة مستمعي الأحداث
     */
    initEventListeners() {
        // أحداث أزرار التصفية
        this.elements.filterButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filter = e.target.dataset.filter;
                this.handleFilterChange(filter);
            });
        });

        // أحداث أزرار تصفية العمليات
        this.elements.transFilterButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filter = e.target.dataset.transFilter;
                this.handleTransactionFilter(filter);
            });
        });

        // حدث زر التحديث
        this.elements.refreshBtn.addEventListener('click', () => {
            this.loadData(30);
        });

        // أحداث تصدير البيانات
        this.elements.exportBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const exportOptions = this.elements.exportBtn.nextElementSibling;
            exportOptions.style.display = exportOptions.style.display === 'block' ? 'none' : 'block';
        });

        this.elements.exportOptions.forEach(option => {
            option.addEventListener('click', (e) => {
                const format = e.target.dataset.export;
                this.exportData(format);
            });
        });

        // إغلاق قائمة التصدير عند النقر خارجها
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.export-dropdown')) {
                const exportOptions = document.querySelector('.export-options');
                if (exportOptions) exportOptions.style.display = 'none';
            }
        });
    }

    /**
     * تطبيق السمة (ليلي/نهاري)
     */
    applyTheme() {
        if (this.theme === 'night') {
            this.elements.container.classList.add('night-theme');
        } else {
            this.elements.container.classList.remove('night-theme');
        }
    }

    /**
     * تبديل السمة
     */
    toggleTheme() {
        this.theme = this.theme === 'day' ? 'night' : 'day';
        localStorage.setItem('theme', this.theme);
        this.applyTheme();

        // إعادة رسم المخططات لتطبيق السمة الجديدة
        if (this.charts.performance) this.renderPerformanceChart();
        if (this.charts.distribution) this.renderDistributionChart();
        if (this.charts.threeD) this.render3DChart();
    }

    /**
     * جلب البيانات من الخادم
     * @param {number} days - عدد الأيام المطلوبة
     * @returns {Promise<Object|null>} بيانات المحفظة أو null في حالة الخطأ
     */
    async _fetchData(days = 30) {
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - days);
        const fromISO = fromDate.toISOString();

        try {
            // عرض مؤشر التحميل
            this.showLoading();

            // ✅ الرصيد
            const balanceRes = await fetch(`/api/users/${this.userId}/balance`, {
                headers: this.orderClient.headers(), credentials: 'include'
            });

            if (!balanceRes.ok) throw new Error('فشل في جلب بيانات الرصيد');
            const balanceData = await balanceRes.json();

            // ✅ الدفع
            const paymentsRes = await fetch(`/api/payments?userId=${this.userId}`, {
                headers: this.orderClient.headers(), credentials: 'include'
            });

            if (!paymentsRes.ok) throw new Error('فشل في جلب بيانات الدفعات');
            const payments = (await paymentsRes.json()).filter(p => new Date(p.createdAt) >= new Date(fromISO));
            const totalPayments = payments.reduce((sum, p) => sum + parseFloat(p.amountInUSD), 0);

            // ✅ الشراء
            const ordersRes = await fetch('/api/orders?limit=100', {
                headers: this.orderClient.headers(), credentials: 'include'
            });

            if (!ordersRes.ok) throw new Error('فشل في جلب بيانات الطلبات');
            const orders = (await ordersRes.json()).filter(o => !o.legacy && ['pending', 'completed'].includes(o.status) && new Date(o.createdAt) >= new Date(fromISO));
            const totalPurchases = orders.reduce((sum, o) => sum + parseFloat(o.amount), 0);

            // إخفاء مؤشر التحميل
            this.hideLoading();

            return { balanceData, totalPayments, totalPurchases, payments, orders };
        } catch (error) {
            console.error('❌ فشل تحميل بيانات المحفظة:', error);
            this.showError();
            return null;
        }
    }

    /**
     * تحميل البيانات وعرضها
     * @param {number} days - عدد الأيام المطلوبة
     */
    async loadData(days = 30) {
        const result = await this._fetchData(days);

        if (!result) return;

        const { balanceData, payments, orders } = result;

        // تحديث بيانات المحفظة
        this.data.balance = parseFloat(balanceData.balance) || 0;
        this.data.change = parseFloat(balanceData.change) || 0;
        this.data.changePercent = parseFloat(balanceData.changePercent) || 0;
        this.data.payments = payments;
        this.data.orders = orders;

        // توليد بيانات أداء وتوزيع وهمية (يمكن استبدالها ببيانات حقيقية)
        //this.generateSampleData();
        this.generateRealData(30);
        // تحديث واجهة المستخدم
        this.updateUI();

        // رسم المخططات
        this.renderCharts();
    }

    async generateRealData(days = 30) {
        const result = await this._fetchData(days);
        if (!result) return;

        const { payments, orders } = result;

        // ✅ توزيع حسب نوع الأصل (للتوزيع البياني)
        const categories = {
            'تطبيقات دردشة': 0,
            'ألعاب': 0,
            'عملات رقمية': 0,
            'رصيد': 0
        };

        orders.forEach(order => {
            const desc = order.method?.toLowerCase() || order.service?.toLowerCase();
            console.log('Order desc:', desc);
            if (desc.includes('دردشة')) {
                categories['تطبيقات دردشة'] += parseFloat(order.amount);
            } else if (desc.includes('لعبة') || desc.includes('game')) {
                categories['ألعاب'] += parseFloat(order.amount);
            } else if (desc.includes('عملة') || desc.includes('crypto')) {
                categories['عملات رقمية'] += parseFloat(order.amount);
            } else {
                categories['رصيد'] += parseFloat(order.amount);
            }
        });

        const total = Object.values(categories).reduce((sum, val) => sum + val, 0);
        const colors = ['#4CAF50', '#2196F3', '#FFC107', '#FF5722'];
        const keys = Object.keys(categories);

        this.data.distributionData = keys.map((key, index) => ({
            asset: key,
            value: total ? ((categories[key] / total) * 100).toFixed(2) : 0,
            color: colors[index]
        }));

        // ✅ بيانات الأداء من الدفعات الحقيقية
        const performanceMap = {};

        payments.forEach(p => {
            const dateStr = p.createdAt.split('T')[0];
            if (!performanceMap[dateStr]) {
                performanceMap[dateStr] = 0;
            }
            performanceMap[dateStr] += parseFloat(p.amountInUSD || p.amount);
        });

        // تحويل إلى مصفوفة مرتبة حسب التاريخ
        this.data.performanceData = Object.entries(performanceMap)
            .map(([date, value]) => ({ date, value }))
            .sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    /**
     * توليد بيانات نموذجية للأداء والتوزيع (للتوضيح)
     */
    generateSampleData() {
        // بيانات أداء وهمية (يمكن استبدالها ببيانات حقيقية من API)
        this.data.performanceData = [
            { date: '2023-10-01', value: 10000 },
            { date: '2023-10-05', value: 10500 },
            { date: '2023-10-10', value: 11000 },
            { date: '2023-10-15', value: 11500 },
            { date: '2023-10-20', value: 12000 },
            { date: '2023-10-25', value: 12500 },
            { date: '2023-10-30', value: 12458.75 }
        ];

        // بيانات توزيع وهمية (يمكن استبدالها ببيانات حقيقية من API)
        this.data.distributionData = [
            { asset: 'أسهم', value: 40, color: '#4CAF50' },
            { asset: 'سندات', value: 25, color: '#2196F3' },
            { asset: 'نقد', value: 20, color: '#FFC107' },
            { asset: 'سلع', value: 15, color: '#FF5722' }
        ];
    }

    /**
     * تحديث واجهة المستخدم بالبيانات الجديدة
     */
    updateUI() {
        // تحديث الرصيد والتغيير
        this.elements.balanceAmount.textContent = `$${this.data.balance.toLocaleString()}`;

        const changeClass = this.data.change >= 0 ? 'change-positive' : 'change-negative';
        const changeSign = this.data.change >= 0 ? '+' : '';

        this.elements.balanceChange.innerHTML = `
            <span class="${changeClass}">${changeSign}$${Math.abs(this.data.change).toLocaleString()} (${changeSign}${Math.abs(this.data.changePercent).toFixed(2)}%)</span>
            <span>منذ الأمس</span>
        `;

        // تحديث قائمة العمليات
        this.updateTransactionsList();
    }

    /**
     * تحديث قائمة العمليات
     * @param {string} filter - نوع التصفية (all, deposit, purchase)
     */
    updateTransactionsList(filter = 'all') {
        if (!this.elements.transactionsList) return;

        // مسح القائمة الحالية
        this.elements.transactionsList.innerHTML = '';

        // دمج المدفوعات والطلبات وفرزها حسب التاريخ
        const allTransactions = [
            ...this.data.payments.map(p => ({
                type: 'deposit',
                title: 'إيداع',
                date: new Date(p.createdAt),
                amount: parseFloat(p.amountInUSD),
                icon: 'fa-arrow-down'
            })),
            ...this.data.orders.map(o => ({
                type: 'purchase',
                title: `شراء ${o.assetName || 'أصل'}`,
                date: new Date(o.createdAt),
                amount: -parseFloat(o.amount), // سالب لأنه خصم
                icon: 'fa-shopping-cart'
            }))
        ].sort((a, b) => b.date - a.date); // الأحدث أولاً

        // تصفية العمليات حسب النوع
        const filteredTransactions = filter === 'all'
            ? allTransactions
            : allTransactions.filter(t => t.type === filter);

        // إضافة العمليات إلى القائمة
        if (filteredTransactions.length === 0) {
            this.elements.transactionsList.innerHTML = `
                <div class="no-transactions">
                    <i class="fas fa-receipt"></i>
                    <p>لا توجد عمليات</p>
                </div>
            `;
            return;
        }

        filteredTransactions.forEach(trans => {
            const isDeposit = trans.type === 'deposit';
            const amountClass = isDeposit ? 'positive' : 'negative';
            const amountSign = isDeposit ? '+' : '-';

            const transElement = document.createElement('div');
            transElement.className = 'transaction-item';
            transElement.innerHTML = `
                <div class="trans-icon">
                    <i class="fas ${trans.icon} ${trans.type}"></i>
                </div>
                <div class="trans-details">
                    <div class="trans-title">${trans.title}</div>
                    <div class="trans-date">${this.formatDate(trans.date)}</div>
                </div>
                <div class="trans-amount ${amountClass}">${amountSign}$${Math.abs(trans.amount).toLocaleString()}</div>
            `;

            this.elements.transactionsList.appendChild(transElement);
        });
    }

    /**
     * تنسيق التاريخ للعرض
     * @param {Date} date - التاريخ
     * @returns {string} التاريخ المنسق
     */
    formatDate(date) {
        return new Intl.DateTimeFormat('ar-EG', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            hour12: true
        }).format(date);
    }

    /**
     * عرض مؤشر التحميل
     */
    showLoading() {
        if (this.elements.chartLoading) {
            this.elements.chartLoading.style.display = 'flex';
        }
        if (this.elements.chartError) {
            this.elements.chartError.style.display = 'none';
        }
    }

    /**
     * إخفاء مؤشر التحميل
     */
    hideLoading() {
        if (this.elements.chartLoading) {
            this.elements.chartLoading.style.display = 'none';
        }
    }

    /**
     * عرض مؤشر الخطأ
     */
    showError() {
        if (this.elements.chartLoading) {
            this.elements.chartLoading.style.display = 'none';
        }
        if (this.elements.chartError) {
            this.elements.chartError.style.display = 'flex';
        }
    }

    /**
     * رسم جميع المخططات
     */
    renderCharts() {
        this.renderPerformanceChart();
        this.renderDistributionChart();
        this.render3DChart(); // تحديث أولي
        setInterval(() => {
            this.render3DChart(); // تحديث دوري
        }, 60000);
    }

    /**
     * رسم مخطط الأداء
     */
    renderPerformanceChart() {
        if (!this.elements.performanceChart) return;

        const ctx = this.elements.performanceChart.getContext('2d');

        // إذا كان هناك مخطط موجود، تدميره أولاً
        if (this.charts.performance) {
            this.charts.performance.destroy();
        }

        // إنشاء مخطط جديد (هنا نستخدم مخططًا وهميًا للتوضيح)
        this.charts.performance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: this.data.performanceData.map(d => d.date),
                datasets: [{
                    label: 'قيمة المحفظة',
                    data: this.data.performanceData.map(d => d.value),
                    borderColor: this.theme === 'night' ? '#4CAF50' : '#2E7D32',
                    backgroundColor: this.theme === 'night' ? 'rgba(76, 175, 80, 0.1)' : 'rgba(46, 125, 50, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: this.theme === 'night' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
                        }
                    },
                    y: {
                        grid: {
                            color: this.theme === 'night' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
                        }
                    }
                }
            }
        });
    }

    /**
     * رسم مخطط التوزيع
     */
    renderDistributionChart() {
        if (!this.elements.distributionChart) return;

        const ctx = this.elements.distributionChart.getContext('2d');

        // إذا كان هناك مخطط موجود، تدميره أولاً
        if (this.charts.distribution) {
            this.charts.distribution.destroy();
        }

        // إنشاء مخطط جديد (هنا نستخدم مخططًا وهميًا للتوضيح)
        this.charts.distribution = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: this.data.distributionData.map(d => d.asset),
                datasets: [{
                    data: this.data.distributionData.map(d => d.value),
                    backgroundColor: this.data.distributionData.map(d => d.color),
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: this.theme === 'night' ? '#FFF' : '#000'
                        }
                    }
                }
            }
        });
    }

    async fetchGlobalSummary() {
        try {
            const [paymentsSummary, ordersSummary] = await Promise.all([
                this.orderClient.read('/api/payments/summary'),
                this.orderClient.read('/api/orders/summary')
            ]); // This user portfolio never requests administrator-wide summaries.

            return { paymentsSummary, ordersSummary };
        } catch (err) {
            console.error('❌ فشل في جلب ملخصات النظام:', err);
            return null;
        }
    }

    /**
     * رسم المخطط ثلاثي الأبعاد (وهمي للتوضيح)
     */
    async render3DChart() {
        if (!this.elements.threeDChart) return;
        const ctx = this.elements.threeDChart.getContext('2d');
        if (this.charts.threeD) this.charts.threeD.destroy();

        const summary = await this.fetchGlobalSummary();
        if (!summary) return;

        const { paymentsSummary, ordersSummary } = summary;

        // ✅ توزيع مخصص حسب نوع البيانات
        const labels = ['دفعات موثقة (USD)', 'طلبات (عدد)', 'صافي الطلبات (USD)', 'دفعات (عدد)'];
        const data = [
            paymentsSummary.totalInUSD,
            ordersSummary.pending + ordersSummary.completed + ordersSummary.cancelled,
            ordersSummary.netCharges,
            paymentsSummary.totalCompleted + paymentsSummary.totalPending + paymentsSummary.totalCancelled
        ];

        const backgroundColor = [
            'rgba(76, 175, 80, 0.7)',
            'rgba(33, 150, 243, 0.7)',
            'rgba(255, 193, 7, 0.7)',
            'rgba(255, 87, 34, 0.7)'
        ];

        const borderColor = backgroundColor.map(c => c.replace('0.7', '1'));

        this.charts.threeD = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'تحليل شامل لجميع المستخدمين',
                    data,
                    backgroundColor,
                    borderColor,
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false },
                    title: {
                        display: true,
                        text: 'تحليل شامل للدفعات والطلبات',
                        color: this.theme === 'night' ? '#FFF' : '#000'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: this.theme === 'night' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
                        },
                        ticks: {
                            color: this.theme === 'night' ? '#FFF' : '#000'
                        }
                    },
                    x: {
                        grid: {
                            color: this.theme === 'night' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
                        },
                        ticks: {
                            color: this.theme === 'night' ? '#FFF' : '#000'
                        }
                    }
                }
            }
        });
        const now = new Date().toLocaleTimeString();
        document.querySelector('#last-update-time').textContent = `آخر تحديث: ${now}`;
    }

    /**
     * التعامل مع تغيير التصفية
     * @param {string} filter - نوع التصفية
     */
    handleFilterChange(filter) {
        // تحديث حالة الأزرار النشطة
        this.elements.filterButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });

        // إعادة تحميل البيانات بناءً على الفلتر المحدد
        let days;
        switch (filter) {
            case 'daily': days = 1; break;
            case 'weekly': days = 7; break;
            case 'monthly': days = 30; break;
            case 'yearly': days = 365; break;
            default: days = 30; // الكل
        }

        this.loadData(days);
    }

    /**
     * التعامل مع تصفية العمليات
     * @param {string} filter - نوع التصفية
     */
    handleTransactionFilter(filter) {
        // تحديث حالة الأزرار النشطة
        this.elements.transFilterButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.transFilter === filter);
        });

        // تحديث قائمة العمليات
        this.updateTransactionsList(filter);
    }

    /**
     * تصدير البيانات
     * @param {string} format - صيغة التصدير (png, txt, json)
     */
    exportData(format) {
        switch (format) {
            case 'png':
                this.exportAsPNG();
                break;
            case 'txt':
                this.exportAsTXT();
                break;
            case 'json':
                this.exportAsJSON();
                break;
        }

        // إخفاء قائمة التصدير بعد الاختيار
        const exportOptions = document.querySelector('.export-options');
        if (exportOptions) exportOptions.style.display = 'none';
    }

    /**
     * تصدير البيانات كصورة PNG
     */
    exportAsPNG() {
        // يمكن استخدام مكتبة مثل html2canvas لالتقاط لقطة للشاشة
        console.log('جاري التصدير كصورة PNG...');
        alert('جاري التصدير كصورة PNG (هذه ميزة تجريبية)');
    }

    /**
     * تصدير البيانات كنص
     */
    exportAsTXT() {
        const data = `
            تقرير المحفظة - ${new Date().toLocaleDateString('ar-EG')}
            ====================================
            
            الرصيد الحالي: $${this.data.balance.toLocaleString()}
            التغير: $${this.data.change >= 0 ? '+' : ''}${this.data.change.toLocaleString()}
            النسبة: ${this.data.change >= 0 ? '+' : ''}${this.data.changePercent.toFixed(2)}%
            
            العمليات:
            ${this.data.payments.map(p => `إيداع: +$${parseFloat(p.amountInUSD).toLocaleString()} - ${new Date(p.createdAt).toLocaleDateString('ar-EG')}`).join('\n')}
            ${this.data.orders.map(o => `شراء: -$${parseFloat(o.amount).toLocaleString()} - ${new Date(o.createdAt).toLocaleDateString('ar-EG')}`).join('\n')}
        `;

        this.downloadFile(data, 'portfolio-report.txt', 'text/plain');
    }

    /**
     * تصدير البيانات كـ JSON
     */
    exportAsJSON() {
        const data = {
            balance: this.data.balance,
            change: this.data.change,
            changePercent: this.data.changePercent,
            payments: this.data.payments,
            orders: this.data.orders,
            exportDate: new Date().toISOString()
        };

        this.downloadFile(JSON.stringify(data, null, 2), 'portfolio-data.json', 'application/json');
    }

    /**
     * تنزيل ملف
     * @param {string} content - محتوى الملف
     * @param {string} filename - اسم الملف
     * @param {string} type - نوع الملف
     */
    downloadFile(content, filename, type) {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 0);
    }

    /**
     * تحديث بيانات المحفظة يدوياً
     */
    refresh() {
        this.loadData(30);
    }

    /**
     * تدمير التبويب وتنظيف الموارد
     */
    destroy() {
        // تدمير المخططات
        Object.values(this.charts).forEach(chart => {
            if (chart) chart.destroy();
        });

        // إزالة مستمعي الأحداث
        // (يجب إضافة منطق إزالة مستمعي الأحداث هنا إذا لزم الأمر)

        console.log('✅ تم تدمير تبويب المحفظة بنجاح');
    }
}

// جعل الفئة متاحة عالمياً
//window.PortfolioTab = PortfolioTab;
