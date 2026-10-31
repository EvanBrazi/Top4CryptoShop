# PostgreSQL user repository — implemented, intentionally unwired

## Files and scope

- `repositories/userRepository.js`: CommonJS repository, lazy existing `db/pg.js` pool.
- `tests/user-repository.test.js`: isolated pool/client/scope-authority fixtures plus
  real bcrypt cost-12 hashing and verification. No Neon application-row writes.

Migrations 001-004 were already applied and independently catalog/checksum verified.
This implementation does not alter any migration, server, controller, middleware,
Mongo financial service, dependency, JWT identity policy, or deployment. It is not
permission to run the app as the privileged migration owner or enable PG finances.

## Public methods

- `findById(id)`: canonical lowercase UUID only; no implicit Mongo-ID/JWT compatibility.
- `findByEmail(email)`: trim/lowercase/validate, exact parameterized lookup.
- `findByUsername(username)`: trim/validate, exact case-sensitive C-collation lookup.
- `findForAuth(identifier)`: normalized email/phone or case-insensitive username,
  ORDER BY id / LIMIT 2, fail closed with USER_IDENTIFIER_AMBIGUOUS on multiple matches.
- `createUser({username,email,password,phone?})`: local registration only; strict own
  data-property allowlist, no caller role/balance/hash/provider/legacy/version fields.
- `updateProfile(id, {theme?,avatar?}, expectedRowVersion)`: ONLY theme/avatar; no
  arbitrary patching of financial, credential, identity or authorization columns.

Lookups return null when absent. Public DTOs are explicit frozen plain objects with
camelCase fields; monetary/version BIGINT values remain canonical decimal strings,
NUMERIC balance remains an exact two-decimal string, and dates become ISO strings.
No global pg numeric parsers, Mongoose hydration/defaults, SELECT *, or caller-chosen
projections are used. Extra columns unexpectedly returned by a driver cannot leak
through the explicit mapper. Missing/coerced cents or a mismatched balance fail closed.

“Safe projection” is not permission for anonymous reads: future routes must still
perform appropriate owner/admin authorization. No route imports the repository now.

## Credential handling

Registration validates existing username/email/phone rules and password strength:
8+ characters, uppercase/lowercase/digit/symbol, <=72 UTF-8 bytes, full-string match.
Passwords are not trimmed or normalized. bcryptjs hashes with cost 12 BEFORE pool
access. Hash output is checked for shape and cost. SQL sets server-controlled local,
user, active, zero cents, unverified email and token_version=1, preserving the existing
new-local-user token increment. No generated monetary field is independently written.
Hashing and standalone INSERT use no long-lived transaction or checked-out client.
Unique constraints arbitrate duplicates/races; there is no read-before-insert promise.

findForAuth uses a dedicated private projection but returns an opaque record:

- `.user`: safe DTO.
- `.verifyPassword(candidate)`: bcrypt comparison, nonempty string and 72-byte guard;
  does not reapply new-registration strength rules to old candidate passwords.
- `.getAuthState()`: explicit PRIVATE tokenVersion/loginAttempts/status/role snapshot.
- `.toJSON()`: safe DTO only.

The hash is held in a closure, never a returned property, JSON value, or diagnostic
error. Google-only null passwords return false without manufactured credentials.
This is NOT a complete auth controller: status checks, login attempts, fresh JWT
issuance/revocation and 2FA behavior still need their own reviewed port. No 2FA/reset
secret or trusted-device value is selected by this draft.

## Optimistic concurrency

Profile UPDATE predicates include id + expected row_version and RETURN the new safe
row. The installed users_metadata_guard alone advances row_version/updated_at; this
repository never writes either. Returned version must equal expected+1. Exhaustion
fails before SQL. A zero-row update is USER_VERSION_CONFLICT (absent OR stale); no
second racy query claims to distinguish those cases. There is no blind retry.

## Financial interface: default CLOSED

There is NO public setBalance/incrementBalance/applyBalanceChange method or exported
transaction callback. The internal interface is:

`repository.internal.forFinancialTransaction(opaqueScope)`

The default repository has NO scope authority: binding any scope/raw pg client fails
FINANCIAL_TRANSACTION_REQUIRED before a query. `createUserRepository` allows trusted
composition-root/test dependency injection; it is NOT a route/request option and its
factory/configuration must never be exposed to a public API.

The future reviewed coordinator may supply a frozen `financialScopeAuthority` with
`resolve(scope)`. It must keep a non-forgeable active scope registry that attests:

- BEGIN already succeeded and the coordinator exclusively owns the checked-out client.
- Resolve returns the SAME frozen context for the scope's full lifetime.
- Context binds client, actorId, userId, actorTokenVersion, operationType and USD.
- Scopes stay active until all in-flight work settles and are revoked on commit/rollback.

The repository does NOT infer a transaction from `client.query` or an inTransaction
boolean. It validates the supplied authority/context and re-resolves before/after
queries. Only test authority fixtures exist today; no production issuer/coordinator
or transaction ownership lifecycle has been implemented.

Bound methods:

1. `lockUsersForUpdate()` locks only bound actor/owner UUIDs in sorted order, checks
   fresh actor active status/tokenVersion and admin role (except own-user purchase),
   and returns private frozen state. Failed re-lock clears previous authorization.
2. `applyBalanceChange({beforeCents,afterCents,expectedRowVersion})` requires those
   locks, canonical safe integers, exact BigInt direction/arithmetic, observed before
   cents and version, and the existing JS numeric-mirror representability check. SQL
   compares id/version/before cents/account state and additionally rechecks fresh
   actor active status/tokenVersion/admin eligibility in an EXISTS predicate. It
   updates ONLY balance_cents and verifies the returned trigger-generated version.

Known balance-effect types are adjustment, order debit/refund and payment credit.
Purchase actor must equal owner. Owners must be active except original-charge order
refund recipients, matching the existing Mongo policy. Full-charge/refund pricing,
canonical fingerprints, journal/source evidence and idempotent outcomes are still
coordinator obligations, not values inferred by this user-row primitive.

No BEGIN/COMMIT/ROLLBACK, journal insertion, pool fallback or automatic retry occurs
inside bound methods. Scoped errors remain sanitized; PostgreSQL conflict SQLSTATEs
are retained as fixed databaseCode metadata. The future coordinator must atomically
couple user change + journal + resource effect, handle rollback/deferred guards and
retain FINANCIAL_OUTCOME_UNKNOWN / retryWithSameKey on uncertain commits. These
methods alone do NOT establish journal coupling or make PostgreSQL finances ready.

## Error safety and tests

Errors contain fixed codes only, no raw cause/input/SQL/credential detail. Known
email/username/phone uniqueness failures have specific codes. An unacknowledged
standalone autocommit write is USER_WRITE_OUTCOME_UNKNOWN, never assumed rolled back.
PostgreSQL 40001/40P01 becomes USER_TRANSACTION_CONFLICT without a local retry.

Tests cover duplicate/racing emails, exact/ambiguous usernames, weak/UTF-8 boundary
passwords, cost-12 bcrypt, safe/opaque secret projections, strict payload allowlists,
string monetary/version decoding, stale/exhausted versions, trusted/revoked scopes,
row locks, account/token authorization, guarded cents CAS, signed effects, inactive
refund owners, failed re-locks, and no transaction control/fallback from the leaf.
The first real-bcrypt test exposed a test-only stub interaction: bcryptjs.compare
calls bcrypt.hash with a callback. Real crypto cases now restore that stub instead
of weakening cost or increasing a timeout.

These are unit/contract tests with fake SQL state, not PostgreSQL adversarial-write,
rollback or real concurrency proofs. Those tests require a separately reviewed,
isolated PostgreSQL test database/coordinator before cut-over. An additional live
pooled lookup-only smoke was attempted but rejected BEFORE execution by the tool
safety-classifier outage; no pooled repository connectivity result is claimed.

## Completed regression result

Final `node --check backend/repositories/userRepository.js` succeeded.
Final `npm test -- --runInBand`: **895/895 tests passed, 20/20 suites**, 23.747 seconds,
no failures/skips. This includes **140 new repository tests** plus the previous 755.
These results do not claim live PostgreSQL write/concurrency validation. The optional
pooled read-only smoke remained blocked before execution; no safeguard was bypassed.

## Coordinator implementation status (supersedes the original next gate)

The user subsequently approved the coordinator design and implementation, including
isolated real PostgreSQL integration tests. Current new files are:

- `services/financialCoordinator.js`
- `services/financial/contracts.js`
- `services/financial/persistence.js`
- `tests/financial-coordinator.test.js`

All six operation paths are written but the coordinator implementation is **NOT
complete or approved for cut-over**. The latest targeted run passed **72/72 unit
 tests, 1/1 suite, 1.149 seconds**, with syntax and whitespace checks succeeding.
These cover transaction lifecycle, cleanup, retries, mapped SQLSTATEs, unknown
commit simulation, scope revocation/forgery, strict inputs and historical adjustment
replay. They are not actual PostgreSQL concurrency or six-operation integration
proofs.

Rootless Podman was confirmed and the PostgreSQL 18 test image downloaded, pinned
at `sha256:41a369edc91d9bdd7a58be6bc71ea0f8f7a3f49e82818a9f0829021ea7840b7c`.
However, repeated safety-classifier service timeouts rejected integration helper/
test creation commands **before execution**. Those files do not yet exist, and no
PostgreSQL test container has been started. The full `npm test -- --runInBand`
command was also rejected before execution. Do not report 967 tests as verified:
895 remains the prior full-regression baseline; 72 is the current targeted result.

All four applied migration checksums remain unchanged. No application URL/.env was
read by this coordinator work, no real users/balances were modified, and no route,
server, dependency manifest, migration or Mongo financial service was changed.
Mongo runtime and financial WebSockets remain unchanged; no mixed-database writes
or imports. Resume isolated integration test creation/execution and full regression
when normal safety checks can complete; do not bypass those checks.
