'use strict';
// Real installed Nodemailer, with a test-owned loopback SMTP fixture only in the transport block.
// Disabled controller contracts never import/mock deleted models or start an SMTP server.
jest.mock('../db/pg', () => {
  const refused = () => { throw new Error('UNIT_DATABASE_ACTIVITY_REFUSED'); };
  const pool = { query: jest.fn(refused), connect: jest.fn(refused) };
  return { getPool: jest.fn(() => pool), closePool: jest.fn(), pool };
});
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const crypto = require('node:crypto');
const nodemailer = require('../node_modules/nodemailer');
const Mail = require('nodemailer/lib/mailer');
const speakeasy = require('../node_modules/speakeasy');
const database = require('../db/pg');

// SMTP-001..SMTP-005: retained real transport/configuration tests and assertions.
describe('retained real Nodemailer transport contracts', () => {
  const createTransport = nodemailer.createTransport.bind(nodemailer);
  let server, port, sockets, messages, rejectAuth, commands;
  const transports = [];
  function mailer(options = {}) {
    const transport = createTransport({ host: '127.0.0.1', port, secure: false, ignoreTLS: true,
      connectionTimeout: 2000, greetingTimeout: 2000, socketTimeout: 2000,
      auth: { user: 'local-test-user', pass: 'local-test-password' }, ...options });
    transports.push(transport); return transport;
  }
  beforeAll(async () => {
    sockets = new Set();
    server = net.createServer(socket => {
      sockets.add(socket); socket.once('close', () => sockets.delete(socket)); socket.on('error', () => {});
      socket.setEncoding('utf8'); socket.write('220 local-test ESMTP ready\r\n');
      let buffer = '', inData = false, data = [], envelope = [];
      socket.on('data', chunk => {
        buffer += chunk; let end;
        while ((end = buffer.indexOf('\r\n')) >= 0) {
          const line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
          if (inData) {
            if (line === '.') { messages.push({ envelope, data: data.join('\r\n') }); inData = false; socket.write('250 accepted\r\n'); }
            else data.push(line.startsWith('..') ? line.slice(1) : line);
            continue;
          }
          const verb = line.split(' ')[0].toUpperCase(); commands.push(verb);
          if (verb === 'EHLO' || verb === 'HELO') socket.write('250-local-test\r\n250-SIZE 10485760\r\n250 AUTH PLAIN\r\n');
          else if (verb === 'AUTH') socket.write(rejectAuth ? '535 authentication failed\r\n' : '235 authenticated\r\n');
          else if (verb === 'MAIL' || verb === 'RCPT') { envelope.push(line); socket.write('250 ok\r\n'); }
          else if (verb === 'DATA') { inData = true; data = []; socket.write('354 send message\r\n'); }
          else if (verb === 'QUIT') socket.end('221 goodbye\r\n');
          else if (verb === 'RSET' || verb === 'NOOP') socket.write('250 ok\r\n');
          else socket.write('502 unsupported\r\n');
        }
      });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); port = server.address().port;
  });
  beforeEach(() => { messages = []; commands = []; rejectAuth = false; });
  afterEach(() => { for (const transport of transports.splice(0)) transport.close(); });
  afterAll(async () => { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); });
  test('the existing Gmail service configuration still selects authenticated TLS on port 465', () => {
    const transport = createTransport({ service: 'gmail', auth: { user: 'account@example.com', pass: 'test-password' } });
    transports.push(transport);
    expect(transport.transporter.options).toMatchObject({ host: 'smtp.gmail.com', port: 465, secure: true });
    expect(transport.transporter.options.auth).toMatchObject({ user: 'account@example.com', pass: 'test-password' });
  });
  test('verify uses the real SMTP authentication handshake', async () => { await expect(mailer().verify()).resolves.toBe(true); expect(commands).toContain('AUTH'); expect(messages).toHaveLength(0); });
  test('sendMail delivers bounded HTML/text/attachment MIME over the local SMTP transport', async () => {
    const info = await mailer().sendMail({ from: 'sender@example.com', to: 'recipient@example.com', subject: 'Local mail regression',
      text: 'Plain text body', html: '<p>HTML body</p>', attachments: [{ filename: 'test.txt', content: Buffer.from('attachment body') }] });
    expect(info.accepted).toEqual(['recipient@example.com']); expect(messages).toHaveLength(1);
    expect(messages[0].envelope.join('\n')).toContain('MAIL FROM:<sender@example.com>');
    expect(messages[0].envelope.join('\n')).toContain('RCPT TO:<recipient@example.com>');
    expect(messages[0].data).toContain('Subject: Local mail regression');
    expect(messages[0].data).toContain('<p>HTML body</p>'); expect(messages[0].data).toContain('filename=test.txt');
  });
  test('SMTP authentication rejection is a safe rejected promise, not a successful send', async () => {
    rejectAuth = true;
    await expect(mailer().sendMail({ from: 'a@example.com', to: 'b@example.com', text: 'not delivered' })).rejects.toMatchObject({ code: 'EAUTH' });
    expect(messages).toHaveLength(0);
  });
  test('required TLS cannot silently downgrade to an unencrypted server', async () => {
    await expect(mailer({ ignoreTLS: false, requireTLS: true }).verify()).rejects.toMatchObject({ code: 'ETLS' });
    expect(commands).toContain('STARTTLS'); expect(commands).not.toContain('AUTH'); expect(messages).toHaveLength(0);
  });
});

// SMTP-006 closes at send2FAKeyByEmail; the other four aliases are additional boundary regressions.
describe('disabled legacy security controllers', () => {
  const MARKER = { unavailable: true, reason: 'POSTGRES_MIGRATION_PENDING' };
  const ALIASES = ['generateQR', 'verifyToken', 'send2FAKeyByEmail', 'verify2FAFromEmail', 'disable2FA'];
  let guards;

  beforeEach(() => {
    jest.clearAllMocks();
    const refused = () => { throw new Error('DISABLED_CONTROLLER_SIDE_EFFECT_REFUSED'); };
    guards = [];
    const guard = (target, method) => guards.push(jest.spyOn(target, method).mockImplementation(refused));
    // Guard the real installed mail API, including direct invocation of an existing Mail instance.
    guard(nodemailer, 'createTransport'); guard(Mail.prototype, 'sendMail');
    guard(speakeasy, 'generateSecret'); guard(speakeasy, 'generateSecretASCII');
    for (const method of ['randomBytes', 'randomFill', 'randomFillSync', 'randomInt']) guard(crypto, method);
    for (const method of ['setTimeout', 'setInterval', 'setImmediate']) guard(global, method);
    guard(net, 'createServer'); guard(net, 'createConnection'); guard(net, 'connect');
    guard(net.Socket.prototype, 'connect'); guard(http.Server.prototype, 'listen');
    guard(http, 'request'); guard(https, 'request');
    guard(fs, 'writeFileSync'); guard(fs, 'appendFileSync');
    guard(fs.promises, 'writeFile'); guard(fs.promises, 'appendFile');
  });
  afterEach(() => {
    try {
      for (const spy of guards) expect(spy).not.toHaveBeenCalled();
      expect(database.getPool).not.toHaveBeenCalled();
      expect(database.pool.query).not.toHaveBeenCalled();
      expect(database.pool.connect).not.toHaveBeenCalled();
      expect(database.closePool).not.toHaveBeenCalled();
    } finally { jest.restoreAllMocks(); }
  });

  test.each(ALIASES)(
    'disabled securityController.%s returns frozen migration 503 without SMTP transport secret generation or persistence', name => {
      const reads = jest.fn(() => { throw new Error('DISABLED_CONTROLLER_INPUT_MUST_NOT_BE_READ'); });
      const hostile = new Proxy({}, { get: reads, ownKeys: reads, has: reads,
        getOwnPropertyDescriptor: reads, set: reads });
      const res = {};
      res.status = jest.fn(() => res); res.json = jest.fn(() => res);
      // Import under all refusing I/O guards; the real disabled module ignores hostile request data/secrets.
      const controller = require('../controllers/securityController');
      expect(controller[name](hostile, res)).toBe(res);
      expect(res.status.mock.calls).toEqual([[503]]);
      expect(res.json.mock.calls).toEqual([[MARKER]]);
      const result = res.json.mock.calls[0][0];
      expect(Object.isFrozen(result)).toBe(true);
      expect(() => { result.unavailable = false; }).toThrow(TypeError);
      expect(() => { result.reason = 'ENABLED'; }).toThrow(TypeError);
      expect(result).toEqual(MARKER);
      expect(reads).not.toHaveBeenCalled();
      expect(Object.keys(require.cache).some(file => /\/(models|mongoose)\//.test(file))).toBe(false);
    });
});
