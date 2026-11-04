import { secureFetch } from '../securefetch.js';

const CATEGORIES = ['apps', 'games', 'cryptos', 'balances'];
const PAGE_SIZE = 20;
const STATUS_LABELS = { pending: 'قيد التنفيذ', completed: 'مكتمل', cancelled: 'ملغى' };
const failure = (message, code) => Object.assign(new Error(message), { code });

export function assertPageShape(data, context) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw failure(`${context}: response is not an object`, 'CONTRACT_ERROR');
  }
  if (!Array.isArray(data.items)) {
    throw failure(`${context}: items is not an array`, 'CONTRACT_ERROR');
  }
  if (data.nextBefore !== null && typeof data.nextBefore !== 'string') {
    throw failure(`${context}: nextBefore must be string or null`, 'CONTRACT_ERROR');
  }
  return data;
}

// Authenticated reads use secureFetch's structured { success, status, data } result.
async function authenticatedRead(url, context) {
  const res = await secureFetch(url, { method: 'GET', credentials: 'include', cache: 'no-store' });
  if (res.status === 401) throw failure('UNAUTHENTICATED', 'UNAUTHENTICATED');
  if (res.status !== 200 || !res.success) {
    throw failure(`Failed to load ${context}: ${res.status}`,
      res.code === 'INVALID_RESPONSE' ? 'CONTRACT_ERROR' : res.code);
  }
  return res.data;
}

export async function fetchCurrentAccount() {
  return authenticatedRead('/api/users/me', 'account');
}

// Public read-only catalogs return bare arrays, intentionally rejected by secureFetch.
// Native GET needs no CSRF; validate the array explicitly, without changing that transport.
const fetchCatalog = async category => {
  if (!CATEGORIES.includes(category)) throw new Error(`Unknown category: ${category}`);
  const res = await fetch(`/api/${category}`, {
    method: 'GET', credentials: 'include', cache: 'no-store', redirect: 'error',
    headers: { Accept: 'application/json' }
  });
  if (res.status === 401) throw failure('UNAUTHENTICATED', 'UNAUTHENTICATED');
  if (res.status !== 200 || !res.ok) throw new Error(`Failed to load ${category}: ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw failure(`Invalid catalog shape for ${category}`, 'CONTRACT_ERROR');
  return data;
};

export async function fetchCategory(category) {
  return fetchCatalog(category);
}

export async function fetchOrdersPage({ before = null } = {}) {
  const url = `/api/orders?limit=${PAGE_SIZE}${before === null ? '' : `&before=${encodeURIComponent(before)}`}`;
  return assertPageShape(await authenticatedRead(url, 'orders'), 'Orders');
}

export async function fetchPaymentsPage({ before = null } = {}) {
  const url = `/api/payments?limit=${PAGE_SIZE}${before === null ? '' : `&before=${encodeURIComponent(before)}`}`;
  return assertPageShape(await authenticatedRead(url, 'payments'), 'Payments');
}

export function normalizeOrder(order) {
  return {
    orderId: order.orderId, service: order.service, amount: order.amount,
    currency: order.chargeCurrency || 'USD', status: order.status,
    statusLabel: STATUS_LABELS[order.status] || 'غير معروف', createdAt: order.createdAt,
    isRefund: order.status === 'cancelled'
  };
}

export function normalizePayment(payment) {
  return {
    paymentId: payment.paymentId, claimedAmount: payment.amount, currency: payment.currency,
    status: payment.status, statusLabel: STATUS_LABELS[payment.status] || 'غير معروف',
    createdAt: payment.createdAt
  };
}

// Keep structured transport results: POST is 201, recovery is a 200 union.
export async function submitPayment(formData, submissionId) {
  return secureFetch('/api/payments', {
    method: 'POST', body: formData, headers: { 'x-submission-id': submissionId }
  });
}
export async function fetchSubmissionStatus(submissionId) {
  return secureFetch(`/api/payments/submissions/${encodeURIComponent(submissionId)}`, {
    method: 'GET', cache: 'no-store'
  });
}
