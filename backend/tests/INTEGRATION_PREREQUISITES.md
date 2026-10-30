# Sub-Phase A: HTTP integration prerequisites

These capabilities are implemented but **not mounted**. No route, server, frontend,
financial coordinator, migration, grant, or notification wiring is changed here.
Existing Mongo routes are not a PostgreSQL fallback: their cut-over belongs to later
approved sub-phases. New capabilities use PostgreSQL exclusively.

## Durable pending two-factor authentication

`createSessionStore` now provides:

- `beginPendingAuthentication({ authenticationProof, expressSid, csrfToken })`
- `completePendingAuthentication({ expressSid, challengeId, csrfToken, code })`
- `authenticateForExpressSession({ token, sessionId, expressSid, csrfToken })`

Begin requires an original, positive, private password or verified-Google credential
handle, an active account with enabled 2FA, and an active anonymous Express parent.
Factor/enrollment aliases, body UUIDs, booleans, failed comparisons and consumed
proofs cannot establish the first factor. The proof is claimed synchronously and
consumed even on rejection or unknown COMMIT.

Pending state lives in `express_sessions.session_data.__top4PendingAuthentication`.
It contains a domain-separated challenge digest and HMAC-sealed receipt bound to
parent UUID/SID digest, CSRF, owner, token version, row version and expiry. It stores
neither the raw challenge secret nor a password/TOTP secret. It is NOT a serialized
WeakMap capability. Its lifetime is bounded by all of:

1. configured challenge lifetime (1–300 seconds, default 300),
2. the original first-factor proof expiry,
3. Express parent expiry.

Completion validates the seal and current database authority, locks account before
parent, then verifies a six-digit TOTP against canonical stored base32 state (window
1). Another process/service instance can complete the challenge without the original
credential object. Role/status/version remain current database authority.

A negative TOTP result commits its attempt count and sealed row-version advance,
returning `authenticated: false`, `remainingAttempts`, and server-only
`expressSession`. The fifth failure tombstones the parent and returns
`sessionDestroyed: true`. This is intentionally a returned negative result, not an
exception that would roll back the attempt counter. Success resets both password
and TOTP attempt counters and updates last login in the issuance transaction.

Successful completion atomically tombstones/clears the old anonymous parent,
creates a random new Express SID, binds a new parent, inserts its exact JWT/custom
session pair, and returns `authenticated: true` with the issued credentials.
Concurrent completions cannot issue twice. An expired, used, transferred, guessed,
tampered or stale challenge cannot authenticate. This is challenge-specific replay
protection; it does not introduce a new global TOTP-counter/watermark table.

Ordinary store creation cannot fabricate pending state. CAS set cannot replace,
remove or add that reserved state or change its bound CSRF. Ordinary unchanged set
and touch remain supported; all direct service changes return the current sealed
store revision.

### Obligations for Sub-Phase B (not implemented here)

- Validate the incoming anonymous-session CSRF before regenerating the login SID.
- Use a fresh, persisted anonymous parent when beginning pending authentication.
- Keep challenge handles out of URLs/logs; send only the approved challenge DTO.
- Synchronize returned `expressSession` data/revision into a mutable Express session
  before response saving/touching, including after a negative TOTP result.
- On successful completion, install the **server-generated** `expressSid` and
  returned mutable session data using Express's session construction machinery.
  Do NOT assign a client header SID, and do NOT regenerate/destroy the newly issued
  parent afterward. The service already rotated and consumed the original parent.
- Never expose `expressSid`, revision metadata or pending receipt/session JSON in
  the public response. The Express SID belongs only in its signed HttpOnly cookie.
- On exhaustion, suppress resaving the tombstoned old session and clear cookies.
- `AUTH_OUTCOME_UNKNOWN` means no unconfirmed credentials/challenge secret may be
  sent. Restart login; do not automatically resume or repeat issuance.
- No client-device-string trusted-device bypass is provided.

## Atomic profile update and suspension

`userRepository.updateProfileAtomic({ principal, expectedRowVersion, patch })`
accepts only username, email, phone, password/currentPassword, theme and avatar.
The target always comes from the principal. UUIDs and canonical string versions
are required. Password comparison/cost-12 hashing occur before taking database
locks, with credential version and row CAS rechecked under the account lock.

One fixed-allowlist UPDATE handles all fields. Identity/password changes increment
token version exactly once and revoke the entire session graph in that same
transaction; email becomes unverified and Google email changes fail closed.
Uniqueness or invalidation failure rolls back the entire update. Return value:
`{ user: SafeUser, requiresReauthentication }`. Theme/avatar-only updates still
require fresh status/token authority and CAS, but do not invalidate sessions.
Unknown COMMIT remains `AUTH_OUTCOME_UNKNOWN`; callers must not delete possibly
referenced avatar assets or claim success.

`userRepository.suspendAccount({ principal, userId, expectedRowVersion })`
requires a fresh active admin, takes sorted account locks, sets `suspended`, advances
token version, and revokes sessions atomically. It does not delete the account,
change its balance, or substitute `deactivated`. `deactivateAccount` remains distinct.
No generic status/role/financial setter is exposed.

## Pending payment submission service

`createPaymentSubmissionService` takes trusted `poolProvider`, `sessionStore`,
`parseUpload`, storage/cleanup callbacks, and cursor secret. Construction/import
starts no database connection or timer. The default storage callbacks lazily use
the existing bounded image normalization/private Cloudinary helper; the parser is
mandatory and supplied by the future HTTP composition root, not by request JSON.

Public operations:

- `submit({ token, sessionId, expressSid, csrfToken, submissionId, uploadSource })`
- `resolveSubmission({ token, sessionId, submissionId })`

The order is exact-session authentication and CSRF -> owner/readiness check ->
bounded parsing -> claimed-field validation -> private image storage -> short
transaction with account lock and authorized pending INSERT. **Do not put multer
or storage ahead of the service in the future router**; its trusted parser callback
must invoke those operations after authentication. Rate limits remain an outer HTTP
adapter obligation; no HTTP routes or middleware are added here.

The parser must retain the existing multipart/file/field limits. Its result is only
`{ body, file }`; accepted body fields are method, amount and note. Currency/limits
come from the frozen server policy and SQL constraints. Minor units are exact
canonical strings; a numeric compatibility round trip is validated. Receipt paths
are generated by trusted storage, never by body metadata. The INSERT writes only
pending claim/receipt fields, never USD approval, journal, balance or decision fields.

A private branded authenticated-request receipt supplies the fixed SQL authorization
predicate. The INSERT itself rechecks the exact JWT digest, custom-session digest,
Express SID/parent, CSRF, user status/version, both expiries and token revocation.
There is no nested pool checkout or transaction held across external storage.

### Submission/recovery contract

- `submissionId` is a caller-retained canonical UUID selected before submitting;
  public payment ID is `pay-<submissionId>`. A future HTTP adapter should transport
  it outside the existing three-field multipart claim body.
- It is a stable recovery identifier, **not** a payload-changing/replay API.
  An existing owner submission returns `PAYMENT_SUBMISSION_EXISTS` without another
  upload. Global uniqueness also prevents concurrent/cross-owner duplicate inserts.
- Success returns only `{ paymentId, status: 'pending' }` after confirmed COMMIT.
- `PAYMENT_SUBMISSION_OUTCOME_UNKNOWN` (503) includes that public payment ID and
  `retrySubmission: false`. It does not repeat insertion or delete the receipt.
- `resolveSubmission` returns an owner-scoped, evidence-validated safe payment if
  committed. Missing evidence returns `outcome: 'unresolved'` and
  `retrySubmission: false`, not permission for another insert or asset deletion.
- Cleanup runs only for a known pre-transaction failure or a final positively
  confirmed rollback. It never runs during a transaction retry or after uncertain
  COMMIT/failed rollback. Cleanup failures do not mask persistence results.
- External provider transports are trusted dependencies. Default storage uses fresh
  random receipt IDs, no overwrite, and owned-prefix cleanup. A replacement storage
  callback must not reuse an already referenced asset as a newly uploaded receipt.
- No new submission table, journal effect, balance adjustment, FX quote, automatic
  approval or WebSocket dispatch is introduced.

## Owner-scoped private fulfillment

`orderRepository.findFulfillmentForOwner({ principal, orderId })` uses the same
single-statement evidence-validated read machinery as the other resource APIs,
with an explicit SQL owner predicate. It returns only the private immutable
fulfillment snapshot for that owner, or null. Even an admin cannot use this owner
method to read another user's target; the admin method remains separate. Public
history continues to omit targets. No target mutation API is introduced.

## Verification

Use the existing disposable harness:

    bash backend/tests/run-disposable-pg.sh

Or target these integration cases:

    bash backend/tests/run-disposable-pg.sh backend/tests/integration-prerequisites.pg.test.js

The suite uses the same exact disposable URL, TLS/identity/ledger guards, advisory
lock and five-migration reset helper as the verified foundation. PostgreSQL
constraints/triggers are not disabled. External Cloudinary transport is controlled
while image processing and persistence are real; explicitly labeled transaction
transport/result injections wrap real PostgreSQL queries for lost acknowledgements
and rollback/retry cases. No application `.env` database or migration apply is used.
