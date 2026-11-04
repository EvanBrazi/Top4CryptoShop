import { PAYMENT_METHODS, validatePayment, PaymentSubmissionClient } from './utils/paymentSubmissionClient.js';
import { getErrorMessage } from './utils/errorMessages.js';

export function mountTopup(ownerId, { onCommitted, isActive = () => true }) {
  const byId = name => document.getElementById(`account-topup-${name}`);
  const form = byId('form'), method = byId('method'), amount = byId('amount');
  const note = byId('note'), receipt = byId('receipt'), submit = byId('submit');
  const message = byId('message'), recovery = byId('recovery'), check = byId('check');
  let alive = true, busy = false, records = [], storageBlocked = false;
  const active = () => alive && isActive();
  const client = new PaymentSubmissionClient(ownerId, { active });
  const handlers = [];
  const listen = (node, type, fn) => { node.addEventListener(type, fn); handlers.push([node, type, fn]); };
  const fields = () => ({ method: method.value, amount: amount.value, note: note.value, file: receipt.files?.[0] });
  function say(code, error = true) {
    message.dataset.kind = error ? 'error' : 'status';
    message.textContent = getErrorMessage(code);
  }
  function redirect(error) {
    if (error?.status !== 401 && error?.code !== 'UNAUTHENTICATED') return false;
    alive = false;
    window.location.replace('/login.html');
    return true;
  }
  function refresh(showErrors = false) {
    if (!active()) return;
    storageBlocked = false;
    try { records = client.pending(); }
    catch { records = []; storageBlocked = true; say('INVALID_RESPONSE'); }
    const config = PAYMENT_METHODS[method.value];
    byId('limits').textContent = config ? `العملة: ${config.currency} — الحد الأدنى: ${config.min} — الحد الأقصى: ${config.max}` : 'اختر وسيلة الدفع لعرض العملة والحدود';
    if (config) {
      amount.setAttribute('min', String(config.min));
      amount.setAttribute('max', String(config.max));
    }
    const blocked = busy || records.length > 0 || storageBlocked;
    for (const node of [method, amount, note, receipt]) node.disabled = blocked;
    recovery.hidden = !records.length && !storageBlocked;
    check.disabled = busy || !records.some(record => record.submissionId);
    const invalid = validatePayment(fields());
    submit.disabled = blocked || Boolean(invalid);
    if (showErrors && !blocked) {
      if (invalid) say(invalid);
      else message.textContent = '';
    }
  }
  function clearForm() {
    for (const node of [method, amount, note, receipt]) node.value = '';
  }
  for (const [name, config] of Object.entries(PAYMENT_METHODS)) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = `${name} — ${config.currency}`;
    method.appendChild(option);
  }
  listen(form, 'input', () => refresh(true));
  listen(method, 'change', () => refresh(true));
  listen(receipt, 'change', () => refresh(true));
  listen(form, 'submit', async event => {
    event.preventDefault();
    if (!active() || busy || records.length || storageBlocked) return;
    const data = fields(), invalid = validatePayment(data);
    if (invalid) { say(invalid); return; }
    busy = true;
    refresh();
    try {
      const result = await client.submit(data);
      if (!active() || redirect(result)) return;
      if (result.state === 'committed') {
        clearForm();
        say('submission_acknowledged', false);
        await onCommitted(); // Refresh page 1; never fabricate a row or credit balance.
      } else say(result.code);
    } catch (error) {
      if (active() && !redirect(error)) say(error?.code || 'INVALID_RESPONSE');
    } finally { busy = false; refresh(); }
  });
  listen(check, 'click', async () => {
    if (!active() || busy) return;
    const record = records.find(item => item.submissionId);
    if (!record) return;
    busy = true;
    refresh();
    try {
      const result = await client.recover(record);
      if (!active() || redirect(result)) return;
      if (result.state === 'committed') {
        clearForm();
        say('submission_recovered', false);
        await onCommitted(result.payment);
      } else say('unresolved_submission', false);
    } catch (error) {
      if (active() && !redirect(error)) say(error?.code || 'INVALID_RESPONSE');
    } finally { busy = false; refresh(); }
  });
  refresh(); // Scan only this authenticated owner's records; no recovery request on load.
  return { refresh, destroy() {
    alive = false;
    for (const [node, type, fn] of handlers) node.removeEventListener(type, fn);
  } };
}
