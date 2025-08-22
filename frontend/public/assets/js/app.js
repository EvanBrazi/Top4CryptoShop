import { checkSession } from './auth.js';
// حالة التطبيق
const AppState = {
    isSidebarOpen: false,
    currentDialog: null,
    isNightMode: false
};

// تهيئة التطبيق
function initApp() {
    // عناصر DOM
    const menuBtn = document.getElementById('menuBtn');
    const closeBtn = document.getElementById('closeBtn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    const themeBtn = document.getElementById('themeBtn');
    const aboutBtn = document.getElementById('aboutBtn');
    const contactBtn = document.getElementById('contactBtn');
    const closeAboutBtn = document.getElementById('closeAboutBtn');
    const closeContactBtn = document.getElementById('closeContactBtn');
    const aboutDialog = document.getElementById('aboutDialog');
    const contactDialog = document.getElementById('contactDialog');

    // تحميل الإعدادات المحفوظة
    loadSettings();

    // أحداث الدرج الجانبي
    menuBtn.addEventListener('click', toggleSidebar);
    closeBtn.addEventListener('click', toggleSidebar);
    overlay.addEventListener('click', closeAll);

    // أحداث تغيير الثيم
    themeBtn.addEventListener('click', toggleTheme);

    // أحداث الحوارات
    aboutBtn.addEventListener('click', () => showDialog(aboutDialog));
    contactBtn.addEventListener('click', () => showDialog(contactDialog));
    closeAboutBtn.addEventListener('click', () => hideDialog(aboutDialog));
    closeContactBtn.addEventListener('click', () => hideDialog(contactDialog));

    // إغلاق الحوارات بالضغط على ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && AppState.currentDialog) {
            hideDialog(AppState.currentDialog);
        }
    });

    // تحليل وإرسال إحصاءات الاستخدام إذا كان هناك token
    if (localStorage.getItem('authToken')) {
        sendAnalytics();
    }
}

// تحميل الإعدادات
function loadSettings() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'night') {
        document.body.classList.add('night-mode');
        const themeBtn = document.getElementById('themeBtn');
        if (themeBtn) {
            const icon = themeBtn.querySelector('i');
            icon.classList.replace('fa-moon', 'fa-sun');
            themeBtn.setAttribute('aria-label', 'تبديل إلى الثيم الفاتح');
        }
        AppState.isNightMode = true;
    }
}

// تبديل الدرج الجانبي
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');

    AppState.isSidebarOpen = !AppState.isSidebarOpen;

    if (AppState.isSidebarOpen) {
        sidebar.classList.add('active');
        overlay.classList.add('active');
    } else {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
    }
}

// إغلاق كل شيء
function closeAll() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    const dialogs = document.querySelectorAll('.dialog.active');

    sidebar.classList.remove('active');
    overlay.classList.remove('active');
    dialogs.forEach(dialog => dialog.classList.remove('active'));

    AppState.isSidebarOpen = false;
    AppState.currentDialog = null;
}

// تبديل الثيم
function toggleTheme() {
    const body = document.body;
    const themeBtn = document.getElementById('themeBtn');
    const icon = themeBtn.querySelector('i');

    AppState.isNightMode = !AppState.isNightMode;

    if (AppState.isNightMode) {
        body.classList.add('night-mode');
        localStorage.setItem('theme', 'night');
        icon.classList.replace('fa-moon', 'fa-sun');
        themeBtn.setAttribute('aria-label', 'تبديل إلى الثيم الفاتح');
    } else {
        body.classList.remove('night-mode');
        localStorage.setItem('theme', 'day');
        icon.classList.replace('fa-sun', 'fa-moon');
        themeBtn.setAttribute('aria-label', 'تبديل إلى الثيم الداكن');
    }
}

// عرض الحوار
function showDialog(dialog) {
    const overlay = document.getElementById('overlay');

    if (AppState.currentDialog) {
        hideDialog(AppState.currentDialog);
    }

    AppState.currentDialog = dialog;
    dialog.classList.add('active');
    overlay.classList.add('active');
}

// إخفاء الحوار
function hideDialog(dialog) {
    const overlay = document.getElementById('overlay');

    dialog.classList.remove('active');
    overlay.classList.remove('active');
    AppState.currentDialog = null;
}

// إرسال إحصاءات الاستخدام
function sendAnalytics() {
    try {
        fetch('/api/analytics', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                'Content-Type': 'application/json'
            }
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.json();
            })
            .catch(error => {
                console.error('Error sending analytics:', error);
            });
    } catch (error) {
        console.error('Analytics error:', error);
    }
}

// تهيئة التطبيق عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', initApp);

// تحويل المستخدم عند النقر على أزرار التسجيل/الدخول
document.addEventListener('DOMContentLoaded', function () {
    (async () => {
        const user = await checkSession(); // لا حاجة لدور معين
        if (user) window.location.href = '/homepage.html';
    })();
    // زر تسجيل الدخول
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', function () {
            window.location.href = '/login.html';
        });
    }

    // زر التسجيل
    const registerBtn = document.getElementById('registerBtn');
    if (registerBtn) {
        re.addEventListener('click', function () {
            window.location.href = '/register.html';
        });
    }
});
