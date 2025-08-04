// العناصر الأساسية
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const sidebar = document.querySelector('.sidebar');
const overlay = document.querySelector('.overlay');
// تبديل الثيم
themeToggleBtn.addEventListener('click', toggleTheme);

var oldTheme = localStorage.getItem('theme') || 'day';

// نظام إدارة الثيمات
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'day';
    document.body.classList.remove('day-theme', 'night-theme');
    document.body.classList.add(`${savedTheme}-theme`);
    oldTheme = savedTheme;
    updateThemeButton();
}
function toggleTheme() {
    const newTheme = oldTheme === 'day' ? 'night' : 'day';
    document.body.classList.remove(`${oldTheme}-theme`);
    document.body.classList.add(`${newTheme}-theme`);
    localStorage.setItem('theme', newTheme);
    oldTheme = newTheme;
    updateThemeButton();
}
function updateThemeButton() {
    console.log('UpdateThemeBtn:  ' + oldTheme);
    if (themeToggleBtn) {
        themeToggleBtn.innerHTML = oldTheme === 'night'
            ? '<i class="fas fa-day"></i> الوضع النهاري'
            : '<i class="fas fa-moon"></i> الوضع الليلي';
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
    }
}
export { initTheme, toggleTheme, updateThemeButton };