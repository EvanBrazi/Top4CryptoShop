'use strict';

// REVIEW DRAFT. Defaults to a filesystem-only plan. Nothing auto-runs at boot.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { connectionOptions } = require('./connection');
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const LOCK = [74382601, 1];
const error = code => Object.assign(new Error(code), { code });

async function loadMigrations(directory = MIGRATIONS_DIR) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.name.toLowerCase().endsWith('.sql')) continue;
    const match = /^([0-9]{3,})_[a-z0-9_]+\.sql$/.exec(entry.name);
    if (!entry.isFile() || !match || +match[1] < 1 || +match[1] > 2147483647) throw error('PG_MIGRATION_FILENAME_INVALID');
    const bytes = await fs.readFile(path.join(directory, entry.name));
    if (!bytes.toString('utf8').trim()) throw error('PG_MIGRATION_EMPTY');
    files.push({ version: Number(match[1]), filename: entry.name,
      checksum: createHash('sha256').update(bytes).digest('hex'), sql: bytes.toString('utf8') });
  }
  files.sort((a, b) => a.version - b.version);
  if (!files.length || files.some((file, index) => file.version !== index + 1)) throw error('PG_MIGRATION_SEQUENCE_INVALID');
  return files;
}

function pendingMigrations(files, applied) {
  // Require history to be an exact prefix: missing files, edits, gaps and renames
  // are failures, not invitations to skip a migration or silently repair history.
  if (applied.length > files.length) throw error('PG_MIGRATION_HISTORY_MISMATCH');
  for (let i = 0; i < applied.length; i += 1) {
    const row = applied[i], file = files[i];
    if (row.version !== file.version || row.filename !== file.filename || row.checksum !== file.checksum) {
      throw error('PG_MIGRATION_HISTORY_MISMATCH');
    }
  }
  return files.slice(applied.length);
}

async function applyMigrations({ env = process.env, ClientClass, directory = MIGRATIONS_DIR } = {}) {
  const files = await loadMigrations(directory);
  const options = connectionOptions(env, 'DIRECT_URL', { direct: true });
  const Client = ClientClass || require('pg').Client;
  const client = new Client({ ...options, query_timeout: 65000 });
  let locked = false, transaction = false, commitStarted = false, committed = false;
  // Absorb asynchronous transport errors; query/connect errors are handled below.
  client.on('error', () => {});
  try {
    await client.connect();
    const acquired = await client.query('SELECT pg_try_advisory_lock($1, $2) AS acquired', LOCK);
    if (acquired.rows[0]?.acquired !== true) throw error('PG_MIGRATION_LOCK_BUSY');
    locked = true;
    await client.query('BEGIN');
    transaction = true;
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '60s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '60s'");
    await client.query("SET LOCAL search_path = pg_catalog, public");
    // Administrative metadata, NOT a second application-domain migration.
    // This ledger is explicitly part of the proposal for approval.
    await client.query(`CREATE TABLE IF NOT EXISTS public.schema_migrations (
      version INTEGER PRIMARY KEY CHECK (version > 0),
      filename TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await client.query('REVOKE ALL ON public.schema_migrations FROM PUBLIC');
    const history = await client.query('SELECT version, filename, checksum FROM public.schema_migrations ORDER BY version');
    const pending = pendingMigrations(files, history.rows);
    // One dedicated direct connection, one atomic transaction for the pending
    // batch. SQL files must not contain top-level transaction control or DDL
    // requiring execution outside a transaction (e.g. CREATE INDEX CONCURRENTLY).
    for (const migration of pending) {
      await client.query(migration.sql);
      await client.query('INSERT INTO public.schema_migrations (version, filename, checksum) VALUES ($1, $2, $3)',
        [migration.version, migration.filename, migration.checksum]);
    }
    commitStarted = true;
    await client.query('COMMIT');
    committed = true;
    transaction = false;
    return { applied: pending.map(file => file.filename) };
  } catch (cause) {
    if (transaction) { try { await client.query('ROLLBACK'); } catch (_) {} }
    // Never claim rollback was confirmed after a lost COMMIT acknowledgement.
    // Re-run the reviewed runner to resolve by the durable checksum ledger;
    // do not automatically replay the batch in this process.
    if (commitStarted && !committed) throw error('PG_MIGRATION_OUTCOME_UNKNOWN');
    throw cause;
  } finally {
    if (locked) { try { await client.query('SELECT pg_advisory_unlock($1, $2)', LOCK); } catch (_) {} }
    try { await client.end(); } catch (_) {}
  }
}

async function main(args = process.argv.slice(2)) {
  if (args.length === 0 || (args.length === 1 && args[0] === '--plan')) {
    const files = await loadMigrations();
    console.log('Local migration inventory only; no database connection or applied-status check:');
    for (const file of files) console.log(`${file.filename} ${file.checksum}`);
    return;
  }
  if (args.length !== 1 || args[0] !== '--apply') throw error('PG_MIGRATION_ARGUMENT_INVALID');
  // Do not load .env during import or the offline plan; do not override the shell.
  require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: false, quiet: true });
  const result = await applyMigrations();
  console.log(`Committed ${result.applied.length} migration(s).`);
  for (const filename of result.applied) console.log(filename);
}

if (require.main === module) {
  main().catch(cause => {
    const code = typeof cause.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(cause.code) ? cause.code : 'PG_MIGRATION_ERROR';
    console.error(`Migration stopped: ${code}`); // No SQL, URLs, error detail or stack.
    process.exitCode = 1;
  });
}

module.exports = { loadMigrations, pendingMigrations, applyMigrations, main };
