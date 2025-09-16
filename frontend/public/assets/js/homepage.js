/**
 * @file homepage.js
 * @description نقطة الدخول الرئيسية للتطبيق - تهيئة جميع المكونات وإدارة الأحداث
 * @version 3.0.0
 * @license MIT
 * 
 * التحسينات الرئيسية:
 * - تحسين بنية الكود وتنظيمه
 * - تحسين إدارة الأخطاء
 * - تحسين الأداء والذاكرة
 * - إضافة التوثيق الشامل
 * - تحسين إدارة الأحداث
 */
import UserManager from "./usermanager.js";
import { Taber } from "./core/taber.js";
import { AppManager } from "./appmanager.js";
import { checkSession } from './auth.js';
import { STORAGE_KEYS } from "./utils/appUtils.js";

// ثوابت التطبيق
const APP_CONFIG = {
    STORAGE_KEYS: {
        ACTIVE_TAB: 'top4cryptoshop_activeTab',
        USER_THEME: 'theme'
    },
    DEFAULT_TAB: 'home',
    SCROLL_THROTTLE: 100,
    MODAL_TRANSITION_DURATION: 300
};

class HomePage {
    constructor() {
        this.userManager = UserManager.getInstance();
        this.domElements = {};
        this.eventListeners = {};
        this.components = {};
        this.init();
    }

    /* ---------------------------------- */
    /* --------- Initialization --------- */
    /* ---------------------------------- */

    /**
     * تهيئة التطبيق الرئيسية
     * @async
     */
    async init() {
        try {
            this._cacheDOMElements();
            this._initComponents();
            await this._loadUserData();
            this._setupEventListeners();
            //await this._registerServiceWorker();
            console.log('✅ تم تحميل النظام بنجاح');
        } catch (error) {
            console.error('❌ فشل تحميل التطبيق:', error);
            this._showFatalError();
        }
        navigator.serviceWorker.controller
            ? console.log('✅ SW is controlling the page')
            : console.warn('❌ SW is NOT controlling the page');

    }

    /**
     * تخزين عناصر DOM
     * @private
     */
    _cacheDOMElements() {
        this.domElements = {
            sidebar: document.querySelector('.sidebar'),
            sidebarMenu: document.querySelector('.sidebar-menu-container'),
            tabsContent: document.querySelector('.tabs-container'),
            toggleBtn: document.querySelector('.toggle-sidebar'),
            overlay: document.querySelector('.overlay'),
            body: document.body,
            addBalanceBtn: document.getElementById('add-balance-btn'),
            backBtn: document.getElementById('back-btn'),
            currentPage: document.getElementById('current-page-indicator'),
            userAvatar: document.getElementById('user-avatar'),
            usernameDisplay: document.getElementById('username-display'),
            balanceDisplay: document.getElementById('balance-display'),
            topBalanceDisplay: document.getElementById('top-balance-display'),
            editProfileBtn: document.getElementById('profile-edit-btn'),
            termsBtn: document.getElementById('terms-btn'),
            privacyBtn: document.getElementById('privacy-btn'),
            termsModal: document.getElementById('terms-modal'),
            privacyModal: document.getElementById('privacy-modal'),
            closeModalBtns: document.querySelectorAll('.close-modal'),
            mainContent: document.querySelector('.main-content'),
            logoutBtn: document.getElementById('logoutBtn'),
            footer: document.querySelector('.site-footer')
        };
    }

    /**
     * تهيئة المكونات الأساسية
     * @private
     */
    _initComponents() {
        // نظام التبويبات
        this.components.taber = new Taber(
            this.domElements.sidebarMenu,
            this.domElements.tabsContent, {
            activeClass: 'active',
            defaultTab: APP_CONFIG.DEFAULT_TAB,
            storageKey: APP_CONFIG.STORAGE_KEYS.ACTIVE_TAB,
            useCookies: true
        }
        );
        // مدير التطبيقات
        this.components.appManager = new AppManager(this.components.taber, this.userManager);
    }

    /**
     * تحميل بيانات المستخدم وتحديث الواجهة
     * @private
     * @async
     */
    async _loadUserData() {
        try {
            if (!this.userManager) {
                console.warn('HomePage lost UserManager#instance, We most defined again!');
                this.userManager = UserManager.getInstance();
            }
            await this.userManager.loadUser(); // يفترض أن um.user يحتوي على البيانات الآن
            //this._updateUserUI();
        } catch (err) {
            console.error('فشل تحميل بيانات المستخدم:', err);
            this._showError('تعذر تحميل بياناتك، يرجى المحاولة لاحقًا');
        }
    }

    /**
     * تحديث واجهة المستخدم حسب بيانات المستخدم
     * @private
     */
    _updateUserUI() {
        // 🛡️ حالة الحساب
        if (user.accountStatus !== 'active') {
            this._showWarning(`⚠️ حسابك ${user.accountStatus}، قد تكون بعض الميزات غير متاحة`);
        }

        // 🕒 آخر دخول
        const lastLoginEl = document.querySelector('last-login');
        if (lastLoginEl && user.lastLogin) {
            const date = new Date(user.lastLogin).toLocaleString();
            lastLoginEl.textContent = `آخر دخول: ${date}`;
        }
    }

    /**
     * عرض رسالة خطأ
     * @private
     */
    _showError(message) {
        alert(message); // يمكنك استبدالها بنظام إشعارات مخصص
    }

    /**
     * عرض تحذير
     * @private
     */
    _showWarning(message) {
        console.warn(message); // أو عرضها في واجهة المستخدم
    }


    /* ---------------------------------- */
    /* --------- Event Handling --------- */
    /* ---------------------------------- */

    /**
     * إعداد مستمعي الأحداث
     * @private
     */
    _setupEventListeners() {
        // أحداث الشريط الجانبي
        this._setupSidebarEvents();

        // أحداث المحفظة
        this._setupWalletEvents();

        this._setupSettingsEvents();

        // أحداث العودة
        this._setupBackButtonEvents();

        // أحداث التمرير
        this._setupScrollHandlers();

        // أحداث النوافذ المنبثقة
        this._setupModalHandlers();

        // أحداث تسجيل الخروج
        this._setupLogoutHandler();

        // تحديث حالة زر العودة
        this._updateBackButtonVisibility();
    }

    /**
     * إعداد أحداث الشريط الجانبي
     * @private
     */
    _setupSidebarEvents() {
        const { toggleBtn, overlay, sidebar } = this.domElements;

        const toggleSidebar = () => {
            sidebar.classList.toggle('active');
            overlay.classList.toggle('active');
        };

        toggleBtn.addEventListener('click', toggleSidebar);
        overlay.addEventListener('click', toggleSidebar);

        this.eventListeners.toggleSidebar = toggleSidebar;
    }

    /**
     * إعداد أحداث المحفظة
     * @private
     */
    _setupWalletEvents() {
        this.domElements.addBalanceBtn.addEventListener('click', () => {
            this.components.taber.activateTab('wallet');
        });
    }

    _setupSettingsEvents() {
        this.domElements.editProfileBtn.addEventListener('click', () => {
            this.components.taber.activateTab('settings');
        });
    }

    /**
     * إعداد أحداث زر العودة
     * @private
     */
    _setupBackButtonEvents() {
        this.domElements.backBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.components.taber.activateTab(APP_CONFIG.DEFAULT_TAB);
        });
    }

    /**
     * إعداد معالجات التمرير
     * @private
     */
    _setupScrollHandlers() {
        let lastScrollPosition = 0;
        let scrollTimeout;

        const throttledScrollHandler = this._throttle(() => {
            const currentScroll = window.pageYOffset || document.documentElement.scrollTop;

            if (currentScroll > lastScrollPosition) {
                this.domElements.footer.classList.add('hidden');
            } else {
                this.domElements.footer.classList.remove('hidden');
            }

            if (currentScroll <= 0) {
                this.domElements.footer.classList.remove('hidden');
            }

            lastScrollPosition = currentScroll;
        }, APP_CONFIG.SCROLL_THROTTLE);

        window.addEventListener('scroll', throttledScrollHandler);

        this.domElements.mainContent.addEventListener('scroll', () => {
            if (this.domElements.sidebar.classList.contains('active')) {
                this.eventListeners.toggleSidebar();
            }
        });
    }

    /**
     * إعداد معالجات النوافذ المنبثقة
     * @private
     */
    _setupModalHandlers() {
        // فتح النوافذ
        this.domElements.termsBtn.addEventListener('click', () =>
            this._openModal(this.domElements.termsModal));

        this.domElements.privacyBtn.addEventListener('click', () =>
            this._openModal(this.domElements.privacyModal));

        // إغلاق النوافذ
        this.domElements.closeModalBtns.forEach(btn => {
            btn.addEventListener('click', this._closeAllModals.bind(this));
        });

        window.addEventListener('click', (event) => {
            if ([this.domElements.termsModal, this.domElements.privacyModal].includes(event.target)) {
                this._closeAllModals();
            }
        });
    }

    /**
     * إعداد معالج تسجيل الخروج
     * @private
     */
    _setupLogoutHandler() {
        if (this.domElements.logoutBtn) {
            this.domElements.overlay.classList.remove('active');
            this.domElements.sidebar.classList.remove('active');
            this.domElements.logoutBtn.addEventListener('click', () => this.userManager._handleLogout()); // ✅
        }
    }

    /**
     * تحديث ظهور زر العودة
     * @private
     */
    _updateBackButtonVisibility() {
        const activeTab = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.ACTIVE_TAB);
        this.domElements.backBtn.style.display =
            (activeTab === APP_CONFIG.DEFAULT_TAB) ? 'none' : 'block';
    }

    /* ---------------------------------- */
    /* --------- Modal Methods ---------- */
    /* ---------------------------------- */

    /**
     * فتح نافذة منبثقة
     * @private
     * @param {HTMLElement} modal - عنصر النافذة
     */
    _openModal(modal) {
        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
        this.domElements.body.style.overflow = 'hidden';
        this.domElements.body.style.paddingRight = `${scrollbarWidth}px`;
        modal.style.display = 'block';
    }

    /**
     * إغلاق جميع النوافذ المنبثقة
     * @private
     */
    _closeAllModals() {
        this.domElements.body.style.overflow = 'auto';
        this.domElements.body.style.paddingRight = '0';
        this.domElements.termsModal.style.display = 'none';
        this.domElements.privacyModal.style.display = 'none';
    }

    /* ---------------------------------- */
    /* --------- Utility Methods -------- */
    /* ---------------------------------- */
    /**
     * دالة throttle للتحكم في تكرار الأحداث
     * @private
     * @param {Function} func - الدالة المراد تنفيذها
     * @param {number} limit - الفاصل الزمني
     * @returns {Function} الدالة المحدودة
     */
    _throttle(func, limit) {
        let lastFunc;
        let lastRan;
        return function () {
            const context = this;
            const args = arguments;
            if (!lastRan) {
                func.apply(context, args);
                lastRan = Date.now();
            } else {
                clearTimeout(lastFunc);
                lastFunc = setTimeout(function () {
                    if ((Date.now() - lastRan) >= limit) {
                        func.apply(context, args);
                        lastRan = Date.now();
                    }
                }, limit - (Date.now() - lastRan));
            }
        };
    }

    /**
     * عرض رسالة خطأ فادح
     * @private
     */
    _showFatalError() {
        const errorContainer = document.createElement('div');
        errorContainer.className = 'fatal-error';
        errorContainer.innerHTML = `
            <h2>حدث خطأ جسيم</h2>
            <p>تعذر تحميل التطبيق، يرجى تحديث الصفحة</p>
            <button id="reloadBtn">إعادة تحميل</button>
        `;

        document.body.innerHTML = '';
        document.body.appendChild(errorContainer);

        document.getElementById('reloadBtn').addEventListener('click', () => {
            window.location.reload();
        });
    }

    /**
     * تنظيف الموارد عند التدمير
     */
    destroy() {
        // تنظيف مستمعي الأحداث
        this.domElements.toggleBtn.removeEventListener('click', this.eventListeners.toggleSidebar);
        this.domElements.overlay.removeEventListener('click', this.eventListeners.toggleSidebar);
        // تدمير المكونات
        this.components.appManager?.destroy();
    }
}

/**
 * 🔔 Notification Queue System
 * - يعرض الإشعارات واحدة تلو الأخرى (طابور)
 * - يدعم ألوان الحالة: success, error, info
 * - لا يُغلق الإشعار تلقائيًا، بل ينتظر ضغط المستخدم على زر ✖
 * - يُعرض الإشعار في وسط الشاشة بشكل أنيق
 *
 * @author: Evan Brazi
 */
const notificationQueue = [];
let isShowingNotification = false;
function enqueueNotification(message, type = 'info') {
    if (!message || typeof message !== 'string') return;
    notificationQueue.push({ message, type });
    processNotificationQueue();
}
function processNotificationQueue() {
    if (isShowingNotification || notificationQueue.length === 0) return;

    const { message, type } = notificationQueue.shift();
    renderToast(message, type);
    isShowingNotification = true;
}
function renderToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.innerHTML = `
    <span class="toast-message">${message}</span>
    <button class="toast-close-btn" aria-label="إغلاق الإشعار">✖</button>
  `;

    document.body.appendChild(toast);

    toast.querySelector('.toast-close-btn').addEventListener('click', () => {
        toast.remove();
        isShowingNotification = false;
        processNotificationQueue();
    });
}

function showUserNotification(message, type = 'success') {
    const container = document.getElementById('user-notifications');
    if (container) {
        const alert = document.createElement('div');
        alert.className = `alert alert-${type}`;
        alert.textContent = message;
        container.prepend(alert);
        setTimeout(() => alert.remove(), 10000);
    } else {
        alert(message);
    }
}

/**
 * @function generateNotificationMessage
 * @description
 * توليد رسالة إشعار مخصصة حسب نوع العملية (طلب أو دفعة) وحالتها (قبول أو رفض).
 * تُستخدم لعرض إشعارات واضحة ومباشرة للمستخدم داخل الواجهة الأمامية.
 *
 * توليد رسالة إشعار حسب نوع الرسالة الكامل من السيرفر
 * @param {string} type - نوع الرسالة مثل 'paymentAccepted' أو 'orderRejected'
 * @returns {{ text: string, level: 'success'|'error'|'info' }} - رسالة الإشعار ونوعها
 */
function generateNotificationMessage(type) {
    const messages = {
        paymentAccepted: {
            text: '💰 تم قبول دفعتك بنجاح! تم تحديث رصيدك ويمكنك متابعة استخدام الخدمات.✅',
            level: 'success'
        },
        paymentRejected: {
            text: '❌ لم يتم قبول دفعتك. يرجى التأكد من معلومات الدفع أو التواصل مع المسؤولين.⚠️',
            level: 'error'
        },
        orderAccepted: {
            text: '📦 تم تنفيذ طلبك بنجاح! شكراً لاختيارك منصتنا، ونتمنى لك تجربة مميزة.✅',
            level: 'success'
        },
        orderRejected: {
            text: '🚫 للأسف، تم رفض طلبك. نوصي بمراجعة التفاصيل أو التواصل مع فريق الدعم.⚠️',
            level: 'error'
        }
    };
    return messages[type] || {
        text: '📭 إشعار غير معروف. يرجى مراجعة التفاصيل أو إعادة المحاولة لاحقًا.⚠️',
        level: 'info'
    };
}

// بدء التطبيق عند تحميل DOM
document.addEventListener('DOMContentLoaded', () => {
    //showLoader();
    (async () => {
        const user = await checkSession(); // لا حاجة لدور معين
        if (!user) return;
        /**
         * homepage.js - WebSocket client for regular user
         * Receives real-time updates like payment status
         *
         * @author: Evan Brazi
         */
        // ✅ تهيئة WebSocket لاستقبال إشعارات لحظية من السيرفر
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        console.log('📡 محاولة الاتصال بـ WebSocket:', wsUrl);
        const socket = new WebSocket(wsUrl);
        const sessionId = localStorage.getItem(STORAGE_KEYS.SESSION_ID) || `session_${Date.now()}`;
        console.log('Session_Id: ', sessionId);
        if (!localStorage.getItem(STORAGE_KEYS.SESSION_ID)) localStorage.setItem(STORAGE_KEYS.SESSION_ID, sessionId);
        socket.addEventListener('open', () => {
            console.log('✅ WebSocket connected (user)');
            // تعريف المستخدم عند الاتصال
            socket.send(JSON.stringify({
                type: 'auth',
                role: 'user',
                userId: localStorage.getItem(STORAGE_KEYS.USER_ID), // يمكن تغييره حسب النظام
                sessionId: sessionId
            }));
        });
        socket.onmessage = async (event) => {
            try {
                const data = JSON.parse(event.data);
                // التحقق من ان الرسالة موجهة لهذا المستخدم
                if (data.userId !== localStorage.getItem(STORAGE_KEYS.USER_ID)) return;
                console.log('📨 إشعار WebSocket للمستخدم:', data);
                if (data.status === 'accepted' || data.status === 'rejected') {
                    console.log('Catch new status: ', data.status);
                    const { text, level } = generateNotificationMessage(data.type);
                    showUserNotification(text, level);
                    enqueueNotification(text, level);
                    await window.homePage._loadUserData();
                    await window.homePage.components.appManager._postOrderMessage();
                    await window.homePage.components.appManager._postPaymentMessage();
                    return;
                }
                switch (data.type) {
                    case 'welcome':
                        enqueueNotification("✅ تم إرسال الطلب بنجاح", "success");
                        showUserNotification("✅ تم إرسال الطلب بنجاح", "success");
                        break;
                    case 'newPayment':
                        enqueueNotification('✅ تم إرسال الدفعة بنجاح', 'success');
                        enqueueNotification('📥 تم تسجيل دفعة جديدة، يتم التحقق منها من قبل المسؤولين', 'info');
                        showUserNotification('✅ تم إرسال الدفعة بنجاح', 'success');
                        await window.homePage.components.appManager._postPaymentMessage();
                        break;

                    case 'newOrder':
                        showUserNotification('✅ تم إرسال الطلب بنجاح', 'success');
                        enqueueNotification('✅ تم إرسال الطلب بنجاح', 'success');
                        enqueueNotification('📥 تم تسجيل طلب جديد، يتم التحقق منه من قبل المسؤولين', 'info');
                        await window.homePage._loadUserData();
                        await window.homePage.components.appManager._postOrderMessage();
                        break;
                    case 'balanceUpdate':
                        showUserNotification(`💰 تم تحديث رصيدك: +${data.newAmount} دولار`, 'success');
                        enqueueNotification(`💰 تم تحديث رصيدك: +${data.newAmount} دولار`, 'success');
                        await window.homePage._loadUserData();
                        break;

                    default:
                        showUserNotification('📨 إشعار غير معروف:', data);
                        console.log('📨 إشعار غير معروف:', data);
                }
            } catch (error) {
                console.error('Error while processing WebSocket message:', error);
            }
        };
    })();

    /**
     * تسجيل Service Worker
     * @private
     */
    if ('serviceWorker' in navigator) {
        try {
            navigator.serviceWorker.register('/sw.js', { type: 'module', scope: '/' });
            console.log('✅ Service Worker مسجل بنجاح');
        } catch (err) {
            console.error('❌ فشل تسجيل Service Worker:', err);
        }
    }
    window.homePage = new HomePage();
    //setTimeout(async () => await hideLoader(), 3000);
});

document.addEventListener('switchTab', (e) => {
    console.log('Switching to tab:', e.detail);
    if (window.homePage?.components?.taber) window.homePage.components.taber.activateTab(e.detail);
});

window.addEventListener('load', () => {
    setTimeout(() => {
        const loader = document.getElementById('pageLoader');
        if (loader) {
            loader.style.opacity = '0';
            setTimeout(() => loader.remove(), 500);
        }
    }, 5000); // يمكنك تعديل المدة حسب سرعة تحميل الصفحة
});

// تنظيف الذاكرة عند إغلاق الصفحة
window.addEventListener('beforeunload', () => {
    window.homePage?.destroy();
});

// استقبال رسائل من Service Worker (مثال على كيفية التعامل مع الرسائل)
//navigator.serviceWorker.addEventListener('message', event => {
//if (event.data.type === 'loading-start') showLoader();
//if (event.data.type === 'loading-end') hideLoader();
//});
