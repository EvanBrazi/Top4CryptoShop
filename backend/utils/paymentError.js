'use strict';
// Only deliberately public payment errors may expose their messages over HTTP.
class PaymentError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'PaymentError';
    this.status = status;
    this.code = code;
  }
}
module.exports = PaymentError;
