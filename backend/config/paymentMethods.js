'use strict';

// Server-owned limits for CLAIMED amounts. No unverified FX rate determines a credit.
module.exports = Object.freeze({
  visa: Object.freeze({ currency: 'USD', min: 10, max: 100 }),
  shamcashdol: Object.freeze({ currency: 'USD', min: 10, max: 200000 }),
  shamcash: Object.freeze({ currency: 'SYP', min: 10000, max: 200000000 }),
  syriatel: Object.freeze({ currency: 'SYP', min: 5000, max: 550000 }),
  mtn: Object.freeze({ currency: 'SYP', min: 5000, max: 550000 }),
  bank: Object.freeze({ currency: 'USD', min: 50, max: 1000 }),
  webmoney: Object.freeze({ currency: 'USD', min: 20, max: 200000 }),
  usdt: Object.freeze({ currency: 'USDT', min: 10, max: 200000000 })
});
