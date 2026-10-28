// Financial intents are persisted before dispatch. Only the server settles money.
export class PurchaseClient {
  constructor({ storage = localStorage, fetcher = fetch, uuid = () => crypto.randomUUID() } = {}) {
    this.storage = storage; this.fetcher = fetcher; this.uuid = uuid;
  }
  headers() {
    const token = this.storage.getItem('userToken');
    const session = this.storage.getItem('customSessionId');
    const csrf = document.cookie.match(/(?:^|;\s*)x-csrf-token=([^;]+)/);
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}`, 'x-session-id': session || '',
      ...(csrf ? { 'x-csrf-token': decodeURIComponent(csrf[1]) } : {}) };
  }
  key(owner, category, productId) { return `purchase-intent-v1:${owner}:${category}:${productId}`; }
  pending(owner, category, productId) {
    const raw = this.storage.getItem(this.key(owner, category, productId));
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || !value.payload || typeof value.payload.idempotencyKey !== 'string') throw new Error('Saved purchase requires reconciliation');
    return value;
  }
  pendingPurchases(owner) {
    const prefix = `purchase-intent-v1:${owner}:`, attempts = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (!key?.startsWith(prefix)) continue;
      const value = JSON.parse(this.storage.getItem(key));
      if (!value?.payload || typeof value.payload.idempotencyKey !== 'string') throw new Error('Saved purchase requires reconciliation');
      attempts.push(value);
    }
    return attempts;
  }
  async purchase(input, expectedOwner = this.storage.getItem('userId')) {
    const headers = this.headers();
    const auth = await this.fetcher('/api/auth/session-info', { headers, credentials: 'include' });
    if (!auth.ok) throw new Error('Sign in again before retrying this purchase');
    const session = await auth.json();
    if (!session.isAuthenticated || typeof session.userId !== 'string' || session.userId !== expectedOwner) throw new Error('Authentication changed. Sign in to the original account before retrying.');
    const current = this.headers();
    if (this.storage.getItem('userId') !== expectedOwner || current.Authorization !== headers.Authorization || current['x-session-id'] !== headers['x-session-id']) throw new Error('Authentication changed. Retry from the original account.');
    const key = this.key(session.userId, input.category, input.productId);
    let attempt = this.pending(session.userId, input.category, input.productId);
    if (attempt) {
      const { idempotencyKey, ...original } = attempt.payload;
      if (JSON.stringify(original) !== JSON.stringify(input)) throw new Error('An unresolved purchase exists. Restore its original selection and target before retrying.');
    } else {
      attempt = { payload: { ...input, idempotencyKey: `purchase-${this.uuid()}` }, unknown: false };
      this.storage.setItem(key, JSON.stringify(attempt)); // Failure here prevents financial dispatch.
    }
    const wasUnknown = attempt.unknown;
    attempt.unknown = true;
    this.storage.setItem(key, JSON.stringify(attempt));
    let response, result;
    try {
      response = await this.fetcher('/api/orders/purchase', { method: 'POST', headers, credentials: 'include', body: JSON.stringify(attempt.payload) });
      result = await response.json();
    } catch (_) {
      throw new Error('Purchase outcome is unknown. Retry the original request with the saved key; do not create another purchase.');
    }
    if (!response.ok || result.success !== true) {
      // A new, definitively rejected request may be corrected. A prior unknown attempt is never discarded on an auth/business/503 response.
      if (!wasUnknown && (response.status === 400 || result.code === 'INSUFFICIENT_FUNDS')) this.storage.removeItem(key);
      const error = new Error(result.retryWithSameKey || response.status >= 500 || wasUnknown
        ? 'Purchase outcome is unresolved. Retry with the same saved key.' : 'The server rejected this purchase. Check the target, quantity, and available funds.');
      error.code = result.code; throw error;
    }
    const saved = this.pending(session.userId, input.category, input.productId);
    if (saved?.payload.idempotencyKey === attempt.payload.idempotencyKey) this.storage.removeItem(key);
    // Historical replay balances must not overwrite the current account balance.
    document.dispatchEvent(new CustomEvent('purchaseConfirmed', { detail: result }));
    return result;
  }
}
