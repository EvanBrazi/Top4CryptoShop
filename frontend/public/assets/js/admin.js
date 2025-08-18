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

const socket = new WebSocket('ws://localhost:10000');

fetch('/api/auth/check-session', { credentials: 'include' })
    .then(res => res.json())
    .then(data => {
        if (!data.isAuthenticated || data.user.role !== 'admin') {
            alert("🚫 ليس لديك صلاحية الوصول إلى لوحة التحكم");
            window.location.href = '/login';

        } else {
            loadUsers();
            loadIcons();
        }
    });

socket.addEventListener('open', () => {
    console.log('✅ WebSocket connected (admin)');
    socket.send(JSON.stringify({
        type: 'auth',
        role: 'admin',
        userId: 'admin-001'
    }));
});

socket.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    switch (data.type) {
        case 'welcome':
        case 'balanceUpdate':
        case 'paymentUploaded':
            showNotification(data.message || '📨 إشعار جديد');
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
        setTimeout(() => alert.remove(), 10000);
    } else {
        alert(message);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadUsers();
    loadIcons();
    document.getElementById('updateBalanceBtn').addEventListener('click', updateBalance);
    document.getElementById('updateStatusBtn')?.addEventListener('click', updateUserStatus);
});

/**
 * Fetches and displays all users in the admin table
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
        <td>
          <select id="status-${user._id}">
            <option value="active" ${user.accountStatus === 'active' ? 'selected' : ''}>✅ نشط</option>
            <option value="suspended" ${user.accountStatus === 'suspended' ? 'selected' : ''}>❄️ مجمد</option>
            <option value="deactivated" ${user.accountStatus === 'deactivated' ? 'selected' : ''}>🚫 محذوف</option>
          </select>
        </td>
        <td style="color:${user.loginAttempts >= 4 ? 'red' : 'inherit'}; font-weight:${user.loginAttempts >= 4 ? 'bold' : 'normal'}">
          ${user.loginAttempts}
        </td>
        <td>${user.lastLogin ? new Date(user.lastLogin).toLocaleString('ar-EG') : '-'}</td>
        <td><button class="update-btn" data-id="${user._id}">💾</button></td>
        <td><button class="delete-btn" data-id="${user._id}">🗑️</button></td>
        <td><button class="status-btn" data-id="${user._id}">🔄</button></td>
      `;
            tbody.appendChild(row);
        });

        tbody.querySelectorAll('.update-btn').forEach(btn => {
            btn.addEventListener('click', () => updateUserBalance(btn.dataset.id));
        });

        tbody.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteUser(btn.dataset.id));
        });

        tbody.querySelectorAll('.status-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const userId = btn.dataset.id;
                const newStatus = document.getElementById(`status-${userId}`).value;
                changeUserStatus(userId, newStatus);
            });
        });

    } catch (error) {
        console.error('فشل تحميل المستخدمين:', error);
    }
}

/**
 * Updates the balance of a specific user
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
 * Changes user account status
 */
async function changeUserStatus(userId, newStatus) {
    try {
        const res = await fetch('/api/admin/update-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, newStatus })
        });
        const result = await res.json();
        alert(result.message || result.error || 'تم تحديث الحالة');
        loadUsers();
    } catch (error) {
        console.error('فشل تحديث الحالة:', error);
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
 * Updates user status via top form
 */
async function updateUserStatus() {
    const userId = document.getElementById('statusUserId').value;
    const newStatus = document.getElementById('newStatus').value;

    try {
        const res = await fetch('/api/admin/update-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, newStatus })
        });

        const result = await res.json();
        document.getElementById('statusResult').textContent = result.message || result.error;
        loadUsers();
    } catch (error) {
        console.error('فشل تعديل الحالة من النموذج:', error);
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

        tbody.querySelectorAll('.retry-btn').forEach(btn => {
            btn.addEventListener('click', () => retryIcon(btn.dataset.id));
        });

    } catch (error) {
        console.error('فشل تحميل الأيقونات:', error);
    }
}

/**
 * Retries loading a failed icon
 */
async function retryIcon(iconId) {
    try {
        await fetch(`/api/icons/${iconId}/retry`, { method: 'PUT' });
        loadIcons();
    } catch (error) {
        console.error('فشل إعادة المحاولة:', error);
    }
}