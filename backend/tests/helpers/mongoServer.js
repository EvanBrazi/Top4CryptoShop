'use strict';

// This harness only configures a freshly spawned, PID-verified localhost mongod.
const { spawn, spawnSync } = require('node:child_process');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { mongo } = require('../../node_modules/mongoose');
const hasMongod = spawnSync('mongod', ['--version'], { stdio: 'ignore' }).status === 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}
async function startMongoServer({ replicaSet = null } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'financial-service-'));
  let child, bootstrap, spawnError;
  const stop = async () => {
    try { if (bootstrap) await bootstrap.close(); }
    finally {
      try {
        if (child && child.exitCode === null && child.signalCode === null && !spawnError) {
          const exited = new Promise(resolve => child.once('exit', resolve));
          child.kill('SIGTERM');
          const force = setTimeout(() => child.kill('SIGKILL'), 10000);
          try { await exited; } finally { clearTimeout(force); }
        }
      } finally { await rm(directory, { recursive: true, force: true }); }
    }
  };
  try {
    const port = await availablePort();
    const args = ['--dbpath', directory, '--port', String(port), '--bind_ip', '127.0.0.1',
      '--nounixsocket', '--quiet', '--logpath', path.join(directory, 'mongod.log'),
      '--setParameter', 'enableTestCommands=1'];
    if (replicaSet) args.push('--replSet', replicaSet);
    child = spawn('mongod', args, { stdio: 'ignore' });
    child.once('error', error => { spawnError = error; });
    const uri = `mongodb://127.0.0.1:${port}`;
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (spawnError || child.exitCode !== null || child.signalCode !== null) throw new Error('Owned MongoDB test process could not start');
      bootstrap = new mongo.MongoClient(uri, { directConnection: true, serverSelectionTimeoutMS: 500 });
      try { await bootstrap.connect(); break; }
      catch (_) { await bootstrap.close(); bootstrap = null; await sleep(100); }
    }
    if (!bootstrap) throw new Error('Owned MongoDB test process did not become reachable');
    const status = await bootstrap.db('admin').command({ serverStatus: 1 });
    if (status.pid !== child.pid) throw new Error('MongoDB test port is not owned by the spawned process');
    if (replicaSet) {
      await bootstrap.db('admin').command({ replSetInitiate: { _id: replicaSet,
        members: [{ _id: 0, host: `127.0.0.1:${port}` }], settings: { electionTimeoutMillis: 1000 } } });
      let primary = false;
      while (Date.now() < deadline) {
        if ((await bootstrap.db('admin').command({ hello: 1 })).isWritablePrimary) { primary = true; break; }
        await sleep(100);
      }
      if (!primary) throw new Error('Owned MongoDB replica set did not elect a primary');
    }
    await bootstrap.close();
    bootstrap = null;
    return { uri: `${uri}/financial_service_tests${replicaSet ? `?replicaSet=${replicaSet}` : ''}`, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}
module.exports = { hasMongod, startMongoServer };
