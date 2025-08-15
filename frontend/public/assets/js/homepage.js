/**
 * @file homepage.js
 * @description نقطة الدخول الرئيسية للتطبيق - تهيئة جميع المكونات وإدارة الأحداث
 * @version 2.0.0
 * @license MIT
 */

import * as th from "./theme.js";
import * as um from "./usermanager.js";
import { Taber } from "./core/taber.js";
import { AppManager } from "./appmanager.js";

document.addEventListener('DOMContentLoaded', async function () {
    try {
        // ----------------------------
        // 1. تهيئة العناصر الأساسية
        // ----------------------------
        const DOM = {
            sidebar: document.querySelector('.sidebar'),
            sidebarMenu: document.querySelector('.sidebar-menu-container'),
            tabsContent: document.querySelector('.tabs-container'),
            toggleBtn: document.querySelector('.toggle-sidebar'),
            overlay: document.querySelector('.overlay'),
            body: document.body,
            addBalanceBtn: document.getElementById('add-balance-btn'),
            backBtn: document.getElementById('back-btn'),
            currentPage: document.getElementById('current-page-indicator'),
            profileImg: document.getElementById('profile-img'),
            usernameDisplay: document.getElementById('username-display'),
            balanceDisplay: document.getElementById('balance-display'),
            topBalanceDisplay: document.getElementById('top-balance-display'),
            termsBtn: document.getElementById('terms-btn'),
            privacyBtn: document.getElementById('privacy-btn'),
            termsModal: document.getElementById('terms-modal'),
            privacyModal: document.getElementById('privacy-modal'),
            closeModalBtns: document.querySelectorAll('.close-modal'),
            mainContent: document.querySelector('.main-content'),
            logoutBtn: document.getElementById('logoutBtn'),
            footer: document.querySelector('.site-footer')
        };

        // ----------------------------
        // 2. الثوابت والإعدادات
        // ----------------------------
        const CONFIG = {
            STORAGE_KEYS: {
                ACTIVE_TAB: 'top4cryptoshop_activeTab',
                USER_THEME: 'user_theme_preference'
            },
            DEFAULT_TAB: 'home',
            SCROLL_THROTTLE: 100
        };

        // ----------------------------
        // 3. تهيئة المكونات الأساسية
        // ----------------------------
        
        // 3.1 نظام التبويبات
        const taber = new Taber(DOM.sidebarMenu, DOM.tabsContent, {
            activeClass: 'active',
            defaultTab: CONFIG.DEFAULT_TAB,
            storageKey: CONFIG.STORAGE_KEYS.ACTIVE_TAB,
            useCookies: true
        });

        // 3.2 مدير التطبيقات
        const appManager = new AppManager(taber);

        // 3.3 تهيئة السمة
        th.initTheme();

        // 3.4 تحميل بيانات المستخدم
        await um.loadUser();

        // ----------------------------
        // 4. إعداد مستمعي الأحداث
        // ----------------------------

        // 4.1 أحداث الشريط الجانبي
        DOM.toggleBtn.addEventListener('click', toggleSidebar);
        DOM.overlay.addEventListener('click', toggleSidebar);

        // 4.2 أحداث المحفظة
        DOM.addBalanceBtn.addEventListener('click', () => {
            taber.activateTab('wallet');
        });

        // 4.3 أحداث العودة
        DOM.backBtn.addEventListener('click', (e) => {
            e.preventDefault();
            taber.activateTab(CONFIG.DEFAULT_TAB);
        });

        // 4.4 أحداث التمرير
        setupScrollHandlers();

        // 4.5 أحداث النوافذ المنبثقة
        setupModalHandlers();

        // 4.6 أحداث تسجيل الخروج
        if (DOM.logoutBtn) {
            DOM.logoutBtn.addEventListener('click', um.logout);
        }

        // 4.7 تحديث حالة زر العودة
        updateBackButtonVisibility();

        // ----------------------------
        // 5. تسجيل Service Worker
        // ----------------------------
        registerServiceWorker();

        console.log('✅ تم تحميل النظام بنجاح');

        // ----------------------------
        // 6. دوال مساعدة
        // ----------------------------

        /**
         * تبديل حالة الشريط الجانبي
         */
        function toggleSidebar() {
            DOM.sidebar.classList.toggle('active');
            DOM.overlay.classList.toggle('active');
        }

        /**
         * إعداد معالجات أحداث التمرير
         */
        function setupScrollHandlers() {
            let lastScrollPosition = 0;
            let scrollTimeout;

            // لمنع التكرار عند التمرير السريع
            const throttledScrollHandler = throttle(() => {
                const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
                
                if (currentScroll > lastScrollPosition) {
                    DOM.footer.classList.add('hidden');
                } else {
                    DOM.footer.classList.remove('hidden');
                }

                if (currentScroll <= 0) {
                    DOM.footer.classList.remove('hidden');
                }

                lastScrollPosition = currentScroll;
            }, CONFIG.SCROLL_THROTTLE);

            window.addEventListener('scroll', throttledScrollHandler);
            DOM.mainContent.addEventListener('scroll', () => {
                if (DOM.sidebar.classList.contains('active')) {
                    toggleSidebar();
                }
            });
        }

        /**
         * إعداد معالجات النوافذ المنبثقة
         */
        function setupModalHandlers() {
            // فتح النوافذ
            DOM.termsBtn.addEventListener('click', () => openModal(DOM.termsModal));
            DOM.privacyBtn.addEventListener('click', () => openModal(DOM.privacyModal));

            // إغلاق النوافذ
            DOM.closeModalBtns.forEach(btn => {
                btn.addEventListener('click', closeAllModals);
            });

            window.addEventListener('click', (event) => {
                if ([DOM.termsModal, DOM.privacyModal].includes(event.target)) {
                    closeAllModals();
                }
            });
        }

        /**
         * فتح نافذة منبثقة
         * @param {HTMLElement} modal - عنصر النافذة
         */
        function openModal(modal) {
            const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
            document.body.style.overflow = 'hidden';
            document.body.style.paddingRight = `${scrollbarWidth}px`;
            modal.style.display = 'block';
        }

        /**
         * إغلاق جميع النوافذ المنبثقة
         */
        function closeAllModals() {
            document.body.style.overflow = 'auto';
            document.body.style.paddingRight = '0';
            DOM.termsModal.style.display = 'none';
            DOM.privacyModal.style.display = 'none';
        }

        /**
         * تحديث ظهور زر العودة
         */
        function updateBackButtonVisibility() {
            const activeTab = localStorage.getItem(CONFIG.STORAGE_KEYS.ACTIVE_TAB);
            DOM.backBtn.style.display = (activeTab === CONFIG.DEFAULT_TAB) ? 'none' : 'block';
        }

        /**
         * تسجيل Service Worker
         */
        async function registerServiceWorker() {
            if ('serviceWorker' in navigator) {
                try {
                    await navigator.serviceWorker.register('/assets/js/sw.js');
                    console.log('✅ Service Worker مسجل بنجاح');
                } catch (err) {
                    console.error('❌ فشل تسجيل Service Worker:', err);
                }
            }
        }

        /**
         * دالة throttle للتحكم في تكرار الأحداث
         * @param {Function} func - الدالة المراد تنفيذها
         * @param {number} limit - الفاصل الزمني
         */
        function throttle(func, limit) {
            let lastFunc;
            let lastRan;
            return function() {
                const context = this;
                const args = arguments;
                if (!lastRan) {
                    func.apply(context, args);
                    lastRan = Date.now();
                } else {
                    clearTimeout(lastFunc);
                    lastFunc = setTimeout(function() {
                        if ((Date.now() - lastRan) >= limit) {
                            func.apply(context, args);
                            lastRan = Date.now();
                        }
                    }, limit - (Date.now() - lastRan));
                }
            };
        }

    } catch (error) {
        console.error('❌ فشل تحميل التطبيق:', error);
        showFatalError();
    }

    /**
     * عرض رسالة خطأ فادح
     */
    function showFatalError() {
        const errorContainer = document.createElement('div');
        errorContainer.className = 'fatal-error';
        errorContainer.innerHTML = `
            <h2>حدث خطأ جسيم</h2>
            <p>تعذر تحميل التطبيق، يرجى تحديث الصفحة</p>
            <button onclick="window.location.reload()">إعادة تحميل</button>
        `;
        document.body.innerHTML = '';
        document.body.appendChild(errorContainer);
    }
});
