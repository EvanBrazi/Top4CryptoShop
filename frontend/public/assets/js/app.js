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
    overlay.addEventListener('click', toggleSidebar);

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

// ============= تحويل المستخدم عند النقر على الأزرار =============
document.addEventListener('DOMContentLoaded', function() {
    // زر تسجيل الدخول
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', function() {
            window.location.href = '/login.html';
        });
    }

    // زر التسجيل
    const signupBtn = document.getElementById('signupBtn');
    if (signupBtn) {
        signupBtn.addEventListener('click', function() {
            window.location.href = '/signup.html';
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const menuBtn = document.getElementById('menuBtn');
    const sidebar = document.getElementById('sidebar');

    if (menuBtn && sidebar) {
        menuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('active');
        });
    }
});

}

// تحميل الإعدادات
function loadSettings() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'night') {
        toggleTheme();
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

// تبديل الثيم
function toggleTheme() {
    const body = document.body;
    AppState.isNightMode = !AppState.isNightMode;

    if (AppState.isNightMode) {
        body.classList.add('night-mode');
        localStorage.setItem('theme', 'night');
    } else {
        body.classList.remove('night-mode');
        localStorage.setItem('theme', 'day');
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

// التحقق من الجلسة عند التحميل
async function checkAuth() {
    try {
        const response = await fetch('/api/auth/verify', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            }
        });

        if (!response.ok) window.location.href = '/login.html';
    } catch (error) {
        window.location.href = '/login.html';
    }
}

// استدعاء الدالة عند تحميل الصفحة
/**checkAuth();*/

// بدء التطبيق عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', initApp);
