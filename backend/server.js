'use strict';
// C1 PostgreSQL-only entry. Importing this file never connects or listens.
// The extracted composition owns reviewed sessions, read-only bootstrap
// verification, financial stubs, and explicit disabled-feature TODOs.
const { createApplication } = require('./services/serverApplication');
const { closePool } = require('./db/pg');

if (require.main === module) {
  require('dotenv').config();
  let runtime, shutdown;
  function stop(exitCode = 0) {
    shutdown ||= (async () => {
      process.exitCode = exitCode;
      try { await runtime?.close(); }
      catch (_) { console.error('SERVER_SHUTDOWN_UNAVAILABLE'); process.exitCode = 1; }
      try { await closePool(); }
      catch (_) { console.error('PG_SHUTDOWN_UNAVAILABLE'); process.exitCode = 1; }
    })();
    return shutdown;
  }
  (async () => {
    runtime = createApplication();
    await runtime.start(); // Connectivity, ledger and catalog verification BEFORE listen.
    console.log('PostgreSQL API is ready');
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void stop(); });
  })().catch(async error => {
    const known = ['PG_BOOTSTRAP_LEDGER_MISMATCH', 'PG_BOOTSTRAP_SCHEMA_MISMATCH', 'PG_BOOTSTRAP_TLS_UNVERIFIED'];
    console.error(known.includes(error?.code) ? error.code : 'SERVER_BOOTSTRAP_UNAVAILABLE');
    await stop(1); // Never log raw errors, connection targets, SQL or credentials.
  });
}
module.exports = { createApplication };
