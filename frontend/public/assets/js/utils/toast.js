/**
 * @module toast
 * عرض إشعار مؤقت للمستخدم في واجهة المشروع
 * @param {string} message - نص الإشعار
 * @param {'success'|'error'|'info'|'warning'} type - نوع الإشعار
 */
export function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = 'custom-toast';

  // أيقونات حسب النوع
  const icons = {
    success: '✅',
    error: '❌',
    info: 'ℹ️',
    warning: '⚠️'
  };

  toast.innerHTML = `<span class="toast-icon">${icons[type] || '🔔'}</span><span class="toast-message">${message}</span>`;

  // تخصيص اللون حسب النوع
  const colors = {
    success: '#4CAF50',
    error: '#f44336',
    info: '#2196F3',
    warning: '#FF9800'
  };

  toast.style.backgroundColor = colors[type] || '#333';

  document.body.appendChild(toast);

  // دخول سلس
  setTimeout(() => {
    toast.classList.add('visible');
  }, 100);

  // خروج بعد 3 ثوانٍ
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
