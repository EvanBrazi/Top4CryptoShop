# Financial schema activation — historical manual guide

**Completed status:** the assistant promoted 002-004 after approval; the user applied
the batch manually, and the assistant independently verified all four ledger rows,
matching checksums, catalog guards and strict TLS. Do not repeat the promotion steps
below: they document the earlier activation procedure. The unwired user repository
is now implemented; see `user-repository-review.md` (895/895 passing regressions).
No PostgreSQL financial coordinator or application cut-over has been implemented.

## Current state and review

001 was applied manually by the user and independently verified by the assistant:
public.users + public.schema_migrations, matching checksum
`dcad707a0db33d20fafcbc0d936eb7e473daadc2a43a80b99de2bba5d51e8147`, timestamp
`2026-10-29 07:19:30.671927+00`, strict verified TLS.

002-004 remain in `backend/db/drafts`, unapplied. Static re-review found no required
SQL changes for the proposed schema-only migration. This is NOT a claim that the
financial SQL has been parsed/executed by PostgreSQL or that its behavior has been
validated under concurrent financial transactions.

- 002 defines bounded BIGINT cents, generated delta/receipt fields, append-only
  guards, actor/type/key and source/effect uniqueness. Source FKs are completed later.
- 003 separates claimed source amounts from approved USD cents and permits only a
  pending-to-terminal transition with deferred bidirectional credit evidence.
- 004 freezes catalog/selection/fulfillment/purchase evidence, prices once using
  NUMERIC half-up intermediates, and permits only full-original-charge cancellation
  refunds or nonmonetary manual completion. Deferred evidence binds both sides.
- NULL-sensitive state/source/pricing/fulfillment checks use coalesce(..., FALSE).
  BEFORE immutable guards exclude generated fields; the shared order trigger branches
  before accessing NEW.operation_type, which does not exist on an orders row.
- Stored version 1 has no legacy hydration default. Imports and runtime grants remain
  separate reviewed work, not part of this activation.

## Environment: no change needed

Use the SAME database and migration owner that applied 001. Existing backend/.env
DIRECT_URL must use the direct non-pooler hostname and verified TLS-compatible URL
options (current sslmode=require is accepted with enforced certificate/host checks).
DATABASE_URL stays pooled and the app remains MongoDB-based. Do not enable PG routes,
telemetry, global numeric parsers, financial WebSockets, or migration-at-startup.

No additional packages, extensions, npm scripts, or runner changes are required.
Do not relax TLS, add channel_binding=require (unsupported enforcement in pg),
change Mongo dependency versions, or echo connection URLs. Scripts load backend/.env
regardless of working directory, but exported shell variables take precedence.

## Verification scripts

- `node backend/db/verify-users.js`: current 001-only stage, unchanged CLI behavior.
  Once later files are active it intentionally fails
  `PG_VERIFY_ACTIVE_INVENTORY_UNEXPECTED`; this is a stage guard, not database damage.
- `node backend/db/verify-financial-schema.js`: new read-only stage-001-through-004
  verifier. Before activation it intentionally fails offline with
  `PG_FINANCIAL_ACTIVE_INVENTORY_UNEXPECTED`; it does NOT activate anything.

The new verifier requires exactly the four expected active filenames, compares
EVERY ledger version/name/checksum to the exact local byte hashes, checks all five
base tables, key UUID/BIGINT/generated types and required version fields without
hydration defaults, named state checks, validated constraints, 13 restrictive FKs
and their deferred settings, 10 enabled row/statement guards and function bindings,
and key unique indexes including their key columns and partial predicates. It also
checks absence of PUBLIC privileges on the three financial tables. It prints catalog
metadata/definitions for inspection, not private application-row values.

This is catalog verification, not proof of every CHECK/generation/function body's
semantics, financial authorization, balance-journal coupling, wallet checksums,
concurrency safety, or a privileged owner's inability to tamper. Actual PostgreSQL
adversarial transaction tests remain required before application cut-over.

## Commands AFTER approval to activate/apply 002-004

These commands are instructions only. The assistant has NOT run the moves or apply.
Run from the project root. Do not overwrite an existing migration; investigate if a
destination already exists. Keep 001 byte-for-byte unchanged, including comments.

```bash
node backend/db/verify-users.js

mv -n -- \
  backend/db/drafts/002_create_financial_operations_table.sql \
  backend/db/drafts/003_create_payments_table.sql \
  backend/db/drafts/004_create_orders_table.sql \
  backend/db/migrations/

node backend/db/migrate.js --plan
```

The inventory must contain EXACTLY versions 001, 002, 003, 004, with the original
001 checksum. --plan is offline: it does not claim which files are applied.

```bash
node backend/db/migrate.js --apply
node backend/db/verify-financial-schema.js
npm test -- --runInBand
```

Expected apply output **if 002-004 commit successfully** (not observed yet):

```text
Committed 3 migration(s).
002_create_financial_operations_table.sql
003_create_payments_table.sql
004_create_orders_table.sql
```

The runner validates and skips the recorded 001, then applies all three pending
files in order, with their ledger entries in ONE transaction and one session lock.
Do not apply 002 alone: 003/004 complete its source FK and evidence guards. No manual
ledger edits, separate SQL-editor DDL, top-level BEGIN/COMMIT in SQL files, or
concurrent migration runner is needed.

Successful verifier output must include five public BASE TABLEs, four ledger rows
with matching local checksums, `checksumMatches: true`, `catalogChecksPassed: true`,
strict TLS confirmation, and clean client shutdown. The catalog details will be
long; no financial-table application rows are accessed. Apply timestamps/checksums
must come from the actual output, not be copied from an illustrative example.

Tests support SQL files in either drafts or active migrations. Users-verification
unit fixtures remain isolated at stage 001; no repository/route or server wiring is
changed by these verification-script/test additions.

## Current verification test result

Latest full regression run: **755/755 passing tests, 19/19 suites**, 22.175 seconds.
No financial SQL was executed to obtain this result. The users verifier succeeded
against Neon; the financial verifier's current offline stage refusal was observed.

## If anything fails

Stop and retain the sanitized code/output. Do not edit 001, drop tables, force a
migration, disable triggers, or manually insert/update ledger rows. An ordinary
pre-COMMIT SQL failure is handled with rollback of the entire pending batch; no
partial 002/003 application should be inferred from a CREATE statement alone.
`PG_MIGRATION_OUTCOME_UNKNOWN` means COMMIT acknowledgement was lost, NOT confirmed
rollback. Resolve the durable ledger before assuming a retry or cleanup is needed.
The read-only ledger inspection SQL is:

```sql
SELECT version, filename, checksum, applied_at
FROM public.schema_migrations
ORDER BY version;
```

Financial runtime writes remain disabled even after schema verification succeeds.
