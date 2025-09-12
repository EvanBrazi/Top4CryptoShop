/**
 * @file admin-panel.js
 * @description لوحة تحكم الأدمن: إدارة المستخدمين والدفعات وتحديث الرصيد والحالة
 * @version 2.1.0
 * @author Evan Brazi
 * @lastModified 2025-08-29
 */
import { STORAGE_KEYS } from "./utils/appUtils.js";

function initAdminWebSocket() {
  console.log('initAdminWebSocket');
  try {
    // ✅ تهيئة WebSocket لاستقبال إشعارات لحظية من السيرفر
    const adminSocket = new WebSocket('ws://localhost:10000');
    adminSocket.addEventListener('message', (event) => {
      console.log('📡 رسالة WebSocket وصلت:', event.data);
    });
    adminSocket.onopen = () => {
      const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
      if (userId) {
        adminSocket.send(JSON.stringify({ type: 'auth', role: 'admin', userId }));
        updateConnectionStatus(true);
      }
    };
    adminSocket.onclose = () => {
      updateConnectionStatus(false);
      setTimeout(initAdminWebSocket, 5000);
    };
    adminSocket.onerror = (error) => {
      console.error('WebSocket error:', error);
      updateConnectionStatus(false);
    };
    adminSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('إشعار WebSocket للأدمن : ', data);
        if (data.type === 'newOrder') {
          renderOrderNotification(data);
        } else if (data.type === 'newPayment') {
          renderPaymentNotification(data);
        } else if (data.type === 'backupStatus') {
          // ✅ إشعار النسخ الاحتياطي
          showNotification(data.message, data.status);
          renderBackupNotification(data); // يمكنك إنشاء هذه الدالة لعرضه في جدول أو سجل
        } else {
          console.warn('⚠️ إشعار غير معروف من WebSocket!');
        }
      } catch (error) {
        console.error('❌ خطأ أثناء معالجة رسالة WebSocket:', error);
      }
    };
  } catch (error) {
    console.error('WebSocket initial failed!', error);
  }
}

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
  if (!filename || typeof filename !== 'string') return '/assets/images/loading.gif';
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
    <p><strong>المبلغ:</strong> ${data.amountInUSD} 💵</p>
    ${data.note ? `<p><strong>ملاحظة:</strong> ${data.note}</p>` : ''}
    <img src="${data.receiptImage}" style="max-width:100%; margin-top:10px;" />
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
 * عرض إشعار طلب جديد في واجهة الأدمن
 * @param {Object} data - بيانات الطلب
 * @param {string} data.orderId - معرف الطلب
 * @param {string} data.userId - معرف المستخدم
 * @param {string} data.playerId - معرف اللاعب
 * @param {number} data.amount - المبلغ
 * @param {string} data.method - طريقة الدفع
 * @param {string} data.service - الخدمة المطلوبة
 * @param {string} data.status - حالة الطلب (اختياري)
 * @param {string} data.createdAt - تاريخ الإنشاء (اختياري)
 */
function renderOrderNotification(data) {
  console.log('📥 تنفيذ renderOrderNotification:', data);
  const container = document.getElementById('admin-notifications');
  // التحقق من وجود الحاوية
  if (!container) {
    console.error('❌ عنصر admin-notifications غير موجود في DOM');
    return;
  }

  // التحقق من عدم وجود الإشعار مسبقاً
  if (container.querySelector(`[data-order-id="${data.orderId}"]`)) {
    console.log('⚠️ تم عرض هذا الطلب مسبقاً');
    return;
  }

  // إنصراف العنصر
  const orderBox = document.createElement('div');
  orderBox.className = 'order-box';
  orderBox.dataset.orderId = data.orderId;

  // تنسيق التاريخ
  const orderDate = data.createdAt ? new Date(data.createdAt).toLocaleString('ar-EG') : new Date().toLocaleString('ar-EG');

  // إنشاء محتوى الإشعار
  orderBox.innerHTML = `
    <div class="order-header">
      <h4>طلب جديد #${data.orderId}</h4>
      <span class="order-time">${orderDate}</span>
    </div>
    <div class="order-details">
      <p><strong>المستخدم:</strong> ${data.userId}</p>
      <p><strong>اللاعب:</strong> ${data.playerId}</p>
      <p><strong>الخدمة:</strong> ${data.service}</p>
      <p><strong>المبلغ:</strong> ${data.amount} $</p>
      <p><strong>الطريقة:</strong> ${data.method}</p>
    </div>
    <div class="order-actions">
      <button class="accept-order-btn" data-order-id="${data.orderId}">✅ قبول</button>
      <button class="reject-order-btn" data-order-id="${data.orderId}">❌ رفض</button>
    </div>
  `;

  // إضافة الإشعار إلى الحاوية
  container.appendChild(orderBox);

  // إضافة تأثير ظهور
  setTimeout(() => {
    orderBox.classList.add('visible');
  }, 10);

  // إضافة مستمعي الأحداث للأزرار
  const acceptBtn = orderBox.querySelector('.accept-order-btn');
  const rejectBtn = orderBox.querySelector('.reject-order-btn');

  acceptBtn.addEventListener('click', () => handleOrderAction(data.orderId, 'accept'));
  rejectBtn.addEventListener('click', () => handleOrderAction(data.orderId, 'reject'));

  console.log(`✅ تم عرض إشعار الطلب: ${data.orderId}`);
}

/**
 * 
 * @param {*} data 
 * @returns 
 */
function renderBackupNotification(data) {
  const container = document.getElementById('backupNotifications');
  if (!container) return;

  const entry = document.createElement('div');
  entry.className = 'backup-entry';
  entry.innerHTML = `
    <strong>${data.source}</strong> - 
    <span style="color:${data.status === 'success' ? 'green' : 'red'}">${data.message}</span> 
    <small>${new Date(data.timestamp).toLocaleString()}</small>
  `;
  container.prepend(entry);
}

/**
 * 🔄 معالجة قبول أو رفض الطلب من لوحة التحكم
 * @param {string} orderId - معرف الطلب
 * @param {'accept'|'reject'} action - الإجراء المطلوب
 * @returns {Promise<void>}
 */
async function handleOrderAction(orderId, action) {
  try {
    const response = await fetch(`/api/orders/${orderId}/${action}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem(STORAGE_KEYS.USER_TOKEN)}`
      }
    });

    if (response.ok) {
      const result = await response.json();

      // تحديث واجهة المستخدم
      const orderBox = document.querySelector(`[data-order-id="${orderId}"]`);
      if (orderBox) {
        orderBox.classList.add(action === 'accept' ? 'accepted' : 'rejected');

        // إخفاء أزرار القبول/الرفض
        const actionsDiv = orderBox.querySelector('.order-actions');
        if (actionsDiv) {
          actionsDiv.innerHTML = action === 'accept'
            ? '<span class="status-badge accepted">تم القبول</span>'
            : '<span class="status-badge rejected">تم الرفض</span>';
        }

        // إخفاء العنصر بعد فترة
        setTimeout(() => {
          orderBox.style.opacity = '0';
          setTimeout(() => orderBox.remove(), 500);
        }, 3000);
      }

      console.log(`✅ تم ${action === 'accept' ? 'قبول' : 'رفض'} الطلب: ${orderId}`);
    } else {
      throw new Error(`فشل في ${action === 'accept' ? 'قبول' : 'رفض'} الطلب`);
    }
  } catch (error) {
    console.error(`❌ خطأ في معالجة الطلب:`, error);
    alert(`❌ حدث خطأ أثناء معالجة الطلب: ${error.message}`);
  }
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

function sendTestNotification() {
  const type = document.getElementById('notification-type').value;
  const userId = document.getElementById('target-user-id').value;

  const payload = {
    status: type.includes('Accepted') ? 'accepted' : 'rejected',
    amount: 100,
    service: 'اختبار',
    paymentId: 'test-pay-id',
    orderId: 'test-order-id'
  };

  fetch('/dev/simulate-notification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type,
      payload,
      targetRole: 'user',
      targetUserId: userId
    })
  })
    .then(res => res.json())
    .then(data => {
      alert(data.message);
    })
    .catch(err => {
      alert('❌ فشل إرسال الإشعار التجريبي');
      console.error(err);
    });
}

/**
 * ✅ بدء التهيئة عند تحميل الصفحة
 */
window.addEventListener('DOMContentLoaded', () => {
  initAdminWebSocket();
  loadUsers();              // تحميل المستخدمين
  loadPendingPayments();    // تحميل الدفعات المعلقة
  document.getElementById('test-button').addEventListener('click', sendTestNotification);
});
