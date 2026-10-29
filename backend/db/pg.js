'use strict';

// Foundation approved and pg installed; application wiring remains deferred.
// Importing this module does not load credentials, construct a pool or connect.
const { connectionOptions } = require('./connection');
let pool;

function getPool() {
  if (!pool) {
    const options = connectionOptions(process.env, 'DATABASE_URL');
    const { Pool } = require('pg');
    pool = new Pool({ ...options, max: 5, idleTimeoutMillis: 30000 });
    pool.on('error', () => {
      // Do not log the error object: it can contain credentials or SQL context.
      console.error('PostgreSQL idle connection error');
    });
  }
  return pool;
}

async function closePool() {
  const existing = pool;
  pool = undefined;
  if (existing) await existing.end();
}

// No global BIGINT/NUMERIC parsers: pg must retain its safe string defaults.
// Financial operations must check out ONE client; this module is not a
// financial transaction API and must not be wired before the coordinated port.
module.exports = { getPool, closePool };
