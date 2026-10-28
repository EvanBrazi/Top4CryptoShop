import { PurchaseClient } from './purchaseClient.js';

// Shared authenticated HTTP transport; no financial sockets or client money arithmetic.
export class OrderClient extends PurchaseClient {
  async read(endpoint) {
    const response = await this.fetcher(endpoint, { headers: this.headers(), credentials: 'include', cache: 'no-store' });
    if (!response.ok) throw new Error('Unable to load orders. Check your signed-in session.');
    return response.json();
  }
  async verifyOwner(expectedOwner, headers = this.headers()) {
    const response = await this.fetcher('/api/auth/session-info', { headers, credentials: 'include', cache: 'no-store' });
    if (!response.ok) throw new Error('Sign in to the original account before retrying.');
    const session = await response.json(), current = this.headers();
    if (!session.isAuthenticated || session.userId !== expectedOwner || this.storage.getItem('userId') !== expectedOwner ||
        current.Authorization !== headers.Authorization || current['x-session-id'] !== headers['x-session-id']) throw new Error('Sign in to the original account before retrying.');
    return session.userId;
  }
  decisionKey(owner, orderId) { return `order-decision-v1:${owner}:${orderId}`; }
  pendingDecisions(owner) {
    const prefix = `order-decision-v1:${owner}:`, attempts = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key?.startsWith(prefix)) {
        const attempt = JSON.parse(this.storage.getItem(key));
        if (!attempt || !['accept', 'reject'].includes(attempt.action) || typeof attempt.orderId !== 'string' || typeof attempt.payload?.idempotencyKey !== 'string') throw new Error('Saved decision requires reconciliation.');
        attempts.push(attempt);
      }
    }
    return attempts;
  }
  async decide(orderId, action, reason, expectedOwner = this.storage.getItem('userId')) {
    if (!['accept', 'reject'].includes(action)) throw new Error('Invalid decision.');
    const headers = this.headers();
    const owner = await this.verifyOwner(expectedOwner, headers), key = this.decisionKey(owner, orderId);
    let attempt = this.pendingDecisions(owner).find(item => item.orderId === orderId);
    if (attempt && (attempt.action !== action || attempt.payload.reason !== reason)) throw new Error('Retry the saved original decision before taking another action.');
    if (!attempt) {
      attempt = { orderId, action, payload: { idempotencyKey: `decision-${this.uuid()}`, reason } };
      this.storage.setItem(key, JSON.stringify(attempt));
    }
    let response, result;
    try {
      response = await this.fetcher(`/api/orders/${encodeURIComponent(orderId)}/${action}`, { method: 'PUT', headers, credentials: 'include', body: JSON.stringify(attempt.payload) });
      result = await response.json();
    } catch (_) { throw new Error('Decision outcome unknown. Retry the original saved action.'); }
    if (!response.ok || result.success !== true) throw new Error('Decision unresolved or refused. Keep the saved action and reconcile the order before changing it.');
    if (JSON.parse(this.storage.getItem(key) || 'null')?.payload.idempotencyKey === attempt.payload.idempotencyKey) this.storage.removeItem(key);
    return result; // Do not apply historical replay balances to current account state.
  }
}
