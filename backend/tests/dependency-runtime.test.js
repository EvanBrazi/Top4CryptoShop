'use strict';
const http = require('node:http');
const axios = require('../node_modules/axios');
const { request: undiciRequest } = require('../node_modules/undici');
const cheerio = require('../node_modules/cheerio');
const WebSocket = require('../node_modules/ws');
let server, origin, wss;
beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      if (req.url === '/large') { res.end(Buffer.alloc(16384, 'x')); return; }
      if (req.url === '/redirect') { res.writeHead(302, { location: '/echo' }); res.end(); return; }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ url: req.url, type: req.headers['content-type'], body: Buffer.concat(chunks).toString('utf8') }));
    });
  });
  wss = new WebSocket.WebSocketServer({ server, path: '/ws', maxPayload: 8 });
  wss.on('connection', socket => { socket.on('error', () => {}); socket.on('message', data => socket.send(data)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => {
  for (const socket of wss.clients) socket.terminate();
  await new Promise(resolve => wss.close(resolve)); await new Promise(resolve => server.close(resolve));
});
test('Axios JSON and redirects still work with the updated HTTP adapter', async () => {
  const posted = await axios.post(origin + '/echo', { value: 'unchanged' }, { proxy: false });
  expect(JSON.parse(posted.data.body)).toEqual({ value: 'unchanged' });
  expect((await axios.get(origin + '/redirect', { proxy: false })).data.url).toBe('/echo');
});
test('Axios multipart serialization preserves boundary and content', async () => {
  const data = new FormData(); data.append('value', 'literal_value'); data.append('file', new Blob(['file-content'], { type: 'text/plain' }), 'owned-test.txt');
  const response = await axios.post(origin + '/echo', data, { proxy: false });
  expect(response.data.type).toMatch(/^multipart\/form-data; boundary=/);
  expect(response.data.body).toContain('literal_value'); expect(response.data.body).toContain('file-content');
});
test('Axios rejects responses over the configured content limit', async () => {
  await expect(axios.get(origin + '/large', { proxy: false, maxContentLength: 16 })).rejects.toMatchObject({ isAxiosError: true });
});
test('NO_PROXY bypass uses the owned destination, not the owned proxy', async () => {
  const keys = ['HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy', 'NO_PROXY', 'no_proxy'];
  const old = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    for (const key of ['HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy']) process.env[key] = origin;
    process.env.NO_PROXY = process.env.no_proxy = '127.0.0.1';
    expect((await axios.get(origin + '/echo')).data.url).toBe('/echo');
  } finally { for (const key of keys) { if (old[key] === undefined) delete process.env[key]; else process.env[key] = old[key]; } }
});
test('Undici 7 request and unchanged Cheerio parser still work together', async () => {
  const response = await undiciRequest(origin + '/echo'); expect((await response.body.json()).url).toBe('/echo');
  expect(cheerio.load('<p class="test">literal</p>')('.test').text()).toBe('literal');
});
function connected() {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(origin.replace('http:', 'ws:') + '/ws');
    socket.once('error', reject); socket.once('open', () => { socket.removeListener('error', reject); socket.on('error', () => {}); resolve(socket); });
  });
}
test('updated ws preserves echo and orderly close', async () => {
  const socket = await connected();
  const message = new Promise(resolve => socket.once('message', resolve)); socket.send('ok'); expect((await message).toString()).toBe('ok');
  const closed = new Promise(resolve => socket.once('close', resolve)); socket.close(); await closed;
});
test('updated ws enforces a bounded maximum payload', async () => {
  const socket = await connected(); const closed = new Promise(resolve => socket.once('close', resolve));
  socket.send('too-large-payload'); expect(await closed).toBe(1009);
});
