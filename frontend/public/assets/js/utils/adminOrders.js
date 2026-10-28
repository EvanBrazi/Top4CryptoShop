import { OrderClient } from './orderClient.js';
const client = new OrderClient();
const inFlight = new Set();
export async function loadPendingOrders() {
  const container = document.getElementById('admin-notifications');
  if (!container) return;
  const owner = localStorage.getItem('userId');
  try {
    await client.verifyOwner(owner);
    const attempts = client.pendingDecisions(owner);
    const orders = await client.read('/api/orders/admin?limit=100');
    for (const attempt of attempts) if (!orders.some(order => order.orderId === attempt.orderId)) {
      orders.push(await client.read(`/api/orders/admin/${encodeURIComponent(attempt.orderId)}`));
    }
    container.querySelectorAll('.order-box').forEach(node => node.remove());
    for (const order of orders) renderOrder(order, attempts.find(item => item.orderId === order.orderId), owner, container);
  } catch (_) {
    const error = document.getElementById('globalNotification');
    if (error) { error.textContent = 'تعذر تحميل الطلبات. تحقق من الجلسة والقرارات المحفوظة.'; error.style.display = 'block'; }
  }
}
function renderOrder(order, saved, owner, container) {
  const box = document.createElement('div'); box.className = 'order-box visible'; box.dataset.orderId = order.orderId;
  const line = (label, value) => { const p = document.createElement('p'); p.textContent = `${label}: ${value ?? '-'}`; box.appendChild(p); return p; };
  line('الطلب', order.orderId); line('المستخدم', order.userId); line('الخدمة', order.service); line('الكمية', order.quantity); line('المبلغ USD', order.charge); line('الحالة', order.status);
  const target = line('بيانات التسليم', 'مخفية');
  const view = document.createElement('button'); view.textContent = 'عرض بيانات التسليم'; box.appendChild(view);
  view.onclick = async () => {
    view.disabled = true;
    try {
      const { fulfillmentSnapshot: snapshot } = await client.read(`/api/orders/admin/${encodeURIComponent(order.orderId)}/fulfillment`);
      target.textContent = snapshot ? `${snapshot.schema}${snapshot.network ? ` (${snapshot.network})` : ''}: ${snapshot.target[snapshot.schema]}` : 'لا توجد بيانات تسليم مطلوبة';
    } catch (_) { target.textContent = 'تعذر تحميل بيانات التسليم'; }
    finally { view.disabled = false; }
  };
  const reason = document.createElement('input'); reason.type = 'text'; reason.maxLength = 500; reason.placeholder = 'سبب القرار / تأكيد التسليم'; reason.value = saved?.payload.reason || ''; reason.disabled = Boolean(saved); box.appendChild(reason);
  const message = line('نتيجة القرار', saved ? 'قرار محفوظ: أعد نفس الإجراء لمعرفة النتيجة' : 'بانتظار الإجراء');
  const buttons = [];
  for (const [action, title] of [['accept', 'تم التسليم — إكمال'], ['reject', 'إلغاء واسترداد كامل']]) {
    if (saved && saved.action !== action || !saved && order.status !== 'pending') continue;
    const button = document.createElement('button'); button.textContent = saved ? `إعادة محاولة: ${title}` : title; buttons.push(button); box.appendChild(button);
    button.onclick = async () => {
      if (inFlight.has(order.orderId)) return;
      if (!reason.value.trim()) { message.textContent = 'أدخل سبب القرار'; return; }
      inFlight.add(order.orderId); buttons.forEach(b => { b.disabled = true; }); reason.disabled = true;
      try {
        const result = await client.decide(order.orderId, action, reason.value.trim(), owner);
        message.textContent = `النتيجة المؤكدة: ${result.status}`;
        await loadPendingOrders();
      } catch (error) {
        message.textContent = error.message;
        // Preserve and restore the same action after any dispatched failure.
        await loadPendingOrders();
      } finally { inFlight.delete(order.orderId); buttons.forEach(b => { b.disabled = false; }); }
    };
  }
  container.appendChild(box);
}
export function initAdminOrders() {
  const container = document.getElementById('admin-notifications'); if (!container) return;
  const refresh = document.createElement('button'); refresh.textContent = 'تحديث الطلبات (حتى 100 طلب)'; refresh.onclick = loadPendingOrders; container.before(refresh);
  loadPendingOrders();
}
