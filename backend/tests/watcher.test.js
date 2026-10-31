'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');
const backend = createRequire(path.join(__dirname, '../package.json'));
const sentry = createRequire(backend.resolve('@sentry/node'));
const nodemon = createRequire(backend.resolve('nodemon'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
test('production and development glob APIs retain their expected major lines', () => {
  const m9 = sentry('minimatch'), m10 = nodemon('minimatch');
  expect(m9.minimatch('catalog/game.json', 'catalog/*.json')).toBe(true);
  expect(m9.minimatch('catalog/game.json', 'catalog/*.js')).toBe(false);
  expect(m10.minimatch('ignored/file.js', 'ignored/**')).toBe(true);
  expect(sentry('minimatch/package.json').version).toBe('9.0.9');
  expect(nodemon('minimatch/package.json').version).toBe('10.2.6');
});
test('Nodemon starts, ignores excluded files, restarts on edits and exits cleanly', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'top4-nodemon-test-'));
  fs.mkdirSync(path.join(dir, 'ignored'));
  const app = path.join(dir, 'app.js');
  const source = "console.log('OWNED_READY'); const parent=process.ppid; setInterval(()=>{if(process.ppid!==parent)process.exit(0);},50);\n";
  fs.writeFileSync(app, source);
  const child = spawn(process.execPath, [backend.resolve('nodemon/bin/nodemon.js'), '--quiet', '--watch', dir,
    '--ext', 'js', '--ignore', path.join(dir, 'ignored/**'), '--delay', '0.1', app],
  { cwd: dir, env: { ...process.env, CI: 'true', NO_UPDATE_NOTIFIER: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', errors = '', spawnError;
  child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { errors += chunk; });
  child.once('error', error => { spawnError = error; });
  const ready = () => output.split('OWNED_READY').length - 1;
  const wait = async minimum => {
    for (let i = 0; i < 100 && ready() < minimum; i++) {
      if (spawnError || child.exitCode !== null) throw new Error('Owned watcher failed: ' + (spawnError?.message || errors));
      await pause(50);
    }
    expect(ready()).toBeGreaterThanOrEqual(minimum);
  };
  try {
    await wait(1); await pause(250);
    fs.writeFileSync(path.join(dir, 'ignored', 'ignored.js'), 'ignored'); await pause(500); expect(ready()).toBe(1);
    fs.writeFileSync(app, source + '// watched edit\n'); await wait(2);
  } finally {
    if (child.exitCode === null && child.signalCode === null && !spawnError) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill('SIGTERM'); const force = setTimeout(() => child.kill('SIGKILL'), 5000);
      try { await exited; } finally { clearTimeout(force); }
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
}, 15000);
