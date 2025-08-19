// نظام إدارة الثيمات
export function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'day';
    document.body.classList.remove('day-theme', 'night-theme');
    document.body.classList.add(`${savedTheme}-theme`);
}

export function toggleTheme() {
    const currentTheme = document.body.classList.contains('day-theme') ? 'day' : 'night';
    const newTheme = currentTheme === 'day' ? 'night' : 'day';
    document.body.classList.remove(`${currentTheme}-theme`);
    document.body.classList.add(`${newTheme}-theme`);
    localStorage.setItem('theme', newTheme);
}

export function toggleDBTheme (userDBTheme) {
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