# Financial migrations — applied; original draft review below

**Current status:** the approved 002-004 drafts were promoted to `db/migrations`
and applied manually by the user; the assistant independently verified all four
ledger checksums and financial catalog guards. Versions 002-004 share timestamp
`2026-10-29 09:11:16.925158+00`. Statements below about inactive/unexecuted financial
drafts describe the ORIGINAL review stage, not the current state. The first user
repository is now implemented but unwired; see `user-repository-review.md` for its
scope and the latest 895/895 regression result. The coordinator remains deferred.

## Migration 001: manually applied and independently verified

Earlier CLI attempts were rejected **before execution** by the tool-service outage;
these were not SQL errors or uncertain commits. That blocker is now resolved for
001: the user ran the approved migration in their own terminal and reported:

```text
Committed 1 migration(s).
001_create_users_table.sql
```

The assistant subsequently reran **only the read-only verification**, independently
confirming the same live results supplied by the user:

- `public.users` and `public.schema_migrations` are BASE TABLEs.
- Ledger version 1 is `001_create_users_table.sql`.
- Recorded and local SHA-256 both equal
  `dcad707a0db33d20fafcbc0d936eb7e473daadc2a43a80b99de2bba5d51e8147`.
- Applied timestamp: `2026-10-29 07:19:30.671927+00`.
- UUID id, BIGINT balance_cents, generated NUMERIC balance, and NOT NULL BOOLEAN
  email_verified were verified, with `checksumMatches: true`.
- TLS was encrypted and certificate verified; the client closed cleanly.

No assistant `--apply` was run after the manual success. The active offline inventory
still contains only 001; the SQL drafts remain inactive. The earlier missing-table
result is historical, not the current database state.

## Review files (NOT active migrations)

- `db/drafts/002_create_financial_operations_table.sql`
- `db/drafts/003_create_payments_table.sql`
- `db/drafts/004_create_orders_table.sql`

The runner applies every pending file in `db/migrations`. These three files must
stay in `db/drafts` until the user approves application. No draft has been executed
against PostgreSQL, including for SQL syntax/constraint validation. No repositories,
financial routes, Mongo/PG mixed writes, imports, or hosting changes were added.

## Proposed representation and invariants

- UUID identities/FKs with optional immutable Mongo reference mappings. Historical
  receipt references can retain mapped legacy spelling; fingerprints are retained,
  not rehashed. JWT legacy-subject acceptance remains a cut-over decision.
- Modern financial/submission version 1 is required, without hydration defaults.
  This is not a catch-all import schema for unverified historical documents.
- USD settlement uses BIGINT cents bounded by JS MAX_SAFE_INTEGER, generated exact
  journal delta/result fields, and generated NUMERIC display mirrors. Do not install
  global pg BIGINT/NUMERIC-to-Number parsers. Future JS boundary code must still check
  numeric mirror round-trip representability.
- Append-only journal, actor/type/key and source/effect uniqueness, signed operation
  contracts, RESTRICT FKs, no runtime grants.
- Payment claims use separate two-decimal source-currency minor units and the current
  eight payment-method limits. Only administrator-approved credit has authoritative
  USD cents/journal/balance evidence; rejection has none.
- Orders use typed immutable columns for all 17 catalog fields, one-of selection,
  historical purchase receipt and fulfillment snapshot. Half-up pricing uses NUMERIC
  intermediates once; cancellation must refund the full original charge.
- Pending-only insertion, one terminal transition, immutable base, no delete/truncate.
  Generated columns are excluded from BEFORE-trigger comparisons because PostgreSQL
  computes their NEW values later.
- Deferred bidirectional evidence triggers re-read final transaction state and bind
  debit/refund/credit owner, actor, currency, signed amount, source, resource, key,
  hash, historical balance and operation receipt references. Manual completion and
  rejected payments cannot gain an invented monetary effect.
- Normalized columns replace the Mongo nested snapshots in this proposed schema.
  Future API mapping must reconstruct the existing nested receipt/result shapes,
  including the purchase receipt's historical pending status. It must OMIT monetary
  fields on completion/rejection instead of turning SQL NULLs into financial claims.

## Explicit enforcement boundaries / next reviewed work

These drafts alone do not implement the PostgreSQL financial-write boundary:

1. Atomic locked user-balance mutation + journal + resource effect needs a separately
   reviewed transaction/repository or restricted write-procedure design. Generated
   user balance and journal source checks alone do not couple every user write to a
   journal, or prove that a journal before/after matches the current account balance.
2. Fresh actor role/account status/tokenVersion authorization inside financial and
   replay-resolution transactions remains required. UUID FKs do not authorize admins.
   Do not add a CHECK that references a mutable current role for historical evidence.
3. Fingerprint syntax/equality is checked here, but canonical request fingerprint
   recomputation/validation remains pure application code. Bind identity, selection
   and canonical target, not mutable price, balance, or catalog revision.
4. SQL wallet checks only constrain canonical shape. Existing checksum/EIP-55/network
   validators, file-default authority and category-wide fail-closed catalog checks
   remain required. SQL cannot validate absent/malformed filesystem files or delivery.
5. Hidden fulfillment/receipt/request/decision columns require explicit safe query
   projections and owner-scoped reads; SQL does not provide Mongoose select:false.
6. The application must not run as the migration owner, which can bypass triggers.
   Restricted runtime privileges and private projections must be reviewed first.
7. Verified-history imports need a reviewed controlled import path; pending-only
   insertion intentionally blocks ordinary terminal inserts. Unverified legacy
   documents require a read-only archive strategy; never fabricate cents or evidence.
8. PostgreSQL SQL parsing, transaction/concurrency/rollback/adversarial constraint
   tests and preservation of replay/unknown-commit behavior are still required before
   cut-over. No PostgreSQL financial writes are authorized by this review.

Financial WebSocket notifications remain disabled until Step 5; hosting and
OAuth/2FA redesign remain deferred. Mongo dependency versions remain frozen.

## Activation and verification guide

See `postgres-financial-activation-guide.md` for exact future commands, environment
requirements, expected (not yet observed) apply output, and failure handling. No
moves or application of 002-004 were performed. The new
`db/verify-financial-schema.js` is read-only and stage-specific to active 001-004;
its current offline refusal `PG_FINANCIAL_ACTIVE_INVENTORY_UNEXPECTED` is expected
while only 001 is active. `verify-users.js` retains its 001-stage CLI guard.

## Test status

The earlier full run passed 729 tests / 18 suites. After adding financial-schema
catalog verification tests and isolating the users-verification unit inventory,
the latest full run passed **755/755 tests, 19/19 suites**, 22.175 seconds, with no
failures or skips. The new tests use fake clients and catalog fixtures only (no
Neon, DDL or application-row access). JavaScript syntax checks also passed.
These passing tests do not constitute PostgreSQL execution/validation of the
financial SQL drafts. Independent LIVE users verification also succeeded after
the small test-dependency injection change; CLI behavior was unchanged.
