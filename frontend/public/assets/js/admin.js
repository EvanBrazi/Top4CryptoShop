/**
 * @file admin-panel.js
 * @description لوحة تحكم الأدمن: إدارة المستخدمين والدفعات وتحديث الرصيد والحالة
 * @version 2.1.0
 * @author Evan Brazi
 * @lastModified 2025-08-29
 */
import { STORAGE_KEYS } from "./utils/appUtils.js";

// ✅ تهيئة WebSocket لاستقبال إشعارات لحظية من السيرفر
const protocol = window.location.protocol === "https:" ? "wss" : "ws";
const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);

socket.onopen = () => {
  const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
  if (userId) {
    socket.send(JSON.stringify({ type: 'auth', role: 'admin', userId }));
    updateConnectionStatus(true);
  }
};

socket.onclose = () => updateConnectionStatus(false);

socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'newPayment') {
    renderPaymentNotification(data);
  }
};

/**
 * ✅ عرض حالة الاتصال في شريط الحالة
 */
function updateConnectionStatus(connected) {
  const statusBar = document.getElementById('connectionStatus');
  if (statusBar) {
    statusBar.textContent = connected ? '🟢 متصل' : '🔴 غير متصل';
    statusBar.style.color = connected ? 'green' : 'red';
  }
}

/**
 * ✅ عرض إشعار عام في أعلى الصفحة
 */
function showNotification(message, type = 'success') {
  const bar = document.getElementById('globalNotification');
  bar.textContent = message;
  bar.style.backgroundColor = type === 'error' ? '#e74c3c' : '#27ae60';
  bar.style.display = 'block';
  setTimeout(() => bar.style.display = 'none', 3000);
}

/**
 * ✅ تحميل المستخدمين من السيرفر وعرضهم في الجدول
 */
async function loadUsers() {
  console.log('loadUsers ...');
  const tbody = document.querySelector('#usersTable tbody');
  tbody.innerHTML = '<tr><td colspan="10">⏳ جاري تحميل المستخدمين...</td></tr>';

  try {
    const res = await fetch('/api/users');
    if (!res.ok) throw new Error('فشل في جلب المستخدمين');

    const users = await res.json(); // ← مباشرة بدون json.users

    tbody.innerHTML = ''; // تفريغ الجدول بعد التحميل

    users.forEach(user => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${user._id}</td>
        <td>${user.username}</td>
        <td>${user.phone || '-'}</td>
        <td>${parseFloat(user.balance).toFixed(2)}</td>
        <td>${user.accountStatus === 'active' ? '🟢 نشط' : '🔴 محظور'}</td>
        <td>${user.loginAttempts || 0}</td>
        <td>${user.lastLogin ? new Date(user.lastLogin).toLocaleString('ar-EG') : '-'}</td>
        <td><button class="edit-btn" data-id="${user._id}">✏️</button></td>
        <td><button class="delete-btn" data-id="${user._id}">🗑️</button></td>
        <td><button class="unban-btn" data-id="${user._id}">🔓</button></td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="10">❌ فشل تحميل المستخدمين</td></tr>';
    showNotification(err.message, 'error');
  }
}

/**
 * ✅ تحميل الدفعات المعلقة من السيرفر وعرضها في تبويب الأدمن
 */
async function loadPendingPayments() {
  const container = document.getElementById('admin-notifications');
  container.innerHTML = '';

  try {
    const res = await fetch('/api/payments/admin');
    const payments = await res.json();

    payments.forEach(data => renderPaymentNotification(data));
  } catch (err) {
    showNotification('فشل تحميل الدفعات المعلقة', 'error');
  }
}

function getReceiptImageUrl(filename) {
  console.log('📷 مسار الصورة:', filename);
  if (!filename || typeof filename !== 'string') return '/assets/images/loading.png';
  else if (filename.startsWith('/images/payments/')) return filename
  else return `/images/payments/${filename}`;
}

/**
 * ✅ عرض دفعة جديدة في واجهة الأدمن
 */
function renderPaymentNotification(data) {
  const container = document.getElementById('admin-notifications'); // ✅ بدل admin-notes
  if (container.querySelector(`[data-id="${data.paymentId}"]`)) return;

  const box = document.createElement('div');
  box.className = 'note-box';
  box.innerHTML = `
    <h4>دفعة جديدة من المستخدم ${data.userId}</h4>
    <p><strong>الطريقة:</strong> ${data.method}</p>
    <p><strong>المبلغ:</strong> ${data.amount} 💵</p>
    ${data.note ? `<p><strong>ملاحظة:</strong> ${data.note}</p>` : ''}
    <img src="${getReceiptImageUrl(data.receiptImage)}" style="max-width:100%; margin-top:10px;" />
    <div class="payment-actions">
      <button class="accept-btn" data-id="${data.paymentId}">✅ قبول</button>
      <button class="reject-btn" data-id="${data.paymentId}">❌ رفض</button>
    </div>
  `;
  if (data.status === 'accepted' || data.status === 'rejected') {
    showNotification(`✅ تم ${data.status === 'accepted' ? 'قبول' : 'رفض'} الدفعة`);
    box.closest('.note-box').remove(); // ← حذف العنصر من الواجهة
  }
  container.appendChild(box);
}

/**
 * ✅ تعديل رصيد مستخدم معين
 */
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
      loadUsers();
    } else {
      throw new Error('فشل التحديث');
    }
  } catch (err) {
    result.textContent = '❌ حدث خطأ أثناء التحديث';
    showNotification(err.message, 'error');
  }
});

/**
 * ✅ تغيير حالة مستخدم معين
 */
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

/**
 * ✅ حذف مستخدم
 */
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

/**
 * ✅ فك الحظر عن مستخدم
 */
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

/**
 * ✅ ربط الأحداث الديناميكية مثل قبول ورفض الدفعات وحذف المستخدم
 */
document.addEventListener('click', (e) => {
  const target = e.target;

  // ✅ تحديد العنصر الذي يحتوي على الزر
  const noteBox = target.closest('.note-box');

  if (target.classList.contains('accept-btn')) {
    const paymentId = target.dataset.id;

    // ✅ منع التفاعل المكرر
    target.disabled = true;

    fetch(`/api/payments/${paymentId}/accept`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' }
    })
      .then(res => res.json())
      .then(data => {
        if (data.status === 'accepted') {
          showNotification('✅ تم قبول الدفعة');
        } else {
          showNotification('⚠️ لم يتم قبول الدفعة');
        }
      })
      .catch(() => showNotification('❌ فشل في قبول الدفعة', 'error'))
      .finally(() => {
        if (noteBox) noteBox.remove(); // ✅ إزالة العنصر من الواجهة
      });
  }

  if (target.classList.contains('reject-btn')) {
    const paymentId = target.dataset.id;

    // ✅ منع التفاعل المكرر
    target.disabled = true;

    fetch(`/api/payments/${paymentId}/reject`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' }
    })
      .then(res => res.json())
      .then(data => {
        if (data.status === 'rejected') {
          showNotification('❌ تم رفض الدفعة');
        } else {
          showNotification('⚠️ لم يتم رفض الدفعة');
        }
      })
      .catch(() => showNotification('❌ فشل في رفض الدفعة', 'error'))
      .finally(() => {
        if (noteBox) noteBox.remove(); // ✅ إزالة العنصر من الواجهة
      });
  }

  if (target.classList.contains('delete-btn')) {
    deleteUser(target.dataset.id);
  }

  if (target.classList.contains('unban-btn')) {
    unbanUser(target.dataset.id);
  }

  if (target.classList.contains('edit-btn')) {
    const userId = target.dataset.id;
    showNotification(`🔧 تعديل المستخدم ${userId}`);
    // يمكنك لاحقًا فتح نافذة تعديل أو تعبئة نموذج
  }
});

/**
 * ✅ بدء التهيئة عند تحميل الصفحة
 */
window.addEventListener('DOMContentLoaded', () => {
  loadUsers();              // تحميل المستخدمين
  loadPendingPayments();    // تحميل الدفعات المعلقة
});
