'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const base58 = require('../node_modules/bs58check').default;
const { bech32, bech32m } = require('../node_modules/bech32');
const { getAddress } = require('../node_modules/ethers');
const { normalizeTarget } = require('../utils/fulfillmentTarget');
const { createCatalogService, FILES } = require('../services/catalogService');
const declaration = (schema, network = null) => ({ requiresFulfillmentTarget: true, fulfillmentSchema: schema, fulfillmentValidationVersion: 1, fulfillmentNetwork: network });
const invalid = code => expect.objectContaining({ status: 400, code: code || 'INVALID_FULFILLMENT_TARGET' });
const btc = base58.encode(Uint8Array.from([0, ...Array(20).fill(17)]));
const tron = base58.encode(Uint8Array.from([0x41, ...Array(20).fill(17)]));
const evm = '0x52908400098527886E0F7030069857D2E4169EE7';
test.each(['playerId', 'accountId'])('%s is bounded, preserves case and leading zeroes', schema => {
  expect(normalizeTarget({ [schema]: ' 00Ab-c_1 ' }, declaration(schema)).target).toEqual({ [schema]: '00Ab-c_1' });
});
test.each([null, [], {}, { accountId: 123 }, { accountId: 'abc', price: 1 }, { playerId: 'abc' }, { accountId: {} }])('strict target shape: %p', target => {
  expect(() => normalizeTarget(target, declaration('accountId'))).toThrow(invalid());
});
test.each(['ab', 'a'.repeat(33), 'a'.repeat(129), 'a b', 'a.b', 'abc\n', '\tabc', 'abc\0', 'abc\x7f', 'abc‮', 'abc​', '<script>', 'abc&x', 'abc"x', "abc'x", 'abc`x', 'abc\\x', 'éabc'])('unsafe account target rejected: %p', value => {
  expect(() => normalizeTarget({ accountId: value }, declaration('accountId'))).toThrow(invalid());
});
test('missing required target and target-free strictness', () => {
  expect(() => normalizeTarget(undefined, declaration('playerId'))).toThrow(invalid('FULFILLMENT_TARGET_REQUIRED'));
  const optional = { ...declaration(null), requiresFulfillmentTarget: false };
  expect(normalizeTarget(undefined, optional)).toBeNull();
  expect(() => normalizeTarget(null, optional)).toThrow(invalid('UNKNOWN_PURCHASE_FIELD'));
});
test.each(['+1234567', '+123456789012345'])('E.164 valid boundary: %s', phone => expect(normalizeTarget({ phone }, declaration('phone')).target.phone).toBe(phone));
test.each(['123456789', '+0123456789', '+123456', '+1234567890123456', '+1 23456789', '+1-23456789', '+123456789x1'])('invalid phone: %s', phone => expect(() => normalizeTarget({ phone }, declaration('phone'))).toThrow(invalid()));
test('email canonicalizes domain only and retains plus addressing', () => expect(normalizeTarget({ email: 'Name+tag@EXAMPLE.COM' }, declaration('email')).target.email).toBe('Name+tag@example.com'));
test.each(['a..b@example.com', '.ab@example.com', 'ab.@example.com', 'ab@localhost', 'ab@-example.com', 'ab@ex_ample.com', 'a'.repeat(65) + '@example.com', 'ab&c@example.com', '"abc"@example.com', 'a@éxample.com'])('invalid email: %s', email => expect(() => normalizeTarget({ email }, declaration('email'))).toThrow(invalid()));
test('email up to 254 characters, not generic 128 limit', () => {
  const email = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(57)}.com`;
  expect(email.length).toBe(254);
  expect(normalizeTarget({ email }, declaration('email')).target.email).toBe(email);
});
test('Bitcoin Base58Check mainnet only and case preserved', () => {
  expect(normalizeTarget({ walletAddress: btc }, declaration('walletAddress', 'bitcoin-mainnet')).target.walletAddress).toBe(btc);
  const testnet = base58.encode(Uint8Array.from([0x6f, ...Array(20).fill(17)]));
  expect(() => normalizeTarget({ walletAddress: testnet }, declaration('walletAddress', 'bitcoin-mainnet'))).toThrow(invalid());
  expect(() => normalizeTarget({ walletAddress: btc.slice(0, -1) + (btc.endsWith('1') ? '2' : '1') }, declaration('walletAddress', 'bitcoin-mainnet'))).toThrow(invalid());
});
test.each([['v0', bech32, 0, 20], ['v0-script', bech32, 0, 32], ['taproot', bech32m, 1, 32]])('Bitcoin %s strict decoding and uppercase normalization', (_, codec, version, length) => {
  const address = codec.encode('bc', [version, ...codec.toWords(Array(length).fill(17))]);
  expect(normalizeTarget({ walletAddress: address.toUpperCase() }, declaration('walletAddress', 'bitcoin-mainnet')).target.walletAddress).toBe(address);
  expect(() => normalizeTarget({ walletAddress: 'B' + address.slice(1) }, declaration('walletAddress', 'bitcoin-mainnet'))).toThrow(invalid());
});
test.each([[bech32m, 0, 20], [bech32, 1, 32], [bech32m, 2, 32], [bech32, 0, 19], [bech32m, 1, 20]])('Bitcoin rejects unsupported checksum/version/program combination', (codec, version, length) => {
  expect(() => normalizeTarget({ walletAddress: codec.encode('bc', [version, ...codec.toWords(Array(length).fill(17))]) }, declaration('walletAddress', 'bitcoin-mainnet'))).toThrow(invalid());
});
test.each(['ethereum-mainnet', 'bsc-mainnet'])('EVM canonicalization and checksum on %s', network => {
  const checksummed = getAddress('0x5aeda56215b167893e80b4fe645ba6d5bab767de');
  expect(normalizeTarget({ walletAddress: checksummed }, declaration('walletAddress', network)).target.walletAddress).toBe(checksummed.toLowerCase());
  const broken = checksummed.replace('A', 'a');
  expect(broken).not.toBe(checksummed);
  expect(() => normalizeTarget({ walletAddress: broken }, declaration('walletAddress', network))).toThrow(invalid());
  expect(() => normalizeTarget({ walletAddress: '0x' + '0'.repeat(40) }, declaration('walletAddress', network))).toThrow(invalid());
});
test('TRON preserves case, rejects uppercase corruption, checksum and zero account', () => {
  expect(normalizeTarget({ walletAddress: tron }, declaration('walletAddress', 'tron-mainnet')).target.walletAddress).toBe(tron);
  for (const walletAddress of [tron.toUpperCase(), tron.slice(0, -1) + '0', base58.encode(Uint8Array.from([0x41, ...Array(20).fill(0)]))]) expect(() => normalizeTarget({ walletAddress }, declaration('walletAddress', 'tron-mainnet'))).toThrow(invalid());
});
test('wallet never accepts client network or unsupported server network', () => {
  expect(() => normalizeTarget({ walletAddress: evm, network: 'ethereum-mainnet' }, declaration('walletAddress', 'ethereum-mainnet'))).toThrow(invalid());
  expect(() => normalizeTarget({ walletAddress: evm }, declaration('walletAddress', 'unknown'))).toThrow(expect.objectContaining({ status: 503, code: 'UNSUPPORTED_NETWORK' }));
});
describe('File-level isolated catalog publication', () => {
  let directory, catalog;
  function modify(filename, mutate) { const file = path.join(directory, filename); const data = JSON.parse(fs.readFileSync(file, 'utf8')); mutate(data); fs.writeFileSync(file, JSON.stringify(data)); catalog.load(); }
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'order-catalog-tests-'));
    for (const filename of Object.keys(FILES)) fs.copyFileSync(path.join(__dirname, '../data', filename), path.join(directory, filename));
    catalog = createCatalogService({ directory }); catalog.load();
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));
  test('production merge preserves crypto IDs and schema isolation', () => {
    expect(catalog.getCategory('cryptos').map(item => item.id)).toEqual([1,2,3,4,5,6,7,8,9,10,11]);
    expect(catalog.getCategory('apps').every(item => item.fulfillmentSchema === 'accountId')).toBe(true);
    expect(catalog.getCategory('cryptos').find(item => item.id === 5)).toMatchObject({ sourceFile: 'cryptos.json', fulfillmentNetwork: 'bsc-mainnet' });
  });
  test.each(Object.keys(FILES))('missing %s fails its entire category, not unrelated categories', filename => {
    fs.unlinkSync(path.join(directory, filename)); catalog.load();
    expect(() => catalog.getCategory(FILES[filename].category)).toThrow(expect.objectContaining({ code: 'FULFILLMENT_CONFIGURATION_INVALID' }));
    expect(catalog.getCategory(FILES[filename].category === 'apps' ? 'games' : 'apps').length).toBeGreaterThan(0);
  });
  test.each(Object.keys(FILES))('malformed %s fails closed', filename => {
    fs.writeFileSync(path.join(directory, filename), '{invalid'); catalog.load();
    expect(() => catalog.getCategory(FILES[filename].category)).toThrow(expect.objectContaining({ code: 'FULFILLMENT_CONFIGURATION_INVALID' }));
  });
  test.each([['payments.json','walletAddress'], ['cryptos.json','accountId'], ['apps.json','phone'], ['games.json','accountId'], ['balances.json','accountId'], ['mobile-payments.json','accountId']])('contradictory schema in %s is rejected', (filename, schema) => {
    modify(filename, root => { root.products[0].fulfillmentSchema = schema; });
    expect(() => catalog.getCategory(FILES[filename].category)).toThrow(expect.objectContaining({ code: 'FULFILLMENT_CONFIGURATION_INVALID' }));
  });
  test('changing file default cannot loosen its policy', () => {
    modify('payments.json', root => { root.defaultFulfillmentSchema = 'walletAddress'; });
    expect(() => catalog.getCategory('cryptos')).toThrow(expect.objectContaining({ code: 'FULFILLMENT_CONFIGURATION_INVALID' }));
  });
  test('duplicate IDs across unified crypto source files fail closed', () => {
    modify('payments.json', root => { root.products[0].id = 3; });
    expect(() => catalog.getCategory('cryptos')).toThrow(expect.objectContaining({ code: 'FULFILLMENT_CONFIGURATION_INVALID' }));
  });
  test('unallowlisted files are never ingested; unallowlisted categories rejected', () => {
    fs.writeFileSync(path.join(directory, 'evil.json'), '{invalid');
    expect(catalog.load().ready).toBe(true);
    expect(() => catalog.getCategory('../evil')).toThrow(); expect(() => catalog.getCategory('essential')).toThrow();
  });
  test('product omission inherits only its file default; explicit contradiction is not ignored', () => {
    modify('payments.json', root => { delete root.products[0].fulfillmentSchema; });
    expect(catalog.getCategory('cryptos').find(item => item.id === 1).fulfillmentSchema).toBe('accountId');
  });
  test('target-free override must be null and cannot silently retain default', () => {
    modify('apps.json', root => { root.products[0].requiresFulfillmentTarget = false; root.products[0].fulfillmentSchema = null; });
    expect(catalog.getCategory('apps')[0].fulfillmentSchema).toBeNull();
    modify('apps.json', root => { root.products[0].fulfillmentSchema = 'accountId'; });
    expect(() => catalog.getCategory('apps')).toThrow(expect.objectContaining({ code: 'FULFILLMENT_CONFIGURATION_INVALID' }));
  });
  test.each([root => { root.products[0].price = '0.001'; }, root => { root.products[0].quantity = 0; }, root => { root.products[0].requiresFulfillmentTarget = 'true'; }])('malformed product policy fails the category', mutate => {
    modify('apps.json', mutate); expect(() => catalog.getCategory('apps')).toThrow(expect.objectContaining({ code: 'FULFILLMENT_CONFIGURATION_INVALID' }));
  });
});
