# Step 4: atomic catalog purchasing

## Deployment and boundaries

Initialize `financialService.initializeFinancialFoundation()` before accepting financial mutations. User, FinancialOperation, Payment and Order must use the same MongoDB connection. Readiness creates/checks the exact required collections and indexes and verifies a write/read/abort/absence probe. Standalone MongoDB, incompatible/TTL indexes, connection generation changes, or infrastructure failures disable financial writes. There is no nontransactional fallback or generic exported transaction callback.

Transactions use snapshot reads, majority writes, primary read preference, a 15-second transaction timeout and a 5-second maximum commit time. Production credentials are never used by the integration harness: it spawns and PID-verifies an owned localhost replica set and removes only its temporary database/catalog directories.

Order and Payment socket dispatch, resource queries, enqueue/replay and notification-state writes remain disabled until Step 5. This pass does not authenticate financial WebSockets, add a provider integration, provide a durable outbox, or perform a PostgreSQL migration. Database raw collection APIs remain a privileged boundary separate from guarded Mongoose mutations.

## Operator-owned catalog

Only these fixed purchase files are ingested. Each root is `{ "defaultFulfillmentSchema": "...", "products": [...] }`.

| File | Frontend category | Required schema |
| --- | --- | --- |
| cryptos.json | cryptos | walletAddress |
| payments.json | cryptos | accountId |
| mobile-payments.json | cryptos | phone |
| apps.json | apps | accountId |
| games.json | games | playerId |
| balances.json | balances | playerId |

`essential.json` is application configuration, not a purchasable catalog. IDs remain category-local. The three crypto files share one ID namespace and one browsing array. Missing/malformed files, duplicate IDs, or contradictory defaults/product schemas fail the affected category closed with `FULFILLMENT_CONFIGURATION_INVALID`, without exposing a partial merge or disabling other categories. Unsupported server-declared networks use `UNSUPPORTED_NETWORK`. Product schemas may inherit the file default. A target-free product must explicitly declare `requiresFulfillmentTarget:false`, `fulfillmentSchema:null`, and a null network. Validation version is explicitly 1.

The catalog is loaded outside retryable transaction callbacks, normalized, recursively frozen, and atomically published. A purchase pins pricing and fulfillment policy through callback retries. New purchases use the current published catalog; committed-key retries use the original immutable Order snapshot even if a product becomes unavailable, is removed, changes price/network, or its current category fails to load. Restart/reload must publish operator changes; no request chooses file paths.

## Money and lifecycle

USD integer cents are authoritative. Compatibility numeric amounts/balances must round-trip exactly. BigInt intermediates perform proportional calculation, with one final half-up cent rounding.

* Apps: 1–1,000,000 quantity units, USD 0.50–1,000 per purchase.
* Games: backend packages only, USD 500 maximum charge.
* Crypto/balance proportional `minLimit`/`maxLimit`: quantity units, not dollar limits.
* All charges: positive, safe integer cents. A package selects a backend quantity and price together; client quantity overrides are refused.

`pending` means the debit, journal, balance update and Order creation committed together, awaiting fulfillment. `completed` means an active administrator manually asserted fulfillment; no money mutation or zero-value financial operation occurs. This does **not** prove provider delivery. `cancelled` means the full original charge was credited with a refund journal and cancellation audit in one transaction. Only pending orders transition; no partial refund or cancellation of completed orders is supported. A suspended existing owner may receive a refund without reactivation. Missing/damaged owner money or inconsistent debit/refund evidence requires reconciliation. Catalog price and old client amounts never determine refunds.

Legacy Orders do not receive a financial-version default or automatic migration. They are read-only, labeled unverified/reconciliation-required, excluded from modern totals and pending fulfillment queues, and cannot be completed/refunded by the modern operations. A legacy user's exact balance may migrate once in a successful purchase transaction; invalid targets and insufficient funds cannot commit that migration.

## HTTP contract

All private routes require shared JWT/application-session authentication. Purchaser identity comes only from `req.user._id`; JWT/body role or user ID cannot choose the purchaser. Purchase transactions also recheck active status and token version. Administrator decisions recheck the current active administrator in the transaction. Mutations require existing session-bound CSRF protection. Ordinary reads remain self-only, including for administrators.

`POST /api/orders` returns 410. The only purchase endpoint is:

```json
POST /api/orders/purchase
{
  "category": "games",
  "productId": 1,
  "packageIndex": 0,
  "idempotencyKey": "purchase-unique-logical-attempt",
  "fulfillmentTarget": { "playerId": "Player_123" }
}
```

Use `quantity` **instead of** `packageIndex` for proportional products. No client price, amount, service name, purchaser ID, status, schema, network, or other unknown field is accepted. A new purchase returns 201; verified replay returns 200, with `replayed:true`. Receipts include order ID, original pending status, exact charge string/cents, quantity, original resulting balance string/cents, and debit operation ID. Original receipt status/balance are historical, not the current Order/account state.

* `GET /api/orders`, `/summary`, `/:id`: owner-only, target-free views.
* `GET /api/orders/:id/fulfillment`: dedicated owner-only private target read.
* `GET /api/orders/admin`, `/all`, `/summary/all`, `/admin/:id`: explicit administrator routes. `/admin` is the modern pending queue.
* `GET /api/orders/admin/:id/fulfillment`: explicit administrator private target read.
* `PUT /api/orders/:id/accept`: completion assertion.
* `PUT /api/orders/:id/reject`: atomic full refund/cancellation.

Both decision bodies accept only `idempotencyKey` and a bounded, trimmed, plain-text `reason`. Lists support `limit` (1–100, default 50) and a lowercase ObjectId `before` cursor, descending by `_id`. The initial browser history/queue view requests up to 100 records; additional history is available through the cursor API. Inaccessible individual resources return 404. Responses use `Cache-Control:no-store`. Summaries report exact gross charges, refunds and net charges (decimal and cent strings), modern status counts, and excluded legacy count—not a meaningless mixed-product total quantity.

## Fulfillment policy and privacy

A target is an object with exactly one field, matching the backend-declared schema. Missing required target: `FULFILLMENT_TARGET_REQUIRED`; invalid target: `INVALID_FULFILLMENT_TARGET`. A target supplied for a target-free product is rejected, not silently ignored.

Raw values must be bounded printable ASCII before parsing (128 characters; email 254). Controls, Unicode and `< > &` quotes, backticks and backslashes are refused before trimming ordinary surrounding ASCII spaces. Errors never echo the raw target.

* accountId/playerId: `[a-zA-Z0-9_-]{3,32}`; preserve case and leading zeros. Not interpreted as application identity or role.
* phone: `+` and 7–15 digits with nonzero first digit, no formatting punctuation.
* email: bounded ASCII RFC-valid subset checked by existing validator; preserve local case and lowercase domain. Not every possible quoted RFC address is supported.
* Bitcoin mainnet: Base58Check version 0/5; Bech32 v0 program 20/32 bytes; Bech32m v1 program 32 bytes. Check padding, checksum, prefix, version, length and uniform case. Preserve Base58 case; normalize validated Bech32 lowercase.
* Ethereum/BSC mainnet: 20-byte nonzero EVM address; validate mixed-case EIP-55 before normalizing lowercase.
* TRON mainnet: Base58Check, 21-byte payload, prefix 0x41 and nonzero account payload; preserve case. Never uppercase TRON.

Wallet network is catalog metadata, never client input. No RPC/DNS/provider calls occur in transactions. Syntax/checksum validation does not prove target ownership, account existence, asset/network compatibility at a provider, or successful delivery.

The canonical immutable `fulfillmentSnapshot` records schema, network, validation version and normalized one-field target. It is excluded from ordinary lists/details and included in the request fingerprint. Reusing a committed key with a changed selection/target returns 409 `IDEMPOTENCY_CONFLICT`. Mongoose guards refuse later target/financial edits, terminal rewrites, unjournaled creation/decisions, deletion and bulk replacement—even when ordinary save validation is disabled. Full linked-journal evidence is checked for replay and decisions.

## Idempotency and recovery

Unique actor/operation/key and Order request/decision indexes prevent duplicate effects; unique resource/source/effect prevents a second debit/refund. Duplicate resolution starts only after the failed transaction unwinds. Replay occurs in a fresh authorization-checked transaction and returns the original stored result. Database outages remain 503; damaged evidence is 409 reconciliation, never guessed delivery/payment success.

Unknown unresolved commits return 503 `FINANCIAL_OUTCOME_UNKNOWN` with `retryWithSameKey:true`. Retry the **same original key and payload**. Never issue a reserve, restore, compensating client refund, or replacement purchase to guess the outcome.

Browser intents are owner-scoped, persisted before dispatch, restored/locked in the dialog, and recoverable from Order history even when the catalog card is removed. Session verification and dispatch use pinned credentials, with account-switch checks. Definitively rejected new purchases may be corrected; prior unknown attempts survive subsequent business/authentication failures. Administrator decisions persist original action/key/reason and have HTTP recovery for saved terminal decisions. Private targets and errors are rendered with textContent/value, not HTML interpolation. Historical replay balances are never written into current browser balances; confirmed purchases trigger authenticated history/portfolio refresh.

Saved intents include private targets in localStorage until resolution. Browser storage/device access is a privacy boundary; no server log or general list contains these targets. Clearing storage loses recovery keys; do not silently replace an unresolved intent. No bounded automatic financial retry/backoff or durable browser cross-device intent store is provided.

## Dependencies and verification

Approved exact additions: bs58check 4.0.0, bech32 2.0.0, ethers 6.16.0. Installation used ignored scripts. npm reported 42 vulnerabilities (2 low, 17 moderate, 22 high, 1 critical); no audit fix or unrelated upgrade was run. Attribution of those findings to this change versus the existing dependency tree has not been established.

Run `npm test -- --runInBand --testTimeout=30000 --silent` from the repository root. Integration suites skip if local mongod is absent; skipped suites are not evidence of transactional safety. The owned harness does not simulate a multi-node failover or prove provider delivery. Fault tests inject lost responses, callback failures and lookup misses around real database transactions/HTTP; they do not replace financial operations with mock implementations.

Final full-suite verification: **617 passed, 617 total; 11 suites passed, 11 total; no failures or skips**, in 17.001 seconds. This includes the new catalog/fulfillment, owned replica-set Orders, browser client/DOM, Order readiness, and expanded notification tests, plus all inherited authentication, user, money, financial model/service and payment tests. Earlier failures in request cloning across Jest realms and duplicate-command observation (MongoDB may put write errors inside an ok:1 reply) were corrected and verified by this full rerun. `git diff --check` also passed. These are current Step 4 results, not the older payment-stage totals. Implementation is awaiting the user's final review; no PostgreSQL branch or migration was created.
