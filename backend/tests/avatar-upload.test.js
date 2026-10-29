'use strict';
// Real HTTP, shared JWT/session/CSRF auth, Multer and Cloudinary v2 configuration.
// Only database access and the external Cloudinary transport are isolated.
jest.mock('../utils/sessionStore', () => ({ activeSessions: new Map() }));
jest.mock('../config/cloudinary', () => {
  const { Writable } = require('node:stream');
  const sdk = require('../node_modules/cloudinary').v2;
  sdk.config({ cloud_name: 'avatar-test-cloud', api_key: 'test-key', api_secret: 'test-signing-secret' });
  const transport = { mode: 'normal', patch: {}, calls: [], held: [], config: sdk.config,
    uploader: { destroy: jest.fn().mockResolvedValue({ result: 'ok' }) } };
  transport.uploader.upload_stream = jest.fn((options, callback) => {
    if (transport.mode === 'throw') throw new Error('private-provider-secret');
    const chunks = [];
    const reply = () => ({ public_id: options.public_id, resource_type: 'image', type: 'upload',
      format: 'jpg', bytes: Buffer.concat(chunks).length,
      secure_url: `https://res.cloudinary.com/avatar-test-cloud/image/upload/v1/${options.public_id}.jpg`, ...transport.patch });
    transport.calls.push({ options, chunks });
    if (transport.mode === 'sync-error') callback(new Error('private-provider-secret'));
    return new Writable({
      write(chunk, encoding, done) { chunks.push(Buffer.from(chunk)); done(); },
      final(done) {
        if (transport.mode === 'hold') transport.held.push(() => callback(null, reply()));
        else if (transport.mode === 'callback-error') callback(new Error('private-provider-secret'));
        else if (transport.mode === 'stream-error') return done(new Error('private-provider-secret'));
        else { callback(null, reply()); if (transport.mode === 'twice') callback(null, reply()); }
        done();
      }
    });
  });
  return transport;
});
const express = require('../node_modules/express');
const jwt = require('../node_modules/jsonwebtoken');
const mongoose = require('../node_modules/mongoose');
const sharp = require('../node_modules/sharp');
const User = require('../models/User');
const RevokedToken = require('../models/RevokedToken');
const cloudinary = require('../config/cloudinary');
const { activeSessions } = require('../utils/sessionStore');
const users = require('../routes/users');
const OWNER = 'abcdef0123456789abcdef01', OTHER = 'abcdef0123456789abcdef02', ADMIN = 'abcdef0123456789abcdef03';
const secretBefore = process.env.JWT_SECRET;
let records, server, origin, image;
const matching = (record, filter) => record && Object.entries(filter).every(([key, value]) =>
  key === '_id' ? String(record._id) === String(value) : record[key] === value);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(test) { for (let i = 0; i < 100 && !test(); i++) await pause(10); expect(test()).toBe(true); }
beforeAll(async () => {
  process.env.JWT_SECRET = 'isolated-avatar-jwt-secret';
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(RevokedToken.collection, 'findOne').mockResolvedValue(null);
  jest.spyOn(User.collection, 'findOne').mockImplementation(async filter => {
    const record = records.get(String(filter._id)); return matching(record, filter) ? { ...record } : null;
  });
  jest.spyOn(User.collection, 'findOneAndUpdate').mockImplementation(async (filter, update) => {
    const record = records.get(String(filter._id));
    if (!matching(record, filter)) return null;
    Object.assign(record, update.$set); return { _id: record._id, avatar: record.avatar };
  });
  image = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#abcdef' } }).png().toBuffer();
  const app = express();
  app.use((req, res, next) => { req.session = { csrfToken: 'avatar-csrf' }; next(); });
  app.use('/api/users', users);
  app.use((error, req, res, next) => {
    if (!res.destroyed) res.status(error.status || 500).json({ code: error.code || 'FAILED', error: error.message });
  });
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  origin = `http://127.0.0.1:${server.address().port}/api/users`;
});
beforeEach(() => {
  jest.clearAllMocks(); cloudinary.mode = 'normal'; cloudinary.patch = {}; cloudinary.calls.length = 0; cloudinary.held.length = 0;
  records = new Map([OWNER, OTHER, ADMIN].map(id => [id, { _id: new mongoose.Types.ObjectId(id),
    username: 'Avatar_User', email: `${id}@example.com`, provider: 'google', tokenVersion: 1,
    accountStatus: 'active', role: id === ADMIN ? 'admin' : 'user', avatar: '', balance: 100, balanceCents: 10000 }]));
  activeSessions.clear();
  for (const id of records.keys()) activeSessions.set(`session-${id}`, { userId: id, expiresAt: Date.now() + 3600000 });
});
afterAll(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  activeSessions.clear(); jest.restoreAllMocks();
  if (secretBefore === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = secretBefore;
});
function form({ mime = 'image/png', bytes = image, field = 'avatar', extra, extraFirst = false, second = false } = {}) {
  const data = new FormData();
  if (extra && extraFirst) data.append('role', 'admin');
  if (bytes !== null) data.append(field, new Blob([bytes], { type: mime }), 'untrusted-original.png');
  if (extra && !extraFirst) data.append('role', 'admin');
  if (second) data.append('avatar', new Blob([image], { type: mime }), 'second.png');
  return data;
}
async function request({ actor = OWNER, target = OWNER, csrf = true, data = form(), signal, headers = {} } = {}) {
  const token = actor && jwt.sign({ userId: actor, tokenVersion: 1, role: 'admin' }, process.env.JWT_SECRET,
    { algorithm: 'HS256', issuer: 'your-app-api', expiresIn: '1h' });
  const response = await fetch(`${origin}/${target}/avatar`, { method: 'POST', signal, body: data,
    headers: { ...(actor ? { authorization: `Bearer ${token}`, 'x-session-id': `session-${actor}` } : {}),
      ...(csrf ? { 'x-csrf-token': 'avatar-csrf' } : {}), ...headers } });
  return { status: response.status, body: await response.json() };
}
function noWrite() { expect(User.collection.findOneAndUpdate).not.toHaveBeenCalled(); expect(records.get(OWNER)).toMatchObject({ avatar: '', balance: 100, balanceCents: 10000 }); }
test('successful v2 upload preserves avatar contract, formats and owned cleanup ID', async () => {
  const result = await request(); expect(result.status).toBe(200);
  const call = cloudinary.calls[0];
  expect(call.options).toMatchObject({ public_id: expect.stringMatching(/^payments_receipts\/[a-f\d-]{36}$/),
    type: 'upload', resource_type: 'image', overwrite: false, format: 'jpg', timeout: 30000,
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp', 'bmp', 'tiff'],
    transformation: [{ format: 'jpg', width: 800, height: 800, crop: 'limit' }] });
  expect(Buffer.concat(call.chunks)).toEqual(image);
  expect(result.body.avatar).toContain(`/${call.options.public_id}.jpg`);
  const update = User.collection.findOneAndUpdate.mock.calls[0][1];
  expect(update).toEqual({ $set: { avatar: result.body.avatar, updatedAt: expect.any(Date) },
    $setOnInsert: { createdAt: expect.any(Date) } });
  expect(records.get(OWNER)).toMatchObject({ balance: 100, balanceCents: 10000 });
  expect(cloudinary.uploader.destroy).not.toHaveBeenCalled();
});
test.each(['image/jpeg', 'image/webp', 'image/bmp', 'image/x-ms-bmp', 'image/tiff'])('keeps existing allowed MIME policy: %s', async mime => { expect((await request({ data: form({ mime }) })).status).toBe(200); });
test.each([{ actor: null }, { actor: OTHER }, { actor: ADMIN }, { csrf: false }])('auth/self/CSRF failure prevents any provider call: %p', async options => {
  expect((await request(options)).status).toBeGreaterThanOrEqual(400); expect(cloudinary.calls).toHaveLength(0); noWrite();
});
test.each(['image/svg+xml', 'image/gif', 'application/octet-stream'])('rejects unsupported MIME before upload: %s', async mime => {
  expect((await request({ data: form({ mime }) })).status).toBe(400); expect(cloudinary.calls).toHaveLength(0); noWrite();
});
test.each([{ extra: true }, { extra: true, extraFirst: true }, { second: true }, { field: 'receipt' }, { bytes: Buffer.alloc(5 * 1024 * 1024 + 1) }, { bytes: Buffer.alloc(0) }, { bytes: null }])('rejects invalid multipart before provider write: %#', async options => {
  expect((await request({ data: form(options) })).status).toBe(400); expect(cloudinary.calls).toHaveLength(0); noWrite();
});
test('malformed multipart boundary never writes an avatar', async () => {
  const result = await request({ data: '--bad\r\nmalformed', headers: { 'content-type': 'multipart/form-data; boundary=bad' } });
  expect(result.status).toBe(400); expect(cloudinary.calls).toHaveLength(0); noWrite();
});
test.each(['throw', 'callback-error', 'stream-error', 'sync-error'])('provider %s is sanitized and cleaned up', async mode => {
  cloudinary.mode = mode; const result = await request(); expect(result.status).toBe(502);
  expect(JSON.stringify(result.body)).not.toContain('private-provider-secret'); noWrite();
  if (mode === 'sync-error') expect(Buffer.concat(cloudinary.calls[0].chunks)).toHaveLength(0);
  expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(expect.stringMatching(/^payments_receipts\/[a-f\d-]{36}$/), expect.objectContaining({ type: 'upload', resource_type: 'image' }));
});
test.each([{ public_id: 'someone-elses-asset' }, { type: 'authenticated' }, { resource_type: 'raw' }, { format: 'png' }, { bytes: NaN },
  { secure_url: 'https://attacker.example/asset.jpg' }, { secure_url: 'https://res.cloudinary.com/another-cloud/image/upload/asset.jpg' }])('rejects contradictory provider evidence: %p', async patch => {
  cloudinary.patch = patch; expect((await request()).status).toBe(502); noWrite();
  expect(cloudinary.uploader.destroy.mock.calls.every(([id]) => id === cloudinary.calls[0].options.public_id)).toBe(true);
});
test('duplicate provider success cannot delete an accepted avatar', async () => {
  cloudinary.mode = 'twice'; expect((await request()).status).toBe(200);
  expect(User.collection.findOneAndUpdate).toHaveBeenCalledTimes(1);
  expect(cloudinary.uploader.destroy).not.toHaveBeenCalled();
});
test('persistence failure cleans the returned owned asset', async () => {
  User.collection.findOneAndUpdate.mockRejectedValueOnce(new Error('database failed'));
  expect((await request()).status).toBe(500);
  expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(cloudinary.calls[0].options.public_id);
  expect(records.get(OWNER).avatar).toBe('');
});
test('changed authentication version after upload cannot persist an avatar', async () => {
  cloudinary.mode = 'hold'; const pending = request(); await waitFor(() => cloudinary.held.length === 1);
  records.get(OWNER).tokenVersion = 2; cloudinary.held[0]();
  expect((await pending).status).toBe(404); expect(records.get(OWNER).avatar).toBe('');
  expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(cloudinary.calls[0].options.public_id);
});
test('client interruption and late provider confirmation both clean only the owned ID', async () => {
  cloudinary.mode = 'hold'; const controller = new AbortController();
  const pending = request({ signal: controller.signal }).catch(error => error);
  await waitFor(() => cloudinary.held.length === 1); controller.abort(); expect((await pending).name).toBe('AbortError');
  await waitFor(() => cloudinary.uploader.destroy.mock.calls.length === 1);
  cloudinary.held[0](); await waitFor(() => cloudinary.uploader.destroy.mock.calls.length === 2); noWrite();
});
test('bounded timeout rejects without waiting for provider completion', async () => {
  const original = global.setTimeout;
  const timer = jest.spyOn(global, 'setTimeout').mockImplementation((fn, delay, ...args) => original(fn, delay === 30000 ? 25 : delay, ...args));
  try { cloudinary.mode = 'hold'; expect((await request()).status).toBe(504); noWrite(); expect(cloudinary.uploader.destroy).toHaveBeenCalled(); }
  finally { timer.mockRestore(); }
});
