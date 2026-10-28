'use strict';

/**
 * USD settlement money: safe integer Number cents at public boundaries,
 * BigInt intermediates for exact calculations. No floating-point arithmetic.
 */
const MAX_CENTS = Number.MAX_SAFE_INTEGER;
const MAX_CENTS_BIGINT = BigInt(MAX_CENTS);
const MAX_AMOUNT_LENGTH = MAX_CENTS_BIGINT.toString().length + 1;

class MoneyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MoneyError';
    this.code = code;
  }
}

function assertCents(cents) {
  if (!Number.isSafeInteger(cents) || cents < 0 || Object.is(cents, -0)) {
    throw new MoneyError('INVALID_CENTS', 'Cents must be a nonnegative safe integer');
  }
  return cents;
}

function checkedCents(value) {
  if (value < 0n) {
    throw new MoneyError('MONEY_UNDERFLOW', 'The monetary result cannot be negative');
  }
  if (value > MAX_CENTS_BIGINT) {
    throw new MoneyError('MONEY_OVERFLOW', 'The monetary result exceeds the safe cent limit');
  }
  return Number(value);
}

function assertFactor(value, name) {
  if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) {
    throw new MoneyError('INVALID_FACTOR', `${name} must be a nonnegative safe integer`);
  }
  return value;
}

/** Reject excess precision rather than silently rounding submitted amounts. */
function parseMoney(value) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new MoneyError('INVALID_MONEY', 'Money must be a decimal string or finite number');
  }
  if (typeof value === 'number' && (!Number.isFinite(value) || value < 0 || Object.is(value, -0))) {
    throw new MoneyError('INVALID_MONEY', 'Money must be finite and nonnegative');
  }
  const text = String(value);
  if (text.length > MAX_AMOUNT_LENGTH) {
    throw new MoneyError('INVALID_MONEY', 'The decimal amount is too long');
  }
  // Require an integer part, no signs/leading zeros/whitespace, and at most two decimals.
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(text);
  // JavaScript's $ can match before a final newline: require a full-string match too.
  if (!match || match[0] !== text) {
    throw new MoneyError('INVALID_MONEY', 'Use a plain decimal amount with at most two decimal places');
  }
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0'));
  return checkedCents(cents);
}

function formatMoney(cents) {
  const value = BigInt(assertCents(cents));
  return `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`;
}

function addCents(left, right) {
  return checkedCents(BigInt(assertCents(left)) + BigInt(assertCents(right)));
}

function subtractCents(left, right) {
  return checkedCents(BigInt(assertCents(left)) - BigInt(assertCents(right)));
}

function multiplyCents(cents, multiplier) {
  return checkedCents(BigInt(assertCents(cents)) * BigInt(assertFactor(multiplier, 'Multiplier')));
}

/**
 * Calculate cents * numerator / denominator exactly, rounding half-up once.
 * Zero numerators are allowed; denominators must be positive safe integers.
 * Catalog quantity rules belong in catalogService, not in monetary arithmetic.
 */
function multiplyDivideCents(cents, numerator, denominator) {
  const amount = BigInt(assertCents(cents));
  const factor = BigInt(assertFactor(numerator, 'Numerator'));
  const divisor = BigInt(assertFactor(denominator, 'Denominator'));
  if (divisor === 0n) {
    throw new MoneyError('INVALID_DENOMINATOR', 'Denominator must be greater than zero');
  }
  const product = amount * factor;
  const quotient = product / divisor;
  const remainder = product % divisor;
  return checkedCents(quotient + (remainder * 2n >= divisor ? 1n : 0n));
}

module.exports = {
  MAX_CENTS,
  MoneyError,
  parseMoney,
  formatMoney,
  assertCents,
  addCents,
  subtractCents,
  multiplyCents,
  multiplyDivideCents
};
