# C2 financial HTTP contracts

Runtime orders/payments are PostgreSQL-only. No Mongoose, Mongo financial service,
notifications, balance-adjustment endpoint, runtime migrations, or dual writes.
`server.js` is unchanged; `services/serverApplication.js` mounts the factories with
its reviewed Express/session/auth composition and common verified-TLS pool.

## Authority and request boundaries

Authenticated UUID identity and canonical string token version come exclusively
from reviewed `req.auth`. Unsafe requests require the signed Express parent,
JWT/application credential pair, and exact persisted `x-csrf-token`. Header-only
credentials support reads but cannot borrow an unrelated parent for mutations.
Decisions are admin-only, with fresh coordinator authorization under account locks.
Owners are scoped in repository SQL, including current status/token version.
Resource paths use public `orderId`/`paymentId`, not Mongo ObjectIds or user UUIDs.

Financial JSON bodies are strict and bounded at 16 KiB after authentication/CSRF.
Unknown fields and query overrides fail closed. Monetary values in responses are
exact strings. No HTTP-level operation retries or compensation writes exist.
Financial/submission handlers do not change session JSON and suppress implicit
Express save/touch with `req.session = null` / `unset: 'keep'`. This does not
revoke or destroy the durable parent. Reads use reviewed explicit persistence.

## Orders

- `POST /api/orders/purchase`: category, productId, exactly one packageIndex or
  quantity, idempotencyKey, and fulfillmentTarget only when catalog-required.
  Purchaser, price, currency, validation policy, and snapshots are server-owned.
- First confirmed purchase: 201; durable replay/recovery: 200 with replayed=true.
- `PUT /api/orders/:id/accept`: idempotencyKey + reason; nonmonetary completion.
- `PUT /api/orders/:id/reject`: idempotencyKey + reason; full stored-charge refund.
- `POST /api/orders`: 410 LEGACY_ORDER_CREATION_DISABLED. No reserve/create/restore
  alternative is enabled.

Fulfillment is immutable. File-default schemas are authoritative; configuration
contradictions/missing or malformed files/duplicate IDs within a category fail
closed. Current catalogs use accountId, playerId, phone and walletAddress with
reviewed network validation. Products without targets reject unsolicited targets.
Public DTOs exclude fulfillment. Dedicated owner `/:id/fulfillment` and admin
`/admin/:id/fulfillment` paths expose authorized snapshots only. No raw target
appears in errors/logging.

## Payments: NEW frontend contract

`POST /api/payments` requires a canonical UUID **x-submission-id header** plus
multipart fields method, amount, optional note, and exactly one receipt image.
The frontend must retain this UUID and send it; it is not a multipart field.
Amounts are claimed minor units under server method/currency/minimum/maximum
configuration. Submission creates a pending claim only; no USD credit or journal.

The submission UUID is a recovery identifier, **not payload idempotency**:

- Confirmed pending creation: 201, `{ paymentId: 'pay-<UUID>', status: 'pending' }`.
- Existing submission ID: 409 PAYMENT_SUBMISSION_EXISTS; no successful replay.
- Unknown COMMIT: 503 PAYMENT_SUBMISSION_OUTCOME_UNKNOWN, paymentId,
  retrySubmission=false. Never automatically upload again or insert again.
- `GET /api/payments/submissions/:submissionId`: authenticated owner-only recovery.
  200 committed evidence, or 200 unresolved with retrySubmission=false. Absence is
  not permission to reinsert. Admin recovery does not widen owner scope.

`PUT /api/payments/:id/accept` accepts **approvedAmount as a strict decimal string
in USD**, idempotencyKey, and reason. The boundary converts once with the reviewed
money parser to canonical approvedAmountCents for the coordinator. Numeric JSON,
exponents, ambiguous dual decimal/cents fields and inferred FX are rejected.
`PUT /api/payments/:id/reject` accepts idempotencyKey and reason, with no credit.
Decision success/replay is 200; independent decisions on settled resources are 409.

### Private receipts

Actual memory Multer is bounded at 5 MiB, one file, three fields. Actual Sharp
validates/re-encodes a single-page image with a 16-million-pixel ceiling to JPEG
inside 800x800. Provider IDs are server-generated private_payment_receipts UUIDs,
with authenticated delivery, no public-upload fallback. All storage calls occur
outside financial transactions. The submission service performs fresh authority
and exact session/CSRF/expiry/revocation checks inside its INSERT.

Confirmed rollback cleans owned uploaded storage best-effort; uncertain database
persistence retains it. Foreign provider IDs are never deleted. Cleanup failure
cannot compensate or rewrite domain outcomes. No reconciliation job is enabled.

`GET /api/payments/:id/receipt` uses dedicated owner/current-admin repository
methods, then returns a signed private download link expiring in about 60 seconds.
It sets Cache-Control:no-store and Referrer-Policy:no-referrer. URLs are bearer
links during their short lifetime, are not logged, and never appear in history,
summary or public detail DTOs. Public DTOs exclude all private provider metadata.

## Reads and pagination

For both resources: owner `/`, `/summary`, `/:id`; admin `/all`, `/admin` (pending),
`/summary/all`, `/admin/:id`. Cross-owner detail/private reads return 404 just like
absent resources. Owner paths never accept userId overrides, even for admins.

Lists return `{ items, nextBefore }`, limit 1-100, default 50. Signed microsecond
 timestamp/UUID keyset cursors bind resource, actor, owner/admin mode, owner filter
and status. Invalid/tampered/rebound cursors are rejected. Admin lists/summaries
accept an optional UUID userId filter; pending queues forbid status overrides.
Order totals and payment claimed-by-currency/approved-USD totals are exact strings.
Existing repository public id/_id UUID aliases are preserved, not Mongo identities.

## Idempotency, errors and unknown outcomes

Coordinator idempotency keys are actor/operation scoped and fingerprint-bound.
Changed payload/reason with the same key returns 409 IDEMPOTENCY_CONFLICT.
Distinct decisions on already-decided resources return 409 ORDER_ALREADY_DECIDED
or PAYMENT_ALREADY_DECIDED. INSUFFICIENT_FUNDS is 409 with no partial effects.
Purchase replay preserves its original durable receipt, even after a later decision.
Completion/rejection do not invent monetary result fields.

Unresolved financial COMMIT returns 503 FINANCIAL_OUTCOME_UNKNOWN with
retryWithSameKey=true. Retry only the identical request and original key through
the coordinator; never infer failure, issue a new key, or compensate. Recovery is
freshly authorized; missing evidence does not trigger HTTP-level body replay.
Financial errors use fixed code/error strings, no driver/provider messages, SQL,
credentials, private metadata or connection targets. All responses are no-store.

## Verification and legacy regression isolation

`tests/financial-http.pg.test.js` exercises actual server routes, sessions, TLS PG,
coordinator, repositories, Multer and Sharp. Cloudinary external transport alone
is controlled; lost-COMMIT tests throw after actual database COMMIT and independently
block recovery connections where needed. Journal/balance/resource evidence is
asserted, alongside concurrent spending/decisions and session-save suppression.

Frozen legacyOrdersRoutes/legacyPaymentsRoutes helpers preserve historical Mongo
behavior in existing Mongo suites only. They are never runtime imports. C1's
financial placeholder expectations intentionally become mounted-route denial
checks; disabled C3 features remain unavailable. The baseline was 1,505 passing
cases; C2 requires full disposable verification before any C3 work.

Run from the project root: `bash backend/tests/run-disposable-pg.sh`.
The harness never loads application .env, uses an exact disposable URL/reset guard
and verified TLS, and applies only approved immutable migrations to that owned DB.
