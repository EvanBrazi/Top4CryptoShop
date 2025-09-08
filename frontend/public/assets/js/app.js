import { STORAGE_KEYS, isValidToken } from './utils/appUtils.js';
// عناصر DOM
const menuBtn = document.getElementById('menuBtn');
const closeBtn = document.getElementById('closeBtn');
const sidebar = document.getElementById('dash-sidebar');
const overlay = document.getElementById('overlay');
const themeBtn = document.getElementById('themeBtn');
const aboutBtn = document.getElementById('aboutBtn');
const contactBtn = document.getElementById('contactBtn');
const closeAboutBtn = document.getElementById('closeAboutBtn');
const closeContactBtn = document.getElementById('closeContactBtn');
const aboutDialog = document.getElementById('aboutDialog');
const contactDialog = document.getElementById('contactDialog');
// زر تسجيل الدخول
const loginBtn = document.getElementById('loginBtn');
// زر التسجيل
const registerBtn = document.getElementById('registerBtn');
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

// حالة التطبيق
const AppState = {
    isSidebarOpen: false,
    currentDialog: null,
    isNightMode: false
};

// تحميل الإعدادات
function loadSettings() {
    const savedTheme = localStorage.getItem('theme') || 'day';
    document.body.classList.add(`${savedTheme}-theme`);
    const themeBtn = document.getElementById('themeBtn');
    const icon = themeBtn.querySelector('i');
    const newIcon = savedTheme === 'day' ? 'sun' : 'moon';
    icon.classList.add(`fa-${newIcon}`);
    themeBtn.setAttribute('aria-label', 'تبديل إلى الثيم الفاتح');
    AppState.isNightMode = savedTheme === 'day' ? true : false;
}

// تبديل الدرج الجانبي
function toggleSidebar() {
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
    const dialogs = document.querySelectorAll('.dialog.active');
    sidebar.classList.remove('active');
    overlay.classList.remove('active');
    dialogs.forEach(dialog => dialog.classList.remove('active'));
    AppState.isSidebarOpen = false;
    AppState.currentDialog = null;
}

// تبديل الثيم
function toggleTheme() {
    const currentTheme = document.body.classList.contains('day-theme') ? 'day' : 'night';
    const currentIcon = currentTheme === 'day' ? 'sun' : 'moon';
    const newTheme = currentTheme === 'day' ? 'night' : 'day';
    const replaceIcon = newTheme === 'day' ? 'sun' : 'moon';
    const icon = themeBtn.querySelector('i');
    icon.classList.replace(`fa-${currentIcon}`, `fa-${replaceIcon}`);
    document.body.classList.remove(`${currentTheme}-theme`);
    document.body.classList.add(`${newTheme}-theme`);
    localStorage.setItem('theme', newTheme);
}

// عرض الحوار
function showDialog(dialog) {
    if (AppState.currentDialog) {
        hideDialog(AppState.currentDialog);
    }

    AppState.currentDialog = dialog;
    dialog.classList.add('active');
    overlay.classList.add('active');
}

// إخفاء الحوار
function hideDialog(dialog) {
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
document.addEventListener('DOMContentLoaded', loadSettings());

// تحويل المستخدم عند النقر على أزرار التسجيل/الدخول
document.addEventListener('DOMContentLoaded', function () {
    const TOKEN = localStorage.getItem(STORAGE_KEYS.USER_TOKEN);
    (async () => {
        console.log('Token : ', await isValidToken(TOKEN));
        if (await isValidToken(TOKEN)) {
            alert('You will go home!', TOKEN)
            window.location.href = '/homepage.html';
        }
    })();
    if (loginBtn) {
        loginBtn.addEventListener('click', function () {
            window.location.href = '/login.html';
        });
    }
    if (registerBtn) {
        registerBtn.addEventListener('click', function () {
            window.location.href = '/register.html';
        });
    }
});
