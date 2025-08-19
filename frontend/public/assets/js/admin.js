/**
 * admin.js - Admin Dashboard Interface
 * Handles user and icon management via API integration
 * CSP-compliant: avoids inline event handlers and unsafe scripting
 *
 * admin.js - WebSocket client for admin dashboard
 * Receives real-time notifications from server
 * 
 * @author: Evan Brazi
 * @created: 2025-08-16
 * @license: MIT
 */
// ✅ Author: Evan Brazi | Last Updated: 2025-08-19
// ✅ Author: Evan Brazi | Last Updated: 2025-08-19
// 📄 هذا الملف مسؤول عن إدارة واجهة الأدمن: تعديل الرصيد، الحالة، تحميل المستخدمين، مراقبة الأيقونات، وإظهار الإشعارات

// 🔔 عرض إشعار عام في أعلى الصفحة
function showNotification(message, type = 'success') {
  const bar = document.getElementById('globalNotification');
  bar.textContent = message;
  bar.style.backgroundColor = type === 'error' ? '#e74c3c' : '#27ae60';
  bar.style.display = 'block';
  setTimeout(() => bar.style.display = 'none', 3000);
}

// 💰 تحديث رصيد مستخدم
document.getElementById('updateBalanceBtn').addEventListener('click', async () => {
  const userId = document.getElementById('userId').value.trim();
  const newBalance = document.getElementById('newBalance').value.trim();
  const result = document.getElementById('balanceResult');

  if (!userId || !newBalance) {
    showNotification('يرجى إدخال جميع الحقول', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/users/${userId}/balance`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ balance: parseFloat(newBalance) })
    });

    if (res.ok) {
      result.textContent = '✅ تم تحديث الرصيد بنجاح';
      showNotification('تم تحديث الرصيد');
      loadUsers(); // إعادة تحميل الجدول
    } else {
      throw new Error('فشل التحديث');
    }
  } catch (err) {
    result.textContent = '❌ حدث خطأ أثناء التحديث';
    showNotification(err.message, 'error');
  }
});

// 🔄 تغيير حالة المستخدم
document.getElementById('updateStatusBtn').addEventListener('click', async () => {
  const userId = document.getElementById('statusUserId').value.trim();
  const newStatus = document.getElementById('newStatus').value;
  const result = document.getElementById('statusResult');

  if (!userId) {
    showNotification('يرجى إدخال معرف المستخدم', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/users/${userId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });

    if (res.ok) {
      result.textContent = '✅ تم تغيير الحالة بنجاح';
      showNotification('تم تغيير حالة المستخدم');
      loadUsers();
    } else {
      throw new Error('فشل تغيير الحالة');
    }
  } catch (err) {
    result.textContent = '❌ حدث خطأ أثناء تغيير الحالة';
    showNotification(err.message, 'error');
  }
});

// 👥 تحميل قائمة المستخدمين وعرضها في الجدول
async function loadUsers() {
  const tbody = document.querySelector('#usersTable tbody');
  tbody.innerHTML = '';

  try {
    const res = await fetch('/api/users');
    const users = await res.json();

    users.forEach(user => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${user.id}</td>
        <td>${user.username}</td>
        <td>${user.phone}</td>
        <td>${user.balance.toFixed(2)}</td>
        <td>${user.accountStatus}</td>
        <td>${user.loginAttempts}</td>
        <td>${user.lastLogin}</td>
        <td><button class="edit-btn" data-id="${user.id}">✏️</button></td>
        <td><button class="delete-btn" data-id="${user.id}">🗑️</button></td>
        <td><button class="unban-btn" data-id="${user.id}">🔓</button></td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    showNotification('فشل تحميل المستخدمين', 'error');
  }
}

// 🖼️ تحميل حالة الأيقونات
async function loadIcons() {
  const tbody = document.querySelector('#iconsTable tbody');
  tbody.innerHTML = '';

  try {
    const res = await fetch('/api/icons');
    const icons = await res.json();

    icons.forEach(icon => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${icon.url}</td>
        <td>${icon.status}</td>
        <td>${icon.attempts}</td>
        <td>${icon.duration}</td>
        <td><img src="${icon.url}" alt="معاينة"></td>
        <td><button class="retry-icon-btn" data-url="${icon.url}">🔁</button></td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    showNotification('فشل تحميل الأيقونات', 'error');
  }
}

// 🗑️ حذف مستخدم
async function deleteUser(id) {
  if (!confirm('هل أنت متأكد من حذف هذا المستخدم؟')) return;

  try {
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showNotification('تم حذف المستخدم');
      loadUsers();
    } else {
      throw new Error('فشل الحذف');
    }
  } catch (err) {
    showNotification(err.message, 'error');
  }
}

// 🔓 فك الحظر عن مستخدم
async function unbanUser(id) {
  try {
    const res = await fetch(`/api/users/${id}/unban`, { method: 'POST' });
    if (res.ok) {
      showNotification('تم فك الحظر');
      loadUsers();
    } else {
      throw new Error('فشل فك الحظر');
    }
  } catch (err) {
    showNotification(err.message, 'error');
  }
}

// 🔁 إعادة محاولة تحميل أيقونة
async function retryIcon(url) {
  try {
    const res = await fetch('/api/icons/retry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    if (res.ok) {
      showNotification('تمت إعادة المحاولة');
      loadIcons();
    } else {
      throw new Error('فشل إعادة المحاولة');
    }
  } catch (err) {
    showNotification(err.message, 'error');
  }
}

// 🧠 ربط الأحداث بطريقة آمنة (بدون inline handlers)
document.addEventListener('click', (e) => {
  const target = e.target;

  if (target.classList.contains('edit-btn')) {
    const id = target.dataset.id;
    // يمكنك لاحقًا فتح نافذة تعديل أو تعبئة النموذج
    showNotification(`تعديل المستخدم ${id}`);
  }

  if (target.classList.contains('delete-btn')) {
    deleteUser(target.dataset.id);
  }

  if (target.classList.contains('unban-btn')) {
    unbanUser(target.dataset.id);
  }

  if (target.classList.contains('retry-icon-btn')) {
    retryIcon(target.dataset.url);
  }
});

// 🚀 تحميل البيانات عند بدء الصفحة
window.addEventListener('DOMContentLoaded', () => {
  loadUsers();
  loadIcons();
});
