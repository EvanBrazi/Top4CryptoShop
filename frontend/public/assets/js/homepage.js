import * as th from "./theme.js";
import * as um from "./usermanager.js";
import { Taber } from "./core/taber.js";
import { AppManager } from "./appmanager.js";

document.addEventListener('DOMContentLoaded', function () {
    // العناصر الأساسية
    const sidebar = document.querySelector('.sidebar');
    const sidebarMenuContainer = document.querySelector('.sidebar-menu-container');
    const tabsContent = document.querySelector('.tabs-container');
    const toggleBtn = document.querySelector('.toggle-sidebar');
    const overlay = document.querySelector('.overlay');

    const body = document.body;
    const addBalanceBtn = document.getElementById('add-balance-btn');
    const backBtn = document.getElementById('back-btn');
    const currentPageIndicator = document.getElementById('current-page-indicator');

    // عناصر البروفايل
    const profileImg = document.getElementById('profile-img');
    const usernameDisplay = document.getElementById('username-display');
    const balanceDisplay = document.getElementById('balance-display');
    const topBalanceDisplay = document.getElementById('top-balance-display');

    // عناصر الفوتر والنوافذ المنبثقة
    const termsBtn = document.getElementById('terms-btn');
    const privacyBtn = document.getElementById('privacy-btn');
    const termsModal = document.getElementById('terms-modal');
    const privacyModal = document.getElementById('privacy-modal');
    const closeModalBtns = document.querySelectorAll('.close-modal');

    // Constant Variables
    const STORAGE_ACTIVE_TAB_KEY = 'top4cryptoshop_activeTab';
    addBalanceBtn.addEventListener('click', () => {
        taber.activateTab('wallet');
    });

    let scrollTimer;
    const mainContent = document.querySelector('.main-content');
    const logoutBtn = document.getElementById('logoutBtn');
    //if (logoutBtn) logoutBtn.addEventListener('click', um.logout());

    // ------ وظائف التحكم الأساسية ------
    mainContent.addEventListener('scroll', function () {
        if (sidebar.classList.contains('active')) {
            toggleSidebar();
        }
    });
    
    // فتح/إغلاق الدرج
    toggleBtn.addEventListener('click', toggleSidebar);
    overlay.addEventListener('click', toggleSidebar);

    function toggleSidebar() {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
    }

    const sidebarLinks = document.querySelectorAll('.sidebar-menu a');

    // احداث النقر على البطاقات
    async function handler(id, size) {
        console.log('handler : ' + id + ' size : ' + size);
        const appCards = await cm.loadCards('apps');
        cm.renderCards('small-cards-container', appCards, 'small');
    }

    let counter = 1;

    // إنشاء مثيل من Taber
    const taber = new Taber(sidebarMenuContainer, tabsContent, {
        activeClass: 'active',
        defaultTab: 'home',
        storageKey: STORAGE_ACTIVE_TAB_KEY,
        useCookies: true
    });

    const appManager = new AppManager(taber);

    // إضافة تاب جديد ديناميكيًا
    const newTabId = `custom-${counter}`;
    const newTabInfo = {
        id: newTabId,
        title: `Custom Tab ${counter}`,
        icon: 'fas fa-star',
        content: `<h3>Content Custom Tab ${counter}</h3><p>This Content Dynamic Added!</p>`
    };
    // @TODO: Edit Taber._validateTabExists to add new Tab
    //taber.addTab(newTabInfo);

    // ------ إدارة الفوتر والنوافذ المنبثقة ------

    termsBtn.addEventListener('click', function () {
        document.body.style.overflowX = 'visible';
        termsModal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        document.body.style.paddingRight = `${window.innerWidth - document.documentElement.clientWidth}px`;
    });

    privacyBtn.addEventListener('click', function () {
        document.body.style.overflowX = 'visible';
        privacyModal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        document.body.style.paddingRight = `${window.innerWidth - document.documentElement.clientWidth}px`;
    });

    closeModalBtns.forEach(btn => {
        btn.addEventListener('click', function () {
            termsModal.style.display = 'none';
            privacyModal.style.display = 'none';
            document.body.style.overflow = 'auto';
        });
    });

    window.addEventListener('click', function (event) {
        if (event.target === termsModal) {
            termsModal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
        if (event.target === privacyModal) {
            privacyModal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    });

    // ------ الأحداث الإضافية ------
    backBtn.addEventListener('click', function (e) {
        e.preventDefault();
        taber.activateTab('home');
    });

    // التحكم في ظهور/اختفاء الفوتر عند التمرير
    let lastScrollPosition = 0;
    const footer = document.querySelector('.site-footer');

    window.addEventListener('scroll', function () {
        const currentScrollPosition = window.pageYOffset || document.documentElement.scrollTop;

        if (currentScrollPosition > lastScrollPosition) {
            // التمرير لأسفل - إخفاء الفوتر
            footer.classList.add('hidden');
        } else {
            // التمرير لأعلى - إظهار الفوتر
            footer.classList.remove('hidden');
        }

        // إذا كان المستخدم في أعلى الصفحة، تأكد من إظهار الفوتر

        if (currentScrollPosition <= 0) {
            footer.classList.remove('hidden');
        }

        lastScrollPosition = currentScrollPosition;
    });

    // Update back button
    window.addEventListener('load', () => {
        const oldTab = localStorage.getItem(STORAGE_ACTIVE_TAB_KEY);
        (oldTab && oldTab === 'home') ? backBtn.style.display = 'none' : backBtn.style.display = 'block';
    });
    // التهيئة الأولية
    
    // 1. تهيئة المستخدم
    um.loadUser();
    th.initTheme();

    //new main.init();
    //main.callSwitchTab(currentTab, 'large');
    //cm.loadCards('main').then(cards => {
    //    cm.renderCards('main-cards-container', cards, 'large', handler);
    //});

    console.log('تم تحميل النظام بنجاح وجاهز للاختبار');
});
