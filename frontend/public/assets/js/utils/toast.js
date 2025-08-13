/**
 * @module toast
 * عرض إشعار مؤقت للمستخدم في واجهة المشروع
 * @param {string} message - نص الإشعار
 * @param {string} type - نوع الإشعار (success, error, info)
 */
export function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = 'toast-message';

  // تخصيص اللون حسب النوع
  if (type === 'success') toast.style.backgroundColor = '#4CAF50';
  else if (type === 'error') toast.style.backgroundColor = '#f44336';
  else toast.style.backgroundColor = '#323232';

  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 3000);
}