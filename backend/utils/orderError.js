'use strict';
class OrderError extends Error {
  constructor(status, code, message) { super(message); this.name = 'OrderError'; this.status = status; this.code = code; }
}
module.exports = OrderError;
