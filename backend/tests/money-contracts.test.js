'use strict';
// C3.2c1: pure contracts of money.js. No database, repository or HTTP imports.
const M = require('../utils/money');

function fails(code, work) {
  let error;
  try { work(); } catch (caught) { error = caught; }
  expect(error).toBeInstanceOf(M.MoneyError);
  expect(error).toMatchObject({ name: 'MoneyError', code });
}

describe('canonical decimal parsing (4)', () => {
  test.each([
    ['zero', ['0', '0.0', '0.00', 0], 0],
    ['whole amounts', ['12', '12.0', '12.00', 12], 1200],
    ['one fractional digit', ['12.3', '12.30', 12.3], 1230],
    ['two fractional digits', ['0.29', 0.29], 29]
  ])('parses %s without changing exact cents', (_name, inputs, cents) => {
    for (const input of inputs) expect(M.parseMoney(input)).toBe(cents);
  });
});

describe('noncanonical decimal syntax (6)', () => {
  test.each([
    ['signs', ['+1', '-1', '-0', '-0.00', '+0.00']],
    ['whitespace', [' 1', '1 ', '\t1', '1\n', '1\r\n', ' 1']],
    ['exponents', ['1e2', '1E2', '1e-2', '1e+2']],
    ['leading zeros', ['00', '01', '00.10', '012.34']],
    ['incomplete decimals', ['', '.', '.50', '1.', '1..00']],
    ['other numeric spellings', ['0x10', '1_000', '1,000', 'NaN', 'Infinity', '１２']]
  ])('rejects %s rather than normalizing input', (_name, inputs) => {
    for (const input of inputs) fails('INVALID_MONEY', () => M.parseMoney(input));
  });
});

describe('coercion and precision rejection (4)', () => {
  test('non-string non-number amounts cannot be coerced', () => {
    for (const input of [null, undefined, true, false, [], ['1'], {}, new Number(1), new String('1'), 1n, Symbol('1')]) {
      fails('INVALID_MONEY', () => M.parseMoney(input));
    }
  });
  test('hostile coercion hooks are never called', () => {
    const toString = jest.fn(() => '1'), valueOf = jest.fn(() => 1);
    const primitive = jest.fn(() => '1');
    fails('INVALID_MONEY', () => M.parseMoney({ toString, valueOf, [Symbol.toPrimitive]: primitive }));
    expect(toString).not.toHaveBeenCalled(); expect(valueOf).not.toHaveBeenCalled(); expect(primitive).not.toHaveBeenCalled();
  });
  test('string precision beyond two digits is rejected even for trailing zeros', () => {
    for (const input of ['1.005', '0.001', '1.000', '0.290', '0.30000000000000004']) {
      fails('INVALID_MONEY', () => M.parseMoney(input));
    }
  });
  test('numeric excess precision and nonfinite or signed amounts are rejected', () => {
    for (const input of [1.005, 0.1 + 0.2, 1e-7, NaN, Infinity, -Infinity, -1, -0]) {
      fails('INVALID_MONEY', () => M.parseMoney(input));
    }
  });
});

describe('authoritative cents and amount bounds (4)', () => {
  test('safe nonnegative integer cents include zero and MAX_SAFE_INTEGER', () => {
    expect(M.MAX_CENTS).toBe(Number.MAX_SAFE_INTEGER);
    for (const input of [0, 1, 29, 100, 12345, M.MAX_CENTS]) expect(M.assertCents(input)).toBe(input);
  });
  test('invalid cents reject the entire historical coercion and unsafe-value matrix', () => {
    for (const input of [-1, -0, 0.5, NaN, Infinity, -Infinity, M.MAX_CENTS + 1, '100', true, false, null, undefined, 100n, [], {}]) {
      fails('INVALID_CENTS', () => M.assertCents(input));
      fails('INVALID_CENTS', () => M.formatMoney(input));
    }
  });
  test('maximum decimal amount parses exactly without a floating-point intermediate', () => {
    expect(M.parseMoney('90071992547409.91')).toBe(M.MAX_CENTS);
    expect(M.parseMoney('90071992547409.90')).toBe(M.MAX_CENTS - 1);
  });
  test('amount overflow is distinct from rejected overlong input', () => {
    for (const input of ['90071992547409.92', '90071992547410', Number.MAX_SAFE_INTEGER]) {
      fails('MONEY_OVERFLOW', () => M.parseMoney(input));
    }
    fails('INVALID_MONEY', () => M.parseMoney('1'.repeat(18)));
  });
});

describe('formatting and exact decimal round trips (2)', () => {
  test('formatting always emits an integer part and exactly two fractional digits', () => {
    for (const [cents, text] of [[0, '0.00'], [1, '0.01'], [29, '0.29'], [100, '1.00'], [12345, '123.45'], [M.MAX_CENTS, '90071992547409.91']]) {
      expect(M.formatMoney(cents)).toBe(text);
    }
  });
  test('decimal-string round trips preserve cents through the safe-integer boundary', () => {
    for (const cents of [0, 1, 9, 10, 99, 100, 101, 12345, M.MAX_CENTS - 1, M.MAX_CENTS]) {
      const display = M.formatMoney(cents);
      expect(display).toMatch(/^(0|[1-9][0-9]*)\.[0-9]{2}$/);
      expect(M.parseMoney(display)).toBe(cents);
      expect(M.formatMoney(M.parseMoney(display))).toBe(display);
    }
  });
});

describe('checked addition subtraction and multiplication (6)', () => {
  test('addition is exact at the safe boundary and rejects overflow', () => {
    expect(M.addCents(29, 1)).toBe(30);
    expect(M.addCents(M.MAX_CENTS - 1, 1)).toBe(M.MAX_CENTS);
    expect(M.addCents(M.MAX_CENTS, 0)).toBe(M.MAX_CENTS);
    fails('MONEY_OVERFLOW', () => M.addCents(M.MAX_CENTS, 1));
  });
  test('subtraction permits exact zero but rejects underflow', () => {
    expect(M.subtractCents(M.MAX_CENTS, M.MAX_CENTS)).toBe(0);
    expect(M.subtractCents(M.MAX_CENTS, 1)).toBe(M.MAX_CENTS - 1);
    fails('MONEY_UNDERFLOW', () => M.subtractCents(0, 1));
  });
  test('multiplication is exact and accepts zero and identity factors', () => {
    expect(M.multiplyCents(29, 3)).toBe(87);
    expect(M.multiplyCents(M.MAX_CENTS, 1)).toBe(M.MAX_CENTS);
    expect(M.multiplyCents(M.MAX_CENTS, 0)).toBe(0);
    expect(M.multiplyCents(0, M.MAX_CENTS)).toBe(0);
  });
  test('multiplication checks the BigInt result rather than truncating overflow', () => {
    fails('MONEY_OVERFLOW', () => M.multiplyCents(M.MAX_CENTS, 2));
    fails('MONEY_OVERFLOW', () => M.multiplyCents(M.MAX_CENTS, M.MAX_CENTS));
  });
  test('every arithmetic entry point validates cents before calculating', () => {
    for (const input of [-0, -1, 0.5, M.MAX_CENTS + 1, '1', null, 1n]) {
      for (const work of [() => M.addCents(input, 0), () => M.addCents(0, input),
        () => M.subtractCents(input, 0), () => M.subtractCents(0, input),
        () => M.multiplyCents(input, 0), () => M.multiplyDivideCents(input, 0, 1)]) {
        fails('INVALID_CENTS', work);
      }
    }
  });
  test('multipliers reject coercion negative zero fractional and unsafe factors', () => {
    for (const input of [-1, -0, 0.5, NaN, Infinity, M.MAX_CENTS + 1, '2', true, null, undefined, 2n]) {
      fails('INVALID_FACTOR', () => M.multiplyCents(1, input));
    }
  });
});

describe('multiplyDivideCents exact half-up contracts (6)', () => {
  test('fractions below one half round down including a zero numerator', () => {
    expect(M.multiplyDivideCents(1, 1, 3)).toBe(0);
    expect(M.multiplyDivideCents(1, 49, 100)).toBe(0);
    expect(M.multiplyDivideCents(M.MAX_CENTS, 0, 1)).toBe(0);
  });
  test('exact half-cent ties round up once', () => {
    expect(M.multiplyDivideCents(1, 1, 2)).toBe(1);
    expect(M.multiplyDivideCents(3, 1, 2)).toBe(2);
    expect(M.multiplyDivideCents(1, 5, 2)).toBe(3);
  });
  test('fractions above one half round up without floating-point calculation', () => {
    expect(M.multiplyDivideCents(1, 2, 3)).toBe(1);
    expect(M.multiplyDivideCents(1, 51, 100)).toBe(1);
    expect(M.multiplyDivideCents(1001, 1, 3)).toBe(334);
  });
  test('an intermediate product above MAX_CENTS is legal when the final quotient fits', () => {
    expect(M.multiplyDivideCents(M.MAX_CENTS, M.MAX_CENTS, M.MAX_CENTS)).toBe(M.MAX_CENTS);
    expect(M.multiplyDivideCents(M.MAX_CENTS, 2, 2)).toBe(M.MAX_CENTS);
  });
  test('overflow is checked after half-up rounding as well as after division', () => {
    expect(M.multiplyDivideCents(6004799503160660, 3, 2)).toBe(M.MAX_CENTS - 1);
    // The exact quotient is MAX_CENTS + 0.5, so rounding must fail, not clamp.
    fails('MONEY_OVERFLOW', () => M.multiplyDivideCents(6004799503160661, 3, 2));
    fails('MONEY_OVERFLOW', () => M.multiplyDivideCents(M.MAX_CENTS, 2, 1));
  });
  test('division requires a positive denominator and strict integer factors', () => {
    fails('INVALID_DENOMINATOR', () => M.multiplyDivideCents(1, 1, 0));
    for (const input of [-1, -0, 0.5, NaN, Infinity, M.MAX_CENTS + 1, '2', true, null, undefined, 2n]) {
      fails('INVALID_FACTOR', () => M.multiplyDivideCents(1, input, 1));
      fails('INVALID_FACTOR', () => M.multiplyDivideCents(1, 1, input));
    }
  });
});

describe('numeric display mirror representability (4)', () => {
  test.each([
    ['zero mirror', 0, 0],
    ['fractional mirror', 29, 29],
    ['large representable mirror', 9007199254740900, 9007199254740900],
    ['large unrepresentable mirror', M.MAX_CENTS, M.MAX_CENTS - 1]
  ])('%s retains its explicit numeric round-trip result', (_name, cents, numericRoundTrip) => {
    const display = M.formatMoney(cents);
    expect(M.parseMoney(display)).toBe(cents);
    expect(M.parseMoney(Number(display))).toBe(numericRoundTrip);
    if (numericRoundTrip !== cents) {
      expect(Number(display)).toBe(Number(M.formatMoney(numericRoundTrip)));
      expect(M.parseMoney(Number(display))).not.toBe(cents);
      // money.js exposes conversion, not a numeric-mirror compatibility guard.
      // A caller must compare the round trip; exact string money stays valid.
    }
  });
});
