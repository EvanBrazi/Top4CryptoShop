# PostgreSQL foundation connectivity pass

**Status update:** after this connectivity pass, migration 001 was manually applied
by the user and independently verified by the assistant, including the ledger
checksum and users columns. Statements below about unapplied 001/DDL and the 717
tests are historical. Current review: `postgres-financial-drafts-review.md`;
manual activation instructions: `postgres-financial-activation-guide.md`.
002-004 remain in drafts and unapplied; latest full regression: 755/755 tests.

## Approved changes

- Added `email_verified BOOLEAN NOT NULL DEFAULT FALSE` to migration 001.
- Kept legacy_mongo_id as an import/reference mapping until all references use
  UUIDs. Continuing legacy-subject JWT acceptance versus forced re-login remains
  explicitly undecided until cut-over. No JWT/application authentication changes.
- Installed exact `pg` **8.23.1**, lifecycle scripts disabled. Required supporting
  packages added; existing compatible pg-protocol advanced from 1.10.3 to 1.16.1.
- Every pre-existing direct backend lock entry and every mongoose/mongodb/
  connect-mongo/bson entry remained identical. Root package/lockfile unchanged.
- Added `db/smoke.js`; no Node repositories or server wiring.

## Offline plan output

Command from the project root: `node backend/db/migrate.js --plan`.

```text
Local migration inventory only; no database connection or applied-status check:
001_create_users_table.sql dcad707a0db33d20fafcbc0d936eb7e473daadc2a43a80b99de2bba5d51e8147
```

This is a filesystem inventory, not a claim that migration 001 is applied.

## Smoke script

Run `node backend/db/smoke.js` from the project root (or `node db/smoke.js` inside
backend). It loads backend/.env without overriding exported environment variables.

- DIRECT_URL only, no DATABASE_URL fallback; same strict verified TLS config.
- One dedicated smoke pool, max 1; borrow one client and verify the live stream is
  encrypted AND certificate-authorized before any query.
- Execute exactly `SELECT version();` and `SELECT current_database();`.
- Release the client and await pool.end() on success and failure.
- Print only the two requested results after pool shutdown, never credentials,
  URLs, private error details or stacks. No migration-runner import or DDL.

## Actual Neon smoke output — successful

After the user supplied the local environment variables, the approved read-only
smoke command completed with exit code 0:

```text
PostgreSQL version: "PostgreSQL 18.6 (4e5fd08) on aarch64-unknown-linux-gnu, compiled by gcc (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0, 64-bit"
Current database: "neondb"
TLS: encrypted and certificate verified
Pool closed. No DDL or migrations executed.
```

The live DIRECT_URL connection is verified, including certificate authorization
and encryption. Only the two approved SELECTs ran; the client was released and
pool shutdown awaited before printing results. No pooled-runtime connectivity or
application cut-over is claimed. No .env values or credentials were printed or
edited by the assistant. Migration 001 and its ledger remain unapplied by us.

### Earlier environment blocker — resolved

The first attempt had stopped with PG_URL_REQUIRED before constructing a pool,
connecting or issuing SQL because nonempty Neon variables were unavailable then.
That earlier result is historical, not the current connection status.

## Environment configuration

Keep values locally in **backend/.env**, with existing MongoDB variables until
cut-over; never paste actual URLs into chat or commit them. URL shape:

```text
DIRECT_URL=postgresql://<user>:<encoded-password>@<direct-host>/<db>?sslmode=verify-full
DATABASE_URL=postgresql://<user>:<encoded-password>@<pooled-host>/<db>?sslmode=verify-full
```

DIRECT_URL must not use a Neon -pooler host. Use percent-encoded credentials.
The approved config accepts sslmode=require while still enforcing certificate/
host verification, or sslmode=verify-full. It rejects libpq channel_binding=require
rather than pretending pg enforces it; omit that option or explicitly use prefer
for a pg-specific URL, with verified TLS retained.

## Verification

- PostgreSQL foundation/smoke tests: **48/48**, **2/2 suites**, 0.617 s.
- Full regression rerun now completed: **717/717**, **17/17 suites**, 22.787 s,
  zero failures/skips and zero snapshots. All original 617 assertions across
  11 original suites remain passing. The earlier execution-tool blocker is resolved.
- npm install completed successfully; installed pg 8.23.1 ran both in regression
  tests and the actual Neon smoke. Optional clean-install verification was not
  completed in the earlier pass and is not claimed here.
- Nine new smoke tests include actual pg refusing a test-owned loopback server
  that declines TLS, before sending startup credentials, and safe string parsing
  for BIGINT/NUMERIC. Other smoke/runner control-flow tests use isolated fixtures,
  not Neon; fixture values are not live connection results.
- Backend audit after installation: **0 Critical, 1 High (frozen Mongoose),
  14 Moderate, 2 Low**, unchanged from the dependency baseline.
- No new pg audit finding. No vulnerable PG telemetry activation.
- No --apply, DDL, data import, DB roles/grants, hosting, staging or Git commits.

Connection output must be observed after the environment variables are available;
Neon migration execution remains separately gated even after a successful smoke.
