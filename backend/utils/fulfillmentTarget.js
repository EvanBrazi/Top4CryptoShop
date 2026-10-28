'use strict';
const { isDeepStrictEqual } = require('node:util');
const validator = require('validator');
const base58check = require('bs58check').default;
const { bech32, bech32m } = require('bech32');
const { getAddress } = require('ethers');
const OrderError = require('./orderError');
const SCHEMAS = Object.freeze(['accountId', 'playerId', 'walletAddress', 'email', 'phone']);
const NETWORKS = Object.freeze(['bitcoin-mainnet', 'ethereum-mainnet', 'tron-mainnet', 'bsc-mainnet']);
const invalid = () => new OrderError(400, 'INVALID_FULFILLMENT_TARGET', 'The fulfillment target is invalid for this product');
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)); }
function policy(value) {
  if (!value || typeof value.requiresFulfillmentTarget !== 'boolean' || value.fulfillmentValidationVersion !== 1 ||
      (value.requiresFulfillmentTarget ? !SCHEMAS.includes(value.fulfillmentSchema) : value.fulfillmentSchema !== null) ||
      (value.fulfillmentSchema !== 'walletAddress' && value.fulfillmentNetwork !== null)) {
    throw new OrderError(503, 'FULFILLMENT_CONFIGURATION_INVALID', 'The product fulfillment configuration is unavailable');
  }
  if (value.fulfillmentSchema === 'walletAddress' && !NETWORKS.includes(value.fulfillmentNetwork)) {
    throw new OrderError(503, 'UNSUPPORTED_NETWORK', 'The product network is unavailable');
  }
}
function bitcoin(address) {
  if (/^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/.test(address)) {
    const data = base58check.decode(address);
    if (data.length !== 21 || ![0, 5].includes(data[0])) throw invalid();
    return address;
  }
  if (address.length > 90 || (address !== address.toLowerCase() && address !== address.toUpperCase())) throw invalid();
  let decoded, modern = false;
  try { decoded = bech32.decode(address, 90); }
  catch (_) { decoded = bech32m.decode(address, 90); modern = true; }
  if (decoded.prefix !== 'bc') throw invalid();
  const version = decoded.words[0];
  const program = bech32.fromWords(decoded.words.slice(1)); // Strict padding conversion.
  if (!((version === 0 && !modern && [20, 32].includes(program.length)) ||
      (version === 1 && modern && program.length === 32))) throw invalid();
  return address.toLowerCase();
}
function wallet(address, network) {
  if (network === 'bitcoin-mainnet') return bitcoin(address);
  if (['ethereum-mainnet', 'bsc-mainnet'].includes(network)) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(address) || /^0x0{40}$/.test(address)) throw invalid();
    return getAddress(address).toLowerCase(); // EIP-55 checked BEFORE canonicalization.
  }
  if (network === 'tron-mainnet') {
    if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) throw invalid();
    const data = base58check.decode(address);
    if (data.length !== 21 || data[0] !== 0x41 || data.slice(1).every(byte => byte === 0)) throw invalid();
    return address; // Base58 is case-sensitive. Never uppercase TRON.
  }
  throw invalid();
}
function normalizeTarget(target, declaration) {
  policy(declaration);
  if (!declaration.requiresFulfillmentTarget) {
    if (target !== undefined) throw new OrderError(400, 'UNKNOWN_PURCHASE_FIELD', 'This product does not accept a fulfillment target');
    return null;
  }
  if (target === undefined) throw new OrderError(400, 'FULFILLMENT_TARGET_REQUIRED', 'A fulfillment target is required for this product');
  const schema = declaration.fulfillmentSchema;
  if (!plain(target) || !isDeepStrictEqual(Object.keys(target), [schema]) || typeof target[schema] !== 'string') throw invalid();
  const raw = target[schema];
  const maximum = schema === 'email' ? 254 : 128;
  if (!raw.length || raw.length > maximum || !/^[\x20-\x7E]+$/.test(raw) || /[<>&'"`\\]/.test(raw)) throw invalid();
  let value = raw.trim();
  try {
    if (['accountId', 'playerId'].includes(schema)) { if (!/^[a-zA-Z0-9_-]{3,32}$/.test(value)) throw invalid(); }
    else if (schema === 'phone') { if (!/^\+[1-9]\d{6,14}$/.test(value)) throw invalid(); }
    else if (schema === 'walletAddress') value = wallet(value, declaration.fulfillmentNetwork);
    else if (schema === 'email') {
      const parts = value.split('@');
      if (parts.length !== 2 || parts[0].length > 64 || !/^[A-Za-z0-9.!#$%*+/=?^_{|}~-]+$/.test(parts[0]) ||
          !/^[A-Za-z0-9.-]+$/.test(parts[1]) || !validator.isEmail(value, { allow_display_name: false,
            allow_utf8_local_part: false, require_tld: true, allow_ip_domain: false, ignore_max_length: false })) throw invalid();
      value = `${parts[0]}@${parts[1].toLowerCase()}`;
    }
  } catch (_) { throw invalid(); } // No decoder or raw value is exposed.
  return { schema, validationVersion: 1, network: declaration.fulfillmentNetwork, target: { [schema]: value } };
}
function validateSnapshot(snapshot, declaration) {
  if (snapshot === null && !declaration.requiresFulfillmentTarget) { normalizeTarget(undefined, declaration); return; }
  if (!plain(snapshot) || !isDeepStrictEqual(Object.keys(snapshot).sort(), ['schema', 'validationVersion', 'network', 'target'].sort()) ||
      !isDeepStrictEqual(snapshot, normalizeTarget(snapshot.target, declaration))) throw invalid();
}
module.exports = { SCHEMAS, NETWORKS, plain, policy, normalizeTarget, validateSnapshot };
