import { fetchCurrentAccount, fetchCategory, fetchOrdersPage, fetchPaymentsPage, normalizeOrder, normalizePayment } from './utils/accountData.js';
import { DialogPurchase } from './dialogs/purchaseDialog.js';
import { logout } from './auth.js';

const byId = id => document.getElementById(`account-${id}`);
const tabs = [...document.querySelectorAll('[data-account-tab]')];
const panels = [...document.querySelectorAll('.account-panel')];
const histories = {
  orders: { fetchPage: fetchOrdersPage, normalize: normalizeOrder, empty: 'لا توجد طلبات بعد' },
  payments: { fetchPage: fetchPaymentsPage, normalize: normalizePayment, empty: 'لا توجد مدفوعات بعد' }
};
for (const state of Object.values(histories)) {
  Object.assign(state, { loaded: false, loading: false, nextBefore: null, version: 0 });
}
let category = null, catalogVersion = 0, initializing = false, redirected = false;

function unauthenticated(error) {
  if (error?.code !== 'UNAUTHENTICATED') return false;
  redirected = true;
  window.location.replace('/login.html');
  return true;
}
function errorMessage(error) {
  return error?.code === 'CONTRACT_ERROR'
    ? 'خطأ في عقد الاستجابة. يرجى إعادة المحاولة.'
    : 'تعذر تحميل البيانات. يرجى إعادة المحاولة.';
}
function formatBalance(cents) {
  if (typeof cents !== 'string' || !/^-?\d+$/.test(cents)) throw new Error('Invalid balanceCents');
  const negative = cents.startsWith('-');
  const digits = cents.replace(/^-/, '').replace(/^0+(?=\d)/, '').padStart(3, '0');
  return `${negative ? '-$' : '$'}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}
function renderHeader(account) {
  const balance = formatBalance(account.balanceCents);
  byId('username').textContent = account.username;
  byId('balance').textContent = balance;
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function selectTab(name, lazy = true) {
  for (const tab of tabs) tab.setAttribute('aria-pressed', String(tab.dataset.accountTab === name));
  for (const panel of panels) panel.hidden = panel.id !== `account-panel-${name}`;
  const state = histories[name];
  if (lazy && state && !state.loaded && !state.loading) void loadHistory(name, true);
}

async function initialize() {
  if (initializing || redirected) return;
  initializing = true;
  byId('gate-retry').hidden = true;
  byId('gate-state').textContent = 'جارٍ التحقق من تسجيل الدخول…';
  try {
    const account = await fetchCurrentAccount();
    if (redirected) return;
    renderHeader(account);
    document.querySelector('.account-gate').hidden = true;
    byId('shell').hidden = false;
  } catch (error) {
    if (unauthenticated(error)) return;
    byId('gate-state').textContent = errorMessage(error);
    byId('gate-retry').hidden = false;
  } finally { initializing = false; }
}

async function loadCatalog(nextCategory) {
  if (redirected) return;
  category = nextCategory;
  const version = ++catalogVersion;
  byId('catalog-retry').hidden = true;
  byId('catalog-state').textContent = 'جارٍ تحميل المنتجات…';
  byId('products').textContent = '';
  try {
    const products = await fetchCategory(category);
    if (version !== catalogVersion || redirected) return;
    for (const product of products) {
      const card = element('article', 'account-card');
      card.appendChild(element('h3', 'account-card-name', product.name));
      const price = Array.isArray(product.price) ? product.price[0] : product.price;
      card.appendChild(element('p', 'account-card-price', price));
      card.appendChild(element('p', 'account-card-availability', product.available === false ? 'غير متوفر' : 'متوفر'));
      const buy = element('button', 'account-button', 'شراء');
      buy.type = 'button';
      buy.disabled = product.available === false;
      buy.addEventListener('click', () => {
        if (buy.disabled || redirected) return;
        new DialogPurchase(product, {
          cssPath: '/assets/css/purchase-dialog.css', supportPhone: '+963980217649'
        }).open();
      });
      card.appendChild(buy);
      byId('products').appendChild(card);
    }
    byId('catalog-state').textContent = products.length ? '' : 'لا توجد منتجات في هذه الفئة';
  } catch (error) {
    if (unauthenticated(error) || version !== catalogVersion) return;
    byId('catalog-state').textContent = errorMessage(error);
    byId('catalog-retry').hidden = false;
  }
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value ?? '') : date.toLocaleString('ar');
}
function appendRows(name, items) {
  for (const item of items) {
    const row = histories[name].normalize(item);
    const values = name === 'orders'
      ? [row.orderId, row.service, `${row.currency} ${row.amount}`, row.statusLabel, formatDate(row.createdAt)]
      : [row.paymentId, `${row.currency} ${row.claimedAmount}`, row.statusLabel, formatDate(row.createdAt)];
    const tr = element('tr');
    for (const value of values) tr.appendChild(element('td', '', value));
    byId(`${name}-body`).appendChild(tr);
  }
}
async function loadHistory(name, reset = false) {
  const state = histories[name];
  if (redirected || (!reset && (state.loading || state.nextBefore === null))) return;
  const version = ++state.version;
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
    if (version !== state.version || redirected) return;
    appendRows(name, page.items);
    state.nextBefore = page.nextBefore;
    state.loaded = true;
    byId(`${name}-state`).textContent = byId(`${name}-body`).children.length ? '' : state.empty;
    more.hidden = page.nextBefore === null;
  } catch (error) {
    if (unauthenticated(error) || version !== state.version) return;
    byId(`${name}-state`).textContent = errorMessage(error);
    retry.hidden = false;
    more.hidden = true;
  } finally {
    if (version === state.version) {
      state.loading = false;
      more.disabled = false;
      retry.disabled = false;
    }
  }
}

for (const tab of tabs) tab.addEventListener('click', () => selectTab(tab.dataset.accountTab));
for (const button of document.querySelectorAll('[data-account-category]')) {
  button.addEventListener('click', () => void loadCatalog(button.dataset.accountCategory));
}
for (const name of Object.keys(histories)) {
  byId(`${name}-more`).addEventListener('click', () => void loadHistory(name));
  byId(`${name}-retry`).addEventListener('click', () => {
    if (!histories[name].loading) void loadHistory(name, true);
  });
}
byId('gate-retry').addEventListener('click', () => void initialize());
byId('catalog-retry').addEventListener('click', () => void loadCatalog(category));
document.addEventListener('purchaseConfirmed', async () => {
  if (redirected) return;
  try {
    const account = await fetchCurrentAccount(); // Never apply the event's historical receipt balance.
    if (redirected) return;
    renderHeader(account);
    selectTab('orders', false);
    await loadHistory('orders', true);
  } catch (error) {
    if (unauthenticated(error)) return;
    byId('message').dataset.kind = 'error';
    byId('message').textContent = errorMessage(error);
  }
});
byId('logout').addEventListener('click', async () => {
  const button = byId('logout');
  if (button.disabled || redirected) return;
  button.disabled = true;
  byId('message').textContent = '';
  try {
    const result = await logout();
    if (result?.success) {
      redirected = true;
      window.location.replace('/login.html');
      return;
    }
    if (result?.status === 401 || result?.code === 'UNAUTHENTICATED') {
      unauthenticated({ code: 'UNAUTHENTICATED' });
      return;
    }
    throw new Error('Logout failed');
  } catch (error) {
    if (unauthenticated(error)) return;
    byId('message').dataset.kind = 'error';
    byId('message').textContent = 'تعذر تسجيل الخروج. يرجى إعادة المحاولة.';
  } finally { button.disabled = false; }
});
void initialize();
