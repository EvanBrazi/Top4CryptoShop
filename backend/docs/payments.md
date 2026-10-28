# Payment foundation and HTTP contract

## Financial boundary

Approval uses `financialService.approvePayment`, **not** `adjustBalance`. The same snapshot/majority transaction updates the owner balance pair, makes the payment `completed`, stores its durable audited result and inserts a positive `payment_credit`. Its unique effect is `payment / String(payment._id) / credit`. An exact legacy owner balance can acquire cents and a migration journal in that same transaction. Invalid/drifting money is never guessed.

Rejection uses `rejectPayment`, makes the payment `cancelled`, and stores an audited, idempotent decision. It does not read/migrate/update the owner's balance and does not create a zero-credit financial operation. The owner may already be inactive or deleted.

The server-owned administrator identity is reauthorized from the database in every transaction, including replay resolution. Idempotency keys are case-sensitive, actor- and decision-type-scoped. The payload hash includes the target payment, decision, reviewed USD amount (approval only), and normalized reason. Reusing a key for a different payload returns 409. A legitimate replay returns the original result, even after later balance changes.

`503 FINANCIAL_OUTCOME_UNKNOWN` includes `retryWithSameKey: true`: retry with the **same key and same payload**, never create a new decision key to work around an ambiguous response. Readiness must be restored by initialization before mutations resume. A confirmed commit is not undone because session cleanup fails.

## Requests

Every endpoint requires shared JWT + opaque application `customSessionId` authentication. For header clients use `Authorization: Bearer <JWT>` and `x-session-id: <customSessionId>`. This is **not** the Express `sessionId`. Mutations additionally require a valid `x-csrf-token` bound to the Express session through the existing CSRF middleware.

- `POST /api/payments`: multipart fields `method`, `amount`, optional `note`, and one `receipt` file. Ownership is derived from authentication, and claimed currency/limits come from `config/paymentMethods.js`. Client `userId`, `amountInUSD`, `currency`, `status`, audit fields and other unknown fields are rejected. The amount is only an original-currency claim. New pending records have explicit `submissionVersion: 1`, `amountInUSD: 0` (unverified), and no settlement cents.
- `PUT /api/payments/:paymentId/accept`: active administrator only; JSON `{ "approvedAmount": "25.00", "idempotencyKey": "review-1", "reason": "Transfer independently verified" }`. `approvedAmount` is an explicitly reviewed **USD** settlement, not a client quote. Returns canonical `completed`, exact `balance` string, cents, operation ID and replay flag.
- `PUT /api/payments/:paymentId/reject`: active administrator only; JSON `{ "idempotencyKey": "reject-1", "reason": "Receipt did not establish settlement" }`. Returns canonical `cancelled` and replay flag, with no monetary result.

The administrator must independently verify actual settlement and duplicate transfer references. A receipt alone is not proof of payment. Per-payment effect deduplication does **not** identify the same external transfer submitted under different payment IDs; provider-reference reconciliation remains a separate operational requirement.

## Reads and receipts

- `GET /api/payments`, `/summary`, and `/:paymentId` are self-only, including for an administrator using ordinary endpoints. Supplying another owner's `userId` returns 403.
- `/all`, `/admin` (pending queue), `/admin/:paymentId`, and `/summary/all` are explicit administrator-only views. Global list/summary endpoints can accept a validated `userId` filter.
- Lists return arrays, default to 50 records, cap `limit` at 100, sort by descending `_id`, and accept `before=<last _id>` for keyset pagination. Private storage/audit fields are never projected into lists.
- Summaries stream records with bounded memory and a database execution limit, group claimed totals by original currency, and add only modern reviewed USD settlement with BigInt. Totals are exact decimal strings; `verifiedAmountCents` is an integer string so a sum cannot silently overflow JavaScript's safe integer limit. No mixed-currency `totalAmount` is provided.
- `GET /:paymentId/receipt` authorizes the owner or database administrator and returns `{ url, expiresAt }` for a signed authenticated Cloudinary download expiring in 60 seconds. All payment responses are `no-store`. URLs contain no application JWT/session credentials.

Authentication, CSRF, rate limiting and readiness precede Multer. Memory uploads are bounded to one file and three fields, below the 5 MiB parser limit. Only claimed JPEG/PNG/WebP is accepted; Sharp validates actual allowed image content and a 16-million-pixel limit, rejects unsupported/multiframe content, strips metadata and re-encodes to JPEG with maximum 800x800 dimensions. Cloudinary storage occurs only after form validation, uses server UUIDs under `private_payment_receipts`, and uses delivery type `authenticated`.

Failed submissions clean up owned assets when non-persistence is established. A lost save response is checked with a majority read before deletion. If storage/database outcomes cannot be established, leave the asset for reconciliation rather than delete a possibly persisted payment's evidence. External storage is not part of a MongoDB transaction; cleanup is best effort, not an exactly-once storage guarantee.

## Deployment and intentionally disabled behavior

- Bootstrap explicitly initializes collections, exact required indexes and the private write/read/abort probe. A supported replica set or sharded deployment is mandatory. The default local standalone configuration keeps financial mutations at 503. No nontransactional fallback exists.
- The existing `paymentId_1` unique physical index name is preserved and its definition verified; no production indexes or records are dropped/migrated automatically. Conflicting indexes, duplicate public IDs, or TTL indexes require operator reconciliation.
- Old payments lacking modern submission/audit evidence require manual reconciliation. Missing journal evidence does **not** establish that a historical payment was unpaid. The new API never serves legacy public receipt URLs. `/images/payments` now returns 410 before static middleware; old files are not deleted.
- Previously public Cloudinary receipts and previously cached/public copies require a separate privacy migration/purge. This backend cannot retroactively make those existing provider URLs private.
- Payment WebSocket dispatch, pending-payment queries, status queries, notification-state writes, and replay of queued payment notifications are disabled with Step 5 TODOs. No new WebSocket authentication has been wired. Existing unrelated order sockets remain outside this pass.
- Balance-adjustment HTTP routes remain disabled. Orders/catalog and broader auth/session redesign are unchanged.
- Existing wallet/admin frontend code needs the new authentication/body/status/receipt contracts. It is deliberately not allowed to preserve unsafe client USD conversion or owner fields for backward compatibility.

## Verification

Run `npm test -- --runInBand` from the repository root. Live payment tests start only freshly spawned, PID-verified localhost MongoDB processes with an owned temporary database and replica set. Cloudinary transport is mocked; HTTP, shared JWT auth, CSRF checks, Multer, Sharp, models, database writes, unique constraints, transactions and rollback are real. Lost-response tests wrap real transactions to emulate ambiguity; the separate E11000 cases produce actual database errors rather than fabricated duplicate exceptions. If `mongod` is absent, live suites are explicitly skipped, not represented as verified.
