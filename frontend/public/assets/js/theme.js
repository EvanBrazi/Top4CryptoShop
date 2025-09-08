import UserManager from "./usermanager.js";
const themeBtn = document.getElementById('theme-toggle-btn');
// نظام إدارة الثيمات
export function initTheme() {
    const currentTheme = document.body.classList.contains('day-theme') ? 'day' : 'night';
    const currentIcon = currentTheme === 'day' ? 'sun' : 'moon';
    const savedTheme = localStorage.getItem('theme') || 'day';
    const replaceIcon = savedTheme === 'day' ? 'sun' : 'moon';
    const icon = themeBtn.querySelector('i');
    icon.classList.replace(`fa-${currentIcon}`, `fa-${replaceIcon}`);
    document.body.classList.remove('day-theme', 'night-theme');
    document.body.classList.add(`${savedTheme}-theme`);
}

export async function toggleTheme() {
    const currentTheme = document.body.classList.contains('day-theme') ? 'day' : 'night';
    const currentIcon = currentTheme === 'day' ? 'sun' : 'moon';
    const newTheme = currentTheme === 'day' ? 'night' : 'day';
    const replaceIcon = newTheme === 'day' ? 'sun' : 'moon';
    const icon = themeBtn.querySelector('i');
    icon.classList.replace(`fa-${currentIcon}`, `fa-${replaceIcon}`);
    document.body.classList.remove(`${currentTheme}-theme`);
    document.body.classList.add(`${newTheme}-theme`);
    localStorage.setItem('theme', newTheme);
    const userManager = UserManager.getInstance();
    const themeValue = newTheme === 'night' ? 1 : 0;
    userManager.setUserTheme(themeValue);
}

export function toggleDBTheme(userDBTheme) {
    console.log('Theme from User', userDBTheme);
    if (!userDBTheme) return;
    localStorage.setItem('theme', userDBTheme);
    initTheme();
}

// تهيئة الثيم عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('theme-toggle-btn').addEventListener('click', function () {
        toggleTheme();
    });
    initTheme();
});