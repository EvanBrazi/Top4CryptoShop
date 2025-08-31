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
 * معالجة قبول أو رفض الطلب
 * @param {string} orderId - معرف الطلب
 * @param {string} action - الإجراء (accept/reject)
 */
async function handleOrderAction(orderId, action) {
  try {
    const response = await fetch(`/api/orders/${orderId}/${action}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('user_token')}`
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
.order-box {
  background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
  border: 1px solid #dee2e6;
  border-radius: 10px;
  padding: 15px;
  margin-bottom: 15px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  opacity: 0;
  transform: translateY(10px);
}

.order-box.visible {
  opacity: 1;
  transform: translateY(0);
}

.order-box.accepted {
  border-left: 4px solid #28a745;
  background: linear-gradient(135deg, #f0fff4 0%, #e6f7e9 100%);
}

.order-box.rejected {
  border-left: 4px solid #dc3545;
  background: linear-gradient(135deg, #fff5f5 0%, #ffe6e6 100%);
}

.order-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid #dee2e6;
}

.order-header h4 {
  margin: 0;
  color: #2c3e50;
  font-size: 16px;
}

.order-time {
  font-size: 12px;
  color: #6c757d;
}

.order-details {
  margin-bottom: 15px;
}

.order-details p {
  margin: 5px 0;
  font-size: 14px;
}

.order-actions {
  display: flex;
  gap: 10px;
}

.accept-order-btn, .reject-order-btn {
  padding: 8px 15px;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s ease;
}

.accept-order-btn {
  background-color: #28a745;
  color: white;
}

.accept-order-btn:hover {
  background-color: #218838;
}

.reject-order-btn {
  background-color: #dc3545;
  color: white;
}

.reject-order-btn:hover {
  background-color: #c82333;
}

.status-badge {
  padding: 5px 10px;
  border-radius: 15px;
  font-size: 12px;
  font-weight: bold;
}

.status-badge.accepted {
  background-color: #d4edda;
  color: #155724;
}

.status-badge.rejected {
  background-color: #f8d7da;
  color: #721c24;
}
// في الخادم (orders.js)
notifyAdmins({
  type: 'newOrder',
  orderId: order.orderId,
  userId: order.userId,
  playerId: order.playerId,
  amount: order.amount,
  method: order.method,
  service: order.service,
  createdAt: order.createdAt
});
