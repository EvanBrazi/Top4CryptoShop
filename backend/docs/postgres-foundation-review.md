# PostgreSQL foundation — approved; migration 001 applied

**Current status:** the user manually applied 001; the assistant independently
verified public.users, the checksum ledger and strict TLS. Financial migrations
002-004 remain review-only drafts. See `postgres-financial-drafts-review.md` and
`postgres-financial-activation-guide.md` for the current 755-test result and next
steps. Deferred-DDL and 717-test statements below describe the earlier foundation
review/connectivity stage, not the current status.

Foundation approved with email_verified added and the JWT cut-over policy deferred.
pg **8.23.1** is installed with an exact declaration; frozen MongoDB entries and
unrelated direct/root dependencies remain unchanged. No application wiring,
repositories, migrations or imports have occurred. Existing MongoDB/authentication/
financial behavior is unchanged. Hosting and financial WebSockets stay deferred.
See [the connectivity pass](postgres-connectivity-pass.md) for the smoke attempt.

## Approved driver and connections

Installed driver: **pg 8.23.1**, CommonJS, Node >=16 (current runtime 22.22.2).
The backend lockfile adds pg and its required supporting dependencies, including
compatible pg-protocol 1.16.1; all existing direct and MongoDB entries are preserved.

`db/pg.js` exposes `getPool()` and `closePool()`. Pool construction is lazy;
importing the module does not read environment secrets, load pg or connect.
One singleton per process, **max 5**, idle timeout 30 s, connection timeout 15 s,
TCP keepalive, pooled `DATABASE_URL`. No global BIGINT/NUMERIC type-parser changes.
Future financial work must check out ONE client for each whole transaction.

`db/connection.js` decodes the URL into explicit host/port/user/password/database
fields, without passing `connectionString` to pg. This prevents URL ssl options
from overriding `ssl: { rejectUnauthorized: true, minVersion: 'TLSv1.2' }`.
DNS servername is pinned to the configured host, preserving certificate identity
verification. Weak SSL modes, duplicate/unknown URL options and global
`NODE_TLS_REJECT_UNAUTHORIZED=0` are rejected. sslmode=require is accepted only
because the explicit TLS configuration still performs full verification.

Use application-specific URLs locally, never in a tracked file or chat:

```text
DATABASE_URL=postgresql://<app-role>:<encoded-password>@<pooled-host>/<db>?sslmode=verify-full
DIRECT_URL=postgresql://<migration-role>:<encoded-password>@<direct-host>/<db>?sslmode=verify-full
```

**Channel-binding review point:** pg 8.23.1 source confirms
`enableChannelBinding: true` prefers SCRAM-SHA-256-PLUS when the server offers it,
but does not enforce libpq's `channel_binding=require`. This draft rejects a URL
requesting mandatory binding rather than silently weakening that request. If a
copied Neon URL contains that parameter, use a separately configured pg URL with
`channel_binding=prefer` (or omit it), while retaining verified TLS. This is an
explicit review decision, not an automatic environment-file rewrite.

Runtime must eventually use a restricted role, distinct from the DDL/migration
owner. No grants or role creation are performed in this first draft.

## Migration runner

`node backend/db/migrate.js --plan` (or no flags) performs ONLY a filesystem
inventory. It does not load .env/pg, connect, or claim which migrations are applied.
`--apply` is an explicit future execution flag, not a startup hook or approval.
Do not invoke it until approval and preflight; it has NOT been invoked.

On an approved apply:

1. Read regular `.sql` files in db/migrations; reject empty files, symlinks,
   invalid filenames, duplicates and gaps. Versions start at 001 and are ordered
   numerically. SHA-256 covers the exact source bytes.
2. Use ONLY `DIRECT_URL`, reject recognizable Neon `-pooler` hosts, and hold one
   dedicated pg Client. Never fall back to DATABASE_URL.
3. Acquire a session advisory lock on the direct connection; fail if busy.
4. Begin one atomic transaction for the entire pending batch; set transaction-local
   lock/statement/idle-in-transaction timeouts and fixed pg_catalog/public search path.
5. Create/consult **public.schema_migrations** (version, filename, checksum,
   applied_at). This is an explicitly proposed ADMINISTRATIVE metadata table;
   **users is the only application-domain table**. Approval of this runner must
   include the ledger, rather than hiding it as an extra domain migration.
6. Require applied history to be an exact immutable prefix. Changed, renamed,
   removed or reordered applied migrations fail; there is no repair/force mode.
7. Execute pending reviewed SQL and parameterized ledger inserts on that same
   client, then commit. DDL/ledger failure rolls back the entire pending batch.
8. Release the owned lock and close the client. A lost COMMIT acknowledgement is
   `PG_MIGRATION_OUTCOME_UNKNOWN`, not a claimed rollback. No automatic replay:
   resolve a later approved re-run against the durable checksum ledger.

All SQL files must be transaction-compatible, with no top-level transaction
control or CREATE INDEX CONCURRENTLY. No down runner, financial fallback,
nontransactional DDL path, shell execution, SQL templating from request input or
new domain tables. CLI output excludes URLs, passwords, SQL/error detail and stacks.

## 001_create_users_table.sql

Full proposal is in [the SQL file](../db/migrations/001_create_users_table.sql).
It covers every declared User.js field, using snake_case SQL names:

- UUID internal id; optional unique canonical legacy_mongo_id preserves the import
  mapping while all references are converted to UUIDs. Keep the column for now.
  Whether JWTs with legacy subjects remain accepted, or cut-over requires re-login,
  will be decided at cut-over. Retaining the column does not choose that policy;
  no JWT minting, acceptance or authentication behavior changes in this pass.
- email_verified BOOLEAN NOT NULL DEFAULT FALSE, explicitly approved for future
  2FA work. Email syntax validity or provider name alone must not create a verified
  email claim; future imports need actual verification evidence for TRUE.
- username/email/phone/google identity uniqueness; NULL-distinct optional identities
  correspond to sparse indexes. Username uniqueness remains case-sensitive.
- Nullable bcrypt password_hash for Google accounts, mandatory for local accounts;
  bcrypt format checked, no SQL hashing/plaintext. Future password code must retain
  strength/72-byte validation, cost 12 and initial local token-version increment.
- theme, avatar, login attempts/times, activation, all three current roles,
  account status, all 2FA fields, trusted-device JSON array, reset-token hash/expiry.
- Authoritative nonnegative BIGINT balance_cents and token_version bounded by
  **9007199254740991**, preserving the current safe-integer boundary.
- Generated NUMERIC(16,2) balance mirror (cannot drift or be independently written).
  Future JS mapping/import must still enforce EXACT compatibility-number
  round-tripping, not merely convert every large decimal string to Number.
- UTC-capable timestamptz fields, created/updated timestamps and row_version for
  optimistic concurrency (future UPDATE must include an expected-version predicate).
- Metadata trigger keeps identity/creation time immutable, advances row_version,
  stamps updated_at, prevents token-version decreases and advances token_version
  on password-hash changes without doubling an explicit application increment.

Intentional SQL hardening, for review: required/defaulted statuses are NOT NULL;
attempt counters are nonnegative integers; reset token is a SHA-256 hex hash;
local passwords must be bcrypt hashes; token counters cannot decrease. Invalid
legacy records must be flagged, not silently coerced into these constraints.
An imported existing hash retains its stored tokenVersion; new local account
initialization will be handled separately by approved future application code.

Important non-equivalences requiring future application work:

- SQL cannot implement Mongoose select:false / toJSON. password_hash, 2FA secret,
  reset fields, trusted devices and token_version must stay out of public projections.
- SQL checks do not replace validator's complete email/mobile-phone/URL validation
  or JSON per-device validation. Existing formatted phone strings are retained,
  not silently forced into an E.164-only constraint or merged by normalization.
- Case-insensitive username login can conflict with case-sensitive uniqueness;
  import must report Foo/foo collisions and login must fail closed on ambiguity.
- Default zero cents is ONLY for new accounts. An importer must explicitly validate
  every source balance; missing legacy cents must never manufacture a zero balance.
- This schema is NOT sufficient for financial writes. Journal/source-effect coupling,
  operation/order/payment constraints and restricted financial write privileges
  are future migrations. No PostgreSQL financial endpoint may be enabled yet.

## Verification limits

39 foundation tests cover strict configuration, lazy pool via a virtual driver,
filesystem planning/history and fake-client sequencing/rollback/cleanup/lost commits.
Nine added smoke tests cover the two-SELECT contract, cleanup, unverified-transport
rejection, the actual installed pg BIGINT/NUMERIC parsers, and actual pg refusing an
owned loopback server that declines TLS before startup credentials are sent.
The read-only Neon smoke now succeeds: version() reports PostgreSQL 18.6,
current_database() reports neondb, and the live TLS stream is encrypted and
certificate-authorized. Only those two SELECTs ran; no Neon DDL has been executed.
The full regression suite passes 717/717 across 17 suites. SQL/constraint/trigger
verification remains deferred; run it in an owned disposable PostgreSQL database
before any separately approved shared-Neon DDL application.
