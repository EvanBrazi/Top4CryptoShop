'use strict';

// Read-only connectivity check. Never imports the migration runner or runs DDL.
const path = require('node:path');
const { connectionOptions } = require('./connection');

async function smoke({ env = process.env, PoolClass } = {}) {
  const options = connectionOptions(env, 'DIRECT_URL', { direct: true });
  const Pool = PoolClass || require('pg').Pool;
  const pool = new Pool({ ...options, application_name: 'top4cryptoshop-smoke',
    max: 1, idleTimeoutMillis: 1000, query_timeout: 15000, allowExitOnIdle: true });
  pool.on('error', () => {}); // Query/connect failures below; never log private context.
  let client;
  try {
    client = await pool.connect();
    client.on('error', () => {}); // Also sanitize asynchronous borrowed-client errors.
    const tls = client.connection?.stream;
    if (tls?.encrypted !== true || tls.authorized !== true) {
      throw Object.assign(new Error('PG_SMOKE_TLS_UNVERIFIED'), { code: 'PG_SMOKE_TLS_UNVERIFIED' });
    }
    const version = await client.query('SELECT version();');
    const database = await client.query('SELECT current_database();');
    if (typeof version.rows[0]?.version !== 'string' || typeof database.rows[0]?.current_database !== 'string') {
      throw Object.assign(new Error('PG_SMOKE_RESULT_INVALID'), { code: 'PG_SMOKE_RESULT_INVALID' });
    }
    return { version: version.rows[0].version, database: database.rows[0].current_database };
  } finally {
    try { if (client) client.release(); } finally { await pool.end(); }
  }
}

async function main() {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: false, quiet: true });
  const result = await smoke();
  // Print only the two explicitly requested results; never URLs or credentials.
  console.log(`PostgreSQL version: ${JSON.stringify(result.version)}`);
  console.log(`Current database: ${JSON.stringify(result.database)}`);
  console.log('TLS: encrypted and certificate verified');
  console.log('Pool closed. No DDL or migrations executed.');
}

if (require.main === module) {
  main().catch(cause => {
    const code = typeof cause.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(cause.code) ? cause.code : 'PG_SMOKE_ERROR';
    console.error(`PostgreSQL smoke stopped: ${code}`);
    process.exitCode = 1;
  });
}

module.exports = { smoke };
