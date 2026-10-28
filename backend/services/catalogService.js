'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { parseMoney, formatMoney, multiplyDivideCents, MAX_CENTS } = require('../utils/money');
const { policy, plain } = require('../utils/fulfillmentTarget');
const { positiveInteger } = require('../utils/orderInput');
const OrderError = require('../utils/orderError');
const FILES = Object.freeze({
  'cryptos.json': Object.freeze({ category: 'cryptos', schema: 'walletAddress' }),
  'payments.json': Object.freeze({ category: 'cryptos', schema: 'accountId' }),
  'mobile-payments.json': Object.freeze({ category: 'cryptos', schema: 'phone' }),
  'apps.json': Object.freeze({ category: 'apps', schema: 'accountId' }),
  'games.json': Object.freeze({ category: 'games', schema: 'playerId' }),
  'balances.json': Object.freeze({ category: 'balances', schema: 'playerId' })
});
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function configuration() { return new OrderError(503, 'FULFILLMENT_CONFIGURATION_INVALID', 'The category catalog configuration is unavailable'); }
function exactPrice(value) {
  const cents = parseMoney(value);
  if (cents < 1 || parseMoney(Number(formatMoney(cents))) !== cents) throw configuration();
  return cents;
}
function createCatalogService({ directory = path.join(__dirname, '../data') } = {}) {
  let catalog = null;
  // Only operator-owned configuration may select this directory. Request input never selects files.
  function load() {
    const next = Object.fromEntries(['apps', 'games', 'cryptos', 'balances'].map(category => [category, { products: [], error: null }]));
    for (const [filename, expected] of Object.entries(FILES)) {
      const category = next[expected.category];
      try {
        const file = JSON.parse(fs.readFileSync(path.join(directory, filename), 'utf8'));
        if (!plain(file) || file.defaultFulfillmentSchema !== expected.schema || !Array.isArray(file.products) ||
            Object.keys(file).some(key => !['defaultFulfillmentSchema', 'products'].includes(key))) throw configuration();
        for (const raw of file.products) {
          if (!plain(raw) || raw.category !== expected.category || !positiveInteger(raw.id) || typeof raw.available !== 'boolean' ||
              typeof raw.name !== 'string' || raw.name.length < 1 || raw.name.length > 200 ||
              (raw.menuPrice !== undefined && typeof raw.menuPrice !== 'boolean') ||
              typeof raw.requiresFulfillmentTarget !== 'boolean' ||
              (raw.requiresFulfillmentTarget && raw.fulfillmentSchema !== undefined && raw.fulfillmentSchema !== expected.schema) ||
              (!raw.requiresFulfillmentTarget && raw.fulfillmentSchema !== null)) throw configuration();
          const product = { ...raw, fulfillmentSchema: raw.requiresFulfillmentTarget ? expected.schema : null, sourceFile: filename };
          policy(product);
          const menu = product.menuPrice === true;
          if (expected.category === 'games' && !menu) throw configuration();
          if (menu) {
            if (!Array.isArray(product.price) || !product.price.length || !Array.isArray(product.quantity) || product.price.length !== product.quantity.length ||
                !product.quantity.every(positiveInteger)) throw configuration();
            product.pricesCents = product.price.map(exactPrice);
          } else {
            if (!positiveInteger(product.quantity) || Array.isArray(product.price)) throw configuration();
            product.priceCents = exactPrice(product.price);
          }
          product.minQuantity = expected.category === 'apps' ? 1 : menu ? 1 : product.minLimit;
          product.maxQuantity = expected.category === 'apps' ? 1000000 : menu ? Math.max(...product.quantity) : product.maxLimit;
          if (!positiveInteger(product.minQuantity) || !positiveInteger(product.maxQuantity) || product.minQuantity > product.maxQuantity) throw configuration();
          product.minChargeCents = expected.category === 'apps' ? 50 : 1;
          product.maxChargeCents = expected.category === 'apps' ? 100000 : expected.category === 'games' ? 50000 : MAX_CENTS;
          if (category.products.some(item => item.id === product.id)) throw configuration(); // Identity is category + ID; unified crypto files share one namespace.
          category.products.push(product);
        }
      } catch (error) { category.error = error instanceof OrderError && error.code === 'UNSUPPORTED_NETWORK' ? error : configuration(); }
    }
    for (const value of Object.values(next)) {
      value.revision = createHash('sha256').update(JSON.stringify(value.products)).digest('hex');
      value.products.sort((a, b) => a.id - b.id);
    }
    catalog = freeze(next); // Atomic publication; a failed category never exposes a partial merge.
    return { ready: Object.values(next).every(item => !item.error) };
  }
  function ensureLoaded() { if (!catalog) load(); }
  function category(name) {
    if (!Object.hasOwn(catalog || {}, name)) throw new OrderError(400, 'INVALID_PURCHASE_INPUT', 'A purchasable category is required');
    const value = catalog[name];
    if (value.error) throw value.error;
    return value;
  }
  function getCategory(name) { ensureLoaded(); return category(name).products; }
  function resolvePurchase(input) {
    // Caller initializes outside the transaction. Resolution itself has no filesystem/network work.
    const current = category(input.category);
    const product = current.products.find(item => item.id === input.productId);
    if (!product || !product.available) throw new OrderError(409, 'PRODUCT_UNAVAILABLE', 'The selected product is unavailable');
    const menu = product.menuPrice === true;
    if (menu !== Object.hasOwn(input, 'packageIndex') || menu && input.packageIndex >= product.price.length) {
      throw new OrderError(400, 'INVALID_PURCHASE_INPUT', 'Use a valid package or quantity for this product');
    }
    const quantity = menu ? product.quantity[input.packageIndex] : input.quantity;
    if (quantity < product.minQuantity || quantity > product.maxQuantity) throw new OrderError(400, 'INVALID_PURCHASE_INPUT', 'The quantity is outside the product limits');
    const priceCents = menu ? product.pricesCents[input.packageIndex] : product.priceCents;
    const baseQuantity = menu ? quantity : product.quantity;
    const chargeCents = menu ? priceCents : multiplyDivideCents(priceCents, quantity, baseQuantity);
    if (chargeCents < product.minChargeCents || chargeCents > product.maxChargeCents || parseMoney(Number(formatMoney(chargeCents))) !== chargeCents) {
      throw new OrderError(400, 'INVALID_PURCHASE_INPUT', 'The charge is outside the supported product limits');
    }
    const snapshot = { category: input.category, productId: product.id, productName: product.name, sourceFile: product.sourceFile,
      catalogRevision: current.revision, pricingVersion: 1, mode: menu ? 'package' : 'proportional', priceCents, baseQuantity,
      minQuantity: product.minQuantity, maxQuantity: product.maxQuantity, minChargeCents: product.minChargeCents, maxChargeCents: product.maxChargeCents,
      requiresFulfillmentTarget: product.requiresFulfillmentTarget, fulfillmentSchema: product.fulfillmentSchema,
      fulfillmentValidationVersion: product.fulfillmentValidationVersion, fulfillmentNetwork: product.fulfillmentNetwork };
    return freeze({ snapshot, quantity, chargeCents });
  }
  return Object.freeze({ load, ensureLoaded, getCategory, resolvePurchase });
}
const service = createCatalogService();
module.exports = { ...service, createCatalogService, FILES };
