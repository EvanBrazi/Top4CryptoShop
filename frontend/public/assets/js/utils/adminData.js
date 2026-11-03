import { secureFetch } from '../securefetch.js';

const PAGE_SIZE = 20;
const STATUS_LABELS = { pending: 'قيد التنفيذ', completed: 'مكتمل', cancelled: 'ملغى' };
const failure = (message, code) => Object.assign(new Error(message), { code });

export function assertPageShape(data, context) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.items) ||
      (data.nextBefore !== null && typeof data.nextBefore !== 'string')) {
    throw failure(`${context}: expected { items, nextBefore }`, 'CONTRACT_ERROR');
  }
  return data;
}

// Every admin read uses secureFetch's object envelope; no native catalog transport.
async function read(url, context) {
  const res = await secureFetch(url, { method: 'GET', credentials: 'include', cache: 'no-store' });
  if (res.status === 401) throw failure('UNAUTHENTICATED', 'UNAUTHENTICATED');
  if (res.status === 403) throw failure('FORBIDDEN', 'FORBIDDEN');
  if (res.status !== 200 || !res.success) {
    throw failure(`Failed to load ${context}: ${res.status}`,
      res.code === 'INVALID_RESPONSE' ? 'CONTRACT_ERROR' : res.code);
  }
  return res.data;
}

export async function fetchCurrentAdmin() {
  return read('/api/users/me', 'admin account');
}
async function fetchPage(endpoint, context, before) {
  const url = `${endpoint}?limit=${PAGE_SIZE}${before === null ? '' : `&before=${encodeURIComponent(before)}`}`;
  return assertPageShape(await read(url, context), context);
}
export async function fetchOrdersPage({ before = null } = {}) {
  return fetchPage('/api/orders/admin', 'Orders', before);
}
export async function fetchPaymentsPage({ before = null } = {}) {
  return fetchPage('/api/payments/admin', 'Payments', before);
}
export async function fetchUsersPage({ before = null } = {}) {
  return fetchPage('/api/users', 'Users', before);
}

export function formatBalance(cents) {
  if (typeof cents !== 'string' || !/^-?\d+$/.test(cents)) throw failure('Invalid balanceCents', 'CONTRACT_ERROR');
  const negative = cents.startsWith('-');
  const digits = cents.replace(/^-/, '').replace(/^0+(?=\d)/, '').padStart(3, '0');
  return `${negative ? '-$' : '$'}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}
function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value ?? '') : date.toLocaleString('ar');
}

// Row descriptors preserve public IDs and monetary strings; owner UUIDs need no lookup.
export function normalizeOrder(order) {
  return { id: order.orderId, ltr: [0, 1, 3], cells: [order.orderId, order.userId, order.service,
    `${order.chargeCurrency} ${order.amount}`, STATUS_LABELS[order.status] || 'غير معروف', formatDate(order.createdAt)] };
}
export function normalizePayment(payment) {
  return { id: payment.paymentId, ltr: [0, 1, 2], cells: [payment.paymentId, payment.userId,
    `${payment.currency} ${payment.amount}`, payment.method, formatDate(payment.createdAt)] };
}
export function normalizeUser(user) {
  return { id: user.id, ltr: [0, 2, 5], cells: [user.id, user.username, user.email, user.role,
    user.accountStatus, formatBalance(user.balanceCents), formatDate(user.createdAt)] };
}
