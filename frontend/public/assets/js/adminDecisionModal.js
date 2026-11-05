import { getErrorMessage } from './utils/errorMessages.js';

export function mountAdminDecisions({ client, adminId, isActive, getOrder = () => null, onSuccess, onUnknown, onAuthFailure, onAlreadyDecided }) {
  const node = name => document.getElementById(`admin-decision-${name}`);
  const dialog = node('dialog'), form = node('form'), reason = node('reason');
  const banner = document.getElementById('admin-decisions-pending'), entries = document.getElementById('admin-decisions-list');
  let selected = null, busy = false, destroyed = false, cooldown = false, timer = null, pending = [];
  const active = () => !destroyed && isActive();
  const listeners = [];
  function listen(target, type, handler) { target.addEventListener(type, handler); listeners.push([target, type, handler]); }
  function sync() {
    if (!active()) return;
    dialog.setAttribute('aria-busy', String(busy));
    reason.disabled = busy;
    node('progress').hidden = !busy;
    node('cancel').disabled = busy;
    node('submit').disabled = busy || cooldown || !selected || (selected.saved && !selected.retrySubmit);
    node('recover').hidden = !selected?.saved;
    node('recover').disabled = busy || cooldown || !!selected?.saved?.corrupt;
    for (const button of entries.querySelectorAll('button')) button.disabled = busy || cooldown || button.dataset.corrupt === 'true';
    for (const button of document.querySelectorAll('[data-admin-decision]')) {
      button.disabled = (busy && button.dataset.adminDecision === selected?.order.orderId) || pending.some(record => record.orderId === button.dataset.adminDecision);
    }
  }
  function refreshPending() {
    if (!active()) return;
    try { pending = client.pendingDecisions(adminId); }
    catch { pending = [{ orderId: '—', corrupt: true }]; }
    if (selected) {
      selected.saved = pending.find(record => record.orderId === selected.order.orderId);
      reason.readOnly = !!selected.saved;
    }
    entries.textContent = '';
    banner.hidden = pending.length === 0;
    for (const record of pending) {
      const item = document.createElement('li'), label = document.createElement('span'), button = document.createElement('button');
      label.textContent = `${record.orderId}${record.corrupt ? ' — سجل محفوظ يحتاج مراجعة مالية' : ''} `;
      label.dir = 'auto';
      button.type = 'button'; button.className = 'admin-button'; button.textContent = 'تحقق من الحالة';
      button.dataset.corrupt = String(!!record.corrupt);
      button.setAttribute('aria-label', `تحقق من الحالة: ${record.orderId}`);
      button.addEventListener('click', () => open({ order: getOrder(record.orderId) || { orderId: record.orderId }, action: record.action, trigger: button }));
      item.appendChild(label); item.appendChild(button); entries.appendChild(item);
    }
    sync();
  }
  function open({ order, action, trigger }) {
    if (!active() || busy) return false;
    refreshPending();
    const saved = pending.find(record => record.orderId === order.orderId);
    if (saved?.corrupt) return false;
    selected = { order, action: saved?.action || action, trigger, saved, retrySubmit: false };
    node('title').textContent = selected.action === 'accept' ? 'قبول الطلب' : 'رفض الطلب';
    node('order-id').textContent = order.orderId;
    node('user-id').textContent = order.userId || '—';
    node('service').textContent = order.service || '—';
    node('amount').textContent = order.amount ? `${order.chargeCurrency} ${order.amount}` : '—';
    node('status').textContent = ({ pending: 'قيد التنفيذ', completed: 'مكتمل', cancelled: 'ملغى' })[order.status] || 'غير متاح';
    reason.value = saved?.payload.reason || ''; reason.readOnly = !!saved;
    reason.setAttribute('aria-invalid', 'false');
    node('error').hidden = true; node('unknown').hidden = !saved;
    sync();
    if (!dialog.open) dialog.showModal();
    reason.focus(); return true;
  }
  function close() { if (!busy && dialog.open) dialog.close(); }
  function closed() {
    const trigger = selected?.trigger;
    selected = null;
    if (active()) {
      const target = trigger?.isConnected ? trigger : entries.querySelector('button') || document.getElementById('admin-tab-orders');
      target.focus();
    }
  }
  function showError(error) {
    node('error').textContent = getErrorMessage(error); node('error').hidden = false;
  }
  async function submit(event, recovery = false) {
    event.preventDefault();
    if (!active() || busy || cooldown || !selected) return;
    const context = selected;
    if (!recovery && context.saved && !context.retrySubmit) return;
    if (!recovery && (!reason.value.trim() || reason.value.trim().length < 10 || reason.value.length > 500 || /[\x00-\x1f\x7f<>&'"`]/.test(reason.value))) {
      showError({ code: 'INVALID_FINANCIAL_REASON' }); reason.setAttribute('aria-invalid', 'true'); reason.focus(); return;
    }
    busy = true; node('error').hidden = true; reason.setAttribute('aria-invalid', 'false'); sync();
    try {
      const receipt = recovery
        ? await client.recoverDecision({ adminId, orderId: context.order.orderId })
        : await client.decide({ orderId: context.order.orderId, action: context.action, reason: reason.value, expectedOwner: adminId });
      if (!active() || selected !== context) return;
      dialog.close();
      onSuccess({ receipt, orderId: context.order.orderId, action: context.action });
    } catch (error) {
      if (!active() || selected !== context) return;
      if (error.state === 'auth' || error.status === 401) { onAuthFailure(error); return; }
      showError(error); context.retrySubmit = false;
      if (error.code === 'ORDER_ALREADY_DECIDED') {
        dialog.close(); onAlreadyDecided({ orderId: context.order.orderId });
      } else {
        try { context.saved = client.pendingDecisions(adminId).find(record => record.orderId === context.order.orderId); }
        catch { context.saved = { corrupt: true }; }
        reason.readOnly = !!context.saved;
        if (error.state === 'unknown') {
          node('unknown').hidden = false; context.retrySubmit = false;
          onUnknown({ orderId: context.order.orderId, code: error.code, status: error.status });
        }
        if (error.status === 429) {
          cooldown = true; context.retrySubmit = !context.saved?.corrupt;
          clearTimeout(timer);
          timer = setTimeout(() => { cooldown = false; sync(); }, 15000);
        }
      }
    } finally {
      busy = false;
      if (active()) { refreshPending(); sync(); }
    }
  }
  listen(form, 'submit', event => submit(event));
  listen(node('recover'), 'click', event => submit(event, true));
  listen(node('cancel'), 'click', close);
  listen(dialog, 'cancel', event => { if (busy) event.preventDefault(); });
  listen(dialog, 'close', closed);
  refreshPending();
  return {
    open, close, refreshPending,
    destroy() {
      destroyed = true; clearTimeout(timer);
      for (const [target, type, handler] of listeners) target.removeEventListener(type, handler);
      if (dialog.open) dialog.close();
      selected = null;
    }
  };
}
