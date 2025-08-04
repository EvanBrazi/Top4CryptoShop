import * as th from "./theme.js";
import * as um from "./usermanager.js";
import { Taber } from "./core/taber.js";
import { AppManager } from "./appmanager.js";

// الثوابت العامة
const STORAGE_ACTIVE_TAB_KEY = 'top4cryptoshop_activeTab';
const CSRF_META_ID = 'csrf-meta';
const LOADING_OVERLAY_ID = 'loading-overlay';

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // === تهيئة العناصر الأساسية ===
        const elements = {
            sidebar: document.querySelector('.sidebar'),
            sidebarMenuContainer: document.querySelector('.sidebar-menu-container'),
            tabsContent: document.querySelector('.tabs-container'),
            toggleBtn: document.querySelector('.toggle-sidebar'),
            overlay: document.querySelector('.overlay'),
            body: document.body,
            addBalanceBtn: document.getElementById('add-balance-btn'),
            backBtn: document.getElementById('back-btn'),
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
            footer: document.querySelector('.site-footer'),
            loadingOverlay: document.getElementById(LOADING_OVERLAY_ID)
        };

        // === التحقق من وجود العناصر الأساسية ===
        if (!elements.sidebar || !elements.tabsContent) {
            throw new Error('عناصر الواجهة الأساسية غير موجودة');
        }

        // === تهيئة التطبيق ===
        showLoading(true);

        // 1. جلب CSRF Token
        await initializeCSRFToken();

        // 2. تهيئة Taber
        const taber = new Taber(elements.sidebarMenuContainer, elements.tabsContent, {
            activeClass: 'active',
            defaultTab: 'home',
            storageKey: STORAGE_ACTIVE_TAB_KEY,
            useCookies: true
        });

        // 3. تهيئة AppManager
        const appManager = new AppManager(taber);

        // 4. تهيئة المستخدم والثيم
        await Promise.all([
            um.loadUser(),
            th.initTheme()
        ]);

        // === إعداد معالجات الأحداث ===
        setupEventListeners(elements, taber);

        console.log('تم تحميل النظام بنجاح وجاهز للاستخدام');
    } catch (error) {
        console.error('خطأ في تهيئة التطبيق:', error);
        showErrorToUser('حدث خطأ أثناء تحميل التطبيق. يرجى تحديث الصفحة.');
    } finally {
        showLoading(false);
    }
});

// ===== الدوال المساعدة =====

async function initializeCSRFToken() {
    try {
        const response = await fetch('/csrf-token', {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const { csrfToken } = await response.json();
        const metaTag = document.getElementById(CSRF_META_ID) || createCSRFMetaTag();
        metaTag.content = csrfToken;
        localStorage.setItem('csrfToken', csrfToken);
    } catch (error) {
        console.error('فشل جلب CSRF Token:', error);
        throw error;
    }
}

function createCSRFMetaTag() {
    const meta = document.createElement('meta');
    meta.id = CSRF_META_ID;
    meta.name = 'csrf-token';
    document.head.appendChild(meta);
    return meta;
}

function setupEventListeners(elements, taber) {
    // 1. أحداث الشريط الجانبي
    elements.toggleBtn.addEventListener('click', toggleSidebar);
    elements.overlay.addEventListener('click', toggleSidebar);

    // 2. أحداث النوافذ المنبثقة
    elements.termsBtn.addEventListener('click', () => openModal(elements.termsModal));
    elements.privacyBtn.addEventListener('click', () => openModal(elements.privacyModal));
    elements.closeModalBtns.forEach(btn => {
        btn.addEventListener('click', closeAllModals);
    });

    // 3. أحداث التمرير
    window.addEventListener('scroll', handleScroll);

    // 4. أحداث أخرى
    elements.addBalanceBtn.addEventListener('click', () => taber.activateTab('wallet'));
    elements.backBtn.addEventListener('click', (e) => {
        e.preventDefault();
        taber.activateTab('home');
    });

    // 5. إدارة حالة زر الرجوع
    window.addEventListener('load', updateBackButtonVisibility);

    function toggleSidebar() {
        elements.sidebar.classList.toggle('active');
        elements.overlay.classList.toggle('active');
    }

    function openModal(modal) {
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        document.body.style.paddingRight = `${window.innerWidth - document.documentElement.clientWidth}px`;
    }

    function closeAllModals() {
        [elements.termsModal, elements.privacyModal].forEach(modal => {
            if (modal) modal.style.display = 'none';
        });
        document.body.style.overflow = 'auto';
    }

    function handleScroll() {
        const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
        
        // إدارة ظهور/اختفاء الفوتر
        if (currentScroll > lastScrollPosition) {
            elements.footer.classList.add('hidden');
        } else {
            elements.footer.classList.remove('hidden');
        }

        // إخفاء الشريط الجانبي إذا كان مفتوحاً
        if (elements.sidebar.classList.contains('active')) {
            toggleSidebar();
        }

        lastScrollPosition = currentScroll <= 0 ? 0 : currentScroll;
    }

    function updateBackButtonVisibility() {
        const oldTab = localStorage.getItem(STORAGE_ACTIVE_TAB_KEY);
        elements.backBtn.style.display = (oldTab && oldTab === 'home') ? 'none' : 'block';
    }
}

async function protectedFetch(url, options = {}) {
    try {
        const csrfToken = document.getElementById(CSRF_META_ID)?.content || localStorage.getItem('csrfToken');
        const token = localStorage.getItem('token') || getCookie('token');

        const headers = {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
            ...options.headers
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(url, {
            ...options,
            headers,
            credentials: 'include'
        });

        if (response.status === 401) {
            handleUnauthorized();
            return null;
        }

        return response;
    } catch (error) {
        console.error('Fetch error:', error);
        throw error;
    }
}

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}

function handleUnauthorized() {
    // 1. مسح بيانات المصادقة المحلية
    localStorage.removeItem('token');
    localStorage.removeItem('csrfToken');
    document.cookie = 'token=; Max-Age=0; path=/; domain=' + window.location.hostname;

    // 2. توجيه المستخدم لصفحة تسجيل الدخول
    window.location.href = '/login?session_expired=true';
}

function showLoading(show) {
    const overlay = document.getElementById(LOADING_OVERLAY_ID);
    if (overlay) overlay.style.display = show ? 'flex' : 'none';
}

function showErrorToUser(message) {
    // يمكن تنفيذ عرض رسالة خطأ في الواجهة
    const errorContainer = document.getElementById('error-container') || createErrorContainer();
    errorContainer.textContent = message;
    errorContainer.style.display = 'block';
    
    setTimeout(() => {
        errorContainer.style.display = 'none';
    }, 5000);
}

function createErrorContainer() {
    const container = document.createElement('div');
    container.id = 'error-container';
    container.style.position = 'fixed';
    container.style.top = '20px';
    container.style.right = '20px';
    container.style.padding = '15px';
    container.style.backgroundColor = '#ff6b6b';
    container.style.color = 'white';
    container.style.borderRadius = '5px';
    container.style.zIndex = '9999';
    document.body.appendChild(container);
    return container;
}
