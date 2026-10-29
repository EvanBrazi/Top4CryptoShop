'use strict';
// Real Nodemailer and a test-owned SMTP socket server; no Gmail/provider requests.
const net = require('node:net');
const nodemailer = require('../node_modules/nodemailer');
const User = require('../models/User');
const SecurityLog = require('../routes/SecurityLog');
const controller = require('../controllers/securityController');
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
test('the current email controller works with the new real Nodemailer API', async () => {
  const oldUser = process.env.MAIL_USER, oldPass = process.env.MAIL_PASS;
  process.env.MAIL_USER = 'local-test-user'; process.env.MAIL_PASS = 'local-test-password';
  const log = jest.spyOn(SecurityLog, 'create').mockResolvedValue({});
  const update = jest.spyOn(User, 'findByIdAndUpdate').mockResolvedValue({});
  const create = jest.spyOn(nodemailer, 'createTransport').mockImplementation(() => mailer());
  const res = { json: jest.fn() };
  try {
    await controller.send2FAKeyByEmail({ user: { _id: 'abcdef0123456789abcdef01', emailVerified: true,
      email: 'recipient@example.com', username: 'Local_User', twoFAStatus: 'disabled' }, ip: '127.0.0.1', headers: { 'user-agent': 'local-test' } }, res);
    expect(create).toHaveBeenCalledWith({ service: 'gmail', auth: { user: 'local-test-user', pass: 'local-test-password' } });
    expect(messages).toHaveLength(1); expect(messages[0].envelope.join('\n')).toContain('RCPT TO:<recipient@example.com>');
    expect(update).toHaveBeenCalledWith('abcdef0123456789abcdef01', expect.objectContaining({ twoFAStatus: 'pending', twoFASecret: expect.any(String) }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  } finally {
    create.mockRestore(); update.mockRestore(); log.mockRestore();
    if (oldUser === undefined) delete process.env.MAIL_USER; else process.env.MAIL_USER = oldUser;
    if (oldPass === undefined) delete process.env.MAIL_PASS; else process.env.MAIL_PASS = oldPass;
  }
});
