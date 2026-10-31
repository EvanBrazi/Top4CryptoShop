# PostgreSQL authentication/session persistence foundation

This is **not a runtime cut-over**. Routes, server startup, Mongo services, cookies,
OAuth verification, session transport, and financial notifications are unchanged.
Migration 005 must not be applied to the application database without approval.

## Run real integration tests

From the project root (rootless Podman, OpenSSL, cached pinned PostgreSQL image):

```sh
bash backend/tests/run-disposable-pg.sh
```

This runs the complete Jest suite, including the financial coordinator and both
new PostgreSQL integration suites. To run only integration tests:

```sh
bash backend/tests/run-disposable-pg.sh \
  backend/tests/auth-sessions.pg.test.js \
  backend/tests/persistence-reads.pg.test.js \
  backend/tests/financial-coordinator.pg.test.js
```

The harness never sources application environment files into the shell. It pins
PostgreSQL 18 by image digest, publishes only loopback port 5433, uses temporary
in-memory data, generates a temporary localhost CA/certificate, exports **both**
connection URLs, and supplies the CA through NODE_EXTRA_CA_CERTS before Node starts.
The existing migration runner retains verified TLS. The migration runner's dotenv
loading cannot override these exported URLs. All five migrations apply only to the
disposable database. An EXIT trap removes that container and temporary certificates.
An occupied port, missing cached image, failed TLS, mismatched identity, edited
migration checksum, incorrect ledger, or concurrent integration guard fails closed.
The integration suites never silently skip or fall back to mocks/MongoDB.

The tests perform destructive resets **only after** URL, TLS, PostgreSQL version,
database/user identity, complete migration ledger, and advisory-lock verification.
They reset all seven application tables and recreate all five migrations, preserving
the administrative ledger and restoring every foreign key/trigger. Run in-band.

For non-PostgreSQL regression testing only (not a substitute for integration):

```sh
npm test -- --runInBand --testPathIgnorePatterns='\.pg\.test\.js$'
```

## Construction and secrets

`createSessionStore({ userRepository, poolProvider?, lookupSecret?, jwtSecret?,
tokenTtlSeconds? })` returns a custom `express-session.Store` plus application
session methods. No singleton, connection, cleanup timer, MemoryStore, or auth cache
is created on import. SESSION_LOOKUP_SECRET is dedicated, mandatory, and at least
32 UTF-8 bytes. JWT_SECRET must also have at least 32 bytes. CURSOR_SECRET is a
separate mandatory 32-byte secret for read-repository cursor authentication.

Session IDs remain opaque strings. Their PostgreSQL lookups use domain-separated
HMAC-SHA256; JWT revocation uses SHA256 of the complete compact signed token.
JWTs use HS256, UUID userId, canonical decimal-string tokenVersion, and the existing
your-app-api/admin-panel issuers. A random jti prevents same-second duplicate tokens;
the whole-token digest, not jti, remains authoritative.

## Express adapter obligations for the later wiring phase

- Supply a finite cookie expiry with at most 24 hours remaining. Unbounded/no-expiry
  cookies are rejected. Future server configuration must explicitly set maxAge.
- Regenerate the Express SID before authenticated issuance; issuance accepts only
  an active **unbound** parent, never an existing authenticated SID.
- `issueAuthenticatedSession({ authenticationProof, expressSid })` requires an
  opaque, positively verified repository credential handle. For enabled 2FA, verify
  TOTP through `findFor2FA` before presenting the original credential handle.
- Never accept principal, UUID, boolean proof, Express SID, or JWT claims as
  client-supplied authentication authority. Route adapters obtain them from trusted
  middleware/verified credentials, not arbitrary body fields.
- Issuance returns `{ token, sessionId, csrfToken, expiresAt, expressSession }` only
  after confirmed atomic commit. Synchronize the returned `expressSession` into the
  server-side request session before saving; its authenticated CAS revision prevents
  a delayed pre-login Express save from overwriting the binding or CSRF token.
  Do not serialize `expressSession` or its `__top4StoreRevision` to HTTP clients.
- The revision is HMAC-bound to the SID, row ID, and version, stripped from persisted
  JSON, and advanced on every set/touch. Preserve it through server-side session
  copies. Stale/forged/missing revisions must not cause retries with an upsert.
- Store no password/hash, TOTP secret, password-reset token, raw JWT, or custom
  session secret in Express session data. Public DTOs are not authentication caches.
- Complete CSRF/cookie/custom-session transport and durable pending-2FA/OAuth adapter
  design before wiring. No body-supplied user ID can complete 2FA.
- Fresh role/status/token_version come from one PostgreSQL authentication statement;
  JWT role and session JSON userId are not independent authorization proof.
- Unknown authentication COMMIT gives AUTH_OUTCOME_UNKNOWN/503, consumes the proof,
  and never retries issuance automatically or returns unconfirmed credentials.
  Require a new authentication attempt; do not apply financial retry semantics.

`authenticate({ token, sessionId })` returns a fresh principal, role, status, and
expiry, never hashes or token/session lookup digests. `revokeAuthenticatedSession`
requires the matching pair, atomically tombstones the Express parent/revokes its
application children, and inserts immutable whole-token revocation evidence.
`revokeUserSessions({ principal, userId, expectedRowVersion })` permits fresh
self/admin authority, increments the target token version, and revokes the graph.
Security mutations in userRepository do the same in their account transaction.
`cleanupExpired({ limit? })` is an explicit maintenance capability, **not an HTTP
route**, bounded to 1–1000 rows per table per call; no active token-revocation evidence
is deleted. Express rows are retained for one day after expiry, beyond the private
30-second transaction/request budget, and only child-free expired parents are deleted.
Enforce bounded request lifetimes in the later server adapter; don't retain old new-
session objects and retry creation after their cookie expiry.

## Read repositories

`createOrderRepository` and `createPaymentRepository` accept poolProvider and
cursorSecret. Public methods: listForOwner, listForAdmin, listPendingForAdmin,
findByOrderIdForOwner/findByOrderIdForAdmin (or PaymentId variants), summarizeForOwner,
summarizeForAdmin. Admin filters may include userId; owner APIs cannot override owner.
Lists allow limit 1–100, before cursor, and fixed status filters. Pending queue APIs
reject contradictory status input. Private fulfillment/receipt reads have separate
explicit admin/owner APIs and must not be used as public history projections.

Resource and journal evidence are selected in one statement with fresh authorization
in that statement and validated by the coordinator's existing fixed contracts.
Public DTOs omit fulfillment targets, receipt paths, journal fingerprints, and
historical balance evidence. Cursors bind resource kind, owner/admin view, caller,
owner filter, and status, preserving native PostgreSQL timestamp microseconds plus
UUID tie-breaker. Summaries use a read-only repeatable-read server-side cursor with
100-row fetches, one evidence snapshot, and exact string/BigInt sums, never Number
aggregation. All reads are deadline-bounded and fail closed on reconciliation errors.

Google creation/authentication requires an injected private verified-identity
registry (`resolve(opaqueHandle)` returning a frozen verified identity). Default
configuration refuses Google proof. No OAuth network verifier or automatic email
linking is implemented here; a verified email collision requires an explicit later
account-linking flow. Enrollment QR/otpauth is an intentional private setup output,
not a public user DTO or a complete durable HTTP challenge protocol.
