// نظام إدارة الثيمات
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'day';
    document.body.classList.remove('day-theme', 'night-theme');
    document.body.classList.add(`${savedTheme}-theme`);
}

function toggleTheme() {
    const currentTheme = document.body.classList.contains('day-theme') ? 'day' : 'night';
    const newTheme = currentTheme === 'day' ? 'night' : 'day';
    document.body.classList.remove(`${currentTheme}-theme`);
    document.body.classList.add(`${newTheme}-theme`);
    localStorage.setItem('theme', newTheme);
}

// تهيئة الثيم عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', function() {
    initTheme();
});

// تصدير الوظائف للاستخدام في ملفات أخرى
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { initTheme, toggleTheme };
}