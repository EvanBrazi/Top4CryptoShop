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

const socket = new WebSocket('ws://localhost:3000');

fetch('/api/auth/check-session')
    .then(res => res.json())
    .then(data => {
        if (data.role !== 'admin') {
            window.location.href = '/login';
        } else {
            // تابع تحميل البيانات
            loadUsers();
            loadIcons();
        }
    });


socket.addEventListener('open', () => {
    console.log('✅ WebSocket connected (admin)');

    // تعريف الأدمن عند الاتصال
    socket.send(JSON.stringify({
        type: 'auth',
        role: 'admin',
        userId: 'admin-001' // يمكن تغييره حسب النظام
    }));
});

socket.addEventListener('message', event => {
    const data = JSON.parse(event.data);

    switch (data.type) {
        case 'welcome':
            showNotification(data.message);
            break;

        case 'balanceUpdate':
            showNotification(`📢 تم تعديل رصيد المستخدم رقم ${data.userId} إلى ${data.newBalance} 💰`);
            break;

        case 'paymentUploaded':
            showNotification(`🧾 تم رفع صورة دفع جديدة من المستخدم رقم ${data.userId}`);
            break;

        default:
            console.log('📨 إشعار غير معروف:', data);
    }
});

function showNotification(message) {
    const container = document.getElementById('admin-notifications');
    if (container) {
        const alert = document.createElement('div');
        alert.className = 'alert alert-info';
        alert.textContent = message;
        container.prepend(alert);
        setTimeout(() => alert.remove(), 10000); // يختفي بعد 10 ثوانٍ
    } else {
        alert(message);
    }
}


document.addEventListener('DOMContentLoaded', () => {
    loadUsers();
    loadIcons();

    // زر تعديل الرصيد من النموذج العلوي
    document.getElementById('updateBalanceBtn').addEventListener('click', updateBalance);
});

/**
 * Fetches and displays all users in the admin table
 * Uses safe event binding to comply with CSP
 */
async function loadUsers() {
    try {
        const res = await fetch('/api/users');
        const users = await res.json();
        const tbody = document.querySelector('#usersTable tbody');
        tbody.innerHTML = '';

        users.forEach(user => {
            const row = document.createElement('tr');
            row.innerHTML = `
        <td>${user._id}</td>
        <td>${user.username}</td>
        <td><input type="number" value="${user.balance}" id="balance-${user._id}"></td>
        <td>${user.accountStatus === 'active' ? '✅ نشط' : user.accountStatus === 'suspended' ? '❄️ مجمد' : '🚫 معطل'}</td>
        <td>${user.loginAttempts}</td>
        <td>${user.lastLogin ? new Date(user.lastLogin).toLocaleString('ar-EG') : '-'}</td>
        <td><button class="update-btn" data-id="${user._id}">💾</button></td>
        <td><button class="delete-btn" data-id="${user._id}">🗑️</button></td>
        <td>${user.accountStatus === 'suspended' ? `<button class="activate-btn" data-id="${user._id}">🔓 تفعيل</button>` : '-'}</td>
      `;
            tbody.appendChild(row);
        });

        // ربط الأحداث بطريقة آمنة بعد إنشاء العناصر
        tbody.querySelectorAll('.update-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const userId = btn.dataset.id;
                updateUserBalance(userId);
            });
        });

        tbody.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const userId = btn.dataset.id;
                deleteUser(userId);
            });
        });

        tbody.querySelectorAll('.activate-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const userId = btn.dataset.id;
                activateUser(userId);
            });
        });

    } catch (error) {
        console.error('فشل تحميل المستخدمين:', error);
    }
}

/**
 * Updates the balance of a specific user
 * @param {string} userId - معرف المستخدم
 */
async function updateUserBalance(userId) {
    const balance = document.getElementById(`balance-${userId}`).value;
    try {
        const res = await fetch(`/api/users/${userId}/balance`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ balance })
        });
        const result = await res.json();
        alert(result.message || 'تم التعديل بنجاح');
        loadUsers();
    } catch (error) {
        console.error('فشل تعديل الرصيد:', error);
    }
}

/**
 * Deletes a user from the system
 * @param {string} userId - معرف المستخدم
 */
async function deleteUser(userId) {
    try {
        await fetch(`/api/users/${userId}`, { method: 'DELETE' });
        loadUsers();
    } catch (error) {
        console.error('فشل حذف المستخدم:', error);
    }
}

/**
 * Activates a suspended user account
 * @param {string} userId - معرف المستخدم
 */
async function activateUser(userId) {
    try {
        await fetch(`/api/users/${userId}/activate`, { method: 'PUT' });
        alert('تم تفعيل الحساب بنجاح');
        loadUsers();
    } catch (error) {
        console.error('فشل تفعيل الحساب:', error);
    }
}

/**
 * Updates user balance via top form
 */
async function updateBalance() {
    const userId = document.getElementById('userId').value;
    const newBalance = document.getElementById('newBalance').value;

    try {
        const res = await fetch(`/api/users/${userId}/balance`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ balance: newBalance })
        });

        const result = await res.json();
        alert(result.message || 'تم التعديل بنجاح');
        loadUsers();
    } catch (error) {
        console.error('فشل تعديل الرصيد من النموذج:', error);
    }
}

/**
 * Fetches and displays icon data in the admin table
 */
async function loadIcons() {
    try {
        const res = await fetch('/api/icons');
        const icons = await res.json();
        const tbody = document.querySelector('#iconsTable tbody');
        tbody.innerHTML = '';

        icons.forEach(icon => {
            const row = document.createElement('tr');
            row.innerHTML = `
        <td>${icon.url}</td>
        <td style="color:${icon.status === 'success' ? 'green' : 'red'}">${icon.status}</td>
        <td>${icon.attempts}</td>
        <td>${icon.duration || '-'}</td>
        <td><img src="${icon.preview}" onerror="this.src='/icons/apps/default.png'"></td>
        <td><button class="retry-btn" data-id="${icon._id}">🔄</button></td>
      `;
            tbody.appendChild(row);
        });

        // ربط زر إعادة المحاولة بطريقة آمنة
        tbody.querySelectorAll('.retry-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const iconId = btn.dataset.id;
                retryIcon(iconId);
            });
        });

    } catch (error) {
        console.error('فشل تحميل الأيقونات:', error);
    }
}

/**
 * Retries loading a failed icon
 * @param {string} iconId - معرف الأيقونة
 */
async function retryIcon(iconId) {
    try {
        await fetch(`/api/icons/${iconId}/retry`, { method: 'PUT' });
        loadIcons();
    } catch (error) {
        console.error('فشل إعادة المحاولة:', error);
    }
}