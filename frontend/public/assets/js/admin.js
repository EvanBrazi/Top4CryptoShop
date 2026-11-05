import { fetchCurrentAdmin, fetchOrdersPage, fetchPaymentsPage, fetchUsersPage, normalizeOrder, normalizePayment, normalizeUser } from './utils/adminData.js';
import { logout } from './auth.js';
import { logVersionBanner } from './utils/version.js';
logVersionBanner();

const byId = id => document.getElementById(`admin-${id}`);
const tabs = [...document.querySelectorAll('[data-admin-tab]')];
const panels = [...document.querySelectorAll('.admin-panel')];
const lists = {
  orders: { fetchPage: fetchOrdersPage, normalize: normalizeOrder, empty: 'لا توجد طلبات معلقة', copy: 'نسخ رقم الطلب' },
  payments: { fetchPage: fetchPaymentsPage, normalize: normalizePayment, empty: 'لا توجد مدفوعات معلقة', copy: 'نسخ رقم الدفعة' },
  users: { fetchPage: fetchUsersPage, normalize: normalizeUser, empty: 'لا يوجد مستخدمون', copy: 'نسخ معرف المستخدم' }
};
for (const state of Object.values(lists)) Object.assign(state, { loaded: false, loading: false, nextBefore: null });
let initializing = false, blocked = false;

function deny(error) {
  if (!['UNAUTHENTICATED', 'FORBIDDEN'].includes(error?.code)) return false;
  blocked = true;
  byId('shell').hidden = true;
  byId('gate-retry').hidden = true;
  document.querySelector('.admin-gate').hidden = false;
  byId('gate-state').textContent = 'غير مسموح. هذه الصفحة مخصصة للإدارة فقط.';
  byId('username').textContent = '';
  byId('role').textContent = '';
  byId('copy-box').hidden = true;
  byId('copy-fallback').value = '';
  byId('message').textContent = '';
  for (const name of Object.keys(lists)) byId(`${name}-body`).textContent = '';
  if (error.code === 'UNAUTHENTICATED') window.location.replace('/login.html');
  return true;
}
function errorMessage(error) {
  return error?.code === 'CONTRACT_ERROR'
    ? 'خطأ في عقد الاستجابة. يرجى إعادة المحاولة.'
    : 'تعذر تحميل البيانات. يرجى إعادة المحاولة.';
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function selectTab(name) {
  if (blocked) return;
  for (const tab of tabs) tab.setAttribute('aria-pressed', String(tab.dataset.adminTab === name));
  for (const panel of panels) panel.hidden = panel.id !== `admin-panel-${name}`;
  const state = lists[name];
  if (state && !state.loaded && !state.loading) void loadPage(name, true);
}

async function initialize() {
  if (initializing || blocked) return;
  initializing = true;
  byId('gate-retry').hidden = true;
  byId('gate-state').textContent = 'جارٍ التحقق من صلاحيات الإدارة…';
  try {
    const account = await fetchCurrentAdmin();
    if (blocked) return;
    if (account?.role !== 'admin') throw Object.assign(new Error('FORBIDDEN'), { code: 'FORBIDDEN' });
    byId('username').textContent = account.username;
    byId('role').textContent = 'Admin';
    document.querySelector('.admin-gate').hidden = true;
    byId('shell').hidden = false;
    selectTab('orders');
  } catch (error) {
    if (deny(error)) return;
    byId('gate-state').textContent = errorMessage(error);
    byId('gate-retry').hidden = false;
  } finally { initializing = false; }
}

async function copyId(id, button) {
  if (blocked || button.disabled) return;
  button.disabled = true;
  byId('copy-box').hidden = true;
  byId('copy-fallback').hidden = true;
  byId('message').textContent = '';
  byId('message').dataset.kind = '';
  try {
    await navigator.clipboard.writeText(id);
    if (!blocked) byId('message').textContent = '✓ Copied';
  } catch {
    if (blocked) return;
    const input = byId('copy-fallback');
    input.value = id;
    byId('copy-box').hidden = false;
    input.hidden = false;
    input.focus();
    input.select();
    byId('message').textContent = 'Press Ctrl+C to copy';
  } finally { button.disabled = false; }
}
function appendRows(name, items) {
  for (const item of items) {
    const row = lists[name].normalize(item), tr = element('tr');
    row.cells.forEach((value, index) => tr.appendChild(element('td', row.ltr.includes(index) ? 'admin-ltr' : '', value)));
    const cell = element('td'), copy = element('button', 'admin-button', lists[name].copy);
    copy.type = 'button';
    copy.dataset.adminCopy = row.id;
    copy.setAttribute('aria-label', `${lists[name].copy}: ${row.id}`);
    copy.addEventListener('click', () => void copyId(row.id, copy));
    cell.appendChild(copy);
    tr.appendChild(cell);
    byId(`${name}-body`).appendChild(tr);
  }
}
async function loadPage(name, reset = false) {
  const state = lists[name];
  if (blocked || state.loading || (!reset && state.nextBefore === null)) return;
  state.loading = true;
  const more = byId(`${name}-more`), retry = byId(`${name}-retry`);
  more.disabled = true;
  retry.disabled = true;
  retry.hidden = true;
  byId(`${name}-state`).textContent = 'جارٍ تحميل البيانات…';
  if (reset) {
    state.loaded = false;
    state.nextBefore = null;
    more.hidden = true;
    byId(`${name}-body`).textContent = '';
  }
  try {
    const page = await state.fetchPage({ before: reset ? null : state.nextBefore });
    if (blocked) return;
    appendRows(name, page.items);
    state.loaded = true;
    state.nextBefore = page.nextBefore;
    byId(`${name}-state`).textContent = byId(`${name}-body`).children.length ? '' : state.empty;
    more.hidden = page.nextBefore === null;
  } catch (error) {
    if (deny(error) || blocked) return;
    byId(`${name}-state`).textContent = errorMessage(error);
    retry.hidden = false;
    more.hidden = true;
  } finally {
    state.loading = false;
    more.disabled = false;
    retry.disabled = false;
  }
}

for (const tab of tabs) tab.addEventListener('click', () => selectTab(tab.dataset.adminTab));
for (const name of Object.keys(lists)) {
  byId(`${name}-more`).addEventListener('click', () => void loadPage(name));
  byId(`${name}-retry`).addEventListener('click', () => void loadPage(name, true));
}
byId('gate-retry').addEventListener('click', () => void initialize());
byId('logout').addEventListener('click', async () => {
  const button = byId('logout');
  if (blocked || button.disabled) return;
  button.disabled = true;
  byId('message').textContent = '';
  try {
    const result = await logout();
    if (result?.success) {
      blocked = true;
      window.location.replace('/login.html');
      return;
    }
    if (result?.status === 401 || result?.code === 'UNAUTHENTICATED') {
      deny({ code: 'UNAUTHENTICATED' });
      return;
    }
    throw new Error('Logout failed');
  } catch (error) {
    if (deny(error)) return;
    byId('message').dataset.kind = 'error';
    byId('message').textContent = 'تعذر تسجيل الخروج. يرجى إعادة المحاولة.';
  } finally { button.disabled = false; }
});
void initialize();
