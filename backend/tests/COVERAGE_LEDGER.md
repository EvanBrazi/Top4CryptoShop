# C3.2 coverage ledger — C3.2a deletion checkpoint

**Checkpoint history:** the C3.2a summary, source rows, destination status and verification below are preserved as approved historical accounting. Later completion records at the end supersede the applicable planned/not-implemented statuses without erasing source obligations. See **C3.2b1 — avatar completion** and **C3.2b2 — users/admin authorization completion** for the completed conversions and current helper deletion status.

## Scope, authority and counting

Source checkpoint: `7439b8d` (C3.1, 690 passing PostgreSQL cases). This pass changes only this ledger and unreferenced retired test files/helpers. No runtime, migration, package, PG suite or remaining Mongo-dependent test is edited.

This is an obligation ledger, **not a claim that planned tests have already been implemented or passed**. Every source registration is expanded into one row per literal `test.each` table entry. Source filename, line, original title template and the exact source parameter expression identify each case unambiguously. A template plus parameter expression is intentional: it preserves `NaN`, `-0`, bigint, router identity and hostile strings without lossy Jest `%p` rendering. Statements/loops inside a case are not counted as additional Jest cases; compound requirements are captured in the requirement/rationale, and a missing subrequirement is marked pending rather than credited to a nearby test. Conditionally skipped Mongo suites are inventoried as obligations, not reported as executed tests. Parameter expressions use HTML-escaped code spans to preserve literal source backslashes; literal control/bidi characters are displayed as explicit escapes rather than rendered invisibly.

Disposition meanings:

- **Existing PG coverage**: cited surviving PostgreSQL case(s) exercise the portable obligation; Mongo-specific plumbing is retired. Some supporting unit cases are also cited explicitly.
- **Existing non-PG coverage**: cited independent/unit coverage already exists. These cases are not falsely counted among the 690 PostgreSQL cases and were not executed in C3.2a unless reported below.
- **New replacement**: exact variant or compound requirement needs a named regression. Its destination is RESERVED/NOT IMPLEMENTED; existing nearby tests are not completion evidence.
- **Changed disabled contract**: retain the current approved behavior (503 migration marker for isolated HTTP stubs, FEATURE_UNAVAILABLE at application prefixes, FINANCIAL_UNAVAILABLE for enabled-but-disabled manual balance, 410 ENDPOINT_DISABLED for reserve/restore); do not restore success, listeners, queues or connections. Existing citations are evidence only for the applicable part; any planned citation leaves the row pending.
- **Retired mechanism**: ObjectId/Mongoose/ClientSession/topology/probe/lazy-migration mechanics with no current API. Any portable security/money/evidence obligation is mapped independently and is not dismissed just because its old mechanism was removed.

Generated columns/NOT NULL are not disabled to create historical Mongo damage. Impossible SQL states must be tested at input boundaries or with explicitly labeled real-query-result fault injection. `legacy_mongo_id` and historical receipt/provenance contracts are not erased. A SQL `balance_migration` evidence constraint is distinct from adding a lazy runtime migration capability.

C3.2b owns avatar/user conversions; later approved C3.2 sub-phases own financial and disabled-feature replacements. No later phase is begun here. The approved numerical budgets (45 avatar, 36 users, 28 financial invariants, 36 money, 8 coordinator additions, 16 disabled PG, 24 notifications, 33 disabled unit, 10 Nodemailer) remain planning targets, not caps that permit discarding obligations. Exact matrix/compound gaps found here must be reconciled and approved in their owning phase; the proposed 823 PG target is not a result or a guarantee for unimplemented tests. Several source cases may share one parameterized destination; destination templates are not counted as already-executed replacement cases.

## Summary

**524 expanded source cases across 255 registrations and 10 files; 240 cases in the four deleted Mongo suites.**

| Disposition | Expanded source cases |
|---|---:|
| Existing PG coverage | 91 |
| Existing non-PG coverage | 15 |
| New replacement | 316 |
| Changed disabled contract | 41 |
| Retired mechanism | 61 |
| **Total** | **524** |

| Original file (relative to backend/tests/) | Registrations | Cases | Existing PG | Existing non-PG | New | Disabled | Retired | C3.2a action |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| `financial-models.mongo.test.js` | 15 | 15 | 1 | 2 | 9 | 0 | 3 | Delete |
| `financial-service.mongo.test.js` | 28 | 36 | 6 | 0 | 23 | 0 | 7 | Delete |
| `orders.mongo.test.js` | 43 | 101 | 30 | 0 | 69 | 1 | 1 | Delete |
| `payments.mongo.test.js` | 41 | 88 | 28 | 0 | 59 | 0 | 1 | Delete |
| `avatar-upload.test.js` | 13 | 37 | 1 | 0 | 36 | 0 | 0 | Untouched; conversion/reconciliation pending |
| `users-admin-authorization.test.js` | 29 | 76 | 15 | 0 | 45 | 16 | 0 | Untouched; conversion/reconciliation pending |
| `financial-models.test.js` | 39 | 78 | 5 | 4 | 42 | 0 | 27 | Untouched; conversion/reconciliation pending |
| `financial-service.test.js` | 30 | 64 | 5 | 4 | 33 | 0 | 22 | Untouched; conversion/reconciliation pending |
| `payment-notifications.test.js` | 11 | 23 | 0 | 0 | 0 | 23 | 0 | Untouched; conversion/reconciliation pending |
| `nodemailer.test.js` | 6 | 6 | 0 | 5 | 0 | 1 | 0 | Untouched; conversion/reconciliation pending |

## Helper deletion boundary

Deleted `helpers/legacyOrdersRoutes.js`, `helpers/legacyPaymentsRoutes.js` and `helpers/mongoServer.js` after removing the four retired suites and confirming no remaining executable importers. Negative `require.cache` path assertions in the unchanged PG suites are **not importers**. The historical helper mention in `backend/docs/financial-routes-contracts.md:125` is documentation, not an import; it remains untouched.

Retain `helpers/legacyMongoAuth.js`, `helpers/legacyCsrf.js` and `helpers/legacyUsersRoutes.js`: both `avatar-upload.test.js` and `users-admin-authorization.test.js` still import them. The user's "once verified no remaining importers" condition prevents deleting these three in C3.2a; C3.2b removes their last consumers before deleting them. Their dependencies on C3.1-deleted models remain expected full-suite blockers, not permitted runtime fallbacks.

Keep `helpers/disposablePg.js` and `helpers/authCredentialCases.js` byte-for-byte unchanged. The remaining six Mongo-dependent suites are intentionally untouched; the full legacy suite is not an acceptance run for C3.2a.

## Destination index

All destination paths are relative to `backend/tests/`. Existing titles are exact source test-title templates with current line numbers; planned titles are explicit reserved regression names, not asserted implementation. Case rows refer to this index to avoid ambiguous file-only coverage claims.

<a id="d001"></a>
**D001 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: financial indexes preserve idempotency, source deduplication and history without replay erasure

<a id="d002"></a>
**D002 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: journal actor/type/idempotency uniqueness rejects a duplicate

<a id="d003"></a>
**D003 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: changed payload hash cannot bypass journal key uniqueness

<a id="d004"></a>
**D004 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: journal key scope is actor and operation type

<a id="d005"></a>
**D005 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: source/effect uniqueness holds across actors and request keys

<a id="d006"></a>
**D006 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: concurrent source-backed inserts preserve one committed effect

<a id="d007"></a>
**D007 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: independent source-free adjustments remain valid

<a id="d008"></a>
**D008 — existing (source present)**: `financial-coordinator.pg.test.js` (line 1165)<br>Test: cancellation refunds full original charge and replay never refunds twice

<a id="d009"></a>
**D009 — planned — NOT IMPLEMENTED**: `financial-coordinator.pg.test.js`<br>Test: case-sensitive adjustment keys remain independent

<a id="d010"></a>
**D010 — planned — NOT IMPLEMENTED**: `financial-coordinator.pg.test.js`<br>Test: journal failure rolls back adjustment and leaves all prior evidence intact

<a id="d011"></a>
**D011 — existing (source present)**: `user-repository.test.js` (line 82)<br>Test: safe mappings reject coerced BIGINT and inconsistent generated balance, without creating defaults

<a id="d012"></a>
**D012 — existing (source present)**: `user-repository.test.js` (line 432)<br>Test: financial stale versions and changed before cents fail before mutation

<a id="d013"></a>
**D013 — existing (source present)**: `financial-coordinator.pg.test.js` (line 466)<br>Test: adjustment atomically commits exact balance, version and journal

<a id="d014"></a>
**D014 — planned — NOT IMPLEMENTED**: `financial-coordinator.pg.test.js`<br>Test: adjustment replay preserves original receipt after a later committed adjustment

<a id="d015"></a>
**D015 — existing (source present)**: `financial-coordinator.test.js` (line 72)<br>Test: replay ends without financial DML or COMMIT and returns historical balance

<a id="d016"></a>
**D016 — planned — NOT IMPLEMENTED**: `financial-coordinator.pg.test.js`<br>Test: stale expected adjustment balance rejects without money version or journal writes

<a id="d017"></a>
**D017 — planned — NOT IMPLEMENTED**: `financial-coordinator.pg.test.js`<br>Test: changed adjustment payload under one key conflicts: %p

<a id="d018"></a>
**D018 — planned — NOT IMPLEMENTED**: `financial-coordinator.pg.test.js`<br>Test: concurrent identical adjustments commit one original result

<a id="d019"></a>
**D019 — planned — NOT IMPLEMENTED**: `financial-coordinator.pg.test.js`<br>Test: concurrent conflicting adjustment intents preserve the losing target

<a id="d020"></a>
**D020 — existing (source present)**: `financial-coordinator.pg.test.js` (line 678)<br>Test: real adjustment-journal 23505 rolls back before clean replay resolution

<a id="d021"></a>
**D021 — planned — NOT IMPLEMENTED**: `financial-coordinator.pg.test.js`<br>Test: different adjustment keys competing for one expected balance have one winner

<a id="d022"></a>
**D022 — planned — NOT IMPLEMENTED**: `financial-coordinator.pg.test.js`<br>Test: zero-delta adjustment creates one durable journal

<a id="d023"></a>
**D023 — planned — NOT IMPLEMENTED**: `financial-coordinator.pg.test.js`<br>Test: exact balance reduction cannot underflow

<a id="d024"></a>
**D024 — planned — NOT IMPLEMENTED**: `financial-coordinator.pg.test.js`<br>Test: same adjustment key is independent across authorized actors

<a id="d025"></a>
**D025 — existing (source present)**: `financial-coordinator.pg.test.js` (line 1306)<br>Test: fresh token authorization is required even for a replay

<a id="d026"></a>
**D026 — planned — NOT IMPLEMENTED**: `financial-coordinator.pg.test.js`<br>Test: inactive administrator cannot mutate or replay an adjustment

<a id="d027"></a>
**D027 — planned — NOT IMPLEMENTED**: `financial-coordinator.pg.test.js`<br>Test: missing or inactive adjustment target leaves funds and journal unchanged

<a id="d028"></a>
**D028 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: invalid authoritative monetary state is rejected rather than silently repaired: %p

<a id="d029"></a>
**D029 — existing (source present)**: `financial-coordinator.pg.test.js` (line 936)<br>Test: disconnect at COMMIT without evidence returns unknown and never repeats the write

<a id="d030"></a>
**D030 — existing (source present)**: `financial-coordinator.pg.test.js` (line 895)<br>Test: lost response after real COMMIT destroys the client and resolves the receipt

<a id="d031"></a>
**D031 — existing (source present)**: `users-server.pg.test.js` (line 121)<br>Test: schema drift refuses boot: %s

<a id="d032"></a>
**D032 — existing (source present)**: `financial-http.pg.test.js` (line 143)<br>Test: purchase is 201, exact committed receipt; replay is 200 with one debit

<a id="d033"></a>
**D033 — existing (source present)**: `financial-http.pg.test.js` (line 172)<br>Test: HTTP %s product %s snapshots the authoritative %s schema

<a id="d034"></a>
**D034 — planned — NOT IMPLEMENTED**: `financial-http.pg.test.js`<br>Test: balances package purchase uses authoritative quantity and charge

<a id="d035"></a>
**D035 — planned — NOT IMPLEMENTED**: `financial-http.pg.test.js`<br>Test: missing required target rejects before writes for category %s

<a id="d036"></a>
**D036 — planned — NOT IMPLEMENTED**: `financial-http.pg.test.js`<br>Test: purchase rejects legacy authority or extra field without writes: %p

<a id="d037"></a>
**D037 — existing (source present)**: `financial-http.pg.test.js` (line 182)<br>Test: strict fulfillment rejects %p before any write

<a id="d038"></a>
**D038 — planned — NOT IMPLEMENTED**: `financial-http.pg.test.js`<br>Test: purchase rejects legacy unsafe target without echo or writes: %p

<a id="d039"></a>
**D039 — planned — NOT IMPLEMENTED**: `financial-http.pg.test.js`<br>Test: legacy catalog schema contradiction fails closed over HTTP: %s

<a id="d040"></a>
**D040 — existing (source present)**: `financial-http.pg.test.js` (line 152)<br>Test: insufficient funds is 409 without partial writes

<a id="d041"></a>
**D041 — existing (source present)**: `financial-http.pg.test.js` (line 157)<br>Test: concurrent different-key purchases cannot overspend

<a id="d042"></a>
**D042 — existing (source present)**: `financial-http.pg.test.js` (line 163)<br>Test: concurrent same-key purchases return one receipt and no parent CAS race

<a id="d043"></a>
**D043 — planned — NOT IMPLEMENTED**: `financial-http.pg.test.js`<br>Test: normalized equivalent target replays and changed target conflicts

<a id="d044"></a>
**D044 — planned — NOT IMPLEMENTED**: `financial-http.pg.test.js`<br>Test: purchase receipt survives catalog loss and a later balance change

<a id="d045"></a>
**D045 — planned — NOT IMPLEMENTED**: `financial-http.pg.test.js`<br>Test: purchase failure after actual %s write rolls back all effects

<a id="d046"></a>
**D046 — existing (source present)**: `financial-http.pg.test.js` (line 225)<br>Test: cancellation fully refunds once, independent decision conflicts, immutable target survives

<a id="d047"></a>
**D047 — planned — NOT IMPLEMENTED**: `financial-http.pg.test.js`<br>Test: competing administrators cancel with at most one original-charge refund

<a id="d048"></a>
**D048 — planned — NOT IMPLEMENTED**: `financial-http.pg.test.js`<br>Test: completed order cannot be cancelled and preserves its original monetary evidence

<a id="d049"></a>
**D049 — existing (source present)**: `financial-http.pg.test.js` (line 213)<br>Test: completion is nonmonetary, replayable, immutable, and keeps original purchase receipt

<a id="d050"></a>
**D050 — existing (source present)**: `financial-http.pg.test.js` (line 236)<br>Test: competing completion/cancellation permits one decision and at most one refund

<a id="d051"></a>
**D051 — existing (source present)**: `financial-coordinator.pg.test.js` (line 1198)<br>Test: original-charge refund may credit an inactive owner

<a id="d052"></a>
**D052 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: refund with invalid owner monetary evidence fails atomically: %s

<a id="d053"></a>
**D053 — planned — NOT IMPLEMENTED**: `financial-http.pg.test.js`<br>Test: cancellation failure after actual %s write rolls back all effects

<a id="d054"></a>
**D054 — existing (source present)**: `financial-http.pg.test.js` (line 541)<br>Test: %s lost COMMIT acknowledgement resolves to replay without repeating body

<a id="d055"></a>
**D055 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: historical unversioned order remains read-only: %s

<a id="d056"></a>
**D056 — existing (source present)**: `financial-http.pg.test.js` (line 379)<br>Test: %s owner history/detail/summary are SQL-scoped; admin uses explicit admin endpoints

<a id="d057"></a>
**D057 — existing (source present)**: `financial-http.pg.test.js` (line 403)<br>Test: owner/admin fulfillment views authorize independently of public details

<a id="d058"></a>
**D058 — existing (source present)**: `financial-http.pg.test.js` (line 491)<br>Test: financial authentication rejects %s current state

<a id="d059"></a>
**D059 — existing (source present)**: `financial-http.pg.test.js` (line 462)<br>Test: %s unsafe requests need exact parent CSRF; header credentials alone cannot mutate

<a id="d060"></a>
**D060 — existing (source present)**: `financial-http.pg.test.js` (line 243)<br>Test: order %s is admin-only before mutation

<a id="d061"></a>
**D061 — existing (source present)**: `financial-http.pg.test.js` (line 553)<br>Test: %s unresolved COMMIT returns 503 and same-key retry resolves without duplicate effect

<a id="d062"></a>
**D062 — existing (source present)**: `financial-coordinator.pg.test.js` (line 748)<br>Test: real purchase-journal 23505 cannot leave a second debit or order

<a id="d063"></a>
**D063 — planned — NOT IMPLEMENTED**: `financial-http.pg.test.js`<br>Test: order decision uniqueness conflict resolves only after rollback: %s

<a id="d064"></a>
**D064 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: existing refund source evidence cannot be credited twice

<a id="d065"></a>
**D065 — existing (source present)**: `financial-http.pg.test.js` (line 571)<br>Test: %s repository outage has fixed errors, no private SQL/targets

<a id="d066"></a>
**D066 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: order immutability and evidence guards reject unsafe writes

<a id="d067"></a>
**D067 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: damaged order target evidence cannot commit

<a id="d068"></a>
**D068 — planned — NOT IMPLEMENTED**: `financial-http.pg.test.js`<br>Test: legacy product network or schema rejection has no financial effect: %p

<a id="d069"></a>
**D069 — planned — NOT IMPLEMENTED**: `financial-http.pg.test.js`<br>Test: equivalent EVM address replays original network after catalog changes

<a id="d070"></a>
**D070 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: order summary excludes unverified historical monetary claims

<a id="d071"></a>
**D071 — planned — NOT IMPLEMENTED**: `financial-http.pg.test.js`<br>Test: quantity and charge boundary selection rejects before debit: %p

<a id="d072"></a>
**D072 — planned — NOT IMPLEMENTED**: `money-contracts.test.js`<br>Test: proportional cents use one final half-up rounding

<a id="d073"></a>
**D073 — planned — NOT IMPLEMENTED**: `financial-http.pg.test.js`<br>Test: proportional purchase charges one final half-up rounded amount

<a id="d074"></a>
**D074 — planned — NOT IMPLEMENTED**: `financial-http.pg.test.js`<br>Test: purchase retry pins catalog pricing and rechecks authorization

<a id="d075"></a>
**D075 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: refund overflow or unrepresentable compatibility value fails atomically: %s

<a id="d076"></a>
**D076 — planned — NOT IMPLEMENTED**: `financial-http.pg.test.js`<br>Test: authorization change after an aborted purchase prevents retry writes

<a id="d077"></a>
**D077 — existing (source present)**: `financial-http.pg.test.js` (line 524)<br>Test: legacy creation and manual balance writes remain disabled; no financial notifications

<a id="d078"></a>
**D078 — existing (source present)**: `financial-http.pg.test.js` (line 207)<br>Test: no-target product accepts no snapshot and rejects unsolicited target

<a id="d079"></a>
**D079 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: payment indexes enforce decisions and preserve durable replay evidence

<a id="d080"></a>
**D080 — planned — NOT IMPLEMENTED**: `financial-http.pg.test.js`<br>Test: unauthenticated legacy payment route operation performs no upload: %p

<a id="d081"></a>
**D081 — existing (source present)**: `integration-prerequisites.pg.test.js` (line 349)<br>Test: bad %s rejected before parsing/storage

<a id="d082"></a>
**D082 — existing (source present)**: `financial-http.pg.test.js` (line 256)<br>Test: actual multipart/Sharp/private provider submission is pending with no settlement or credit

<a id="d083"></a>
**D083 — existing (source present)**: `integration-prerequisites.pg.test.js` (line 342)<br>Test: submission authenticates, parses, validates, stores receipt, and inserts pending with no credit

<a id="d084"></a>
**D084 — planned — NOT IMPLEMENTED**: `financial-http.pg.test.js`<br>Test: payment submission rejects legacy client authority field before storage: %s

<a id="d085"></a>
**D085 — existing (source present)**: `financial-http.pg.test.js` (line 295)<br>Test: invalid receipt %s cannot create a payment

<a id="d086"></a>
**D086 — existing (source present)**: `integration-prerequisites.pg.test.js` (line 487)<br>Test: real image helper rejects forged image content with no Cloudinary call or payment

<a id="d087"></a>
**D087 — existing (source present)**: `integration-prerequisites.pg.test.js` (line 448)<br>Test: known insert failure and positive rollback permit cleanup; failed cleanup cannot erase error

<a id="d088"></a>
**D088 — existing (source present)**: `financial-http.pg.test.js` (line 397)<br>Test: %s admin reads reject ordinary users and ignore JWT role claims

<a id="d089"></a>
**D089 — existing (source present)**: `financial-http.pg.test.js` (line 365)<br>Test: payment %s is admin-only

<a id="d090"></a>
**D090 — existing (source present)**: `financial-http.pg.test.js` (line 425)<br>Test: %s cursor pagination is bounded, complete and filter-bound

<a id="d091"></a>
**D091 — existing (source present)**: `persistence-reads.pg.test.js` (line 37)<br>Test: payment owner history/detail is receipt-safe; private receipt reads are separately owner scoped

<a id="d092"></a>
**D092 — existing (source present)**: `financial-http.pg.test.js` (line 412)<br>Test: private receipt link is owner/current-admin only, signed and short lived

<a id="d093"></a>
**D093 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: historical payment receipt cannot be exposed or signed

<a id="d094"></a>
**D094 — existing (source present)**: `financial-http.pg.test.js` (line 338)<br>Test: approval explicitly credits USD atomically once, replay succeeds, second key conflicts

<a id="d095"></a>
**D095 — planned — NOT IMPLEMENTED**: `financial-http.pg.test.js`<br>Test: approval failure after actual %s write rolls back credit and decision

<a id="d096"></a>
**D096 — existing (source present)**: `financial-coordinator.pg.test.js` (line 1368)<br>Test: approval replay returns historical balance after a later adjustment

<a id="d097"></a>
**D097 — planned — NOT IMPLEMENTED**: `financial-http.pg.test.js`<br>Test: changed approval decision payload conflicts without additional credit: %p

<a id="d098"></a>
**D098 — planned — NOT IMPLEMENTED**: `financial-http.pg.test.js`<br>Test: legacy invalid approval input performs no writes: %p

<a id="d099"></a>
**D099 — existing (source present)**: `financial-http.pg.test.js` (line 508)<br>Test: %s decisions reject client authority, query overrides and missing reason/key

<a id="d100"></a>
**D100 — planned — NOT IMPLEMENTED**: `financial-http.pg.test.js`<br>Test: same-key concurrent approval resolves one original committed credit

<a id="d101"></a>
**D101 — existing (source present)**: `financial-coordinator.pg.test.js` (line 1326)<br>Test: two administrators cannot approve one payment twice

<a id="d102"></a>
**D102 — existing (source present)**: `financial-http.pg.test.js` (line 357)<br>Test: concurrent payment %s permits one decision

<a id="d103"></a>
**D103 — planned — NOT IMPLEMENTED**: `financial-http.pg.test.js`<br>Test: payment decision uniqueness conflict rolls back credit before resolution: %s

<a id="d104"></a>
**D104 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: payment source/effect uniqueness prevents credit after a missed lookup

<a id="d105"></a>
**D105 — existing (source present)**: `financial-http.pg.test.js` (line 349)<br>Test: payment rejection is nonmonetary and replayable; later approval conflicts

<a id="d106"></a>
**D106 — existing (source present)**: `financial-coordinator.pg.test.js` (line 1107)<br>Test: rejection is nonmonetary and leaves owner balance/version unchanged

<a id="d107"></a>
**D107 — planned — NOT IMPLEMENTED**: `financial-coordinator.pg.test.js`<br>Test: payment rejection does not inspect owner monetary state: %s

<a id="d108"></a>
**D108 — planned — NOT IMPLEMENTED**: `financial-http.pg.test.js`<br>Test: rejection key reused for another payment conflicts without deciding it

<a id="d109"></a>
**D109 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: historical unversioned payment cannot be decided: %s

<a id="d110"></a>
**D110 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: invalid owner monetary evidence prevents payment approval

<a id="d111"></a>
**D111 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: approval overflow or unrepresentable compatibility value fails atomically: %s

<a id="d112"></a>
**D112 — existing (source present)**: `financial-http.pg.test.js` (line 566)<br>Test: unknown COMMIT recovery reauthorizes instead of returning evidence to revoked principal

<a id="d113"></a>
**D113 — existing (source present)**: `financial-http.pg.test.js` (line 451)<br>Test: summaries and admin queues reflect exact decided effects without mixing currencies

<a id="d114"></a>
**D114 — existing (source present)**: `persistence-reads.pg.test.js` (line 64)<br>Test: payment queues/detail and exact mixed-currency summaries validate credit/rejection evidence

<a id="d115"></a>
**D115 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: payment immutable and terminal evidence guards reject unsafe writes

<a id="d116"></a>
**D116 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: invalid pending payment data cannot commit: %p

<a id="d117"></a>
**D117 — existing (source present)**: `users-server.pg.test.js` (line 281)<br>Test: actual multipart avatar persists owned HTTPS URL through guarded CAS

<a id="d118"></a>
**D118 — planned — NOT IMPLEMENTED**: `avatar-upload.pg.test.js`<br>Test: accepted avatar MIME policy persists through PostgreSQL CAS: %s

<a id="d119"></a>
**D119 — planned — NOT IMPLEMENTED**: `avatar-upload.pg.test.js`<br>Test: avatar authorization failure prevents provider and PostgreSQL writes: %p

<a id="d120"></a>
**D120 — planned — NOT IMPLEMENTED**: `avatar-upload.pg.test.js`<br>Test: unsupported avatar MIME rejects before provider or persistence: %s

<a id="d121"></a>
**D121 — planned — NOT IMPLEMENTED**: `avatar-upload.pg.test.js`<br>Test: invalid avatar multipart prevents provider and persistence: %p

<a id="d122"></a>
**D122 — planned — NOT IMPLEMENTED**: `avatar-upload.pg.test.js`<br>Test: malformed avatar boundary creates no asset or persistence

<a id="d123"></a>
**D123 — planned — NOT IMPLEMENTED**: `avatar-upload.pg.test.js`<br>Test: avatar provider failure is sanitized and cleans only owned ID: %s

<a id="d124"></a>
**D124 — planned — NOT IMPLEMENTED**: `avatar-upload.pg.test.js`<br>Test: contradictory avatar provider evidence cannot persist or delete foreign assets: %p

<a id="d125"></a>
**D125 — planned — NOT IMPLEMENTED**: `avatar-upload.pg.test.js`<br>Test: duplicate provider success cannot delete or persist an accepted avatar twice

<a id="d126"></a>
**D126 — planned — NOT IMPLEMENTED**: `avatar-upload.pg.test.js`<br>Test: known avatar rollback cleans only returned owned asset

<a id="d127"></a>
**D127 — planned — NOT IMPLEMENTED**: `avatar-upload.pg.test.js`<br>Test: token-version change during avatar upload prevents persistence

<a id="d128"></a>
**D128 — planned — NOT IMPLEMENTED**: `avatar-upload.pg.test.js`<br>Test: avatar interruption and late provider confirmation clean only owned ID

<a id="d129"></a>
**D129 — planned — NOT IMPLEMENTED**: `avatar-upload.pg.test.js`<br>Test: avatar provider timeout is bounded and does not persist

<a id="d130"></a>
**D130 — existing (source present)**: `users-server.pg.test.js` (line 168)<br>Test: administrative list is bounded, cursor-paginated and safely projected

<a id="d131"></a>
**D131 — existing (source present)**: `users-server.pg.test.js` (line 184)<br>Test: regular users cannot list and a demoted current admin cannot rely on the JWT role

<a id="d132"></a>
**D132 — planned — NOT IMPLEMENTED**: `disabled-features.pg.test.js`<br>Test: disabled admin users and panel API return unavailable without session writes

<a id="d133"></a>
**D133 — existing (source present)**: `users-server.pg.test.js` (line 193)<br>Test: detail ownership is enforced for %s

<a id="d134"></a>
**D134 — existing (source present)**: `users-server.pg.test.js` (line 189)<br>Test: self read %s returns exact string money/version without secrets

<a id="d135"></a>
**D135 — planned — NOT IMPLEMENTED**: `users-admin-authorization.pg.test.js`<br>Test: ordinary user cannot mutate another profile: %s %s

<a id="d136"></a>
**D136 — planned — NOT IMPLEMENTED**: `users-admin-authorization.pg.test.js`<br>Test: administrator cannot mutate another profile: %s %s

<a id="d137"></a>
**D137 — planned — NOT IMPLEMENTED**: `users-admin-authorization.pg.test.js`<br>Test: profile rejects legacy forbidden or unknown field without effects: %s

<a id="d138"></a>
**D138 — planned — NOT IMPLEMENTED**: `users-admin-authorization.pg.test.js`<br>Test: malformed or empty profile body performs no writes: %p

<a id="d139"></a>
**D139 — existing (source present)**: `users-server.pg.test.js` (line 199)<br>Test: identity profile update is atomic, clears email verification and revokes every old session

<a id="d140"></a>
**D140 — existing (source present)**: `users-server.pg.test.js` (line 245)<br>Test: local password mutation uses cost 12, revokes old graph and authenticates only new password

<a id="d141"></a>
**D141 — existing (source present)**: `auth-sessions.pg.test.js` (line 220)<br>Test: password change verifies current password, increments version exactly once, and invalidates sessions

<a id="d142"></a>
**D142 — planned — NOT IMPLEMENTED**: `users-admin-authorization.pg.test.js`<br>Test: invalid password mutation preserves account and sessions: %p

<a id="d143"></a>
**D143 — planned — NOT IMPLEMENTED**: `users-admin-authorization.pg.test.js`<br>Test: Google-only profile cannot use local password update

<a id="d144"></a>
**D144 — planned — NOT IMPLEMENTED**: `users-admin-authorization.pg.test.js`<br>Test: losing password CAS preserves stored hash and authentication graph

<a id="d145"></a>
**D145 — existing (source present)**: `users-server.pg.test.js` (line 234)<br>Test: profile requires exact parent-bound CSRF before JSON parsing or persistence

<a id="d146"></a>
**D146 — existing (source present)**: `users-server.pg.test.js` (line 287)<br>Test: avatar %s fails before provider write

<a id="d147"></a>
**D147 — existing (source present)**: `users-server.pg.test.js` (line 273)<br>Test: lifecycle %s %s is admin-only, CSRF-protected and CAS

<a id="d148"></a>
**D148 — existing (source present)**: `users-server.pg.test.js` (line 255)<br>Test: manual balance remains admin/CSRF protected and never writes money

<a id="d149"></a>
**D149 — planned — NOT IMPLEMENTED**: `users-admin-authorization.pg.test.js`<br>Test: theme strict allowlist changes no money or authentication state

<a id="d150"></a>
**D150 — planned — NOT IMPLEMENTED**: `users-admin-authorization.pg.test.js`<br>Test: avatar strict uploaded-file contract rejects client authority without effects

<a id="d151"></a>
**D151 — planned — NOT IMPLEMENTED**: `users-admin-authorization.pg.test.js`<br>Test: avatar removal rejects extra fields and cleans owned asset after commit

<a id="d152"></a>
**D152 — existing (source present)**: `users-server.pg.test.js` (line 333)<br>Test: removal never deletes foreign URL %s

<a id="d153"></a>
**D153 — planned — NOT IMPLEMENTED**: `users-admin-authorization.pg.test.js`<br>Test: activation rejects authority fields and revokes only target sessions

<a id="d154"></a>
**D154 — existing (source present)**: `users-server.pg.test.js` (line 260)<br>Test: DELETE logically deactivates and preserves user/money while revoking only target sessions

<a id="d155"></a>
**D155 — planned — NOT IMPLEMENTED**: `users-admin-authorization.pg.test.js`<br>Test: missing lifecycle target leaves sessions unchanged

<a id="d156"></a>
**D156 — planned — NOT IMPLEMENTED**: `users-admin-authorization.pg.test.js`<br>Test: invalid lifecycle or balance UUID performs no mutation: %p

<a id="d157"></a>
**D157 — planned — NOT IMPLEMENTED**: `users-admin-authorization.pg.test.js`<br>Test: authorized manual balance stays unavailable for malformed or injected body: %p

<a id="d158"></a>
**D158 — existing (source present)**: `users-server.pg.test.js` (line 164)<br>Test: disabled %s is 410 for all methods without authentication or writes

<a id="d159"></a>
**D159 — planned — NOT IMPLEMENTED**: `disabled-features.test.js`<br>Test: reserve and restore preserve bodyless HEAD and current preflight semantics

<a id="d160"></a>
**D160 — existing (source present)**: `auth-http.pg.test.js` (line 360)<br>Test: HTTP rejects current pair after %s

<a id="d161"></a>
**D161 — planned — NOT IMPLEMENTED**: `disabled-features.pg.test.js`<br>Test: disabled admin prefix cannot expose data to stale or inactive credentials

<a id="d162"></a>
**D162 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: zero-balance user initializes authoritative cents and generated mirror

<a id="d163"></a>
**D163 — planned — NOT IMPLEMENTED**: `money-contracts.test.js`<br>Test: invalid or coerced cents are rejected: %p

<a id="d164"></a>
**D164 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: valid cents produce exact generated monetary mirror: %s

<a id="d165"></a>
**D165 — planned — NOT IMPLEMENTED**: `money-contracts.test.js`<br>Test: invalid monetary precision is rejected rather than rounded: %p

<a id="d166"></a>
**D166 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: generated monetary mirror cannot be independently overwritten

<a id="d167"></a>
**D167 — existing (source present)**: `user-repository.test.js` (line 419)<br>Test: unrepresentable numeric mirrors are rejected before a cents update

<a id="d168"></a>
**D168 — existing (source present)**: `financial-coordinator.pg.test.js` (line 1008)<br>Test: production scope authority rejects forgeries and revokes committed handles

<a id="d169"></a>
**D169 — existing (source present)**: `user-repository.test.js` (line 345)<br>Test: financial cents compare-and-swap uses one scoped client and neither writes mirrors nor commits

<a id="d170"></a>
**D170 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: authoritative user cents cannot be nulled or removed

<a id="d171"></a>
**D171 — existing (source present)**: `financial-coordinator.pg.test.js` (line 1067)<br>Test: rollback also revokes its scope and balance handle

<a id="d172"></a>
**D172 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: incomplete or contradictory financial intent cannot commit: %p

<a id="d173"></a>
**D173 — existing (source present)**: `users-server.pg.test.js` (line 227)<br>Test: theme-only update keeps token version, sessions and money unchanged

<a id="d174"></a>
**D174 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: source-free adjustment has canonical generated replay evidence

<a id="d175"></a>
**D175 — planned — NOT IMPLEMENTED**: `money-contracts.test.js`<br>Test: journal-facing numeric boundaries reject coercion and unsafe values: %s

<a id="d176"></a>
**D176 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: generated journal delta is exact and directionally constrained

<a id="d177"></a>
**D177 — planned — NOT IMPLEMENTED**: `money-contracts.test.js`<br>Test: checked signed balance changes reject overflow and underflow

<a id="d178"></a>
**D178 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: journal keys and hashes reject malformed evidence: %s

<a id="d179"></a>
**D179 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: adjustment source group is all or none

<a id="d180"></a>
**D180 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: source-backed journal cannot omit source identity

<a id="d181"></a>
**D181 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: journal source type effect and delta direction agree

<a id="d182"></a>
**D182 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: migration journal evidence preserves value and identifies target

<a id="d183"></a>
**D183 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: journal replay result is canonical and cannot be independently overwritten

<a id="d184"></a>
**D184 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: unexpected financial evidence fields cannot become metadata

<a id="d185"></a>
**D185 — existing (source present)**: `financial-coordinator.test.js` (line 62)<br>Test: BEGIN, limits, sorted locks, financial DML, evidence check and COMMIT precede one clean release

<a id="d186"></a>
**D186 — existing (source present)**: `financial-coordinator.pg.test.js` (line 1392)<br>Test: append-only and immutable guards remain enabled in the disposable schema

<a id="d187"></a>
**D187 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: financial journal append-only guards reject update delete and truncate

<a id="d188"></a>
**D188 — existing (source present)**: `financial-coordinator.test.js` (line 57)<br>Test: default import is lazy and exposes only operations, construction and sanitized error type

<a id="d189"></a>
**D189 — existing (source present)**: `users-server.pg.test.js` (line 88)<br>Test: health is 503 before verification, 200 after it, without session writes

<a id="d190"></a>
**D190 — existing (source present)**: `users-server.pg.test.js` (line 97)<br>Test: unavailable real PostgreSQL refuses to listen and remains not ready

<a id="d191"></a>
**D191 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: incompatible financial journal index definition refuses runtime readiness: %s

<a id="d192"></a>
**D192 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: incompatible payment decision index definition refuses runtime readiness: %s

<a id="d193"></a>
**D193 — planned — NOT IMPLEMENTED**: `financial-invariants.pg.test.js`<br>Test: incompatible order replay index definition refuses runtime readiness: %s

<a id="d194"></a>
**D194 — planned — NOT IMPLEMENTED**: `financial-coordinator.pg.test.js`<br>Test: legacy malformed adjustment arguments reject before acquiring PostgreSQL: %p

<a id="d195"></a>
**D195 — planned — NOT IMPLEMENTED**: `financial-coordinator.pg.test.js`<br>Test: invalid or inactive administrator cannot adjust: %p

<a id="d196"></a>
**D196 — existing (source present)**: `financial-coordinator.test.js` (line 145)<br>Test: unknown unique constraints do not enter idempotency recovery

<a id="d197"></a>
**D197 — planned — NOT IMPLEMENTED**: `financial-coordinator.pg.test.js`<br>Test: authorization change after retryable rollback prevents adjustment

<a id="d198"></a>
**D198 — planned — NOT IMPLEMENTED**: `financial-coordinator.pg.test.js`<br>Test: adjustment recovery read outage preserves unknown outcome without replacement writes

<a id="d199"></a>
**D199 — planned — NOT IMPLEMENTED**: `financial-coordinator.pg.test.js`<br>Test: precommit authority or infrastructure failure cannot publish pending adjustment

<a id="d200"></a>
**D200 — existing (source present)**: `financial-coordinator.test.js` (line 134)<br>Test: cleanup failure cannot erase a confirmed financial commit

<a id="d201"></a>
**D201 — planned — NOT IMPLEMENTED**: `payment-notifications.test.js`<br>Test: payment notification returns unavailable without sends or queueing: %s

<a id="d202"></a>
**D202 — planned — NOT IMPLEMENTED**: `payment-notifications.test.js`<br>Test: paymentId under generic type remains unavailable without sends

<a id="d203"></a>
**D203 — planned — NOT IMPLEMENTED**: `payment-notifications.test.js`<br>Test: client-asserted admin cannot activate notification listeners or reads

<a id="d204"></a>
**D204 — planned — NOT IMPLEMENTED**: `payment-notifications.test.js`<br>Test: old queued payment payload remains disabled and untouched: %s

<a id="d205"></a>
**D205 — planned — NOT IMPLEMENTED**: `payment-notifications.test.js`<br>Test: stored type and embedded payment identifiers cannot activate notification persistence

<a id="d206"></a>
**D206 — planned — NOT IMPLEMENTED**: `payment-notifications.test.js`<br>Test: Payment notification state returns unavailable without writes

<a id="d207"></a>
**D207 — planned — NOT IMPLEMENTED**: `payment-notifications.test.js`<br>Test: order notification returns unavailable without sends or queueing: %s

<a id="d208"></a>
**D208 — planned — NOT IMPLEMENTED**: `payment-notifications.test.js`<br>Test: client-asserted role cannot activate order notification reads: %s

<a id="d209"></a>
**D209 — planned — NOT IMPLEMENTED**: `payment-notifications.test.js`<br>Test: old queued order payload and identifier remain disabled and untouched

<a id="d210"></a>
**D210 — planned — NOT IMPLEMENTED**: `payment-notifications.test.js`<br>Test: Order notification state returns unavailable without writes

<a id="d211"></a>
**D211 — planned — NOT IMPLEMENTED**: `payment-notifications.test.js`<br>Test: nonfinancial notice returns unavailable without dispatch

<a id="d212"></a>
**D212 — existing (source present)**: `nodemailer.test.js` (line 48)<br>Test: the existing Gmail service configuration still selects authenticated TLS on port 465

<a id="d213"></a>
**D213 — existing (source present)**: `nodemailer.test.js` (line 54)<br>Test: verify uses the real SMTP authentication handshake

<a id="d214"></a>
**D214 — existing (source present)**: `nodemailer.test.js` (line 55)<br>Test: sendMail delivers bounded HTML/text/attachment MIME over the local SMTP transport

<a id="d215"></a>
**D215 — existing (source present)**: `nodemailer.test.js` (line 64)<br>Test: SMTP authentication rejection is a safe rejected promise, not a successful send

<a id="d216"></a>
**D216 — existing (source present)**: `nodemailer.test.js` (line 69)<br>Test: required TLS cannot silently downgrade to an unencrypted server

<a id="d217"></a>
**D217 — planned — NOT IMPLEMENTED**: `nodemailer.test.js`<br>Test: legacy email controller returns unavailable without SMTP or persistence

<a id="d218"></a>
**D218 — planned — NOT IMPLEMENTED**: `financial-coordinator.pg.test.js`<br>Test: refund preserves the inactive owner status while crediting the original charge

<a id="d219"></a>
**D219 — planned — NOT IMPLEMENTED**: `users-admin-authorization.pg.test.js`<br>Test: anonymous user listing cannot enumerate accounts or write sessions

<a id="d220"></a>
**D220 — planned — NOT IMPLEMENTED**: `users-admin-authorization.pg.test.js`<br>Test: password change revokes every owner session and preserves other users credentials

<a id="d221"></a>
**D221 — planned — NOT IMPLEMENTED**: `financial-http.pg.test.js`<br>Test: legacy invalid payment form rejects before external storage: %p

<a id="d222"></a>
**D222 — planned — NOT IMPLEMENTED**: `users-admin-authorization.pg.test.js`<br>Test: user mutation rejects missing parent CSRF before side effects: %s %s

<a id="d223"></a>
**D223 — planned — NOT IMPLEMENTED**: `disabled-features.pg.test.js`<br>Test: disabled admin balance prefix returns unavailable for every credential and body shape

## Complete source-case mapping

### financial-models.mongo.test.js

Source: `backend/tests/financial-models.mongo.test.js` at `7439b8d`; SHA256 `8a872de0dd82852183fc079e2e4b68ad205990bc623b0c6956a67efaffd3f596`.

| Case ID / source line | Original test title template | Exact parameter expression | Business requirement | Disposition | Exact destination via index | Rationale |
|---|---|---|---|---|---|---|
| FMM-001 / L116 | the named unique/partial indexes exist in MongoDB and have no TTL | <code>—</code> | Durable financial uniqueness/source/history indexes and replay retention. | New replacement | [D001](#d001) | Mongo index declarations retire; real SQL catalog and behavior assertions replace them. Metadata-only verifier cases are supporting, not a live uniqueness proof. |
| FMM-002 / L125 | MongoDB rejects a duplicate actor/type/idempotency key with E11000 | <code>—</code> | Duplicate actor/type/key cannot insert a second journal. | New replacement | [D002](#d002) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FMM-003 / L131 | changing the payload hash cannot bypass key uniqueness | <code>—</code> | Changing payload hash cannot bypass key uniqueness. | New replacement | [D003](#d003) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FMM-004 / L136 | idempotency keys are scoped to actor and operation type | <code>—</code> | Idempotency is independently scoped by actor and operation type. | New replacement | [D004](#d004) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FMM-005 / L142 | source/effect deduplication holds across different actors and retry keys | <code>—</code> | Source/effect is globally deduplicated across actors and keys. | New replacement | [D005](#d005) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FMM-006 / L149 | concurrent source-backed inserts commit exactly one effect | <code>—</code> | Concurrent source-backed inserts commit at most one effect. | New replacement | [D006](#d006) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FMM-007 / L158 | the partial index permits independent adjustments with no source group | <code>—</code> | Source-free adjustments do not collide in the partial source index. | New replacement | [D007](#d007) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FMM-008 / L163 | distinct debit/refund effects on the same order are permitted | <code>—</code> | Debit and refund are distinct, once-only effects on one order. | Existing PG coverage | [D008](#d008) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| FMM-009 / L168 | keys use explicit binary case-sensitive comparison | <code>—</code> | Keys remain case-sensitive. | New replacement | [D009](#d009) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FMM-010 / L173 | exact legacy migration and its journal record commit together | <code>—</code> | Lazy adoption of a Mongo user without balanceCents. | Retired mechanism | Not applicable — retired mechanism | PostgreSQL requires non-null authoritative cents and generates its mirror. No hydration/default/lazy migration protocol is part of the runtime; migration/import provenance remains protected and is not erased. |
| FMM-011 / L184 | aborted transactions leave neither balance changes nor journal inserts | <code>—</code> | Rollback after actual financial and journal writes leaves no effects. | New replacement | [D010](#d010) | The surviving retry-exhaustion test faults during account locking, before DML. It does not prove the legacy after-write rollback obligation; wrap real writes and verify their rollback. |
| FMM-012 / L194 | invalid legacy precision is rejected before it can be replaced by a rounded pair | <code>—</code> | Reject invalid historical Mongo floating-point balances during lazy migration. | Retired mechanism | Not applicable — retired mechanism | There is no nullable-cent Mongo migration path to convert. Application precision/checked money remains separately required by FM-003/FM-005 and money-contract replacements. |
| FMM-013 / L203 | existing mirror drift cannot be silently repaired by overwriting both fields | <code>—</code> | Contradictory stored cents/mirror evidence fails closed. | Existing non-PG coverage | [D011](#d011) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| FMM-014 / L209 | a stale document cannot overwrite a newer query-written balance | <code>—</code> | A stale snapshot cannot overwrite a newer balance. | Existing non-PG coverage | [D012](#d012) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| FMM-015 / L224 | $inc cannot alter either balance even inside a real transaction | <code>—</code> | Mongoose $inc interception inside ClientSession. | Retired mechanism | Not applicable — retired mechanism | No Mongoose operator or ClientSession exists. Narrow balance authority is independently covered by user-repository financial API/scope cases; do not simulate a Mongo operator in SQL. |

### financial-service.mongo.test.js

Source: `backend/tests/financial-service.mongo.test.js` at `7439b8d`; SHA256 `d124b04b691fc4159d2db4631d336438a2a6b7ca6feaf7099b6d395fc244a447`.

| Case ID / source line | Original test title template | Exact parameter expression | Business requirement | Disposition | Exact destination via index | Rationale |
|---|---|---|---|---|---|---|
| FSM-001 / L38 | rejects actual standalone hello before any probe or financial write | <code>—</code> | Standalone Mongo hello/topology rejection. | Retired mechanism | Not applicable — retired mechanism | No Mongo topology is supported or inspected; PostgreSQL startup/TLS/schema verification replaces the infrastructure, not this protocol. |
| FSM-002 / L46 | the actual write-and-abort probe ALSO fails on standalone if preliminary hello is misleading | <code>—</code> | Misleading hello followed by Mongo write/abort probe. | Retired mechanism | Not applicable — retired mechanism | Private Mongo probe collections and replica-set discovery are deleted. Retain PostgreSQL readiness/rollback checks, not a fake replica set. |
| FSM-003 / L80 | initialization installs real unique/partial indexes and leaves no persisted probe | <code>—</code> | Installed uniqueness and durable replay indexes enforce readiness. | New replacement | [D001](#d001) | Probe lifecycle retires; durable index behavior is a SQL replacement obligation. |
| FSM-004 / L91 | atomically commits both balance fields and the exact adjustment journal | <code>—</code> | Adjustment commits cents, generated mirror, version and journal atomically. | Existing PG coverage | [D013](#d013) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| FSM-005 / L101 | real commands use snapshot reads, majority commit and the same transaction session | <code>—</code> | Mongo snapshot/majority/lsid command options. | Retired mechanism | Not applicable — retired mechanism | PostgreSQL uses READ COMMITTED and scoped clients. Its transaction-order tests remain in financial-coordinator.test.js; Mongo command option equality is not a portable requirement. |
| FSM-006 / L114 | replay returns the original committed result even after a later adjustment changes the balance | <code>—</code> | Adjustment replay returns historical evidence after a later committed adjustment. | New replacement | [D014](#d014)<br>[D015](#d015) | The surviving unit test changes fixture balance and proves historical replay. Reserve the exact real-PostgreSQL sequence of two committed adjustments and replay; the successful-adjustment case alone is not replay evidence. |
| FSM-007 / L122 | a stale expected balance rejects without changing either balance or the journal | <code>—</code> | Stale expected balance leaves account money, mirror, version and journal unchanged. | New replacement | [D016](#d016) | The rollback-scope PG case already rejects EXPECTED_BALANCE_MISMATCH and checks cents/journal. Reserve a full unchanged-account snapshot as explicit complete evidence, rather than citing an adjustment success. |
| FSM-008 / L127 | conflicting payload under the same key rejects: %p | <code>{ balance: &#x27;126&#x27; }</code> | Each changed adjustment payload under one key conflicts without writes. | New replacement | [D017](#d017) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FSM-009 / L127 | conflicting payload under the same key rejects: %p | <code>{ expectedBalance: &#x27;99&#x27; }</code> | Each changed adjustment payload under one key conflicts without writes. | New replacement | [D017](#d017) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FSM-010 / L127 | conflicting payload under the same key rejects: %p | <code>{ reason: &#x27;A different audit reason&#x27; }</code> | Each changed adjustment payload under one key conflicts without writes. | New replacement | [D017](#d017) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FSM-011 / L127 | conflicting payload under the same key rejects: %p | <code>{ userId: OTHER_USER }</code> | Each changed adjustment payload under one key conflicts without writes. | New replacement | [D017](#d017) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FSM-012 / L133 | concurrent identical requests commit once and all return the same operation | <code>—</code> | Concurrent identical adjustments resolve one original journal. | New replacement | [D018](#d018) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FSM-013 / L140 | concurrent conflicting requests survive a real write-conflict retry without updating the losing target | <code>—</code> | Concurrent conflicting adjustments preserve the losing target and retry safely. | New replacement | [D019](#d019) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FSM-014 / L167 | concurrent terminal E11000 failures resolve the original result after aborting, not through replacement writes | <code>—</code> | Unique-conflict resolution occurs after rollback on a clean transaction. | Existing PG coverage | [D020](#d020) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| FSM-015 / L191 | different keys competing for the same expected balance cannot both overwrite funds | <code>—</code> | Different keys cannot both overwrite one expected balance. | New replacement | [D021](#d021) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FSM-016 / L200 | zero-delta adjustments are journaled, not silently skipped | <code>—</code> | Zero-delta adjustment still creates audit evidence. | New replacement | [D022](#d022) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FSM-017 / L204 | negative deltas are exact and cannot make the balance negative | <code>—</code> | Exact negative adjustment delta cannot underflow. | New replacement | [D023](#d023) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FSM-018 / L209 | case-sensitive keys remain distinct | <code>—</code> | Adjustment keys are case-sensitive. | New replacement | [D009](#d009) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FSM-019 / L214 | the same key is independently scoped to different authorized actors | <code>—</code> | Authorized actors independently scope the same adjustment key. | New replacement | [D024](#d024) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FSM-020 / L220 | a revoked administrator cannot even replay a previously committed operation | <code>—</code> | Revoked authority cannot replay committed evidence. | Existing PG coverage | [D025](#d025) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| FSM-021 / L226 | inactive administrators are rejected without writes | <code>—</code> | Inactive administrator cannot mutate or replay. | New replacement | [D026](#d026) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FSM-022 / L232 | missing/inactive targets are rejected before financial writes | <code>—</code> | Missing/inactive adjustment targets reject before writes. | New replacement | [D027](#d027) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FSM-023 / L238 | exact legacy adoption and adjustment commit with a single globally deduplicated migration | <code>—</code> | Transactional lazy adoption plus balance_migration from Mongo documents. | Retired mechanism | Not applicable — retired mechanism | Required PostgreSQL cents/generated mirrors remove this missing-cents runtime path. Do not reinstate an automatic import/migration API. |
| FSM-024 / L250 | invalid raw monetary state requires reconciliation, not silent replacement: %p | <code>{ balance: 1.005, balanceCents: undefined }</code> | Invalid authoritative money/evidence fails closed, never repaired. | New replacement | [D028](#d028) | Missing/coerced/drifting Mongo variants are translated to SQL constraints or controlled result-evidence injections. Never disable triggers to manufacture impossible stored state. |
| FSM-025 / L250 | invalid raw monetary state requires reconciliation, not silent replacement: %p | <code>{ balance: 0.1 + 0.2, balanceCents: undefined }</code> | Invalid authoritative money/evidence fails closed, never repaired. | New replacement | [D028](#d028) | Missing/coerced/drifting Mongo variants are translated to SQL constraints or controlled result-evidence injections. Never disable triggers to manufacture impossible stored state. |
| FSM-026 / L250 | invalid raw monetary state requires reconciliation, not silent replacement: %p | <code>{ balance: 100, balanceCents: 9999 }</code> | Invalid authoritative money/evidence fails closed, never repaired. | New replacement | [D028](#d028) | Missing/coerced/drifting Mongo variants are translated to SQL constraints or controlled result-evidence injections. Never disable triggers to manufacture impossible stored state. |
| FSM-027 / L250 | invalid raw monetary state requires reconciliation, not silent replacement: %p | <code>{ balance: 100, balanceCents: null }</code> | Invalid authoritative money/evidence fails closed, never repaired. | New replacement | [D028](#d028) | Missing/coerced/drifting Mongo variants are translated to SQL constraints or controlled result-evidence injections. Never disable triggers to manufacture impossible stored state. |
| FSM-028 / L250 | invalid raw monetary state requires reconciliation, not silent replacement: %p | <code>{ balance: &#x27;100&#x27;, balanceCents: undefined }</code> | Invalid authoritative money/evidence fails closed, never repaired. | New replacement | [D028](#d028) | Missing/coerced/drifting Mongo variants are translated to SQL constraints or controlled result-evidence injections. Never disable triggers to manufacture impossible stored state. |
| FSM-029 / L250 | invalid raw monetary state requires reconciliation, not silent replacement: %p | <code>{ balance: undefined, balanceCents: undefined }</code> | Invalid authoritative money/evidence fails closed, never repaired. | New replacement | [D028](#d028) | Missing/coerced/drifting Mongo variants are translated to SQL constraints or controlled result-evidence injections. Never disable triggers to manufacture impossible stored state. |
| FSM-030 / L264 | a stale expected balance on a legacy account does not opportunistically migrate it | <code>—</code> | No opportunistic migration of a nullable-cent Mongo account. | Retired mechanism | Not applicable — retired mechanism | No lazy nullable-cent migration exists. Expected-balance rejection is retained separately; historical adoption is not reproduced. |
| FSM-031 / L270 | a journal failure rolls back the balance update, migration and adjustment together | <code>—</code> | Journal failure rolls back financial mutation. | New replacement | [D010](#d010) | The migration component retires; rollback of cents/version/journal remains mandatory. |
| FSM-032 / L282 | a previously journaled migration cannot be silently repeated after raw cents removal | <code>—</code> | Repeated balance_migration after raw Mongo cents removal. | Retired mechanism | Not applicable — retired mechanism | PostgreSQL cannot unset a NOT NULL cents column through the deleted raw-document API. Do not add lazy repair or migrate again. |
| FSM-033 / L291 | a real commit failpoint yields 503 unknown outcome, with no unsafe write fallback | <code>—</code> | Unresolved COMMIT is unavailable/unknown, never fallback mutation. | Existing PG coverage | [D029](#d029) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| FSM-034 / L307 | an ambiguous response AFTER a real commit is resolved from the durable journal | <code>—</code> | Lost acknowledgement after actual COMMIT resolves durable evidence. | Existing PG coverage | [D030](#d030) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| FSM-035 / L320 | a real conflicting index definition prevents readiness without destructive index repair | <code>—</code> | Schema/index incompatibility prevents listening without automatic repair. | Existing PG coverage | [D031](#d031) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| FSM-036 / L338 | disconnecting and reconnecting does not reuse old readiness | <code>—</code> | Mongo connection-generation readiness cache invalidation. | Retired mechanism | Not applicable — retired mechanism | The old connection singleton/readiness cache is removed. PostgreSQL pool/bootstrap behavior has independent coverage, not a Mongo reconnect cache. |

### orders.mongo.test.js

Source: `backend/tests/orders.mongo.test.js` at `7439b8d`; SHA256 `425323746bd250edefe94aebed0405f41de3b5398df5ac563e52f62c5f4b0131`.

| Case ID / source line | Original test title template | Exact parameter expression | Business requirement | Disposition | Exact destination via index | Rationale |
|---|---|---|---|---|---|---|
| OM-001 / L82 | atomic HTTP purchase creates a paid pending order and exact debit evidence | <code>—</code> | Purchase commits pending paid order and exact debit. | Existing PG coverage | [D032](#d032) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| OM-002 / L92 | valid %s product %s uses its file schema | <code>[&#x27;apps&#x27;,1,1900,&#x27;accountId&#x27;,&#x27;Acct_123&#x27;,99]</code> | File-authoritative product schema/network and charge are used. | Existing PG coverage | [D033](#d033) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| OM-003 / L92 | valid %s product %s uses its file schema | <code>[&#x27;cryptos&#x27;,3,1000,&#x27;walletAddress&#x27;,bitcoin,549]</code> | File-authoritative product schema/network and charge are used. | Existing PG coverage | [D033](#d033) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| OM-004 / L92 | valid %s product %s uses its file schema | <code>[&#x27;cryptos&#x27;,4,1000,&#x27;walletAddress&#x27;,tron,599]</code> | File-authoritative product schema/network and charge are used. | Existing PG coverage | [D033](#d033) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| OM-005 / L92 | valid %s product %s uses its file schema | <code>[&#x27;cryptos&#x27;,5,1000,&#x27;walletAddress&#x27;,evm,449]</code> | File-authoritative product schema/network and charge are used. | Existing PG coverage | [D033](#d033) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| OM-006 / L92 | valid %s product %s uses its file schema | <code>[&#x27;cryptos&#x27;,7,1000,&#x27;accountId&#x27;,&#x27;P1234567&#x27;,599]</code> | File-authoritative product schema/network and charge are used. | Existing PG coverage | [D033](#d033) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| OM-007 / L92 | valid %s product %s uses its file schema | <code>[&#x27;cryptos&#x27;,9,1000,&#x27;phone&#x27;,&#x27;+905551234567&#x27;,449]</code> | File-authoritative product schema/network and charge are used. | Existing PG coverage | [D033](#d033) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| OM-008 / L96 | valid balances package purchase | <code>—</code> | Balances package uses authoritative quantity and charge. | New replacement | [D034](#d034) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-009 / L97 | required target precedes any money mutation: %s | <code>&#x27;apps&#x27;</code> | Every category rejects a missing required target before money writes. | New replacement | [D035](#d035) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-010 / L97 | required target precedes any money mutation: %s | <code>&#x27;games&#x27;</code> | Every category rejects a missing required target before money writes. | New replacement | [D035](#d035) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-011 / L97 | required target precedes any money mutation: %s | <code>&#x27;cryptos&#x27;</code> | Every category rejects a missing required target before money writes. | New replacement | [D035](#d035) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-012 / L97 | required target precedes any money mutation: %s | <code>&#x27;balances&#x27;</code> | Every category rejects a missing required target before money writes. | New replacement | [D035](#d035) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-013 / L101 | rejects client financial/identity/extra fields: %p | <code>{ amount: 0.01 }</code> | Reject every legacy client money/identity/extra-field variant. | New replacement | [D036](#d036) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-014 / L101 | rejects client financial/identity/extra fields: %p | <code>{ userId: OTHER }</code> | Reject every legacy client money/identity/extra-field variant. | New replacement | [D036](#d036) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-015 / L101 | rejects client financial/identity/extra fields: %p | <code>{ actorId: ADMIN }</code> | Reject every legacy client money/identity/extra-field variant. | New replacement | [D036](#d036) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-016 / L101 | rejects client financial/identity/extra fields: %p | <code>{ service: &#x27;Cheap product&#x27; }</code> | Reject every legacy client money/identity/extra-field variant. | New replacement | [D036](#d036) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-017 / L101 | rejects client financial/identity/extra fields: %p | <code>{ status: &#x27;completed&#x27; }</code> | Reject every legacy client money/identity/extra-field variant. | New replacement | [D036](#d036) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-018 / L101 | rejects client financial/identity/extra fields: %p | <code>{ network: &#x27;bitcoin-mainnet&#x27; }</code> | Reject every legacy client money/identity/extra-field variant. | New replacement | [D036](#d036) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-019 / L101 | rejects client financial/identity/extra fields: %p | <code>{ fulfillmentSchema: &#x27;accountId&#x27; }</code> | Reject every legacy client money/identity/extra-field variant. | New replacement | [D036](#d036) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-020 / L101 | rejects client financial/identity/extra fields: %p | <code>{ quantity: 60 }</code> | Reject every legacy client money/identity/extra-field variant. | New replacement | [D036](#d036) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-021 / L102 | rejects invalid strict target shape: %p | <code>{}</code> | Strict target shape rejects coercion, wrong schema and identity injection. | Existing PG coverage | [D037](#d037) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| OM-022 / L102 | rejects invalid strict target shape: %p | <code>null</code> | Strict target shape rejects coercion, wrong schema and identity injection. | Existing PG coverage | [D037](#d037) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| OM-023 / L102 | rejects invalid strict target shape: %p | <code>[]</code> | Strict target shape rejects coercion, wrong schema and identity injection. | Existing PG coverage | [D037](#d037) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| OM-024 / L102 | rejects invalid strict target shape: %p | <code>{ playerId: 123 }</code> | Strict target shape rejects coercion, wrong schema and identity injection. | Existing PG coverage | [D037](#d037) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| OM-025 / L102 | rejects invalid strict target shape: %p | <code>{ playerId: &#x27;abc&#x27;, userId: OTHER }</code> | Strict target shape rejects coercion, wrong schema and identity injection. | Existing PG coverage | [D037](#d037) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| OM-026 / L102 | rejects invalid strict target shape: %p | <code>{ accountId: &#x27;abc&#x27; }</code> | Strict target shape rejects coercion, wrong schema and identity injection. | Existing PG coverage | [D037](#d037) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| OM-027 / L102 | rejects invalid strict target shape: %p | <code>{ playerId: { nested: &#x27;abc&#x27; } }</code> | Strict target shape rejects coercion, wrong schema and identity injection. | Existing PG coverage | [D037](#d037) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| OM-028 / L103 | rejects injection or invalid format without echo: %p | <code>&#x27;&lt;script&gt;alert(1)&lt;/script&gt;&#x27;</code> | Every legacy target injection/format variant is rejected without echo or writes. | New replacement | [D038](#d038) | Existing HTTP and pure target tests cover much of this matrix, but are not credited for missing exact HTTP variants. |
| OM-029 / L103 | rejects injection or invalid format without echo: %p | <code>&#x27;abc\n&#x27;</code> | Every legacy target injection/format variant is rejected without echo or writes. | New replacement | [D038](#d038) | Existing HTTP and pure target tests cover much of this matrix, but are not credited for missing exact HTTP variants. |
| OM-030 / L103 | rejects injection or invalid format without echo: %p | <code>&#x27;\tabc&#x27;</code> | Every legacy target injection/format variant is rejected without echo or writes. | New replacement | [D038](#d038) | Existing HTTP and pure target tests cover much of this matrix, but are not credited for missing exact HTTP variants. |
| OM-031 / L103 | rejects injection or invalid format without echo: %p | <code>&#x27;abc\0&#x27;</code> | Every legacy target injection/format variant is rejected without echo or writes. | New replacement | [D038](#d038) | Existing HTTP and pure target tests cover much of this matrix, but are not credited for missing exact HTTP variants. |
| OM-032 / L103 | rejects injection or invalid format without echo: %p | <code>&#x27;abc\x7f&#x27;</code> | Every legacy target injection/format variant is rejected without echo or writes. | New replacement | [D038](#d038) | Existing HTTP and pure target tests cover much of this matrix, but are not credited for missing exact HTTP variants. |
| OM-033 / L103 | rejects injection or invalid format without echo: %p | <code>&#x27;abc\u202e&#x27;</code> | Every legacy target injection/format variant is rejected without echo or writes. | New replacement | [D038](#d038) | Existing HTTP and pure target tests cover much of this matrix, but are not credited for missing exact HTTP variants. |
| OM-034 / L103 | rejects injection or invalid format without echo: %p | <code>&#x27;abc&amp;x&#x27;</code> | Every legacy target injection/format variant is rejected without echo or writes. | New replacement | [D038](#d038) | Existing HTTP and pure target tests cover much of this matrix, but are not credited for missing exact HTTP variants. |
| OM-035 / L103 | rejects injection or invalid format without echo: %p | <code>&#x27;abc&quot;x&#x27;</code> | Every legacy target injection/format variant is rejected without echo or writes. | New replacement | [D038](#d038) | Existing HTTP and pure target tests cover much of this matrix, but are not credited for missing exact HTTP variants. |
| OM-036 / L103 | rejects injection or invalid format without echo: %p | <code>&quot;abc&#x27;x&quot;</code> | Every legacy target injection/format variant is rejected without echo or writes. | New replacement | [D038](#d038) | Existing HTTP and pure target tests cover much of this matrix, but are not credited for missing exact HTTP variants. |
| OM-037 / L103 | rejects injection or invalid format without echo: %p | <code>&#x27;a&#x27;.repeat(129)</code> | Every legacy target injection/format variant is rejected without echo or writes. | New replacement | [D038](#d038) | Existing HTTP and pure target tests cover much of this matrix, but are not credited for missing exact HTTP variants. |
| OM-038 / L103 | rejects injection or invalid format without echo: %p | <code>&#x27;a&#x27;.repeat(33)</code> | Every legacy target injection/format variant is rejected without echo or writes. | New replacement | [D038](#d038) | Existing HTTP and pure target tests cover much of this matrix, but are not credited for missing exact HTTP variants. |
| OM-039 / L103 | rejects injection or invalid format without echo: %p | <code>&#x27;ab&#x27;</code> | Every legacy target injection/format variant is rejected without echo or writes. | New replacement | [D038](#d038) | Existing HTTP and pure target tests cover much of this matrix, but are not credited for missing exact HTTP variants. |
| OM-040 / L103 | rejects injection or invalid format without echo: %p | <code>&#x27;a b&#x27;</code> | Every legacy target injection/format variant is rejected without echo or writes. | New replacement | [D038](#d038) | Existing HTTP and pure target tests cover much of this matrix, but are not credited for missing exact HTTP variants. |
| OM-041 / L106 | HTTP fails closed on contradictory %s declaration | <code>[&#x27;payments.json&#x27;,&#x27;walletAddress&#x27;]</code> | All specified catalog contradictions fail closed over HTTP. | New replacement | [D039](#d039) | Current contradictory-catalog table differs for apps/mobile-payments; retain those exact variants explicitly. |
| OM-042 / L106 | HTTP fails closed on contradictory %s declaration | <code>[&#x27;cryptos.json&#x27;,&#x27;accountId&#x27;]</code> | All specified catalog contradictions fail closed over HTTP. | New replacement | [D039](#d039) | Current contradictory-catalog table differs for apps/mobile-payments; retain those exact variants explicitly. |
| OM-043 / L106 | HTTP fails closed on contradictory %s declaration | <code>[&#x27;apps.json&#x27;,&#x27;email&#x27;]</code> | All specified catalog contradictions fail closed over HTTP. | New replacement | [D039](#d039) | Current contradictory-catalog table differs for apps/mobile-payments; retain those exact variants explicitly. |
| OM-044 / L106 | HTTP fails closed on contradictory %s declaration | <code>[&#x27;mobile-payments.json&#x27;,&#x27;walletAddress&#x27;]</code> | All specified catalog contradictions fail closed over HTTP. | New replacement | [D039](#d039) | Current contradictory-catalog table differs for apps/mobile-payments; retain those exact variants explicitly. |
| OM-045 / L112 | insufficient funds leaves no order or journal | <code>—</code> | Insufficient funds creates no partial financial resources. | Existing PG coverage | [D040](#d040) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| OM-046 / L116 | concurrent different keys cannot overspend | <code>—</code> | Competing purchases cannot overspend. | Existing PG coverage | [D041](#d041) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| OM-047 / L121 | same-key concurrent HTTP requests debit once | <code>—</code> | Same-key concurrent purchase debits once. | Existing PG coverage | [D042](#d042) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| OM-048 / L124 | same key different target conflicts; spaces normalize equivalently | <code>—</code> | Changed target conflicts while normalized equivalent target replays. | New replacement | [D043](#d043) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-049 / L128 | committed receipt survives missing current catalog and changed balance | <code>—</code> | Historical receipt survives both catalog loss and later balance changes. | New replacement | [D044](#d044) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-050 / L132 | failure AFTER actual %s write rolls back | <code>&#x27;money&#x27;</code> | Failure after each real money/journal/order write rolls back everything. | New replacement | [D045](#d045) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-051 / L132 | failure AFTER actual %s write rolls back | <code>&#x27;journal&#x27;</code> | Failure after each real money/journal/order write rolls back everything. | New replacement | [D045](#d045) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-052 / L132 | failure AFTER actual %s write rolls back | <code>&#x27;order&#x27;</code> | Failure after each real money/journal/order write rolls back everything. | New replacement | [D045](#d045) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-053 / L136 | full cancellation refunds once and uses original price | <code>—</code> | Cancellation refunds original charge once with immutable target. | Existing PG coverage | [D046](#d046) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| OM-054 / L140 | competing administrators refund exactly once | <code>—</code> | Two administrators cannot refund one order twice. | New replacement | [D047](#d047) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-055 / L144 | completion touches no money and cannot be cancelled | <code>—</code> | Completion is nonmonetary and cannot be followed by cancellation. | New replacement | [D048](#d048)<br>[D049](#d049) | Current HTTP coverage proves nonmonetary completion/replay but does not attempt cancellation after completion. Retain that terminal-state negative assertion explicitly. |
| OM-056 / L148 | completion/cancellation race has one terminal winner | <code>—</code> | Completion/cancellation race has one terminal winner. | Existing PG coverage | [D050](#d050) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| OM-057 / L151 | suspended owner is refunded without activation | <code>—</code> | Refund of an inactive owner preserves their status and original charge. | New replacement | [D218](#d218)<br>[D051](#d051) | Existing PG refund/replay coverage uses a deactivated owner but does not assert their final status. Preserve the suspended-status/no-activation assertion explicitly. |
| OM-058 / L154 | refund of %s owner state requires reconciliation | <code>&#x27;missing&#x27;</code> | Invalid refund owner/evidence requires reconciliation without writes. | New replacement | [D052](#d052) | Missing-cent/drift variants impossible under SQL are represented by controlled query-result evidence injection, not altered constraints. |
| OM-059 / L154 | refund of %s owner state requires reconciliation | <code>&#x27;drift&#x27;</code> | Invalid refund owner/evidence requires reconciliation without writes. | New replacement | [D052](#d052) | Missing-cent/drift variants impossible under SQL are represented by controlled query-result evidence injection, not altered constraints. |
| OM-060 / L154 | refund of %s owner state requires reconciliation | <code>&#x27;missing-cents&#x27;</code> | Invalid refund owner/evidence requires reconciliation without writes. | New replacement | [D052](#d052) | Missing-cent/drift variants impossible under SQL are represented by controlled query-result evidence injection, not altered constraints. |
| OM-061 / L157 | failure after actual cancellation %s write rolls back | <code>&#x27;refund&#x27;</code> | Failure after refund/order cancellation writes rolls both back. | New replacement | [D053](#d053) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-062 / L157 | failure after actual cancellation %s write rolls back | <code>&#x27;order&#x27;</code> | Failure after refund/order cancellation writes rolls both back. | New replacement | [D053](#d053) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-063 / L160 | lost %s commit response resolves original evidence | <code>&#x27;purchase&#x27;</code> | Lost purchase/completion/cancellation acknowledgement resolves original evidence. | Existing PG coverage | [D054](#d054) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| OM-064 / L160 | lost %s commit response resolves original evidence | <code>&#x27;complete&#x27;</code> | Lost purchase/completion/cancellation acknowledgement resolves original evidence. | Existing PG coverage | [D054](#d054) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| OM-065 / L160 | lost %s commit response resolves original evidence | <code>&#x27;cancel&#x27;</code> | Lost purchase/completion/cancellation acknowledgement resolves original evidence. | Existing PG coverage | [D054](#d054) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| OM-066 / L165 | legacy %s records remain read-only | <code>&#x27;pending&#x27;</code> | Historical unversioned order records cannot acquire financial mutation rights. | New replacement | [D055](#d055) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-067 / L165 | legacy %s records remain read-only | <code>&#x27;processing&#x27;</code> | Historical unversioned order records cannot acquire financial mutation rights. | New replacement | [D055](#d055) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-068 / L165 | legacy %s records remain read-only | <code>&#x27;accepted&#x27;</code> | Historical unversioned order records cannot acquire financial mutation rights. | New replacement | [D055](#d055) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-069 / L165 | legacy %s records remain read-only | <code>&#x27;rejected&#x27;</code> | Historical unversioned order records cannot acquire financial mutation rights. | New replacement | [D055](#d055) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-070 / L165 | legacy %s records remain read-only | <code>&#x27;completed&#x27;</code> | Historical unversioned order records cannot acquire financial mutation rights. | New replacement | [D055](#d055) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-071 / L165 | legacy %s records remain read-only | <code>&#x27;cancelled&#x27;</code> | Historical unversioned order records cannot acquire financial mutation rights. | New replacement | [D055](#d055) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-072 / L169 | ordinary reads stay owner-scoped; targets only appear on dedicated endpoints | <code>—</code> | Owner/public reads hide targets; private endpoint authorizes separately. | Existing PG coverage | [D056](#d056)<br>[D057](#d057) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| OM-073 / L174 | authentication, CSRF, token version, session and admin role enforced | <code>—</code> | Auth, parent CSRF, current token/session/admin required. | Existing PG coverage | [D058](#d058)<br>[D059](#d059)<br>[D060](#d060) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| OM-074 / L178 | unresolved %s outcome requires same-key retry and never a fallback write | <code>&#x27;purchase&#x27;</code> | Unknown outcome requires same-key recovery, never replacement mutation. | Existing PG coverage | [D061](#d061) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| OM-075 / L178 | unresolved %s outcome requires same-key retry and never a fallback write | <code>&#x27;complete&#x27;</code> | Unknown outcome requires same-key recovery, never replacement mutation. | Existing PG coverage | [D061](#d061) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| OM-076 / L178 | unresolved %s outcome requires same-key retry and never a fallback write | <code>&#x27;cancel&#x27;</code> | Unknown outcome requires same-key recovery, never replacement mutation. | Existing PG coverage | [D061](#d061) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| OM-077 / L193 | real debit idempotency E11000 resolves only after the aborted transaction ends | <code>—</code> | Debit key conflict resolves only after aborted transaction. | Existing PG coverage | [D062](#d062) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| OM-078 / L207 | real completion decision-index E11000 resolves with %s reads | <code>&#x27;available&#x27;</code> | Order decision uniqueness conflict rolls back before resolution, including read outage. | New replacement | [D063](#d063) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-079 / L207 | real completion decision-index E11000 resolves with %s reads | <code>&#x27;outage&#x27;</code> | Order decision uniqueness conflict rolls back before resolution, including read outage. | New replacement | [D063](#d063) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-080 / L221 | real source/effect E11000 cannot reopen a previously refunded order | <code>—</code> | Source/effect uniqueness cannot reopen an already-refunded order. | New replacement | [D064](#d064) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-081 / L234 | journal infrastructure outage is 503, not damaged-evidence reconciliation | <code>—</code> | Journal/repository transport outage is sanitized unavailable. | Existing PG coverage | [D065](#d065) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| OM-082 / L239 | model blocks immutable target changes, bulk writes, deletion and evidence-free decisions | <code>—</code> | Immutable targets and evidence-free decisions/deletion remain rejected. | New replacement | [D066](#d066) | Mongoose bulk/update hooks retire; SQL immutable/evidence/delete protections remain obligations. |
| OM-083 / L247 | even disabled save validation cannot create an order with damaged target evidence | <code>—</code> | Damaged immutable target evidence cannot be committed. | New replacement | [D067](#d067) | validateBeforeSave is retired; live SQL deferred-evidence constraints replace its invariant. |
| OM-084 / L253 | legacy migration is once-only and insufficient funds or invalid targets never migrate | <code>—</code> | Once-only lazy Mongo cents migration during purchase. | Retired mechanism | Not applicable — retired mechanism | No missing-cents adoption path exists in PostgreSQL. Insufficient funds and invalid targets already have independent no-write coverage. |
| OM-085 / L259 | live network/schema validation refuses product %s | <code>[3,tron]</code> | Every legacy product/network/schema failure rejects without debit. | New replacement | [D068](#d068) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-086 / L259 | live network/schema validation refuses product %s | <code>[4,evm]</code> | Every legacy product/network/schema failure rejects without debit. | New replacement | [D068](#d068) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-087 / L259 | live network/schema validation refuses product %s | <code>[5,tron]</code> | Every legacy product/network/schema failure rejects without debit. | New replacement | [D068](#d068) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-088 / L259 | live network/schema validation refuses product %s | <code>[9,&#x27;05551234567&#x27;]</code> | Every legacy product/network/schema failure rejects without debit. | New replacement | [D068](#d068) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-089 / L259 | live network/schema validation refuses product %s | <code>[7,&#x27;a b&#x27;]</code> | Every legacy product/network/schema failure rejects without debit. | New replacement | [D068](#d068) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-090 / L263 | EVM checksummed equivalent replays using original network after metadata changes | <code>—</code> | Checksum-equivalent EVM target replays original network after metadata change. | New replacement | [D069](#d069) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-091 / L268 | summary uses exact modern net charges and excludes legacy monetary claims | <code>—</code> | Exact modern order aggregates never count historical unverified money. | New replacement | [D070](#d070) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-092 / L272 | quantity/charge policy refuses %s selection %s | <code>[&#x27;apps&#x27;,1000001]</code> | Legacy quantity/charge policy edge selections remain rejected. | New replacement | [D071](#d071) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-093 / L272 | quantity/charge policy refuses %s selection %s | <code>[&#x27;apps&#x27;,1]</code> | Legacy quantity/charge policy edge selections remain rejected. | New replacement | [D071](#d071) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-094 / L272 | quantity/charge policy refuses %s selection %s | <code>[&#x27;games&#x27;,1]</code> | Legacy quantity/charge policy edge selections remain rejected. | New replacement | [D071](#d071) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-095 / L277 | one final half-up rounding settles proportional cents | <code>—</code> | Proportional charge performs one final half-up rounding. | New replacement | [D072](#d072)<br>[D073](#d073) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-096 / L281 | callback retry pins catalog pricing and rechecks current authorization | <code>—</code> | Transaction retry pins pricing and rechecks current authority. | New replacement | [D074](#d074) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-097 / L290 | refund %s balance fails atomically | <code>&#x27;overflow&#x27;</code> | Refund overflow or numeric incompatibility cannot partially commit. | New replacement | [D075](#d075) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-098 / L290 | refund %s balance fails atomically | <code>&#x27;unrepresentable&#x27;</code> | Refund overflow or numeric incompatibility cannot partially commit. | New replacement | [D075](#d075) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-099 / L297 | authorization is rechecked after an actual aborted callback | <code>—</code> | Authority changed after abort is rechecked before retry writes. | New replacement | [D076](#d076) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| OM-100 / L310 | legacy creation is disabled | <code>—</code> | Historical order creation stays disabled without persistence. | Changed disabled contract | [D077](#d077) | Current approved creation-disable contract is tested; no old route is restored. |
| OM-101 / L311 | target-free product requires explicit no-target policy | <code>—</code> | Explicit no-target policy rejects unsolicited target. | Existing PG coverage | [D078](#d078) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |

### payments.mongo.test.js

Source: `backend/tests/payments.mongo.test.js` at `7439b8d`; SHA256 `d58a22b0ca5ee8c5142a615fa0c10265408f0254d2acdd139894dbb5825fd0e0`.

| Case ID / source line | Original test title template | Exact parameter expression | Business requirement | Disposition | Exact destination via index | Rationale |
|---|---|---|---|---|---|---|
| PM-001 / L137 | readiness installs the actual unique Payment indexes, with no TTL replay erasure | <code>—</code> | Payment decision/source uniqueness and durable replay retention. | New replacement | [D079](#d079) | Mongo readiness/index installation retires; SQL uniqueness and retention remain required. |
| PM-002 / L144 | unauthenticated %s %s is rejected before any upload | <code>[&#x27;POST&#x27;, &#x27;/&#x27;]</code> | Each legacy unauthenticated read/write endpoint rejects before upload. | New replacement | [D080](#d080) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-003 / L144 | unauthenticated %s %s is rejected before any upload | <code>[&#x27;GET&#x27;, &#x27;/&#x27;]</code> | Each legacy unauthenticated read/write endpoint rejects before upload. | New replacement | [D080](#d080) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-004 / L144 | unauthenticated %s %s is rejected before any upload | <code>[&#x27;GET&#x27;, &#x27;/all&#x27;]</code> | Each legacy unauthenticated read/write endpoint rejects before upload. | New replacement | [D080](#d080) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-005 / L144 | unauthenticated %s %s is rejected before any upload | <code>[&#x27;GET&#x27;, &#x27;/summary&#x27;]</code> | Each legacy unauthenticated read/write endpoint rejects before upload. | New replacement | [D080](#d080) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-006 / L144 | unauthenticated %s %s is rejected before any upload | <code>[&#x27;GET&#x27;, &#x27;/summary/all&#x27;]</code> | Each legacy unauthenticated read/write endpoint rejects before upload. | New replacement | [D080](#d080) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-007 / L144 | unauthenticated %s %s is rejected before any upload | <code>[&#x27;GET&#x27;, &#x27;/pay-test/receipt&#x27;]</code> | Each legacy unauthenticated read/write endpoint rejects before upload. | New replacement | [D080](#d080) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-008 / L144 | unauthenticated %s %s is rejected before any upload | <code>[&#x27;PUT&#x27;, &#x27;/pay-test/accept&#x27;]</code> | Each legacy unauthenticated read/write endpoint rejects before upload. | New replacement | [D080](#d080) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-009 / L144 | unauthenticated %s %s is rejected before any upload | <code>[&#x27;PUT&#x27;, &#x27;/pay-test/reject&#x27;]</code> | Each legacy unauthenticated read/write endpoint rejects before upload. | New replacement | [D080](#d080) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-010 / L151 | CSRF rejection precedes parsing/storage | <code>—</code> | Parent CSRF precedes parsing or external storage. | Existing PG coverage | [D059](#d059)<br>[D081](#d081) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| PM-011 / L156 | stale token versions are rejected before parsing/storage | <code>—</code> | Stale credentials reject before parsing/storage. | Existing PG coverage | [D081](#d081)<br>[D058](#d058) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| PM-012 / L160 | submission derives ownership/currency, preserves unverified zero, sanitizes and privately stores receipt | <code>—</code> | Submission derives owner/currency, remains pending without credit, stores private receipt. | Existing PG coverage | [D082](#d082)<br>[D083](#d083) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| PM-013 / L175 | submission rejects client-owned %s before external storage | <code>&#x27;userId&#x27;</code> | Every client-owned submission field rejects before storage. | New replacement | [D084](#d084) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-014 / L175 | submission rejects client-owned %s before external storage | <code>&#x27;amountInUSD&#x27;</code> | Every client-owned submission field rejects before storage. | New replacement | [D084](#d084) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-015 / L175 | submission rejects client-owned %s before external storage | <code>&#x27;status&#x27;</code> | Every client-owned submission field rejects before storage. | New replacement | [D084](#d084) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-016 / L175 | submission rejects client-owned %s before external storage | <code>&#x27;currency&#x27;</code> | Every client-owned submission field rejects before storage. | New replacement | [D084](#d084) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-017 / L175 | submission rejects client-owned %s before external storage | <code>&#x27;amountCents&#x27;</code> | Every client-owned submission field rejects before storage. | New replacement | [D084](#d084) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-018 / L175 | submission rejects client-owned %s before external storage | <code>&#x27;decision&#x27;</code> | Every client-owned submission field rejects before storage. | New replacement | [D084](#d084) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-019 / L175 | submission rejects client-owned %s before external storage | <code>&#x27;receiptImage&#x27;</code> | Every client-owned submission field rejects before storage. | New replacement | [D084](#d084) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-020 / L175 | submission rejects client-owned %s before external storage | <code>&#x27;actorId&#x27;</code> | Every client-owned submission field rejects before storage. | New replacement | [D084](#d084) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-021 / L180 | invalid form is rejected without external storage: %p | <code>{ amount: &#x27;1.005&#x27; }</code> | Each original invalid amount, method and note form rejects before provider storage. | New replacement | [D221](#d221) | Nearby PG tables cover related precision/bounds/metadata inputs, not every exact legacy HTTP form variant and no-upload assertion. Preserve the six original variants. |
| PM-022 / L180 | invalid form is rejected without external storage: %p | <code>{ amount: &#x27;9&#x27; }</code> | Each original invalid amount, method and note form rejects before provider storage. | New replacement | [D221](#d221) | Nearby PG tables cover related precision/bounds/metadata inputs, not every exact legacy HTTP form variant and no-upload assertion. Preserve the six original variants. |
| PM-023 / L180 | invalid form is rejected without external storage: %p | <code>{ amount: &#x27;101&#x27; }</code> | Each original invalid amount, method and note form rejects before provider storage. | New replacement | [D221](#d221) | Nearby PG tables cover related precision/bounds/metadata inputs, not every exact legacy HTTP form variant and no-upload assertion. Preserve the six original variants. |
| PM-024 / L180 | invalid form is rejected without external storage: %p | <code>{ method: &#x27;__proto__&#x27; }</code> | Each original invalid amount, method and note form rejects before provider storage. | New replacement | [D221](#d221) | Nearby PG tables cover related precision/bounds/metadata inputs, not every exact legacy HTTP form variant and no-upload assertion. Preserve the six original variants. |
| PM-025 / L180 | invalid form is rejected without external storage: %p | <code>{ method: &#x27;unknown&#x27; }</code> | Each original invalid amount, method and note form rejects before provider storage. | New replacement | [D221](#d221) | Nearby PG tables cover related precision/bounds/metadata inputs, not every exact legacy HTTP form variant and no-upload assertion. Preserve the six original variants. |
| PM-026 / L180 | invalid form is rejected without external storage: %p | <code>{ note: &#x27;&lt;script&gt;bad&lt;/script&gt;&#x27; }</code> | Each original invalid amount, method and note form rejects before provider storage. | New replacement | [D221](#d221) | Nearby PG tables cover related precision/bounds/metadata inputs, not every exact legacy HTTP form variant and no-upload assertion. Preserve the six original variants. |
| PM-027 / L184 | claimed MIME without valid image content is rejected | <code>—</code> | Invalid image content rejects before provider/payment. | Existing PG coverage | [D085](#d085)<br>[D086](#d086) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| PM-028 / L188 | oversized receipt is rejected by real Multer without storage | <code>—</code> | Real multipart byte limit prevents storage. | Existing PG coverage | [D085](#d085) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| PM-029 / L192 | missing receipt is rejected | <code>—</code> | Missing receipt rejects without payment. | Existing PG coverage | [D085](#d085) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| PM-030 / L196 | persistence failure cleans up only the server-owned authenticated receipt | <code>—</code> | Known rollback permits only owned receipt cleanup. | Existing PG coverage | [D087](#d087) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| PM-031 / L205 | global read %s ignores forged JWT/session admin roles | <code>&#x27;/admin&#x27;</code> | Global payment reads require fresh database admin role. | Existing PG coverage | [D088](#d088) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| PM-032 / L205 | global read %s ignores forged JWT/session admin roles | <code>&#x27;/all&#x27;</code> | Global payment reads require fresh database admin role. | Existing PG coverage | [D088](#d088) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| PM-033 / L205 | global read %s ignores forged JWT/session admin roles | <code>&#x27;/summary/all&#x27;</code> | Global payment reads require fresh database admin role. | Existing PG coverage | [D088](#d088) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| PM-034 / L208 | decision %s requires database admin role and CSRF | <code>&#x27;accept&#x27;</code> | Payment decisions require fresh admin and exact parent CSRF. | Existing PG coverage | [D089](#d089)<br>[D059](#d059) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| PM-035 / L208 | decision %s requires database admin role and CSRF | <code>&#x27;reject&#x27;</code> | Payment decisions require fresh admin and exact parent CSRF. | Existing PG coverage | [D089](#d089)<br>[D059](#d059) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| PM-036 / L215 | normal listing/summary stays self-only for actor %s | <code>OWNER</code> | Ordinary listing/summary remains self-scoped even for admin. | Existing PG coverage | [D056](#d056) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| PM-037 / L215 | normal listing/summary stays self-only for actor %s | <code>ADMIN</code> | Ordinary listing/summary remains self-scoped even for admin. | Existing PG coverage | [D056](#d056) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| PM-038 / L224 | owner-scoped list uses safe projections and bounded cursor pagination | <code>—</code> | Safe projections and bounded authenticated pagination. | Existing PG coverage | [D090](#d090)<br>[D091](#d091) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| PM-039 / L238 | receipt and single-payment reads hide other ownership but allow explicit admin review | <code>—</code> | Private receipts authorize owner/current admin separately. | Existing PG coverage | [D092](#d092) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| PM-040 / L257 | legacy receipt URL is never returned or signed | <code>—</code> | Historical/unverified receipt URL is never returned or signed. | New replacement | [D093](#d093) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-041 / L265 | admin HTTP approval commits status, both balance fields and payment_credit journal together | <code>—</code> | Approval atomically commits one authoritative USD credit and decision. | Existing PG coverage | [D094](#d094) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| PM-042 / L278 | failure after actual %s write rolls back status, credit and journal | <code>&#x27;payment&#x27;</code> | Failure after actual payment/journal writes rolls credit and status back. | New replacement | [D095](#d095) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-043 / L278 | failure after actual %s write rolls back status, credit and journal | <code>&#x27;journal&#x27;</code> | Failure after actual payment/journal writes rolls credit and status back. | New replacement | [D095](#d095) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-044 / L287 | same-key HTTP replay preserves original result after later money changes | <code>—</code> | Replay returns historical approved result after later adjustment. | Existing PG coverage | [D096](#d096) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| PM-045 / L296 | changed same-key payload conflicts: %p | <code>{ approvedAmount: &#x27;26&#x27; }</code> | Every changed approval payload conflicts under one decision key. | New replacement | [D097](#d097) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-046 / L296 | changed same-key payload conflicts: %p | <code>{ reason: &#x27;Changed reason&#x27; }</code> | Every changed approval payload conflicts under one decision key. | New replacement | [D097](#d097) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-047 / L296 | changed same-key payload conflicts: %p | <code>{ paymentId: &#x27;pay-other&#x27; }</code> | Every changed approval payload conflicts under one decision key. | New replacement | [D097](#d097) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-048 / L302 | invalid approval input cannot write: %p | <code>{ approvedAmount: &#x27;0&#x27; }</code> | Every legacy invalid approval variant has no effects. | New replacement | [D098](#d098) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-049 / L302 | invalid approval input cannot write: %p | <code>{ approvedAmount: &#x27;1.005&#x27; }</code> | Every legacy invalid approval variant has no effects. | New replacement | [D098](#d098) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-050 / L302 | invalid approval input cannot write: %p | <code>{ approvedAmount: true }</code> | Every legacy invalid approval variant has no effects. | New replacement | [D098](#d098) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-051 / L302 | invalid approval input cannot write: %p | <code>{ approvedAmount: formatMoney(MAX_CENTS) }</code> | Every legacy invalid approval variant has no effects. | New replacement | [D098](#d098) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-052 / L302 | invalid approval input cannot write: %p | <code>{ userId: OTHER }</code> | Every legacy invalid approval variant has no effects. | New replacement | [D098](#d098) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-053 / L302 | invalid approval input cannot write: %p | <code>{ role: &#x27;admin&#x27; }</code> | Every legacy invalid approval variant has no effects. | New replacement | [D098](#d098) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-054 / L302 | invalid approval input cannot write: %p | <code>{ idempotencyKey: &#x27;key\n&#x27; }</code> | Every legacy invalid approval variant has no effects. | New replacement | [D098](#d098) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-055 / L308 | HTTP approval refuses forged owner and legacy amountInUSD input | <code>—</code> | Forged actor/owner and legacy USD fields cannot authorize approval. | Existing PG coverage | [D099](#d099) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| PM-056 / L315 | concurrent same-key approvals both resolve one original committed credit | <code>—</code> | Same-key concurrent approvals resolve one original committed credit. | New replacement | [D100](#d100) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-057 / L323 | different administrators racing approval cannot double-credit the source | <code>—</code> | Competing administrators cannot credit one source twice. | Existing PG coverage | [D101](#d101) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| PM-058 / L331 | approval/rejection race commits exactly one terminal outcome, with credit only for approval | <code>—</code> | Approval/rejection race commits one terminal decision. | Existing PG coverage | [D102](#d102) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| PM-059 / L341 | actual terminal decision-index E11000 rolls back credit with resolution %s | <code>&#x27;available&#x27;</code> | Decision uniqueness conflicts roll back credit before resolution; outage is safe. | New replacement | [D103](#d103) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-060 / L341 | actual terminal decision-index E11000 rolls back credit with resolution %s | <code>&#x27;outage&#x27;</code> | Decision uniqueness conflicts roll back credit before resolution; outage is safe. | New replacement | [D103](#d103) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-061 / L367 | actual source/effect E11000 prevents credit even when an existing journal lookup misses | <code>—</code> | Global source uniqueness prevents credit even if preliminary lookup misses. | New replacement | [D104](#d104) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-062 / L382 | rejection is audited/idempotent and does not read or write any owner funds or journal | <code>—</code> | Rejection is durable/idempotent and nonmonetary. | Existing PG coverage | [D105](#d105)<br>[D106](#d106) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| PM-063 / L399 | rejection does not inspect or migrate %s owner money | <code>&#x27;legacy&#x27;</code> | Rejection does not inspect or migrate invalid/inactive/missing owner money. | New replacement | [D107](#d107) | Nonmonetary independence is retained; missing/drift legacy documents use guarded result injections where SQL cannot store that shape. |
| PM-064 / L399 | rejection does not inspect or migrate %s owner money | <code>&#x27;drift&#x27;</code> | Rejection does not inspect or migrate invalid/inactive/missing owner money. | New replacement | [D107](#d107) | Nonmonetary independence is retained; missing/drift legacy documents use guarded result injections where SQL cannot store that shape. |
| PM-065 / L399 | rejection does not inspect or migrate %s owner money | <code>&#x27;inactive&#x27;</code> | Rejection does not inspect or migrate invalid/inactive/missing owner money. | New replacement | [D107](#d107) | Nonmonetary independence is retained; missing/drift legacy documents use guarded result injections where SQL cannot store that shape. |
| PM-066 / L399 | rejection does not inspect or migrate %s owner money | <code>&#x27;missing&#x27;</code> | Rejection does not inspect or migrate invalid/inactive/missing owner money. | New replacement | [D107](#d107) | Nonmonetary independence is retained; missing/drift legacy documents use guarded result injections where SQL cannot store that shape. |
| PM-067 / L410 | HTTP rejection returns canonical cancelled and cannot later be approved | <code>—</code> | Canonical cancelled rejection cannot later be approved. | Existing PG coverage | [D105](#d105) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| PM-068 / L419 | rejection same-key reuse for another payment conflicts and leaves it pending | <code>—</code> | Reusing rejection key for a different payment conflicts and preserves it. | New replacement | [D108](#d108) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-069 / L427 | approval migrates exact legacy owner cents once in the same transaction | <code>—</code> | Approval adopts missing Mongo balanceCents and journals migration. | Retired mechanism | Not applicable — retired mechanism | PostgreSQL has mandatory cents/generated mirror; automatic lazy adoption is not a runtime capability. |
| PM-070 / L435 | legacy %s payment requires reconciliation, never inferred unpaid | <code>&#x27;pending&#x27;</code> | Unversioned historical payment is not inferred unpaid from its legacy status. | New replacement | [D109](#d109) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-071 / L435 | legacy %s payment requires reconciliation, never inferred unpaid | <code>&#x27;accepted&#x27;</code> | Unversioned historical payment is not inferred unpaid from its legacy status. | New replacement | [D109](#d109) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-072 / L435 | legacy %s payment requires reconciliation, never inferred unpaid | <code>&#x27;rejected&#x27;</code> | Unversioned historical payment is not inferred unpaid from its legacy status. | New replacement | [D109](#d109) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-073 / L435 | legacy %s payment requires reconciliation, never inferred unpaid | <code>&#x27;processing&#x27;</code> | Unversioned historical payment is not inferred unpaid from its legacy status. | New replacement | [D109](#d109) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-074 / L442 | approval with incompatible owner money rolls back without terminal status | <code>—</code> | Incompatible owner evidence aborts approval without decision. | New replacement | [D110](#d110) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-075 / L449 | resulting owner balance %s rejects without status or journal | <code>&#x27;overflow&#x27;</code> | Overflow/unrepresentable approval balance fails atomically. | New replacement | [D111](#d111) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-076 / L449 | resulting owner balance %s rejects without status or journal | <code>&#x27;unrepresentable&#x27;</code> | Overflow/unrepresentable approval balance fails atomically. | New replacement | [D111](#d111) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| PM-077 / L460 | lost %s commit response resolves from fresh authorization-checked durable evidence | <code>&#x27;approve&#x27;</code> | Lost approval/rejection COMMIT resolves only after fresh authorization. | Existing PG coverage | [D054](#d054)<br>[D112](#d112) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| PM-078 / L460 | lost %s commit response resolves from fresh authorization-checked durable evidence | <code>&#x27;reject&#x27;</code> | Lost approval/rejection COMMIT resolves only after fresh authorization. | Existing PG coverage | [D054](#d054)<br>[D112](#d112) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| PM-079 / L478 | unresolved %s outcome returns 503 and safe same-key retry contract | <code>&#x27;approve&#x27;</code> | Unresolved approval/rejection outcome returns safe same-key recovery. | Existing PG coverage | [D061](#d061) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| PM-080 / L478 | unresolved %s outcome returns 503 and safe same-key retry contract | <code>&#x27;reject&#x27;</code> | Unresolved approval/rejection outcome returns safe same-key recovery. | Existing PG coverage | [D061](#d061) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| PM-081 / L506 | summary groups claims by currency and sums only reviewed USD settlement exactly | <code>—</code> | Claims stay currency-separated; reviewed USD aggregates are exact. | Existing PG coverage | [D113](#d113)<br>[D114](#d114) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| PM-082 / L517 | model guards block nontransactional, bulk, delete, pipeline and terminal re-writes | <code>—</code> | Immutable payment fields, evidence-free transitions/deletes remain rejected. | New replacement | [D115](#d115) | Mongoose bulk/pipeline mechanics retire; SQL evidence/immutability protections remain mandatory. |
| PM-083 / L532 | model rejects invalid pending data even with save validation disabled: %p | <code>{ amount: &#x27;50&#x27; }</code> | Invalid pending claim or version evidence cannot commit. | New replacement | [D116](#d116) | save validation bypass retires; SQL constraints and fixed insertion contracts preserve the business requirements. |
| PM-084 / L532 | model rejects invalid pending data even with save validation disabled: %p | <code>{ amountInUSD: 1 }</code> | Invalid pending claim or version evidence cannot commit. | New replacement | [D116](#d116) | save validation bypass retires; SQL constraints and fixed insertion contracts preserve the business requirements. |
| PM-085 / L532 | model rejects invalid pending data even with save validation disabled: %p | <code>{ amountCents: 0 }</code> | Invalid pending claim or version evidence cannot commit. | New replacement | [D116](#d116) | save validation bypass retires; SQL constraints and fixed insertion contracts preserve the business requirements. |
| PM-086 / L532 | model rejects invalid pending data even with save validation disabled: %p | <code>{ submissionVersion: undefined }</code> | Invalid pending claim or version evidence cannot commit. | New replacement | [D116](#d116) | save validation bypass retires; SQL constraints and fixed insertion contracts preserve the business requirements. |
| PM-087 / L532 | model rejects invalid pending data even with save validation disabled: %p | <code>{ status: &#x27;accepted&#x27; }</code> | Invalid pending claim or version evidence cannot commit. | New replacement | [D116](#d116) | save validation bypass retires; SQL constraints and fixed insertion contracts preserve the business requirements. |
| PM-088 / L532 | model rejects invalid pending data even with save validation disabled: %p | <code>{ receipt: { publicId: &#x27;outside-folder&#x27;, format: &#x27;jpg&#x27;, deliveryType: &#x27;authenticated&#x27; } }</code> | Invalid pending claim or version evidence cannot commit. | New replacement | [D116](#d116) | save validation bypass retires; SQL constraints and fixed insertion contracts preserve the business requirements. |

### avatar-upload.test.js

Source: `backend/tests/avatar-upload.test.js` at `7439b8d`; SHA256 `fc58ae8a82a1782353be53ef289baf6a199ad319d013f8797448f96b2d285b92`.

| Case ID / source line | Original test title template | Exact parameter expression | Business requirement | Disposition | Exact destination via index | Rationale |
|---|---|---|---|---|---|---|
| AV-001 / L107 | successful v2 upload preserves avatar contract, formats and owned cleanup ID | <code>—</code> | Successful v2 upload commits owned URL/configuration through guarded CAS. | Existing PG coverage | [D117](#d117) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| AV-002 / L122 | keeps existing allowed MIME policy: %s | <code>&#x27;image/jpeg&#x27;</code> | Retain all accepted avatar MIME variants. | New replacement | [D118](#d118) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| AV-003 / L122 | keeps existing allowed MIME policy: %s | <code>&#x27;image/webp&#x27;</code> | Retain all accepted avatar MIME variants. | New replacement | [D118](#d118) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| AV-004 / L122 | keeps existing allowed MIME policy: %s | <code>&#x27;image/bmp&#x27;</code> | Retain all accepted avatar MIME variants. | New replacement | [D118](#d118) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| AV-005 / L122 | keeps existing allowed MIME policy: %s | <code>&#x27;image/x-ms-bmp&#x27;</code> | Retain all accepted avatar MIME variants. | New replacement | [D118](#d118) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| AV-006 / L122 | keeps existing allowed MIME policy: %s | <code>&#x27;image/tiff&#x27;</code> | Retain all accepted avatar MIME variants. | New replacement | [D118](#d118) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| AV-007 / L123 | auth/self/CSRF failure prevents any provider call: %p | <code>{ actor: null }</code> | All unauthenticated/cross-user/admin-cross-user/CSRF failures precede provider calls. | New replacement | [D119](#d119) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| AV-008 / L123 | auth/self/CSRF failure prevents any provider call: %p | <code>{ actor: OTHER }</code> | All unauthenticated/cross-user/admin-cross-user/CSRF failures precede provider calls. | New replacement | [D119](#d119) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| AV-009 / L123 | auth/self/CSRF failure prevents any provider call: %p | <code>{ actor: ADMIN }</code> | All unauthenticated/cross-user/admin-cross-user/CSRF failures precede provider calls. | New replacement | [D119](#d119) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| AV-010 / L123 | auth/self/CSRF failure prevents any provider call: %p | <code>{ csrf: false }</code> | All unauthenticated/cross-user/admin-cross-user/CSRF failures precede provider calls. | New replacement | [D119](#d119) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| AV-011 / L126 | rejects unsupported MIME before upload: %s | <code>&#x27;image/svg+xml&#x27;</code> | Every unsupported MIME rejects before provider. | New replacement | [D120](#d120) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| AV-012 / L126 | rejects unsupported MIME before upload: %s | <code>&#x27;image/gif&#x27;</code> | Every unsupported MIME rejects before provider. | New replacement | [D120](#d120) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| AV-013 / L126 | rejects unsupported MIME before upload: %s | <code>&#x27;application/octet-stream&#x27;</code> | Every unsupported MIME rejects before provider. | New replacement | [D120](#d120) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| AV-014 / L129 | rejects invalid multipart before provider write: %# | <code>{ extra: true }</code> | All multipart fields/files/size/empty variants reject before provider. | New replacement | [D121](#d121) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| AV-015 / L129 | rejects invalid multipart before provider write: %# | <code>{ extra: true, extraFirst: true }</code> | All multipart fields/files/size/empty variants reject before provider. | New replacement | [D121](#d121) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| AV-016 / L129 | rejects invalid multipart before provider write: %# | <code>{ second: true }</code> | All multipart fields/files/size/empty variants reject before provider. | New replacement | [D121](#d121) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| AV-017 / L129 | rejects invalid multipart before provider write: %# | <code>{ field: &#x27;receipt&#x27; }</code> | All multipart fields/files/size/empty variants reject before provider. | New replacement | [D121](#d121) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| AV-018 / L129 | rejects invalid multipart before provider write: %# | <code>{ bytes: Buffer.alloc(5 * 1024 * 1024 + 1) }</code> | All multipart fields/files/size/empty variants reject before provider. | New replacement | [D121](#d121) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| AV-019 / L129 | rejects invalid multipart before provider write: %# | <code>{ bytes: Buffer.alloc(0) }</code> | All multipart fields/files/size/empty variants reject before provider. | New replacement | [D121](#d121) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| AV-020 / L129 | rejects invalid multipart before provider write: %# | <code>{ bytes: null }</code> | All multipart fields/files/size/empty variants reject before provider. | New replacement | [D121](#d121) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| AV-021 / L132 | malformed multipart boundary never writes an avatar | <code>—</code> | Malformed boundary creates no avatar asset. | New replacement | [D122](#d122) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| AV-022 / L136 | provider %s is sanitized and cleaned up | <code>&#x27;throw&#x27;</code> | Throw/callback/stream/synchronous provider failures sanitize and clean owned ID. | New replacement | [D123](#d123) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| AV-023 / L136 | provider %s is sanitized and cleaned up | <code>&#x27;callback-error&#x27;</code> | Throw/callback/stream/synchronous provider failures sanitize and clean owned ID. | New replacement | [D123](#d123) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| AV-024 / L136 | provider %s is sanitized and cleaned up | <code>&#x27;stream-error&#x27;</code> | Throw/callback/stream/synchronous provider failures sanitize and clean owned ID. | New replacement | [D123](#d123) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| AV-025 / L136 | provider %s is sanitized and cleaned up | <code>&#x27;sync-error&#x27;</code> | Throw/callback/stream/synchronous provider failures sanitize and clean owned ID. | New replacement | [D123](#d123) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| AV-026 / L142 | rejects contradictory provider evidence: %p | <code>{ public_id: &#x27;someone-elses-asset&#x27; }</code> | Every contradictory provider evidence variant is rejected safely. | New replacement | [D124](#d124) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| AV-027 / L142 | rejects contradictory provider evidence: %p | <code>{ type: &#x27;authenticated&#x27; }</code> | Every contradictory provider evidence variant is rejected safely. | New replacement | [D124](#d124) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| AV-028 / L142 | rejects contradictory provider evidence: %p | <code>{ resource_type: &#x27;raw&#x27; }</code> | Every contradictory provider evidence variant is rejected safely. | New replacement | [D124](#d124) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| AV-029 / L142 | rejects contradictory provider evidence: %p | <code>{ format: &#x27;png&#x27; }</code> | Every contradictory provider evidence variant is rejected safely. | New replacement | [D124](#d124) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| AV-030 / L142 | rejects contradictory provider evidence: %p | <code>{ bytes: NaN }</code> | Every contradictory provider evidence variant is rejected safely. | New replacement | [D124](#d124) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| AV-031 / L142 | rejects contradictory provider evidence: %p | <code>{ secure_url: &#x27;https://attacker.example/asset.jpg&#x27; }</code> | Every contradictory provider evidence variant is rejected safely. | New replacement | [D124](#d124) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| AV-032 / L142 | rejects contradictory provider evidence: %p | <code>{ secure_url: &#x27;https://res.cloudinary.com/another-cloud/image/upload/asset.jpg&#x27; }</code> | Every contradictory provider evidence variant is rejected safely. | New replacement | [D124](#d124) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| AV-033 / L147 | duplicate provider success cannot delete an accepted avatar | <code>—</code> | Duplicate callback cannot double-persist or delete accepted avatar. | New replacement | [D125](#d125) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| AV-034 / L152 | persistence failure cleans the returned owned asset | <code>—</code> | Known persistence rollback cleans only newly owned returned asset. | New replacement | [D126](#d126) | Translate mocked Mongo failure to wrapped real PostgreSQL rollback; unknown COMMIT is explicitly excluded from cleanup authority. |
| AV-035 / L158 | changed authentication version after upload cannot persist an avatar | <code>—</code> | Token version change during upload prevents CAS persistence and cleans rejected asset. | New replacement | [D127](#d127) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| AV-036 / L164 | client interruption and late provider confirmation both clean only the owned ID | <code>—</code> | Client interruption and late confirmation clean owned ID without writes. | New replacement | [D128](#d128) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| AV-037 / L171 | bounded timeout rejects without waiting for provider completion | <code>—</code> | Bounded provider timeout rejects without waiting for completion. | New replacement | [D129](#d129) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |

### users-admin-authorization.test.js

Source: `backend/tests/users-admin-authorization.test.js` at `7439b8d`; SHA256 `f5b21579534e669173bbb7acc104710f232b930a0d5cc50500803091aae30415`.

| Case ID / source line | Original test title template | Exact parameter expression | Business requirement | Disposition | Exact destination via index | Rationale |
|---|---|---|---|---|---|---|
| UA-001 / L148 | listing/panel requires authentication | <code>[usersRouter, &#x27;/&#x27;]</code> | Anonymous user listing rejects before any user enumeration. | New replacement | [D219](#d219) | The cited positive listing/header-auth cases do not attempt anonymous user listing. Preserve this exact endpoint negative assertion. |
| UA-002 / L148 | listing/panel requires authentication | <code>[adminRouter, &#x27;/users&#x27;]</code> | Application admin users/panel API stays unavailable without auth/session/persistence work. | Changed disabled contract | [D132](#d132) | These legacy admin-prefix requests no longer enter authentication/listing. The production prefix is fixed FEATURE_UNAVAILABLE even for anonymous or forged-role callers. |
| UA-003 / L148 | listing/panel requires authentication | <code>[adminRouter, &#x27;/panel&#x27;]</code> | Application admin users/panel API stays unavailable without auth/session/persistence work. | Changed disabled contract | [D132](#d132) | These legacy admin-prefix requests no longer enter authentication/listing. The production prefix is fixed FEATURE_UNAVAILABLE even for anonymous or forged-role callers. |
| UA-004 / L152 | listing/panel ignores forged token and session admin roles | <code>[usersRouter, &#x27;/&#x27;]</code> | Fresh database role overrides forged token/session role. | Existing PG coverage | [D131](#d131) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| UA-005 / L152 | listing/panel ignores forged token and session admin roles | <code>[adminRouter, &#x27;/users&#x27;]</code> | Application admin users/panel API stays unavailable without auth/session/persistence work. | Changed disabled contract | [D132](#d132) | These legacy admin-prefix requests no longer enter authentication/listing. The production prefix is fixed FEATURE_UNAVAILABLE even for anonymous or forged-role callers. |
| UA-006 / L152 | listing/panel ignores forged token and session admin roles | <code>[adminRouter, &#x27;/panel&#x27;]</code> | Application admin users/panel API stays unavailable without auth/session/persistence work. | Changed disabled contract | [D132](#d132) | These legacy admin-prefix requests no longer enter authentication/listing. The production prefix is fixed FEATURE_UNAVAILABLE even for anonymous or forged-role callers. |
| UA-007 / L156 | admin listing uses safe projections and admin panel remains accessible | <code>—</code> | Enabled safe user listing remains; retired admin API/panel remains unavailable. | Changed disabled contract | [D130](#d130)<br>[D132](#d132) | Split compound expectation: /api/users listing is supported; /api/admin/users and /api/admin/panel must never regain successful behavior. Protected /admin.html is a different route. |
| UA-008 / L165 | individual user and balance reads enforce ownership: %s | <code>`/${OTHER}`</code> | Cross-user reads require current admin; owner cannot read others. | Existing PG coverage | [D133](#d133) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| UA-009 / L165 | individual user and balance reads enforce ownership: %s | <code>`/${OTHER}/balance`</code> | Cross-user reads require current admin; owner cannot read others. | Existing PG coverage | [D133](#d133) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| UA-010 / L169 | owner can read their profile/balance and /me without secrets | <code>—</code> | Self profile/balance/me expose no secrets and exact string money. | Existing PG coverage | [D134](#d134) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| UA-011 / L183 | ordinary users cannot mutate another profile: %s %s | <code>[&#x27;PUT&#x27;, `/${OTHER}`, { username: &#x27;Changed_Name&#x27; }]</code> | All ordinary-user cross-profile mutation paths reject without effects. | New replacement | [D135](#d135) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| UA-012 / L183 | ordinary users cannot mutate another profile: %s %s | <code>[&#x27;PUT&#x27;, `/${OTHER}/theme`, { theme: 1 }]</code> | All ordinary-user cross-profile mutation paths reject without effects. | New replacement | [D135](#d135) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| UA-013 / L183 | ordinary users cannot mutate another profile: %s %s | <code>[&#x27;POST&#x27;, `/${OTHER}/avatar`, {}]</code> | All ordinary-user cross-profile mutation paths reject without effects. | New replacement | [D135](#d135) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| UA-014 / L183 | ordinary users cannot mutate another profile: %s %s | <code>[&#x27;POST&#x27;, `/${OTHER}/avatar/remove`, {}]</code> | All ordinary-user cross-profile mutation paths reject without effects. | New replacement | [D135](#d135) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| UA-015 / L188 | admins have no cross-user profile mutation exception: %s %s | <code>[&#x27;PUT&#x27;, `/${OTHER}`, { username: &#x27;Changed_Name&#x27; }]</code> | Administrators have no cross-user profile mutation exception. | New replacement | [D136](#d136) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| UA-016 / L188 | admins have no cross-user profile mutation exception: %s %s | <code>[&#x27;PUT&#x27;, `/${OTHER}/theme`, { theme: 1 }]</code> | Administrators have no cross-user profile mutation exception. | New replacement | [D136](#d136) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| UA-017 / L188 | admins have no cross-user profile mutation exception: %s %s | <code>[&#x27;POST&#x27;, `/${OTHER}/avatar`, {}]</code> | Administrators have no cross-user profile mutation exception. | New replacement | [D136](#d136) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| UA-018 / L188 | admins have no cross-user profile mutation exception: %s %s | <code>[&#x27;POST&#x27;, `/${OTHER}/avatar/remove`, {}]</code> | Administrators have no cross-user profile mutation exception. | New replacement | [D136](#d136) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| UA-019 / L193 | profile rejects forbidden/unknown field %s | <code>&#x27;balance&#x27;</code> | Every legacy forbidden/unknown profile field is rejected. | New replacement | [D137](#d137) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| UA-020 / L193 | profile rejects forbidden/unknown field %s | <code>&#x27;role&#x27;</code> | Every legacy forbidden/unknown profile field is rejected. | New replacement | [D137](#d137) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| UA-021 / L193 | profile rejects forbidden/unknown field %s | <code>&#x27;accountStatus&#x27;</code> | Every legacy forbidden/unknown profile field is rejected. | New replacement | [D137](#d137) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| UA-022 / L193 | profile rejects forbidden/unknown field %s | <code>&#x27;tokenVersion&#x27;</code> | Every legacy forbidden/unknown profile field is rejected. | New replacement | [D137](#d137) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| UA-023 / L193 | profile rejects forbidden/unknown field %s | <code>&#x27;provider&#x27;</code> | Every legacy forbidden/unknown profile field is rejected. | New replacement | [D137](#d137) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| UA-024 / L193 | profile rejects forbidden/unknown field %s | <code>&#x27;googleId&#x27;</code> | Every legacy forbidden/unknown profile field is rejected. | New replacement | [D137](#d137) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| UA-025 / L193 | profile rejects forbidden/unknown field %s | <code>&#x27;twoFASecret&#x27;</code> | Every legacy forbidden/unknown profile field is rejected. | New replacement | [D137](#d137) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| UA-026 / L193 | profile rejects forbidden/unknown field %s | <code>&#x27;twoFAStatus&#x27;</code> | Every legacy forbidden/unknown profile field is rejected. | New replacement | [D137](#d137) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| UA-027 / L193 | profile rejects forbidden/unknown field %s | <code>&#x27;trustedDevices&#x27;</code> | Every legacy forbidden/unknown profile field is rejected. | New replacement | [D137](#d137) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| UA-028 / L193 | profile rejects forbidden/unknown field %s | <code>&#x27;resetPasswordToken&#x27;</code> | Every legacy forbidden/unknown profile field is rejected. | New replacement | [D137](#d137) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| UA-029 / L193 | profile rejects forbidden/unknown field %s | <code>&#x27;loginAttempts&#x27;</code> | Every legacy forbidden/unknown profile field is rejected. | New replacement | [D137](#d137) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| UA-030 / L193 | profile rejects forbidden/unknown field %s | <code>&#x27;avatar&#x27;</code> | Every legacy forbidden/unknown profile field is rejected. | New replacement | [D137](#d137) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| UA-031 / L193 | profile rejects forbidden/unknown field %s | <code>&#x27;unexpected&#x27;</code> | Every legacy forbidden/unknown profile field is rejected. | New replacement | [D137](#d137) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| UA-032 / L199 | profile rejects malformed or empty bodies: %p | <code>null</code> | Null/array/empty/string profile bodies have no effects. | New replacement | [D138](#d138) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| UA-033 / L199 | profile rejects malformed or empty bodies: %p | <code>[]</code> | Null/array/empty/string profile bodies have no effects. | New replacement | [D138](#d138) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| UA-034 / L199 | profile rejects malformed or empty bodies: %p | <code>{}</code> | Null/array/empty/string profile bodies have no effects. | New replacement | [D138](#d138) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| UA-035 / L199 | profile rejects malformed or empty bodies: %p | <code>&#x27;invalid&#x27;</code> | Null/array/empty/string profile bodies have no effects. | New replacement | [D138](#d138) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| UA-036 / L203 | allowed profile fields save without touching financial/security fields or rehashing | <code>—</code> | Identity update preserves money/hash but atomically invalidates old authentication. | Changed disabled contract | [D139](#d139) | Old expectation of unchanged tokenVersion/sessions is obsolete; current identity change clears verification and revokes the graph, while money/role/password remain protected. |
| UA-037 / L210 | password change uses the real hashing hook, increments version and invalidates only owner sessions | <code>—</code> | Password hashing/version change revokes only owner sessions and leaves others untouched. | New replacement | [D220](#d220)<br>[D140](#d140)<br>[D141](#d141) | Existing PG cases prove hashing and owner revocation but do not assert surviving admin/other sessions in this password-change sequence. |
| UA-038 / L226 | invalid password changes fail without writes: %p | <code>[{ password: &#x27;UpdatedPassword2!&#x27; }, 400]</code> | Every missing/wrong/weak/current-only/empty password variant is write-free. | New replacement | [D142](#d142) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| UA-039 / L226 | invalid password changes fail without writes: %p | <code>[{ password: &#x27;UpdatedPassword2!&#x27;, currentPassword: &#x27;wrong&#x27; }, 403]</code> | Every missing/wrong/weak/current-only/empty password variant is write-free. | New replacement | [D142](#d142) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| UA-040 / L226 | invalid password changes fail without writes: %p | <code>[{ password: &#x27;weak&#x27;, currentPassword: OLD_PASSWORD }, 400]</code> | Every missing/wrong/weak/current-only/empty password variant is write-free. | New replacement | [D142](#d142) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| UA-041 / L226 | invalid password changes fail without writes: %p | <code>[{ currentPassword: OLD_PASSWORD }, 400]</code> | Every missing/wrong/weak/current-only/empty password variant is write-free. | New replacement | [D142](#d142) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| UA-042 / L226 | invalid password changes fail without writes: %p | <code>[{ password: &#x27;&#x27;, currentPassword: OLD_PASSWORD }, 400]</code> | Every missing/wrong/weak/current-only/empty password variant is write-free. | New replacement | [D142](#d142) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| UA-043 / L237 | Google users cannot use local password update | <code>—</code> | Google-only account cannot acquire local password via this route. | New replacement | [D143](#d143) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| UA-044 / L242 | failed concurrent password save does not invalidate sessions or persist plaintext | <code>—</code> | Concurrent losing password CAS preserves stored hash and sessions. | New replacement | [D144](#d144) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| UA-045 / L259 | mutation requires CSRF: %s %s %s | <code>[usersRouter, &#x27;PUT&#x27;, `/${OWNER}`, { username: &#x27;New_Name&#x27; }, OWNER]</code> | Each enabled unsafe user route requires exact parent CSRF. | Existing PG coverage | [D145](#d145)<br>[D146](#d146)<br>[D147](#d147)<br>[D148](#d148) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| UA-046 / L259 | mutation requires CSRF: %s %s %s | <code>[usersRouter, &#x27;PUT&#x27;, `/${OWNER}/theme`, { theme: 1 }, OWNER]</code> | This exact theme/avatar-removal mutation requires parent-bound CSRF before side effects. | New replacement | [D222](#d222) | Current profile, avatar-upload and lifecycle CSRF cases do not exercise missing CSRF on theme or avatar removal. Do not credit another route as this negative assertion. |
| UA-047 / L259 | mutation requires CSRF: %s %s %s | <code>[usersRouter, &#x27;POST&#x27;, `/${OWNER}/avatar`, {}, OWNER]</code> | Each enabled unsafe user route requires exact parent CSRF. | Existing PG coverage | [D145](#d145)<br>[D146](#d146)<br>[D147](#d147)<br>[D148](#d148) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| UA-048 / L259 | mutation requires CSRF: %s %s %s | <code>[usersRouter, &#x27;POST&#x27;, `/${OWNER}/avatar/remove`, {}, OWNER]</code> | This exact theme/avatar-removal mutation requires parent-bound CSRF before side effects. | New replacement | [D222](#d222) | Current profile, avatar-upload and lifecycle CSRF cases do not exercise missing CSRF on theme or avatar removal. Do not credit another route as this negative assertion. |
| UA-049 / L259 | mutation requires CSRF: %s %s %s | <code>[usersRouter, &#x27;PUT&#x27;, `/${OTHER}/activate`, {}, ADMIN]</code> | Each enabled unsafe user route requires exact parent CSRF. | Existing PG coverage | [D145](#d145)<br>[D146](#d146)<br>[D147](#d147)<br>[D148](#d148) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| UA-050 / L259 | mutation requires CSRF: %s %s %s | <code>[usersRouter, &#x27;DELETE&#x27;, `/${OTHER}`, {}, ADMIN]</code> | Each enabled unsafe user route requires exact parent CSRF. | Existing PG coverage | [D145](#d145)<br>[D146](#d146)<br>[D147](#d147)<br>[D148](#d148) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| UA-051 / L259 | mutation requires CSRF: %s %s %s | <code>[usersRouter, &#x27;PUT&#x27;, `/${OTHER}/balance`, { balance: 10 }, ADMIN]</code> | Each enabled unsafe user route requires exact parent CSRF. | Existing PG coverage | [D145](#d145)<br>[D146](#d146)<br>[D147](#d147)<br>[D148](#d148) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| UA-052 / L259 | mutation requires CSRF: %s %s %s | <code>[adminRouter, &#x27;PUT&#x27;, `/update-balance/${OTHER}`, { balance: 10 }, ADMIN]</code> | Application admin balance prefix stays unavailable with no financial or session effects. | Changed disabled contract | [D223](#d223) | At the actual composition boundary /api/admin/* is fixed unavailable, not the historical router. Direct legacy handler auth/body validation remains unchanged and is separately planned in disabled-features.test.js. |
| UA-053 / L264 | theme has its own strict allowlist and only writes theme | <code>—</code> | Theme strict allowlist permits only nonfinancial theme change. | New replacement | [D149](#d149) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| UA-054 / L272 | avatar upload only accepts the uploaded file and cleans up rejected uploads | <code>—</code> | Avatar accepts only a server-owned upload; rejects extra/missing payloads safely. | New replacement | [D150](#d150) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| UA-055 / L282 | avatar removal rejects extra fields and deletes only an asset from this cloud account | <code>—</code> | Removal rejects extra fields and cleans same-cloud asset only after CAS. | New replacement | [D151](#d151) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| UA-056 / L290 | avatar removal does not delete assets from a different cloud account | <code>—</code> | Removal cannot delete a foreign-cloud asset. | Existing PG coverage | [D152](#d152) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| UA-057 / L296 | account operations and adjustments are admin-only: %s %s | <code>[&#x27;DELETE&#x27;, `/${OTHER}`]</code> | Account lifecycle and manual balance route are admin-only. | Existing PG coverage | [D147](#d147)<br>[D148](#d148) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| UA-058 / L296 | account operations and adjustments are admin-only: %s %s | <code>[&#x27;PUT&#x27;, `/${OTHER}/activate`]</code> | Account lifecycle and manual balance route are admin-only. | Existing PG coverage | [D147](#d147)<br>[D148](#d148) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| UA-059 / L296 | account operations and adjustments are admin-only: %s %s | <code>[&#x27;PUT&#x27;, `/${OWNER}/balance`]</code> | Account lifecycle and manual balance route are admin-only. | Existing PG coverage | [D147](#d147)<br>[D148](#d148) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| UA-060 / L300 | activation is allowlisted, increments the target version and clears only target sessions | <code>—</code> | Activation allowlist/version/session revocation are target-bound. | New replacement | [D153](#d153) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| UA-061 / L310 | deletion is allowlisted and clears only deleted user sessions | <code>—</code> | DELETE logically deactivates, preserves money/history, revokes target only. | Changed disabled contract | [D154](#d154) | Physical Mongo deletion is no longer the contract. Retain logical deactivation and target-only revocation. |
| UA-062 / L319 | nonexistent account operations return 404 and leave sessions unchanged | <code>—</code> | Missing lifecycle targets return 404 without session mutations. | New replacement | [D155](#d155) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| UA-063 / L325 | target IDs are validated before database operations: %s %s %s | <code>[usersRouter, &#x27;DELETE&#x27;, &#x27;/not-an-id&#x27;]</code> | UUID target validation precedes mutation and storage. | New replacement | [D156](#d156) | ObjectId casting semantics retire; UUID validation is a replacement, not a cast compatibility shim. |
| UA-064 / L325 | target IDs are validated before database operations: %s %s %s | <code>[usersRouter, &#x27;PUT&#x27;, &#x27;/not-an-id/activate&#x27;]</code> | UUID target validation precedes mutation and storage. | New replacement | [D156](#d156) | ObjectId casting semantics retire; UUID validation is a replacement, not a cast compatibility shim. |
| UA-065 / L325 | target IDs are validated before database operations: %s %s %s | <code>[usersRouter, &#x27;PUT&#x27;, &#x27;/not-an-id/balance&#x27;]</code> | UUID target validation precedes mutation and storage. | New replacement | [D156](#d156) | ObjectId casting semantics retire; UUID validation is a replacement, not a cast compatibility shim. |
| UA-066 / L325 | target IDs are validated before database operations: %s %s %s | <code>[usersRouter, &#x27;GET&#x27;, &#x27;/not-an-id/balance&#x27;]</code> | UUID target validation precedes mutation and storage. | New replacement | [D156](#d156) | ObjectId casting semantics retire; UUID validation is a replacement, not a cast compatibility shim. |
| UA-067 / L325 | target IDs are validated before database operations: %s %s %s | <code>[adminRouter, &#x27;PUT&#x27;, &#x27;/update-balance/not-an-id&#x27;]</code> | Application admin balance prefix stays unavailable with no financial or session effects. | Changed disabled contract | [D223](#d223) | At the actual composition boundary /api/admin/* is fixed unavailable, not the historical router. Direct legacy handler auth/body validation remains unchanged and is separately planned in disabled-features.test.js. |
| UA-068 / L336 | valid admin adjustments fail closed without balance or token version writes | <code>[usersRouter, `/${OTHER}/balance`]</code> | Valid authorized manual balance request stays 503 without money writes. | Existing PG coverage | [D148](#d148) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| UA-069 / L336 | valid admin adjustments fail closed without balance or token version writes | <code>[adminRouter, `/update-balance/${OTHER}`]</code> | Application admin balance prefix stays unavailable with no financial or session effects. | Changed disabled contract | [D223](#d223) | At the actual composition boundary /api/admin/* is fixed unavailable, not the historical router. Direct legacy handler auth/body validation remains unchanged and is separately planned in disabled-features.test.js. |
| UA-070 / L344 | non-admin adjustments are forbidden | <code>[usersRouter, `/${OTHER}/balance`]</code> | Ordinary user cannot use enabled manual balance route. | Existing PG coverage | [D148](#d148) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| UA-071 / L344 | non-admin adjustments are forbidden | <code>[adminRouter, `/update-balance/${OTHER}`]</code> | Application admin balance prefix stays unavailable with no financial or session effects. | Changed disabled contract | [D223](#d223) | At the actual composition boundary /api/admin/* is fixed unavailable, not the historical router. Direct legacy handler auth/body validation remains unchanged and is separately planned in disabled-features.test.js. |
| UA-072 / L348 | adjustment bodies have strict types, bounds and allowlists | <code>[usersRouter, `/${OTHER}/balance`]</code> | Manual adjustments remain disabled for every request body. | Changed disabled contract | [D157](#d157) | Current users balance route is fixed unavailable after auth/CSRF, not historical body validation. Legacy admin handler keeps its existing validation; application admin prefix remains disabled. |
| UA-073 / L348 | adjustment bodies have strict types, bounds and allowlists | <code>[adminRouter, `/update-balance/${OTHER}`]</code> | Application admin balance prefix stays unavailable with no financial or session effects. | Changed disabled contract | [D223](#d223) | At the actual composition boundary /api/admin/* is fixed unavailable, not the historical router. Direct legacy handler auth/body validation remains unchanged and is separately planned in disabled-features.test.js. |
| UA-074 / L356 | disabled %s returns 410 for every method without auth/database/storage effects | <code>&#x27;reserve&#x27;</code> | Reserve/restore remain disabled before sessions/storage. | Changed disabled contract | [D158](#d158)<br>[D159](#d159) | Retain 410 for supported requests and no writes. Do not demand JSON for HEAD or bypass composition CORS preflight to reproduce historical fake-router OPTIONS behavior. |
| UA-075 / L356 | disabled %s returns 410 for every method without auth/database/storage effects | <code>&#x27;restore&#x27;</code> | Reserve/restore remain disabled before sessions/storage. | Changed disabled contract | [D158](#d158)<br>[D159](#d159) | Retain 410 for supported requests and no writes. Do not demand JSON for HEAD or bypass composition CORS preflight to reproduce historical fake-router OPTIONS behavior. |
| UA-076 / L367 | stale token and inactive account checks remain shared across both routers | <code>—</code> | Stale/inactive authorization stays fresh on enabled routes; admin prefix stays unavailable. | Changed disabled contract | [D160](#d160)<br>[D161](#d161) | Do not restore old 401/403 behavior on an application prefix intentionally fixed to FEATURE_UNAVAILABLE. |

### financial-models.test.js

Source: `backend/tests/financial-models.test.js` at `7439b8d`; SHA256 `edd7d8175945d3e303bff3f23934c2d52f1a9c5a003c85cbfea49f41d793c6a9`.

| Case ID / source line | Original test title template | Exact parameter expression | Business requirement | Disposition | Exact destination via index | Rationale |
|---|---|---|---|---|---|---|
| FM-001 / L35 | legacy hydration never defaults or migrates balanceCents | <code>—</code> | Mongoose hydration must not default missing balanceCents. | Retired mechanism | Not applicable — retired mechanism | There is no Mongoose hydration or missing-cent row in the runtime. PostgreSQL requires cents and generates its mirror; keep import provenance, not a hydration default API. |
| FM-002 / L48 | new zero-balance accounts explicitly initialize both fields without a transaction | <code>—</code> | Zero-balance registration initializes mandatory cents and generated mirror. | New replacement | [D162](#d162) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FM-003 / L54 | rejects invalid/coerced balanceCents: %p | <code>-1</code> | Application cents boundary rejects unsafe/coerced inputs. | New replacement | [D163](#d163) | Replace Mongoose field casts with JavaScript money validation. SQL can legitimately accept a typed numeric parameter represented as text; do not confuse that with public input acceptance. |
| FM-004 / L54 | rejects invalid/coerced balanceCents: %p | <code>-0</code> | Application cents boundary rejects unsafe/coerced inputs. | New replacement | [D163](#d163) | Replace Mongoose field casts with JavaScript money validation. SQL can legitimately accept a typed numeric parameter represented as text; do not confuse that with public input acceptance. |
| FM-005 / L54 | rejects invalid/coerced balanceCents: %p | <code>0.5</code> | Application cents boundary rejects unsafe/coerced inputs. | New replacement | [D163](#d163) | Replace Mongoose field casts with JavaScript money validation. SQL can legitimately accept a typed numeric parameter represented as text; do not confuse that with public input acceptance. |
| FM-006 / L54 | rejects invalid/coerced balanceCents: %p | <code>NaN</code> | Application cents boundary rejects unsafe/coerced inputs. | New replacement | [D163](#d163) | Replace Mongoose field casts with JavaScript money validation. SQL can legitimately accept a typed numeric parameter represented as text; do not confuse that with public input acceptance. |
| FM-007 / L54 | rejects invalid/coerced balanceCents: %p | <code>Infinity</code> | Application cents boundary rejects unsafe/coerced inputs. | New replacement | [D163](#d163) | Replace Mongoose field casts with JavaScript money validation. SQL can legitimately accept a typed numeric parameter represented as text; do not confuse that with public input acceptance. |
| FM-008 / L54 | rejects invalid/coerced balanceCents: %p | <code>-Infinity</code> | Application cents boundary rejects unsafe/coerced inputs. | New replacement | [D163](#d163) | Replace Mongoose field casts with JavaScript money validation. SQL can legitimately accept a typed numeric parameter represented as text; do not confuse that with public input acceptance. |
| FM-009 / L54 | rejects invalid/coerced balanceCents: %p | <code>MAX_CENTS + 1</code> | Application cents boundary rejects unsafe/coerced inputs. | New replacement | [D163](#d163) | Replace Mongoose field casts with JavaScript money validation. SQL can legitimately accept a typed numeric parameter represented as text; do not confuse that with public input acceptance. |
| FM-010 / L54 | rejects invalid/coerced balanceCents: %p | <code>&#x27;100&#x27;</code> | Application cents boundary rejects unsafe/coerced inputs. | New replacement | [D163](#d163) | Replace Mongoose field casts with JavaScript money validation. SQL can legitimately accept a typed numeric parameter represented as text; do not confuse that with public input acceptance. |
| FM-011 / L54 | rejects invalid/coerced balanceCents: %p | <code>true</code> | Application cents boundary rejects unsafe/coerced inputs. | New replacement | [D163](#d163) | Replace Mongoose field casts with JavaScript money validation. SQL can legitimately accept a typed numeric parameter represented as text; do not confuse that with public input acceptance. |
| FM-012 / L54 | rejects invalid/coerced balanceCents: %p | <code>false</code> | Application cents boundary rejects unsafe/coerced inputs. | New replacement | [D163](#d163) | Replace Mongoose field casts with JavaScript money validation. SQL can legitimately accept a typed numeric parameter represented as text; do not confuse that with public input acceptance. |
| FM-013 / L54 | rejects invalid/coerced balanceCents: %p | <code>null</code> | Application cents boundary rejects unsafe/coerced inputs. | New replacement | [D163](#d163) | Replace Mongoose field casts with JavaScript money validation. SQL can legitimately accept a typed numeric parameter represented as text; do not confuse that with public input acceptance. |
| FM-014 / L54 | rejects invalid/coerced balanceCents: %p | <code>100n</code> | Application cents boundary rejects unsafe/coerced inputs. | New replacement | [D163](#d163) | Replace Mongoose field casts with JavaScript money validation. SQL can legitimately accept a typed numeric parameter represented as text; do not confuse that with public input acceptance. |
| FM-015 / L58 | accepts exact matching cents: %p | <code>0</code> | Exact cents produce an exact generated decimal mirror. | New replacement | [D164](#d164) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FM-016 / L58 | accepts exact matching cents: %p | <code>1</code> | Exact cents produce an exact generated decimal mirror. | New replacement | [D164](#d164) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FM-017 / L58 | accepts exact matching cents: %p | <code>29</code> | Exact cents produce an exact generated decimal mirror. | New replacement | [D164](#d164) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FM-018 / L58 | accepts exact matching cents: %p | <code>100</code> | Exact cents produce an exact generated decimal mirror. | New replacement | [D164](#d164) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FM-019 / L58 | accepts exact matching cents: %p | <code>12345</code> | Exact cents produce an exact generated decimal mirror. | New replacement | [D164](#d164) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FM-020 / L62 | rejects mismatches/excess legacy precision: %p | <code>{ balance: 1, balanceCents: 101 }</code> | Floating precision/drift is never rounded into authoritative cents. | New replacement | [D165](#d165)<br>[D166](#d166) | Historical writable mirror mismatches become generated-column protection; excess precision remains an application-money obligation. |
| FM-021 / L62 | rejects mismatches/excess legacy precision: %p | <code>{ balance: 1.005, balanceCents: 101 }</code> | Floating precision/drift is never rounded into authoritative cents. | New replacement | [D165](#d165)<br>[D166](#d166) | Historical writable mirror mismatches become generated-column protection; excess precision remains an application-money obligation. |
| FM-022 / L62 | rejects mismatches/excess legacy precision: %p | <code>{ balance: 0.1 + 0.2, balanceCents: 30 }</code> | Floating precision/drift is never rounded into authoritative cents. | New replacement | [D165](#d165)<br>[D166](#d166) | Historical writable mirror mismatches become generated-column protection; excess precision remains an application-money obligation. |
| FM-023 / L67 | rejects a cent value whose numeric compatibility mirror cannot round-trip exactly | <code>—</code> | Unrepresentable compatibility mirror prevents financial mutation. | Existing non-PG coverage | [D167](#d167) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| FM-024 / L71 | rejects mismatches even when save validation is disabled | <code>—</code> | Mongoose validateBeforeSave:false cannot bypass balance middleware. | Retired mechanism | Not applicable — retired mechanism | The save option and middleware are gone. Generated mirror constraints and financial scope/CAS validations are retained separately; SQL is not exposed to a save-validation option. |
| FM-025 / L79 | document writes require a transaction and both fields to be marked for writing | <code>—</code> | Financial writes require coordinator-owned transaction scope, not arbitrary sessions. | Existing PG coverage | [D168](#d168)<br>[D169](#d169) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| FM-026 / L89 | document writes compare the original money pair and restore caller save conditions | <code>—</code> | Original money/version CAS prevents overwrites within scoped client. | Existing non-PG coverage | [D169](#d169)<br>[D012](#d012) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| FM-027 / L103 | a one-sided document migration is rejected even in a transaction | <code>—</code> | One-sided migration with document markModified/session. | Retired mechanism | Not applicable — retired mechanism | Missing cents and markModified migration protocols do not exist under the reviewed PostgreSQL schema. |
| FM-028 / L110 | a matching, explicit legacy document migration preserves the mirror | <code>—</code> | Explicit Mongoose legacy migration marks both fields. | Retired mechanism | Not applicable — retired mechanism | No lazy adoption path exists. PostgreSQL writes authoritative cents and computes its mirror; do not add a manual mirror setter. |
| FM-029 / L118 | cannot overwrite and hide an invalid legacy source: %p | <code>1.005</code> | Hydrated legacy float source cannot be overwritten before migration. | Retired mechanism | Not applicable — retired mechanism | Historical lazy migration is removed. Exact parser/precision rejection remains independently required by money-contracts.test.js. |
| FM-030 / L118 | cannot overwrite and hide an invalid legacy source: %p | <code>0.1 + 0.2</code> | Hydrated legacy float source cannot be overwritten before migration. | Retired mechanism | Not applicable — retired mechanism | Historical lazy migration is removed. Exact parser/precision rejection remains independently required by money-contracts.test.js. |
| FM-031 / L118 | cannot overwrite and hide an invalid legacy source: %p | <code>1e-7</code> | Hydrated legacy float source cannot be overwritten before migration. | Retired mechanism | Not applicable — retired mechanism | Historical lazy migration is removed. Exact parser/precision rejection remains independently required by money-contracts.test.js. |
| FM-032 / L126 | cannot silently repair a previously inconsistent authoritative mirror | <code>—</code> | Corrupt monetary read evidence cannot be silently repaired. | Existing non-PG coverage | [D011](#d011) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| FM-033 / L134 | cannot migrate a partially projected account with an unknown original balance | <code>—</code> | Partial Mongoose projection must not fabricate original balance for migration. | Retired mechanism | Not applicable — retired mechanism | No hydrated partial document or nullable-cent migration exists. Safe PostgreSQL mapping already rejects missing/coerced cents without defaults. |
| FM-034 / L141 | authoritative balances cannot be removed | <code>—</code> | Authoritative cents cannot be removed or nulled. | New replacement | [D170](#d170) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FM-035 / L157 | financial operator is rejected with or without a session: %p | <code>{ $inc: { balance: 1 } }</code> | Reject Mongo financial operators with/without ClientSession. | Retired mechanism | Not applicable — retired mechanism | No $inc/$mul/$unset/$rename/$min/$max/$setOnInsert or Mongo sessions remain. Fixed repository interfaces and generated mirrors are tested independently; do not create operator emulation. |
| FM-036 / L157 | financial operator is rejected with or without a session: %p | <code>{ $inc: { balanceCents: 100 } }</code> | Reject Mongo financial operators with/without ClientSession. | Retired mechanism | Not applicable — retired mechanism | No $inc/$mul/$unset/$rename/$min/$max/$setOnInsert or Mongo sessions remain. Fixed repository interfaces and generated mirrors are tested independently; do not create operator emulation. |
| FM-037 / L157 | financial operator is rejected with or without a session: %p | <code>{ $inc: { balance: 1, balanceCents: 100 } }</code> | Reject Mongo financial operators with/without ClientSession. | Retired mechanism | Not applicable — retired mechanism | No $inc/$mul/$unset/$rename/$min/$max/$setOnInsert or Mongo sessions remain. Fixed repository interfaces and generated mirrors are tested independently; do not create operator emulation. |
| FM-038 / L157 | financial operator is rejected with or without a session: %p | <code>{ $mul: { balance: 2 } }</code> | Reject Mongo financial operators with/without ClientSession. | Retired mechanism | Not applicable — retired mechanism | No $inc/$mul/$unset/$rename/$min/$max/$setOnInsert or Mongo sessions remain. Fixed repository interfaces and generated mirrors are tested independently; do not create operator emulation. |
| FM-039 / L157 | financial operator is rejected with or without a session: %p | <code>{ $unset: { balanceCents: 1 } }</code> | Reject Mongo financial operators with/without ClientSession. | Retired mechanism | Not applicable — retired mechanism | No $inc/$mul/$unset/$rename/$min/$max/$setOnInsert or Mongo sessions remain. Fixed repository interfaces and generated mirrors are tested independently; do not create operator emulation. |
| FM-040 / L157 | financial operator is rejected with or without a session: %p | <code>{ $unset: { balance: 1 } }</code> | Reject Mongo financial operators with/without ClientSession. | Retired mechanism | Not applicable — retired mechanism | No $inc/$mul/$unset/$rename/$min/$max/$setOnInsert or Mongo sessions remain. Fixed repository interfaces and generated mirrors are tested independently; do not create operator emulation. |
| FM-041 / L157 | financial operator is rejected with or without a session: %p | <code>{ $rename: { balance: &#x27;other&#x27; } }</code> | Reject Mongo financial operators with/without ClientSession. | Retired mechanism | Not applicable — retired mechanism | No $inc/$mul/$unset/$rename/$min/$max/$setOnInsert or Mongo sessions remain. Fixed repository interfaces and generated mirrors are tested independently; do not create operator emulation. |
| FM-042 / L157 | financial operator is rejected with or without a session: %p | <code>{ $rename: { other: &#x27;balanceCents&#x27; } }</code> | Reject Mongo financial operators with/without ClientSession. | Retired mechanism | Not applicable — retired mechanism | No $inc/$mul/$unset/$rename/$min/$max/$setOnInsert or Mongo sessions remain. Fixed repository interfaces and generated mirrors are tested independently; do not create operator emulation. |
| FM-043 / L157 | financial operator is rejected with or without a session: %p | <code>{ $min: { balance: 0 } }</code> | Reject Mongo financial operators with/without ClientSession. | Retired mechanism | Not applicable — retired mechanism | No $inc/$mul/$unset/$rename/$min/$max/$setOnInsert or Mongo sessions remain. Fixed repository interfaces and generated mirrors are tested independently; do not create operator emulation. |
| FM-044 / L157 | financial operator is rejected with or without a session: %p | <code>{ $max: { balanceCents: 100 } }</code> | Reject Mongo financial operators with/without ClientSession. | Retired mechanism | Not applicable — retired mechanism | No $inc/$mul/$unset/$rename/$min/$max/$setOnInsert or Mongo sessions remain. Fixed repository interfaces and generated mirrors are tested independently; do not create operator emulation. |
| FM-045 / L157 | financial operator is rejected with or without a session: %p | <code>{ $set: { &#x27;balanceCents.invalid&#x27;: 1 } }</code> | Reject Mongo financial operators with/without ClientSession. | Retired mechanism | Not applicable — retired mechanism | No $inc/$mul/$unset/$rename/$min/$max/$setOnInsert or Mongo sessions remain. Fixed repository interfaces and generated mirrors are tested independently; do not create operator emulation. |
| FM-046 / L157 | financial operator is rejected with or without a session: %p | <code>{ $setOnInsert: { balance: 0, balanceCents: 0 } }</code> | Reject Mongo financial operators with/without ClientSession. | Retired mechanism | Not applicable — retired mechanism | No $inc/$mul/$unset/$rename/$min/$max/$setOnInsert or Mongo sessions remain. Fixed repository interfaces and generated mirrors are tested independently; do not create operator emulation. |
| FM-047 / L164 | matching query pairs still require an active transaction | <code>—</code> | Financial update authority requires active private transaction scope. | Existing PG coverage | [D168](#d168)<br>[D171](#d171) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| FM-048 / L170 | query pair must be complete and exact: %p | <code>{ balance: 125 }</code> | Financial write validates complete authoritative intent and evidence. | New replacement | [D172](#d172) | Mongo pair-coercion syntax retires; retain application field/type validation, generated mirror protection and scoped CAS evidence instead. |
| FM-049 / L170 | query pair must be complete and exact: %p | <code>{ balanceCents: 12500 }</code> | Financial write validates complete authoritative intent and evidence. | New replacement | [D172](#d172) | Mongo pair-coercion syntax retires; retain application field/type validation, generated mirror protection and scoped CAS evidence instead. |
| FM-050 / L170 | query pair must be complete and exact: %p | <code>{ balance: 125, balanceCents: 12000 }</code> | Financial write validates complete authoritative intent and evidence. | New replacement | [D172](#d172) | Mongo pair-coercion syntax retires; retain application field/type validation, generated mirror protection and scoped CAS evidence instead. |
| FM-051 / L170 | query pair must be complete and exact: %p | <code>{ balance: 1.005, balanceCents: 100 }</code> | Financial write validates complete authoritative intent and evidence. | New replacement | [D172](#d172) | Mongo pair-coercion syntax retires; retain application field/type validation, generated mirror protection and scoped CAS evidence instead. |
| FM-052 / L170 | query pair must be complete and exact: %p | <code>{ balance: 125, balanceCents: &#x27;12500&#x27; }</code> | Financial write validates complete authoritative intent and evidence. | New replacement | [D172](#d172) | Mongo pair-coercion syntax retires; retain application field/type validation, generated mirror protection and scoped CAS evidence instead. |
| FM-053 / L174 | a valid query pair validates stored state in the same session: explicit $set = %p | <code>true</code> | Explicit versus implicit Mongo $set shares ClientSession. | Retired mechanism | Not applicable — retired mechanism | Mongo update syntax/session forwarding is not a PostgreSQL API. Scoped client/CAS behavior is independently covered by user-repository tests. |
| FM-054 / L174 | a valid query pair validates stored state in the same session: explicit $set = %p | <code>false</code> | Explicit versus implicit Mongo $set shares ClientSession. | Retired mechanism | Not applicable — retired mechanism | Mongo update syntax/session forwarding is not a PostgreSQL API. Scoped client/CAS behavior is independently covered by user-repository tests. |
| FM-055 / L181 | query migration cannot overwrite an invalid stored legacy balance: %p | <code>1.005</code> | Query migration rejects invalid stored legacy float. | Retired mechanism | Not applicable — retired mechanism | There is no query-driven lazy migration. Precision parsing/SQL generated mirrors remain separately covered. |
| FM-056 / L181 | query migration cannot overwrite an invalid stored legacy balance: %p | <code>0.1 + 0.2</code> | Query migration rejects invalid stored legacy float. | Retired mechanism | Not applicable — retired mechanism | There is no query-driven lazy migration. Precision parsing/SQL generated mirrors remain separately covered. |
| FM-057 / L186 | query migration rejects incomplete legacy data instead of supplying hydration defaults | <code>—</code> | Query hydration defaults cannot fill incomplete legacy documents. | Retired mechanism | Not applicable — retired mechanism | No Mongoose document hydration or missing-cents defaulting exists. Keep PostgreSQL mandatory cents and safe mapping checks. |
| FM-058 / L190 | query writes reject drift in an existing cents/mirror pair | <code>—</code> | Read evidence rejects an inconsistent authoritative mirror. | Existing non-PG coverage | [D011](#d011) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| FM-059 / L194 | query upserts, multi-account writes and untargeted financial writes are rejected | <code>—</code> | Reject Mongoose upsert/updateMany/untargeted financial APIs. | Retired mechanism | Not applicable — retired mechanism | These model APIs are removed. Repository scope binds one actor/owner and exposes no standalone balance setter; that authority remains independently covered. |
| FM-060 / L200 | ordinary nonfinancial query updates still work | <code>—</code> | Nonfinancial theme mutation remains functional and financially inert. | Existing PG coverage | [D173](#d173) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| FM-061 / L212 | valid adjustment without a source group has an exact replay result | <code>—</code> | Source-free adjustment has canonical USD replay result. | New replacement | [D174](#d174) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FM-062 / L219 | journal numeric field rejects coercion and unsafe values: %s | <code>&#x27;beforeCents&#x27;</code> | Financial journal numeric intent rejects coercion/unsafe values. | New replacement | [D175](#d175) | Generated delta has no public setter; reject invalid before/after inputs at trusted application boundaries and protect generated SQL columns. |
| FM-063 / L219 | journal numeric field rejects coercion and unsafe values: %s | <code>&#x27;afterCents&#x27;</code> | Financial journal numeric intent rejects coercion/unsafe values. | New replacement | [D175](#d175) | Generated delta has no public setter; reject invalid before/after inputs at trusted application boundaries and protect generated SQL columns. |
| FM-064 / L219 | journal numeric field rejects coercion and unsafe values: %s | <code>&#x27;deltaCents&#x27;</code> | Financial journal numeric intent rejects coercion/unsafe values. | New replacement | [D175](#d175) | Generated delta has no public setter; reject invalid before/after inputs at trusted application boundaries and protect generated SQL columns. |
| FM-065 / L224 | signed deltas are exact, cannot overflow and must agree with before/after | <code>—</code> | Signed generated deltas exactly match before/after and safe bounds. | New replacement | [D176](#d176)<br>[D177](#d177) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FM-066 / L229 | keys/hashes reject whitespace, coercion and malformed values: %s | <code>&#x27;idempotencyKey&#x27;</code> | Journal keys/hash evidence reject malformed values and coercion. | New replacement | [D178](#d178) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FM-067 / L229 | keys/hashes reject whitespace, coercion and malformed values: %s | <code>&#x27;payloadHash&#x27;</code> | Journal keys/hash evidence reject malformed values and coercion. | New replacement | [D178](#d178) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FM-068 / L234 | source group is all-or-none for adjustments | <code>—</code> | Adjustment source group is complete or absent. | New replacement | [D179](#d179) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FM-069 / L240 | source-backed effects cannot bypass the deduplication index by omitting source fields | <code>—</code> | Source-backed financial effects require source identity. | New replacement | [D180](#d180) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FM-070 / L243 | source/effect/type relationships and debit signs are validated | <code>—</code> | Type/source/effect and debit direction must agree. | New replacement | [D181](#d181) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FM-071 / L250 | migration records preserve value and identify the actual target user | <code>—</code> | Migration-shaped SQL audit evidence preserves value and actual target. | New replacement | [D182](#d182) | The SQL schema retains a balance_migration evidence contract; test its constraints without inventing a lazy runtime migration API. |
| FM-072 / L255 | replay result must agree with afterCents and exact formatting | <code>—</code> | Replay balance/delta evidence derives canonically from after cents. | New replacement | [D183](#d183) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FM-073 / L260 | unknown journal/result fields are rejected instead of becoming unbounded metadata | <code>—</code> | Unknown journal/result metadata cannot bypass fixed contracts. | New replacement | [D184](#d184) | Mongoose StrictModeError retires; use fixed JavaScript contracts/generated SQL evidence, not arbitrary metadata fields. |
| FM-074 / L264 | inserts require an active transaction | <code>—</code> | Journal inserts occur only through coordinator-owned transaction. | Existing PG coverage | [D013](#d013)<br>[D185](#d185) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| FM-075 / L268 | journal validation cannot be disabled at save time | <code>—</code> | Mongoose save validation flag cannot disable journal validation. | Retired mechanism | Not applicable — retired mechanism | There is no model save/validateBeforeSave API. SQL malformed-evidence cases are retained above without pretending the middleware still exists. |
| FM-076 / L274 | a valid journal insert forwards the transaction session | <code>—</code> | Financial journal shares scoped transaction; later mutation is append-only. | Existing PG coverage | [D013](#d013)<br>[D186](#d186) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| FM-077 / L282 | all Mongoose journal mutation/bulk APIs are blocked | <code>—</code> | Financial journal cannot update/delete/truncate. | New replacement | [D187](#d187) | Mongoose bulk/replace/hydrate.deleteOne syntax retires; preserve real SQL append-only protection and narrow APIs. |
| FM-078 / L297 | unique, partial and history indexes are declared without automatic index creation or TTL | <code>—</code> | Real financial key/source/history indexes preserve durable evidence. | New replacement | [D001](#d001) | autoCreate/autoIndex and Mongo TTL declarations retire; verify SQL schema/behavior rather than ODM declarations. |

### financial-service.test.js

Source: `backend/tests/financial-service.test.js` at `7439b8d`; SHA256 `0a402db7cb58b611ea49407189acd1863afdd67dd90908e0b647492f8804050a`.

| Case ID / source line | Original test title template | Exact parameter expression | Business requirement | Disposition | Exact destination via index | Rationale |
|---|---|---|---|---|---|---|
| FS-001 / L95 | exports only the approved API and no callback/notification API | <code>—</code> | Only approved coordinator operation/construction API is exposed. | Existing non-PG coverage | [D188](#d188) | Deleted financialService export names retire; the narrow coordinator API is the supported replacement. |
| FS-002 / L98 | uninitialized service refuses financial writes | <code>—</code> | Unready PostgreSQL server refuses requests/listening. | Existing PG coverage | [D189](#d189)<br>[D190](#d190) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| FS-003 / L104 | prepares named indexes and writes, reads, aborts and verifies only a private probe | <code>—</code> | Install Mongo indexes and private write/read/abort/absence probe. | Retired mechanism | Not applicable — retired mechanism | Startup does not create Mongo collections or run replica-set probes. Runtime SQL verification has its own metadata-only/readiness tests. |
| FS-004 / L119 | shares initialization in flight and allows readiness to await it | <code>—</code> | Share singleton Mongo initialization promise/readiness wait. | Retired mechanism | Not applicable — retired mechanism | The financialService initialization singleton is removed; do not recreate a Mongo readiness cache inside PostgreSQL. |
| FS-005 / L124 | rejects unsupported topology/session support: %p | <code>{ logicalSessionTimeoutMinutes: 30, maxWireVersion: 25 }</code> | Reject unsupported Mongo topology/session support. | Retired mechanism | Not applicable — retired mechanism | No Mongo server/topology/session support is inspected. |
| FS-006 / L124 | rejects unsupported topology/session support: %p | <code>{ setName: &#x27;tests&#x27;, maxWireVersion: 25 }</code> | Reject unsupported Mongo topology/session support. | Retired mechanism | Not applicable — retired mechanism | No Mongo server/topology/session support is inspected. |
| FS-007 / L124 | rejects unsupported topology/session support: %p | <code>{ setName: &#x27;tests&#x27;, logicalSessionTimeoutMinutes: 30, maxWireVersion: 6 }</code> | Reject unsupported Mongo topology/session support. | Retired mechanism | Not applicable — retired mechanism | No Mongo server/topology/session support is inspected. |
| FS-008 / L124 | rejects unsupported topology/session support: %p | <code>{ msg: &#x27;isdbgrid&#x27;, logicalSessionTimeoutMinutes: 30, maxWireVersion: 7 }</code> | Reject unsupported Mongo topology/session support. | Retired mechanism | Not applicable — retired mechanism | No Mongo server/topology/session support is inspected. |
| FS-009 / L135 | accepts supported mongos only after the probe passes | <code>—</code> | Permit supported mongos after probe. | Retired mechanism | Not applicable — retired mechanism | No mongos runtime or sharding discovery path exists. |
| FS-010 / L140 | rejects the actual probe write failure even when hello looks supported | <code>—</code> | Supported-looking hello cannot override failing transaction probe. | Retired mechanism | Not applicable — retired mechanism | Mongo probe machinery is removed; PostgreSQL transaction/readiness failures are independently checked. |
| FS-011 / L147 | fails closed when an aborted probe is visible outside its transaction | <code>—</code> | Aborted private Mongo probe must be absent. | Retired mechanism | Not applicable — retired mechanism | No probe collection is created; retain business transaction rollback cases separately. |
| FS-012 / L152 | fails closed if the probe abort fails | <code>—</code> | Mongo probe abort failure must refuse readiness. | Retired mechanism | Not applicable — retired mechanism | ClientSession abort/probe mechanics do not convert to PostgreSQL startup. |
| FS-013 / L161 | rejects an invalid installed index: %s | <code>&#x27;missing&#x27;</code> | Invalid journal uniqueness/source schema must fail closed. | New replacement | [D191](#d191) | Wrong-key/partial/collation/TTL Mongo definitions translate only where SQL semantics exist; extra SQL index or missing guard must be evaluated under current verifier policy, not repaired. |
| FS-014 / L161 | rejects an invalid installed index: %s | <code>&#x27;notUnique&#x27;</code> | Invalid journal uniqueness/source schema must fail closed. | New replacement | [D191](#d191) | Wrong-key/partial/collation/TTL Mongo definitions translate only where SQL semantics exist; extra SQL index or missing guard must be evaluated under current verifier policy, not repaired. |
| FS-015 / L161 | rejects an invalid installed index: %s | <code>&#x27;wrongPartial&#x27;</code> | Invalid journal uniqueness/source schema must fail closed. | New replacement | [D191](#d191) | Wrong-key/partial/collation/TTL Mongo definitions translate only where SQL semantics exist; extra SQL index or missing guard must be evaluated under current verifier policy, not repaired. |
| FS-016 / L161 | rejects an invalid installed index: %s | <code>&#x27;wrongCollation&#x27;</code> | Mongo collation/TTL index rejection: 'wrongCollation' | Retired mechanism | Not applicable — retired mechanism | Mongo index options have no PostgreSQL TTL/ODM analogue. Durable replay retention and SQL key comparison/index predicates remain separately mapped; do not fabricate a SQL TTL index. |
| FS-017 / L161 | rejects an invalid installed index: %s | <code>&#x27;wrongKeyOrder&#x27;</code> | Invalid journal uniqueness/source schema must fail closed. | New replacement | [D191](#d191) | Wrong-key/partial/collation/TTL Mongo definitions translate only where SQL semantics exist; extra SQL index or missing guard must be evaluated under current verifier policy, not repaired. |
| FS-018 / L161 | rejects an invalid installed index: %s | <code>&#x27;ttl&#x27;</code> | Mongo collation/TTL index rejection: 'ttl' | Retired mechanism | Not applicable — retired mechanism | Mongo index options have no PostgreSQL TTL/ODM analogue. Durable replay retention and SQL key comparison/index predicates remain separately mapped; do not fabricate a SQL TTL index. |
| FS-019 / L161 | rejects an invalid installed index: %s | <code>&#x27;extraTtl&#x27;</code> | Mongo collation/TTL index rejection: 'extraTtl' | Retired mechanism | Not applicable — retired mechanism | Mongo index options have no PostgreSQL TTL/ODM analogue. Durable replay retention and SQL key comparison/index predicates remain separately mapped; do not fabricate a SQL TTL index. |
| FS-020 / L172 | rejects invalid Payment decision/replay index: %s | <code>&#x27;missing&#x27;</code> | Invalid payment decision schema must fail closed. | New replacement | [D192](#d192) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FS-021 / L172 | rejects invalid Payment decision/replay index: %s | <code>&#x27;notUnique&#x27;</code> | Invalid payment decision schema must fail closed. | New replacement | [D192](#d192) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FS-022 / L172 | rejects invalid Payment decision/replay index: %s | <code>&#x27;wrongPartial&#x27;</code> | Invalid payment decision schema must fail closed. | New replacement | [D192](#d192) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FS-023 / L172 | rejects invalid Payment decision/replay index: %s | <code>&#x27;wrongCollation&#x27;</code> | Mongo collation/TTL index rejection: 'wrongCollation' | Retired mechanism | Not applicable — retired mechanism | Mongo index options have no PostgreSQL TTL/ODM analogue. Durable replay retention and SQL key comparison/index predicates remain separately mapped; do not fabricate a SQL TTL index. |
| FS-024 / L172 | rejects invalid Payment decision/replay index: %s | <code>&#x27;ttl&#x27;</code> | Mongo collation/TTL index rejection: 'ttl' | Retired mechanism | Not applicable — retired mechanism | Mongo index options have no PostgreSQL TTL/ODM analogue. Durable replay retention and SQL key comparison/index predicates remain separately mapped; do not fabricate a SQL TTL index. |
| FS-025 / L172 | rejects invalid Payment decision/replay index: %s | <code>&#x27;extraTtl&#x27;</code> | Mongo collation/TTL index rejection: 'extraTtl' | Retired mechanism | Not applicable — retired mechanism | Mongo index options have no PostgreSQL TTL/ODM analogue. Durable replay retention and SQL key comparison/index predicates remain separately mapped; do not fabricate a SQL TTL index. |
| FS-026 / L184 | rejects invalid Order purchase/replay index: %s | <code>&#x27;missing&#x27;</code> | Invalid order replay schema must fail closed. | New replacement | [D193](#d193) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FS-027 / L184 | rejects invalid Order purchase/replay index: %s | <code>&#x27;notUnique&#x27;</code> | Invalid order replay schema must fail closed. | New replacement | [D193](#d193) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FS-028 / L184 | rejects invalid Order purchase/replay index: %s | <code>&#x27;wrongPartial&#x27;</code> | Invalid order replay schema must fail closed. | New replacement | [D193](#d193) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FS-029 / L184 | rejects invalid Order purchase/replay index: %s | <code>&#x27;wrongCollation&#x27;</code> | Mongo collation/TTL index rejection: 'wrongCollation' | Retired mechanism | Not applicable — retired mechanism | Mongo index options have no PostgreSQL TTL/ODM analogue. Durable replay retention and SQL key comparison/index predicates remain separately mapped; do not fabricate a SQL TTL index. |
| FS-030 / L184 | rejects invalid Order purchase/replay index: %s | <code>&#x27;wrongKeyOrder&#x27;</code> | Invalid order replay schema must fail closed. | New replacement | [D193](#d193) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FS-031 / L184 | rejects invalid Order purchase/replay index: %s | <code>&#x27;ttl&#x27;</code> | Mongo collation/TTL index rejection: 'ttl' | Retired mechanism | Not applicable — retired mechanism | Mongo index options have no PostgreSQL TTL/ODM analogue. Durable replay retention and SQL key comparison/index predicates remain separately mapped; do not fabricate a SQL TTL index. |
| FS-032 / L184 | rejects invalid Order purchase/replay index: %s | <code>&#x27;extraTtl&#x27;</code> | Mongo collation/TTL index rejection: 'extraTtl' | Retired mechanism | Not applicable — retired mechanism | Mongo index options have no PostgreSQL TTL/ODM analogue. Durable replay retention and SQL key comparison/index predicates remain separately mapped; do not fabricate a SQL TTL index. |
| FS-033 / L197 | an index build error is sanitized and is never repaired destructively | <code>—</code> | Mongo index build errors must not trigger destructive repair. | Retired mechanism | Not applicable — retired mechanism | PostgreSQL runtime startup verifies already-applied migrations and never builds/repairs Mongo indexes. SQL incompatible-schema startup is retained separately. |
| FS-034 / L204 | a client change during the probe cannot mark the new connection ready | <code>—</code> | Mongo client generation changes during probe. | Retired mechanism | Not applicable — retired mechanism | The removed singleton connection/probe cannot mark a replacement Mongo client ready. |
| FS-035 / L208 | disconnect/reconnect requires fresh initialization | <code>—</code> | Mongo disconnect/reconnect readiness cache. | Retired mechanism | Not applicable — retired mechanism | No Mongo connection generation cache remains; current PostgreSQL bootstrap/pool semantics are separately covered. |
| FS-036 / L216 | rejects malformed/unknown input before starting a session: %p | <code>{ expectedBalance: undefined }</code> | All legacy malformed/unknown financial inputs reject before acquisition. | New replacement | [D194](#d194) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FS-037 / L216 | rejects malformed/unknown input before starting a session: %p | <code>{ balance: &#x27;1.005&#x27; }</code> | All legacy malformed/unknown financial inputs reject before acquisition. | New replacement | [D194](#d194) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FS-038 / L216 | rejects malformed/unknown input before starting a session: %p | <code>{ balance: -1 }</code> | All legacy malformed/unknown financial inputs reject before acquisition. | New replacement | [D194](#d194) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FS-039 / L216 | rejects malformed/unknown input before starting a session: %p | <code>{ balance: true }</code> | All legacy malformed/unknown financial inputs reject before acquisition. | New replacement | [D194](#d194) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FS-040 / L216 | rejects malformed/unknown input before starting a session: %p | <code>{ actorId: &#x27;not-an-id&#x27; }</code> | All legacy malformed/unknown financial inputs reject before acquisition. | New replacement | [D194](#d194) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FS-041 / L216 | rejects malformed/unknown input before starting a session: %p | <code>{ userId: { $ne: null } }</code> | All legacy malformed/unknown financial inputs reject before acquisition. | New replacement | [D194](#d194) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FS-042 / L216 | rejects malformed/unknown input before starting a session: %p | <code>{ idempotencyKey: &#x27;x\n&#x27; }</code> | All legacy malformed/unknown financial inputs reject before acquisition. | New replacement | [D194](#d194) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FS-043 / L216 | rejects malformed/unknown input before starting a session: %p | <code>{ idempotencyKey: &#x27;&#x27; }</code> | All legacy malformed/unknown financial inputs reject before acquisition. | New replacement | [D194](#d194) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FS-044 / L216 | rejects malformed/unknown input before starting a session: %p | <code>{ reason: &#x27;   &#x27; }</code> | All legacy malformed/unknown financial inputs reject before acquisition. | New replacement | [D194](#d194) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FS-045 / L216 | rejects malformed/unknown input before starting a session: %p | <code>{ reason: &#x27;x&#x27;.repeat(501) }</code> | All legacy malformed/unknown financial inputs reject before acquisition. | New replacement | [D194](#d194) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FS-046 / L216 | rejects malformed/unknown input before starting a session: %p | <code>{ role: &#x27;admin&#x27; }</code> | All legacy malformed/unknown financial inputs reject before acquisition. | New replacement | [D194](#d194) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FS-047 / L226 | rejects an unrepresentable numeric mirror | <code>—</code> | Numeric compatibility failure rejects before cents mutation. | Existing non-PG coverage | [D167](#d167) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| FS-048 / L231 | requires a currently active database administrator: %p | <code>null</code> | Missing/nonadmin/inactive authority cannot adjust. | New replacement | [D195](#d195) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FS-049 / L231 | requires a currently active database administrator: %p | <code>{ role: &#x27;user&#x27;, accountStatus: &#x27;active&#x27; }</code> | Missing/nonadmin/inactive authority cannot adjust. | New replacement | [D195](#d195) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FS-050 / L231 | requires a currently active database administrator: %p | <code>{ role: &#x27;admin&#x27;, accountStatus: &#x27;suspended&#x27; }</code> | Missing/nonadmin/inactive authority cannot adjust. | New replacement | [D195](#d195) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FS-051 / L236 | stale expected balance rejects with no money or journal write | <code>—</code> | Stale expected balance leaves account money, mirror, version and journal unchanged. | New replacement | [D016](#d016) | The rollback-scope PG case already rejects EXPECTED_BALANCE_MISMATCH and checks cents/journal. Reserve a full unchanged-account snapshot as explicit complete evidence, rather than citing an adjustment success. |
| FS-052 / L243 | sets a complete pair with original-value predicates and uses the same session for the journal | <code>—</code> | Scoped transaction writes authoritative cents, CAS and journal together. | Existing PG coverage | [D013](#d013)<br>[D169](#d169) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| FS-053 / L257 | replays the original result before comparing a later balance | <code>—</code> | Adjustment replay precedes changed current balance and preserves historical result. | New replacement | [D014](#d014)<br>[D015](#d015) | Current PG replay coverage changes target eligibility, not its money. The unit test proves historical fixture replay; the two-committed-adjustment PG sequence is still a reserved replacement. |
| FS-054 / L266 | same key with a changed canonical payload conflicts: %p | <code>{ balance: &#x27;126&#x27; }</code> | Changed canonical adjustment balance/expected balance/reason conflicts. | New replacement | [D017](#d017) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FS-055 / L266 | same key with a changed canonical payload conflicts: %p | <code>{ expectedBalance: &#x27;99&#x27; }</code> | Changed canonical adjustment balance/expected balance/reason conflicts. | New replacement | [D017](#d017) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FS-056 / L266 | same key with a changed canonical payload conflicts: %p | <code>{ reason: &#x27;Different reason&#x27; }</code> | Changed canonical adjustment balance/expected balance/reason conflicts. | New replacement | [D017](#d017) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FS-057 / L271 | resolves E11000 only after the failed transaction session ends | <code>—</code> | Recognized unique conflict resolves only after rollback/clean transaction. | Existing PG coverage | [D020](#d020) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| FS-058 / L285 | an unrelated duplicate index is not treated as an idempotency replay | <code>—</code> | Unrecognized unique constraint is never idempotency success. | Existing non-PG coverage | [D196](#d196) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| FS-059 / L291 | uncertain commit without a verifiable journal returns 503 and requires the same key | <code>—</code> | Unknown COMMIT cannot be retried as replacement mutation. | Existing PG coverage | [D029](#d029) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| FS-060 / L307 | uncertain commit with a verifiable journal resolves to its committed result | <code>—</code> | Lost actual COMMIT acknowledgement resolves original durable receipt. | Existing PG coverage | [D030](#d030) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |
| FS-061 / L320 | authorization is revalidated on a retry, without reusing an aborted result | <code>—</code> | Retry must reauthorize rather than reuse an aborted result. | New replacement | [D197](#d197) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FS-062 / L333 | an unavailable journal lookup cannot turn an uncertain commit into a definite failure or replacement write | <code>—</code> | Recovery-read outage preserves uncertainty without fallback mutation. | New replacement | [D198](#d198) | Exact legacy variant or compound requirement is not credited as covered merely by a nearby case; implement the cited regression before closing this obligation. |
| FS-063 / L349 | readiness invalidation before commit aborts the callback instead of returning its pending outcome | <code>—</code> | Authority/readiness failure before COMMIT rolls back mutation. | New replacement | [D199](#d199) | Mongo readiness token mechanics retire; scoped PostgreSQL authority/infrastructure fail-closed obligation remains. |
| FS-064 / L359 | session cleanup failure does not erase a confirmed commit | <code>—</code> | Cleanup failure cannot erase confirmed financial commit. | Existing non-PG coverage | [D200](#d200) | Portable requirement is exercised by the cited surviving cases; historical model/route plumbing is not retained. |

### payment-notifications.test.js

Source: `backend/tests/payment-notifications.test.js` at `7439b8d`; SHA256 `456505f460394c28e90051fc5825f5f0b1c9db11676b9f8e25bddd3f16931e56`.

| Case ID / source line | Original test title template | Exact parameter expression | Business requirement | Disposition | Exact destination via index | Rationale |
|---|---|---|---|---|---|---|
| PN-001 / L32 | direct %s dispatch is a no-op and cannot enqueue | <code>&#x27;newPayment&#x27;</code> | Payment notification types always return disabled without dispatch/queue. | Changed disabled contract | [D201](#d201) | C3.1 disables this entry point. Assert its current unavailable response and lack of side effects, not the retired successful behavior. |
| PN-002 / L32 | direct %s dispatch is a no-op and cannot enqueue | <code>&#x27;paymentAccepted&#x27;</code> | Payment notification types always return disabled without dispatch/queue. | Changed disabled contract | [D201](#d201) | C3.1 disables this entry point. Assert its current unavailable response and lack of side effects, not the retired successful behavior. |
| PN-003 / L32 | direct %s dispatch is a no-op and cannot enqueue | <code>&#x27;paymentRejected&#x27;</code> | Payment notification types always return disabled without dispatch/queue. | Changed disabled contract | [D201](#d201) | C3.1 disables this entry point. Assert its current unavailable response and lack of side effects, not the retired successful behavior. |
| PN-004 / L32 | direct %s dispatch is a no-op and cannot enqueue | <code>&#x27;paymentStatus&#x27;</code> | Payment notification types always return disabled without dispatch/queue. | Changed disabled contract | [D201](#d201) | C3.1 disables this entry point. Assert its current unavailable response and lack of side effects, not the retired successful behavior. |
| PN-005 / L32 | direct %s dispatch is a no-op and cannot enqueue | <code>&#x27;PAYMENT&#x27;</code> | Payment notification types always return disabled without dispatch/queue. | Changed disabled contract | [D201](#d201) | C3.1 disables this entry point. Assert its current unavailable response and lack of side effects, not the retired successful behavior. |
| PN-006 / L38 | paymentId payload is blocked even under an unrelated type | <code>—</code> | Embedded paymentId cannot bypass disabled dispatch. | Changed disabled contract | [D202](#d202) | C3.1 disables this entry point. Assert its current unavailable response and lack of side effects, not the retired successful behavior. |
| PN-007 / L42 | client-asserted administrator authentication cannot query or dispatch pending payments | <code>—</code> | Client administrator assertion cannot activate listeners or queries. | Changed disabled contract | [D203](#d203) | C3.1 disables this entry point. Assert its current unavailable response and lack of side effects, not the retired successful behavior. |
| PN-008 / L47 | client-asserted user cannot replay queued %s payment payloads | <code>&#x27;newPayment&#x27;</code> | Old queued payment variants cannot replay or mutate queue. | Changed disabled contract | [D204](#d204) | C3.1 disables this entry point. Assert its current unavailable response and lack of side effects, not the retired successful behavior. |
| PN-009 / L47 | client-asserted user cannot replay queued %s payment payloads | <code>&#x27;paymentAccepted&#x27;</code> | Old queued payment variants cannot replay or mutate queue. | Changed disabled contract | [D204](#d204) | C3.1 disables this entry point. Assert its current unavailable response and lack of side effects, not the retired successful behavior. |
| PN-010 / L47 | client-asserted user cannot replay queued %s payment payloads | <code>&#x27;paymentRejected&#x27;</code> | Old queued payment variants cannot replay or mutate queue. | Changed disabled contract | [D204](#d204) | C3.1 disables this entry point. Assert its current unavailable response and lack of side effects, not the retired successful behavior. |
| PN-011 / L47 | client-asserted user cannot replay queued %s payment payloads | <code>&#x27;paymentStatus&#x27;</code> | Old queued payment variants cannot replay or mutate queue. | Changed disabled contract | [D204](#d204) | C3.1 disables this entry point. Assert its current unavailable response and lack of side effects, not the retired successful behavior. |
| PN-012 / L55 | queue filtering checks both stored type and embedded paymentId | <code>—</code> | No stored or embedded payment payload is read/queued/dispatched. | Changed disabled contract | [D205](#d205) | The old $nor queue filter implementation retires; no database query or queue replay occurs at all. |
| PN-013 / L61 | markNotificationSent Payment is a no-op | <code>—</code> | Payment notification-state writes stay disabled. | Changed disabled contract | [D206](#d206) | C3.1 disables this entry point. Assert its current unavailable response and lack of side effects, not the retired successful behavior. |
| PN-014 / L65 | direct %s dispatch cannot send or enqueue | <code>&#x27;newOrder&#x27;</code> | Order notification types always return disabled without dispatch/queue. | Changed disabled contract | [D207](#d207) | C3.1 disables this entry point. Assert its current unavailable response and lack of side effects, not the retired successful behavior. |
| PN-015 / L65 | direct %s dispatch cannot send or enqueue | <code>&#x27;orderAccepted&#x27;</code> | Order notification types always return disabled without dispatch/queue. | Changed disabled contract | [D207](#d207) | C3.1 disables this entry point. Assert its current unavailable response and lack of side effects, not the retired successful behavior. |
| PN-016 / L65 | direct %s dispatch cannot send or enqueue | <code>&#x27;orderRejected&#x27;</code> | Order notification types always return disabled without dispatch/queue. | Changed disabled contract | [D207](#d207) | C3.1 disables this entry point. Assert its current unavailable response and lack of side effects, not the retired successful behavior. |
| PN-017 / L65 | direct %s dispatch cannot send or enqueue | <code>&#x27;orderStatus&#x27;</code> | Order notification types always return disabled without dispatch/queue. | Changed disabled contract | [D207](#d207) | C3.1 disables this entry point. Assert its current unavailable response and lack of side effects, not the retired successful behavior. |
| PN-018 / L65 | direct %s dispatch cannot send or enqueue | <code>&#x27;ORDER&#x27;</code> | Order notification types always return disabled without dispatch/queue. | Changed disabled contract | [D207](#d207) | C3.1 disables this entry point. Assert its current unavailable response and lack of side effects, not the retired successful behavior. |
| PN-019 / L69 | client-asserted %s cannot query Orders | <code>&#x27;admin&#x27;</code> | Client role assertion cannot activate order listeners or queries. | Changed disabled contract | [D208](#d208) | C3.1 disables this entry point. Assert its current unavailable response and lack of side effects, not the retired successful behavior. |
| PN-020 / L69 | client-asserted %s cannot query Orders | <code>&#x27;user&#x27;</code> | Client role assertion cannot activate order listeners or queries. | Changed disabled contract | [D208](#d208) | C3.1 disables this entry point. Assert its current unavailable response and lack of side effects, not the retired successful behavior. |
| PN-021 / L73 | old queued order payloads and identifiers are suppressed without writes | <code>—</code> | Old queued order variants cannot replay or mutate queue. | Changed disabled contract | [D209](#d209) | C3.1 disables this entry point. Assert its current unavailable response and lack of side effects, not the retired successful behavior. |
| PN-022 / L79 | Order notification-state writes are disabled | <code>—</code> | Order notification-state writes stay disabled. | Changed disabled contract | [D210](#d210) | C3.1 disables this entry point. Assert its current unavailable response and lack of side effects, not the retired successful behavior. |
| PN-023 / L82 | nonfinancial notice dispatch is preserved | <code>—</code> | Nonfinancial notices are unavailable as well. | Changed disabled contract | [D211](#d211) | C3.1 disabled all notification dispatch. Preserving historical nonfinancial sends would reactivate a retired feature. |

### nodemailer.test.js

Source: `backend/tests/nodemailer.test.js` at `7439b8d`; SHA256 `e274ce163db8be1243c5826c852f9c09c2bfe75272de71abe61ed0de39c3b221`.

| Case ID / source line | Original test title template | Exact parameter expression | Business requirement | Disposition | Exact destination via index | Rationale |
|---|---|---|---|---|---|---|
| SMTP-001 / L48 | the existing Gmail service configuration still selects authenticated TLS on port 465 | <code>—</code> | Real Gmail service mapping remains authenticated TLS port 465. | Existing non-PG coverage | [D212](#d212) | Independent dependency/configuration coverage is retained unchanged; this is not application 2FA email activation. |
| SMTP-002 / L54 | verify uses the real SMTP authentication handshake | <code>—</code> | Real owned SMTP verify performs authentication without delivery. | Existing non-PG coverage | [D213](#d213) | Independent local SMTP coverage remains; no application database is involved. |
| SMTP-003 / L55 | sendMail delivers bounded HTML/text/attachment MIME over the local SMTP transport | <code>—</code> | Local real SMTP delivers bounded HTML/text/attachment MIME. | Existing non-PG coverage | [D214](#d214) | Retain independent dependency transport coverage; no provider/Gmail network request. |
| SMTP-004 / L64 | SMTP authentication rejection is a safe rejected promise, not a successful send | <code>—</code> | SMTP authentication rejection remains a failed promise, not success. | Existing non-PG coverage | [D215](#d215) | Retain independent dependency error semantics. |
| SMTP-005 / L69 | required TLS cannot silently downgrade to an unencrypted server | <code>—</code> | Required SMTP TLS cannot silently downgrade. | Existing non-PG coverage | [D216](#d216) | Retain independent local transport TLS behavior. |
| SMTP-006 / L73 | the current email controller works with the new real Nodemailer API | <code>—</code> | Legacy email controller returns 503 without generating secrets, writing or mailing. | Changed disabled contract | [D217](#d217) | Remove deleted User/SecurityLog imports only in its approved future phase; the five transport tests remain intact. |

## C3.2a verification record

- Static inventory: **255 registrations, 524 expanded cases, 223 exact destination entries**; no unresolved parameter tables. All existing destination titles resolve uniquely to source; every row has a disposition and required destination or explicit retirement rationale. All ten source SHA256 values match checkpoint `7439b8d`; all 524 IDs are unique and all destination anchors resolve.
- Assertion review: success-only adjustment cases are not credited for stale-balance rejection or historical replay. Explicit full-account rejection snapshots, two-committed-adjustment replay, after-write rollback, final inactive refund status, cancellation after completion, target-only password revocation, and missing-CSRF checks on theme/avatar removal remain reserved where the cited assertions do not demonstrate the complete requirement. Related existing coverage is identified as support, not completion.
- Runtime/test syntax checks: **not run**, as requested. No runtime or surviving JavaScript file was edited.
- PG-only verification on **2026-10-30**: `bash backend/tests/run-disposable-pg.sh backend/tests/*.pg.test.js` — **PASS: 7/7 suites, 690/690 tests, 0 snapshots, 105.691 s**. The harness committed all five migrations against its disposable verified-TLS PostgreSQL 18 database; no silent skip or Mongo fallback.
- Protected-file verification: exactly **seven approved deletions plus this new ledger**, no staged changes, and every other tracked file matches HEAD. The six future-conversion suites, seven PG suites, runtime, package files and migrations remain unchanged. `helpers/disposablePg.js` and `helpers/authCredentialCases.js` also match HEAD byte-for-byte. `git diff --check` passes.
- New/disabled replacement execution and full-suite verification: deferred to the individually approved later C3.2 phases, never represented as C3.2a results. The 15 existing non-PG obligations were **not run** here. Five are unchanged Nodemailer transport cases whose suite still has obsolete top-level model imports; source-present coverage is not a claim that this untouched suite currently loads.

### Deleted files

Paths relative to `backend/tests/`:

- `financial-models.mongo.test.js`
- `financial-service.mongo.test.js`
- `orders.mongo.test.js`
- `payments.mongo.test.js`
- `helpers/legacyOrdersRoutes.js`
- `helpers/legacyPaymentsRoutes.js`
- `helpers/mongoServer.js`

### Remaining importer findings

The scan of `backend/tests/` found **no executable importers of the seven C3.2a-deleted files**. The following consumers prevent deleting the other three requested helpers:

| Untouched consumer | Retained helper imports |
|---|---|
| `avatar-upload.test.js` | L6 `jest.requireActual('./helpers/legacyMongoAuth')`; L7 `jest.requireActual('./helpers/legacyCsrf')`; L46 `require('./helpers/legacyUsersRoutes')` |
| `users-admin-authorization.test.js` | L4 `jest.requireActual('./helpers/legacyMongoAuth')`; L5 `jest.requireActual('./helpers/legacyCsrf')`; L29 `require('./helpers/legacyUsersRoutes')` |

Additional expected references to C3.1-deleted models/service or removed Mongoose remain in the untouched conversion files. These are reported, not repaired or bypassed:

| Remaining file | Executable import/mock locations and targets |
|---|---|
| `avatar-upload.test.js` | L38 Mongoose; L40 `models/User`; L41 `models/RevokedToken` |
| `users-admin-authorization.test.js` | L20 `models/User`; L21 `models/RevokedToken`; L22 Mongoose |
| `financial-models.test.js` | L1 Mongoose; L2 `models/User`; L3 `models/FinancialOperation` |
| `financial-service.test.js` | L3 Mongoose; L4–7 `models/User`, `FinancialOperation`, `Payment`, `Order`; L8 `services/financialService` |
| `payment-notifications.test.js` | L3–5 mocks for `models/Order`, `Payment`, `PendingNotification`; L7–9 corresponding imports |
| `nodemailer.test.js` | L5 `models/User`; L6 `routes/SecurityLog` |
| `helpers/legacyMongoAuth.js` | L5 `models/User`; L6 `models/RevokedToken` |
| `helpers/legacyUsersRoutes.js` | L11 `models/User` |

`financial-http.pg.test.js:140` and `users-server.pg.test.js:85` contain negative `require.cache` path assertions, **not imports**. Ledger/source-name references and the historical documentation mention are not executable importers. All of these files remain untouched. C3.2b has not begun.

## C3.2b1 — avatar completion

Source checkpoint: `09b8142` (approved C3.2a). This section supersedes the avatar-specific pending status of **D118–D129** and the old avatar importer findings above; all other C3.2a accounting remains historical and unchanged. C3.2b2 has not begun.

### Implemented allocation

`backend/tests/avatar-upload.pg.test.js` contains **45 expanded Jest cases across 15 registrations**, with the approved exact split:

| Group | Cases | Registration/source lines |
|---|---:|---|
| Success/MIME policy | 7 | L205–218: six allowed MIME cases plus a real large-image provider transformation |
| Auth/ownership/CSRF/CAS | 9 | L223–241: anonymous, ordinary/admin cross-user, missing/wrong CSRF, missing/noncanonical/stale CAS, invalid UUID |
| Invalid multipart/MIME | 11 | L247–269: three denied MIME cases, seven invalid multipart cases, malformed boundary |
| Provider failures/evidence | 11 | L274–292: four transport failures and seven exact legacy evidence contradictions |
| Cleanup/races/timeout/unknown outcome | 7 | L297–404: duplicate callbacks, known rollback, changed authority, CAS race, interruption, timeout, unknown COMMIT |
| **Total** | **45** | **No skipped or focused tests** |

Line numbers refer to the new suite. Exact title templates and variants below provide the authoritative destinations; group ranges are navigation aids.

### Complete avatar obligation closure

All **37 original avatar obligations (AV-001–AV-037)** are preserved. The original 36 pending replacement obligations now have real-PG implementation destinations; AV-001 also retains its existing users-server coverage. The historical 524-row inventory is not enlarged by assertion-loop iterations or by new regressions.

| Historical source IDs | Exact destination in `avatar-upload.pg.test.js` | Assertion/evidence preserved |
|---|---|---|
| AV-001 | L206 `accepted avatar MIME policy persists through PostgreSQL CAS: %s` — `image/png`; L214 `provider JPEG transformation limits a genuine large image without changing the uploaded bytes` | Exact upload options/formats, original bytes, server-generated owned UUID, safe HTTPS URL, complete PG account snapshot/CAS, unchanged money and non-owner accounts, no deletion, continued authentication |
| AV-002–AV-006 / D118 | L206 `accepted avatar MIME policy persists through PostgreSQL CAS: %s` — JPEG, WebP, BMP, x-ms-bmp, TIFF advertised MIME variants | All five original allowed MIME variants, plus PNG; real multipart parsing and provider-side JPEG processing |
| AV-007–AV-010 / D119 | L234 `avatar authorization failure prevents provider and PostgreSQL writes: %p` — anonymous, ordinary cross-user, administrator cross-user, missing parent CSRF | No upload/cleanup call, identical entire account and persisted session-graph snapshots; additional wrong-CSRF/CAS/UUID cases are independently asserted |
| AV-011–AV-013 / D120 | L248 `unsupported avatar MIME rejects before provider or persistence: %s` — SVG, GIF, octet-stream | Fixed 400 INVALID_AVATAR and no provider or persistence effects |
| AV-014–AV-020 / D121 | L256 `invalid avatar multipart prevents provider and persistence: %p` — field after/before file, second file, wrong file field, 5 MiB+1 byte file, empty file, missing file | Every original multipart variant, real Multer limits, no provider calls or account effects; symbolic byte labels resolve to actual Buffers in the test |
| AV-021 / D122 | L263 `malformed avatar boundary creates no asset or persistence` | Actual malformed wire boundary, fixed rejection and no upload/write |
| AV-022–AV-025 / D123 | L275 `avatar provider failure is sanitized and cleans only owned ID: %s` — throw, callback-error, stream-error, sync-error | Real Writable transport fault paths, fixed error body without raw secrets, exact owned cleanup options; synchronous error sends zero bytes and destroys the stream |
| AV-026–AV-032 / D124 | L287 `contradictory avatar provider evidence cannot persist or delete foreign assets: %p` — foreign ID, wrong delivery type/resource/format, NaN bytes, attacker URL, foreign-cloud URL | Exact original seven contradictions, complete unchanged-account snapshots, cleanup only of the generated owned ID, never the foreign returned ID |
| AV-033 / D125 | L297 `duplicate provider success cannot delete or persist an accepted avatar twice` | Two immediate callbacks plus a third confirmation after committed persistence: one real avatar UPDATE/version increment, no deletion or later account change |
| AV-034 / D126 | L305 `known avatar rollback cleans only returned owned asset` | Real UPDATE followed by PostgreSQL-raised 23514 and confirmed ROLLBACK; cleanup attempt occurs afterward, on the owned ID only. Cleanup transport failure remains best effort and sanitized; full account and session snapshots remain unchanged |
| AV-035 / D127 | L319 `token-version change during avatar upload prevents persistence` | Independently exercise token-version change and account deactivation while the provider holds its reply; fresh PG authority rejects both before avatar DML, preserves the newer account, cleans owned upload and rejects old credentials |
| AV-036 / D128 | L349 `avatar interruption and late provider confirmation clean only owned ID` | Actual HTTP fetch abortion, destroyed provider stream, one initial and one late-confirmation cleanup of the same owned ID, no avatar DML or account change |
| AV-037 / D129 | L364 `avatar provider timeout is bounded and does not persist` | Assert the middleware schedules its fixed 30,000 ms deadline; accelerate only that timer to 150 ms. PG/session/HTTP timers remain real. Fixed 504, destroyed stream, owned cleanup including late callback, no DML/account change |

The extra eight cases relative to the 37 original cases are the large-image transform, five extra guard cases, post-upload CAS race, and unknown actual COMMIT. Their addition follows the approved **45-case** allocation; nothing was dropped to meet the budget. Account deactivation is an additional independently asserted sequence within the token-version case, not an extra Jest case.

Additional exact destinations:

- L338 `CAS change during upload preserves newer profile and rejects the owned avatar`: newer committed theme/version wins; no stale avatar write; owned upload is cleaned; fresh credentials remain usable.
- L383 `unknown actual avatar COMMIT retains the possibly accepted asset without replacement writes`: the wrapper performs a real COMMIT then loses its acknowledgement; fixed AUTH_OUTCOME_UNKNOWN, broken-client release, one committed avatar/version increment, no asset deletion, no replacement upload/write, read-only HTTP recovery.

### Implementation boundary and clarified contracts

- Real `createApplication` initialization/listening, current HTTP CSRF bootstrap/login, UUIDs, canonical decimal-string `x-row-version`, real PostgreSQL repositories and parent/child sessions. Fault wrappers forward genuine PG results and never disable guards or manufacture rows.
- Only Cloudinary external upload/cleanup transport is controlled (`upload_stream` and `destroy` spies). Real Cloudinary SDK configuration, real Writable streams, multipart/Multer and Sharp are used; no repository/session/auth/Multer/Sharp mock or legacy fixture.
- **Sharp clarification:** the unchanged avatar runtime streams source bytes to Cloudinary and requests JPEG/800px transformation; it does not contain server-side Sharp decoding. Real Sharp creates genuine fixtures and performs the controlled provider transformation. These tests do not claim application-side Sharp processing or a live Cloudinary-network integration.
- The allowed MIME policy remains advertised-MIME allowlisting, not newly invented content sniffing. A genuine PNG under each allowed advertised MIME preserves the exact legacy policy. Original image bytes and transformed JPEG bytes are asserted separately, including no enlargement and a genuine 1600×1200 to 800×600 transformation.
- Legacy persistence failure/authority-change statuses are translated to the current fixed PG contracts: known rollback is 503 AUTH_UNAVAILABLE, changed locked authority is 403 AUTH_FORBIDDEN, and unknown COMMIT is 503 AUTH_OUTCOME_UNKNOWN. Financial and owned-asset invariants are strengthened, not weakened.

### C3.2b1 verification

- Initial new-suite run: **45/45 passing, one suite, 0 snapshots, 13.181 s** against disposable verified-TLS PG18; all five migrations applied.
- Final new-suite run, including post-COMMIT duplicate callback and rollback-before-cleanup assertions: **45/45 passing, one suite, 0 snapshots, 12.413 s** — `bash backend/tests/run-disposable-pg.sh backend/tests/avatar-upload.pg.test.js`.
- Deleted `backend/tests/avatar-upload.test.js` **only after the final replacement suite passed**. No remaining importers/references outside the historical ledger were found for that deleted test.
- Retain all three legacy helpers: the only remaining executable consumers are unchanged `users-admin-authorization.test.js:4` (`legacyMongoAuth`), `:5` (`legacyCsrf`), and `:29` (`legacyUsersRoutes`). Negative PG `require.cache` assertions and ledger references are not importers. C3.2b2 will remove these consumers; no helper is deleted prematurely.
- Static inventory independently verifies **45 cases / 15 registrations / exact 7,9,11,11,7 split**, with no unresolved tables or skipped/focused tests.
- Final full-PG verification after legacy deletion: **PASS — 8/8 suites, 735/735 tests (690 existing + 45 avatar), 0 snapshots, 117.383 s** — `bash backend/tests/run-disposable-pg.sh backend/tests/*.pg.test.js`. All five migrations applied to the disposable verified-TLS PG18 database; no skips or Mongo fallback.
- Protected-file checks: **PASS** — exactly the new avatar PG suite, old avatar suite deletion, and this ledger update. Every other tracked file matches HEAD, including users-admin, all existing PG suites, all retained helpers, runtime, packages and migrations; no staged changes. `git diff --check` passes. All 524 historical source rows remain byte-for-byte unchanged and all new exact destination titles/lines resolve.
- Final new-suite SHA256: `dfc1a92eb41b355694b7aa48de4c4d4225dc1cbd9ea1a5947250ac95f4206f9e`.
- Cumulative obligation status: **127 existing PG / 15 existing non-PG / 280 pending new / 41 changed disabled / 61 retired = 524**. Only the 36 formerly pending avatar obligations move to existing PG; AV-001 was already covered. The approved C3.2a summary above remains its historical checkpoint, not an assertion that completed avatar replacements are still pending.
- No runtime, package, migration, existing PG suite, users-admin, financial, payment, Nodemailer or disabled-feature code is changed. C3.2b2 requires separate approval.

## C3.2b2 — users/admin authorization completion

Completed **2026-10-31**. This record supersedes the users-specific pending destinations **D135–D138, D142–D144, D149–D151, D153, D155–D157, D219–D220, D222**, and the application-boundary portions of **D132, D159, D161, D223**. Original source rows and checkpoint summaries remain historical, not current pending claims. Direct disabled-handler/unit obligations from other source files remain pending in their separately approved phases; these HTTP assertions do not reactivate or convert those suites.

### Allocation and executed cases

The original **36-slot users planning target** is reconciled as **20 new expanded Jest cases + 16 planning slots credited to existing passing coverage**. The credits below are coverage slots, not 16 additional Jest executions or a claim that one source obligation always equals one test. The new suite has **19 registrations / 20 expanded cases**; its only parameterized registration expands into ordinary/admin avatar-removal cases. Assertion-loop iterations are not extra Jest cases. All 20 cases were executed and passed both independently and in the full PG run.

| New case | Group | Exact title in `users-admin-authorization.pg.test.js` | Result |
|---|---|---|---|
| N01 / L145 | Read | anonymous users listing rejects before enumeration or session persistence | PASS |
| N02 / L152 | Cross-user | ordinary cross-user profile and theme mutations cannot write any account | PASS |
| N03 / L159 | Cross-user | cross-user avatar removal has no exception for Owner_U | PASS |
| N04 / L159 | Cross-user | cross-user avatar removal has no exception for Admin_A | PASS |
| N05 / L167 | Profile/password/guards | remaining profile forbidden fields reject the entire otherwise valid patch | PASS |
| N06 / L177 | Profile/password/guards | null array empty and string profile bodies leave accounts and sessions unchanged | PASS |
| N07 / L185 | Profile/password/guards | identity CAS changes only allowlisted columns and never rehashes the password | PASS |
| N08 / L196 | Profile/password/guards | password change revokes every owner parent and child but preserves admin and other graphs | PASS |
| N09 / L211 | Profile/password/guards | missing current and empty new passwords fail without account or graph writes | PASS |
| N10 / L220 | Profile/password/guards | Google-only HTTP authenticated account cannot acquire a local password | PASS |
| N11 / L230 | Profile/password/guards | losing password CAS preserves the hash and graph after a real concurrent theme commit | PASS |
| N12 / L240 | Profile/password/guards | theme and avatar removal require exact parent CSRF before effects | PASS |
| N13 / L252 | Profile/password/guards | theme endpoint rejects extra financial fields and null body without partial mutation | PASS |
| N14 / L259 | Profile/password/guards | avatar removal rejects injected fields without clearing or deleting the owned asset | PASS |
| N15 / L267 | Lifecycle/targets | activation allowlist and revocation affect only the target session graph | PASS |
| N16 / L281 | Lifecycle/targets | DELETE rejects extra financial fields without deleting or deactivating the target | PASS |
| N17 / L285 | Lifecycle/targets | missing lifecycle UUIDs return 404 without account or session mutations | PASS |
| N18 / L293 | Lifecycle/targets | lifecycle and disabled balance reject malformed and legacy ObjectId targets before target queries | PASS |
| N19 / L307 | Disabled contracts | authorized disabled balance ignores every historical body without account or graph writes | PASS |
| N20 / L316 | Disabled contracts | exact disabled admin paths and reserve HEAD preflight never consult session or account storage | PASS |
| **Total** | **1 read + 3 cross-user + 10 profile/password/guards + 4 lifecycle/targets + 2 disabled** | **20 executed new cases** | **20/20 PASS** |

### Existing passing coverage credited to the remaining 16 planning slots

Paths below are relative to `backend/tests/`. Titles are exact source templates; each selected variant was included in the passing full PG run. A credit may cite multiple cases to close a compound capability rather than duplicating them in the new suite.

| Credit slot | Existing exact destination and selected variants | Coverage credited |
|---|---|---|
| E01 | `users-server.pg.test.js:168` — `administrative list is bounded, cursor-paginated and safely projected` | Positive safe administrator listing |
| E02 | `users-server.pg.test.js:184` — `regular users cannot list and a demoted current admin cannot rely on the JWT role` | Ordinary-user denial and fresh-role enforcement |
| E03 | `users-server.pg.test.js:189` — `self read %s returns exact string money/version without secrets` (`/me`, self detail, self balance) | Safe owner reads |
| E04 | `users-server.pg.test.js:193` — `detail ownership is enforced for %s` (detail and `/balance`) | Cross-user read denial, current-admin access, missing and malformed read targets |
| E05 | `users-server.pg.test.js:231` — `self-only mutation %s rejects even another administrator` (profile and `/theme`) | No administrator cross-user profile/theme exception |
| E06 | `avatar-upload.pg.test.js:234` — `avatar authorization failure prevents provider and PostgreSQL writes: %p` (`ordinary cross-user` and `administrator cross-user`) | No cross-user avatar-upload exception |
| E07 | `users-server.pg.test.js:212` — `profile rejects forbidden field %s without effects` (`role`, `accountStatus`, `balance`, `tokenVersion`, `avatar`); `integration-prerequisites.pg.test.js:271` — `profile cannot mutate protected/unsupported field %s` (`provider`, `twoFAStatus`) | Existing exact forbidden-field variants; the six remaining variants are N05 |
| E08 | `users-server.pg.test.js:252` — `incorrect current password rejects the whole mixed profile mutation`; `integration-prerequisites.pg.test.js:278` — `wrong current password prevents every identity field from changing` | Wrong-current-password rejection without partial mutation |
| E09 | `integration-prerequisites.pg.test.js:275` — `invalid combined patch changes nothing: %j` (weak password with correct current password, and current-password-only patch) | Existing weak/current-only password variants |
| E10 | `users-server.pg.test.js:234` — `profile requires exact parent-bound CSRF before JSON parsing or persistence` | Exact profile CSRF; theme/removal are independently N12 |
| E11 | `avatar-upload.pg.test.js:234` — `avatar authorization failure prevents provider and PostgreSQL writes: %p` (`missing parent CSRF` and `wrong parent CSRF`) | Exact avatar-upload CSRF |
| E12 | `users-server.pg.test.js:227` — `theme-only update keeps token version, sessions and money unchanged` | Successful financially inert theme change |
| E13 | `avatar-upload.pg.test.js:256` — `invalid avatar multipart prevents provider and persistence: %p` (extra fields before/after file and missing file); `users-server.pg.test.js:296` — `multipart %s cannot create a provider asset` | Strict uploaded-file-only contract |
| E14 | `users-server.pg.test.js:325` — `avatar removal commits DB CAS before best-effort provider cleanup`; `:333` — `removal never deletes foreign URL %s` (foreign host and foreign cloud) | Removal success, cleanup ordering, and foreign-asset protection; injected-field rejection is N14 |
| E15 | `users-server.pg.test.js:273` — `lifecycle %s %s is admin-only, CSRF-protected and CAS`; `:255` — `manual balance remains admin/CSRF protected and never writes money` | Existing lifecycle and disabled-balance authority/CSRF/CAS guards |
| E16 | `users-server.pg.test.js:260` — `DELETE logically deactivates and preserves user/money while revoking only target sessions` | Current logical DELETE success; injected-field rejection is independently N16 |

Existing password-hash-cost/new-password-login assertions (`users-server.pg.test.js:245`, D140) and repository password-change/version assertions (`auth-sessions.pg.test.js:220`, D141) also support N08; they are not added again to the 16-slot accounting.

### Complete users obligation closure

All **76 historical users obligations (UA-001–UA-076)** now have executed current-contract destinations. Their original disposition was **15 existing PG + 45 pending new + 16 changed contracts**. The latter 61 obligations are closed by the new cases and cited surviving PG coverage; no legacy source row is dropped to fit the planning budget.

| Historical source IDs / destinations | Executed current destination | Closure / preserved assertion |
|---|---|---|
| UA-001 / D219 | N01 | Anonymous listing rejects before SQL or session persistence |
| UA-002–UA-003, UA-005–UA-007 / D132, D130 | N20; E01 for UA-007 enabled listing | Exact `/api/admin/users` and `/api/admin/panel` unavailable for anonymous, ordinary, current-admin and stale/inactive callers, with zero SQL; enabled listing remains safe |
| UA-004 / D131 | E02 | Fresh database role, not asserted/JWT administrator role |
| UA-008–UA-009 / D133; UA-010 / D134 | E04; E03 | Ownership and safe exact-money reads |
| UA-011–UA-014 / D135 | N02; E06 ordinary upload; N03 removal | All four ordinary cross-user mutation paths reject |
| UA-015–UA-018 / D136 | E05; E06 administrator upload; N04 removal | No admin exception on all four mutation paths |
| UA-019–UA-031 / D137 | E07 for balance/role/status/version/provider/twoFAStatus/avatar; N05 for googleId/twoFASecret/trustedDevices/resetPasswordToken/loginAttempts/unexpected | All 13 original forbidden-field variants retain write-free rejection; remaining six also reject otherwise valid patches atomically |
| UA-032–UA-035 / D138 | N06 | All four literal malformed/empty body variants leave entire account/session snapshots unchanged |
| UA-036 / D139 | N07; `users-server.pg.test.js:199` — `identity profile update is atomic, clears email verification and revokes every old session` | Full account allowlist/hash preservation, current identity-change token/version/verification/revocation contract, no money writes |
| UA-037 / D220, D140, D141 | N08; existing hash/authentication assertions cited above | Every owner parent/child revoked, exact single account version increment, admin and other accounts/graphs survive |
| UA-038–UA-042 / D142 | N09 for missing current/empty new; E08 for wrong current; E09 for weak/current-only | All five password input variants reject without partial account mutation; current missing-password contract is 403 CURRENT_PASSWORD_INVALID, not old 400 |
| UA-043 / D143 | N10 | Real Google HTTP authentication; local hash remains NULL and graph unchanged after rejected mutation |
| UA-044 / D144 | N11 | Real separately committed theme/version race beats password CAS; old hash and graph survive |
| UA-045 / D145; UA-047 / D146 | E10; E11 | Exact profile and avatar-upload parent CSRF |
| UA-046, UA-048 / D222 | N12 | Theme and avatar removal independently exercise missing and wrong CSRF before effects |
| UA-049–UA-051 / D147, D148 | E15 | Exact activation/DELETE/manual-balance authority and CSRF paths |
| UA-052 / D223 | N20 | Application admin balance prefix rejects before authentication/storage regardless of body |
| UA-053 / D149 | N13 + E12 | Theme extra-field/null rejection plus existing successful theme-only preservation |
| UA-054 / D150 | E13 | Extra/missing upload payload rejected without provider or persistence work |
| UA-055 / D151; UA-056 / D152 | N14 + E14; E14 foreign-cloud variant | Injected removal field rejected; successful cleanup follows DB commit and never deletes foreign asset |
| UA-057–UA-059 / D147, D148 | E15 | Ordinary users cannot perform lifecycle/manual balance operations |
| UA-060 / D153 | N15 | Activation field allowlist, suspension bookkeeping, exact target version increment and target-only graph revocation |
| UA-061 / D154 | N16 + E16 | DELETE rejects injection; successful contract is logical deactivation with preserved user/money, not physical Mongo deletion |
| UA-062 / D155 | N17 | Both missing lifecycle UUID paths are 404 and leave account/session snapshots unchanged |
| UA-063–UA-065 / D156 | N18 | Malformed and historical ObjectId mutation targets reject before target queries; current-authentication queries are not falsely claimed absent |
| UA-066 / D156 | E04 `/balance` malformed-target sequence | Existing GET balance UUID rejection, not credited to a mutation-only case |
| UA-067, UA-069, UA-071, UA-073 / D223 | N20 | Exact valid/invalid admin balance URLs and historical caller/body variants stay unavailable without SQL |
| UA-068, UA-070 / D148 | E15; N19 supports full no-write snapshots | Authorized disabled balance remains 503; ordinary caller remains forbidden |
| UA-072 / D157 | N19 | All historical body categories ignored after proper auth/CSRF; fixed FINANCIAL_UNAVAILABLE and unchanged money/accounts/graphs |
| UA-074–UA-075 / D158, D159 | `users-server.pg.test.js:164` — `disabled %s is 410 for all methods without authentication or writes`; N20 | Both reserve/restore keep 410 for ordinary methods, bodyless 410 HEAD and composition CORS 204 preflight, without SQL/cookies |
| UA-076 / D160, D161 | `auth-http.pg.test.js:360` — `HTTP rejects current pair after %s`; `:344` — `%s issued pair is rejected after database version changes` (password, Google, 2FA); N20 | Enabled routes reject stale/revoked/inactive credentials; disabled admin paths stay unavailable before credential consultation |

Cumulative closed-obligation accounting: **188 existing PG / 15 existing non-PG / 235 pending new / 25 changed disabled / 61 retired = 524**. Compared with C3.2b1, **45 pending users replacements + 16 users changed-contract obligations** now have executed PG coverage. This counts historical obligations, not the 755 expanded PG tests. Historical C3.2a summaries/source rows and the C3.2b1 completion record remain intact.

### Execution and cleanup verification

- User-supplied manual standalone run: **PASS — 1/1 suite, 20/20 tests, 0 snapshots, 5.833 s** — `bash backend/tests/run-disposable-pg.sh backend/tests/users-admin-authorization.pg.test.js`.
- User-supplied manual full run before cleanup: **PASS — 9/9 suites, 755/755 tests, 0 snapshots, 121.991 s** — `bash backend/tests/run-disposable-pg.sh backend/tests/*.pg.test.js`.
- These successful runs satisfied the conditional deletion gate. Deleted `users-admin-authorization.test.js`, then scanned the repository before deleting its three helpers. **Zero remaining executable importers** were found for each helper. A second post-deletion scan confirms the same result.
- General name grep, excluding dependency/git directories and this historical ledger: `legacyMongoAuth` — **0 matches**; `legacyCsrf` — **0 matches**; `legacyUsersRoutes` — **1 non-import match** at unchanged `users-server.pg.test.js:85`, a negative `require.cache` path assertion. Import-oriented grep for `require`, `jest.requireActual` and static/dynamic `import` combined with any helper name — **0 matches**. No test/cache assertion was edited to manufacture a zero-reference count.
- Deleted files, relative to `backend/tests/` (**4 total**): `users-admin-authorization.test.js`, `helpers/legacyMongoAuth.js`, `helpers/legacyCsrf.js`, `helpers/legacyUsersRoutes.js`.
- Assistant-executed final full PG run **after all four deletions**: **PASS — 9/9 suites, 755/755 tests (735 previous + 20 new), 0 snapshots, 120.416 s** — `bash backend/tests/run-disposable-pg.sh backend/tests/*.pg.test.js`. All five migrations applied to disposable verified-TLS PG18; no Mongo fallback or skipped suites.
- New suite SHA256: `d2f8c3ba1854c59c38a0b71a16e84c5c6bee710f97d923f7a3a911f58e6e83fc`. Cleanup did not edit the already manually verified new suite.
- Static/protected-file verification: **PASS** — all 524 historical source rows match HEAD byte-for-byte; the completion table maps all 76 users IDs exactly once; explicit existing PG title/line citations resolve; the unchanged new suite has 19 registrations / 20 cases without skip/focus. Tracked changes are exactly this ledger and the four authorized deletions, with no staged changes. `git diff --check` passes.
- Change boundary: this ledger update and exactly four authorized deletions, with the pre-existing untracked new users PG suite retained. Runtime, migrations, package files, other PG suites/helpers, financial/payment/Nodemailer/disabled-feature suites and every preserved feature remain unchanged. No C3.2c implementation is included.

### C3.2c — proposed only; approval required

1. Reconcile `financial-models.test.js` (78 expanded historical obligations) into `financial-invariants.pg.test.js` (**approximately 28 real-PG cases**) and `money-contracts.test.js` (**approximately 36 independent unit cases**). Preserve exact source variants and credit already-covered capabilities instead of mechanically copying Mongo middleware tests. PG destinations include mandatory/bounded cents, generated mirror/delta/replay evidence, journal source/type/effect and key/hash constraints, durable uniqueness/history and append-only behavior. Pure contracts include strict cents/money parsing, precision/coercion/negative-zero/unsafe bounds, exact formatting and numeric mirror round trips. Generated/NOT NULL states must not be disabled to fabricate impossible legacy damage; retained migration-shaped audit evidence must not become a lazy runtime migration API.
2. Map all portable obligations in `financial-service.test.js` (64 historical obligations) to existing coordinator/readiness coverage or **approximately 8 new cases** in `financial-coordinator.pg.test.js`. Proposed gap groups: malformed input before acquiring PG; current administrator authority; stale expected balance; historical replay after a later committed adjustment; changed canonical payload under one key; authorization change after retryable rollback; unavailable recovery read preserving unknown outcome; precommit authority/infrastructure failure preserving rollback/no published success. Exact registration/matrix allocation requires source-to-assertion reconciliation before implementation; eight is a planning target, not permission to discard a gap.
3. Delete `financial-models.test.js` and `financial-service.test.js` only after their mapped replacements pass and importer checks permit deletion; update this ledger without erasing source obligations. Run targeted PG/unit replacements, then full PG acceptance. If all proposed PG additions are new, the forecast is **791 PG cases / 10 suites** (755 + 28 + 8), plus about 36 unit cases outside that PG count; this is not an executed result.
4. No runtime, migrations, package files, financial HTTP/payment/notification/Nodemailer/disabled-feature suites or preserved features will be edited. Future approval must explicitly authorize only the two replacement suites, the coordinator PG additions, two retired-source deletions and ledger accounting. **Wait for user approval before implementation.**

## C3.2c1 — money contracts and coordinator gap cases

Approved and implemented **2026-10-31** as the first of two sequential financial conversion sub-phases. This completion record supersedes the money-only portion of the C3.2c proposal and operational destinations **D014, D016, D017, D194, D195, D197–D199**. The historical inventory/source rows above remain unchanged. **C3.2c2 has not begun**: `financial-invariants.pg.test.js` is not created and `financial-models.test.js` is not deleted or edited.

### Money contracts — executed, 36/36 passing

`money-contracts.test.js` imports **only `../utils/money`**. It contains **25 registrations / 36 expanded cases**, with three literal parameter tables (4, 6 and 4 entries). Matrices inside an assertion loop are not additional Jest cases. No database/repository/HTTP imports, mocks of money.js, skipped tests, or weakened runtime contracts.

| Group | Cases | Exact registration/title destinations in `money-contracts.test.js` |
|---|---:|---|
| Canonical decimals | 4 | L13–18 `parses %s without changing exact cents` — zero, whole amounts, one fractional digit, two fractional digits |
| Noncanonical syntax | 6 | L24–31 `rejects %s rather than normalizing input` — signs, whitespace (including final newline), exponents, leading zeros, incomplete decimals, other numeric spellings |
| Coercion / precision | 4 | L37 `non-string non-number amounts cannot be coerced`; L42 `hostile coercion hooks are never called`; L48 `string precision beyond two digits is rejected even for trailing zeros`; L53 `numeric excess precision and nonfinite or signed amounts are rejected` |
| Cents / amount bounds | 4 | L61 `safe nonnegative integer cents include zero and MAX_SAFE_INTEGER`; L65 `invalid cents reject the entire historical coercion and unsafe-value matrix`; L71 `maximum decimal amount parses exactly without a floating-point intermediate`; L75 `amount overflow is distinct from rejected overlong input` |
| Formatting / string round trips | 2 | L84 `formatting always emits an integer part and exactly two fractional digits`; L89 `decimal-string round trips preserve cents through the safe-integer boundary` |
| Checked arithmetic | 6 | L100 `addition is exact at the safe boundary and rejects overflow`; L106 `subtraction permits exact zero but rejects underflow`; L111 `multiplication is exact and accepts zero and identity factors`; L117 `multiplication checks the BigInt result rather than truncating overflow`; L121 `every arithmetic entry point validates cents before calculating`; L130 `multipliers reject coercion negative zero fractional and unsafe factors` |
| Multiply/divide half-up | 6 | L138 `fractions below one half round down including a zero numerator`; L143 `exact half-cent ties round up once`; L148 `fractions above one half round up without floating-point calculation`; L153 `an intermediate product above MAX_CENTS is legal when the final quotient fits`; L157 `overflow is checked after half-up rounding as well as after division`; L163 `division requires a positive denominator and strict integer factors` |
| Numeric display mirrors | 4 | L173–178 `%s retains its explicit numeric round-trip result` — zero mirror, fractional mirror, large representable mirror, large unrepresentable mirror |
| **Total** | **36** | **All executed/passing** |

Contract clarifications: `parseMoney` accepts both plain decimal strings and exact finite Number amounts; `assertCents` requires safe-integer Number cents and rejects string/bigint/coerced values and negative zero. Tests preserve that distinction. `money.js` has no numeric-mirror rejection API: the mirror cases explicitly compare cents with `parseMoney(Number(formatMoney(cents)))`. At MAX_CENTS the exact decimal string remains valid while the numeric mirror loses one cent; rejection before mutation is independently covered by the repository/coordinator cases below. Large BigInt intermediate products are valid if the divided result fits; a result of MAX_CENTS + 0.5 must overflow after half-up rounding, not clamp.

### Eight genuine coordinator gaps — executed, 8/8 passing

All original **26 registrations / 27 expanded PG cases** in `financial-coordinator.pg.test.js` remain unchanged. Eight nonparameterized registrations are appended, for **34 registrations / 35 expanded cases**. The existing verified-disposable/TLS/migration gates and real repository/transaction machinery are reused. No runtime or other PG suite is edited.

| Gap / exact title in `financial-coordinator.pg.test.js` | Cases | New assertion beyond existing coverage |
|---|---:|---|
| G01 / L1432 `malformed adjustment matrix rejects before pool acquisition or account effects` | 1 | All 11 legacy malformed-input categories translated to current UUID/canonical-cent contracts, plus malformed bodies, wrong token-version type, and unrepresentable numeric mirror; zero provider/acquisition calls and complete unchanged account/evidence snapshots |
| G02 / L1459 `adjustment requires a present current active administrator and exact token version` | 1 | Missing/ordinary/demoted/suspended/version-revoked actors independently rejected on the adjustment path, before financial DML; fixture authority changes are real separately committed PG writes |
| G03 / L1482 `stale adjustment expected balance preserves every account column and all evidence` | 1 | Existing rollback-scope case has a monetary tuple; this case checks every account column and complete journal/order/payment rows, with no financial DML or COMMIT |
| G04 / L1493 `adjustment replay retains the first receipt after a later committed balance change` | 1 | Two genuine committed adjustments, then first-key replay: exact original frozen receipt, unchanged entire accounts/evidence, no financial DML/COMMIT; existing target-ineligibility replay does not change money |
| G05 / L1512 `changed adjustment balance expected balance or reason conflicts under the same key` | 1 | All three adjustment fingerprint changes independently return 409 IDEMPOTENCY_CONFLICT, preserve prior evidence, and never update money; existing conflict case covers purchase intent |
| G06 / L1525 `token version revoked after a real retryable rollback forbids the next adjustment attempt` | 1 | Real PG 40001 after money UPDATE/journal/receipt read, actual ROLLBACK, independently committed administrator token revocation, then fresh second-attempt 403; no aborted receipt published or financial effect retained |
| G07 / L1557 `recovery read outage preserves unknown COMMIT without a replacement adjustment` | 1 | Lost COMMIT transport followed by a failed recovery connection/read, for both undispatched and genuinely committed outcomes; sanitized 503 FINANCIAL_OUTCOME_UNKNOWN, broken clients discarded, resolution has zero DML; only an explicit identical-key new invocation may retry/replay |
| G08 / L1607 `precommit PG failure rolls back new evidence and never publishes the pending receipt` | 1 | Real PG 57014 after money UPDATE/journal/verified receipt but before COMMIT, sanitized 503, confirmed ROLLBACK, no published success, all prior account/evidence rows intact; explicit same-key retry proves no partial idempotency evidence |
| **Total added** | **8** | **All executed/passing; no duplicated original PG registration** |

### Existing executed coverage credits

Paths below are relative to `backend/tests/`. Supporting independent/unit suites were actually executed separately; they are not falsely included in the PG test count.

| Credit | Exact surviving destination | Why not duplicate it |
|---|---|---|
| C01 / D189, D190 | `users-server.pg.test.js:88` — `health is 503 before verification, 200 after it, without session writes`; `:97` — `unavailable real PostgreSQL refuses to listen and remains not ready` | Current startup/readiness fail-closed contract replaces removed Mongo initialization |
| C02 / D013, D169 | `financial-coordinator.pg.test.js:466` — `adjustment atomically commits exact balance, version and journal`; `user-repository.test.js:345` — `financial cents compare-and-swap uses one scoped client and neither writes mirrors nor commits` | Exact authoritative cents/CAS/generated mirror and same scoped transaction |
| C03 / D020 | `financial-coordinator.pg.test.js:678` — `real adjustment-journal 23505 rolls back before clean replay resolution` | Recognized duplicate resolution already proves real rollback before clean replay |
| C04 / D029 | `financial-coordinator.pg.test.js:936` — `disconnect at COMMIT without evidence returns unknown and never repeats the write` | Existing no-evidence unknown outcome, not a recovery-read outage |
| C05 / D030 | `financial-coordinator.pg.test.js:895` — `lost response after real COMMIT destroys the client and resolves the receipt` | Existing durable receipt recovery, not a recovery-read outage |
| C06 | `financial-coordinator.pg.test.js:796` — `PostgreSQL-raised %s exhausts three attempts without effects` (40001, 40P01); `:849` — `repository-mapped 40001 retries and then commits exactly once` | Bounded retries and successful retried commit already exist; only mid-retry authority change is new |
| C07 | `financial-coordinator.pg.test.js:1267` — `adjustment replay precedes current target eligibility checks`; `:1288` — `same key with different purchase intent is a conflict, not another debit`; `:1306` — `fresh token authorization is required even for a replay`; `:1368` — `approval replay returns historical balance after a later adjustment` | Credit exact existing resource/path contracts, not a generic substitute for new adjustment-specific sequences |
| C08 / D188 | `financial-coordinator.test.js:57` — `default import is lazy and exposes only operations, construction and sanitized error type` | Narrow/lazy API is an independent unit obligation |
| C09 / D167 | `user-repository.test.js:419` — `unrepresentable numeric mirrors are rejected before a cents update` | Existing actual write-boundary rejection; new money-only tests demonstrate conversion/round-trip behavior, not a nonexistent guard |
| C10 / D196 | `financial-coordinator.test.js:145` — `unknown unique constraints do not enter idempotency recovery` | Existing unrelated-constraint rejection is unit coverage |
| C11 / D200 | `financial-coordinator.test.js:134` — `cleanup failure cannot erase a confirmed financial commit` | Existing post-confirmation cleanup semantics are unit coverage |
| C12 (support only) | `pg-financial-schema-verification.test.js:161` — `rejects %s` (invalid unique index, wrong idempotency keys, wrong partial predicate); `:97` — `verifies four checksums and catalog guards with metadata-only SELECTs in a read-only transaction` | Fake-catalog unit fixtures support schema obligations but do not execute incompatible real-PG financial/payment/order index definitions; D191–D193 remain reserved for C3.2c2 |

### financial-service.test.js — exact obligation reconciliation

The original **64 source rows** are preserved. **22 formerly pending operational obligations** now have executed PG destinations. **11 incompatible-schema/index obligations remain explicitly pending for C3.2c2**; they are not silently discarded or counted as coordinator successes. The 22 retired obligations are only removed Mongo topology/ClientSession/probe/cache mechanisms, with portable transaction/security obligations mapped independently.

| Historical source IDs | Current exact destination / status | Preserved obligation |
|---|---|---|
| FS-001 | C08 — existing unit PASS | Narrow coordinator API, no callback/notification/standalone-money capability |
| FS-002 | C01 — existing PG credit | Server cannot serve/listen before current PostgreSQL verification |
| FS-003–FS-012 | Retired mechanism, historical rationale unchanged | Mongo topology/session/init/probe machinery has no current API |
| FS-013–FS-015, FS-017 | D191 — **PENDING C3.2c2**, C12 supporting unit PASS only | Real journal missing/nonunique/incorrect-predicate/wrong-key-order readiness variants |
| FS-016, FS-018–FS-019 | Retired mechanism | Mongo collation/TTL options are not recreated; durable SQL retention remains separately obligated |
| FS-020–FS-022 | D192 — **PENDING C3.2c2**, C12 supporting verifier unit coverage only | Real payment decision index missing/nonunique/wrong-predicate readiness variants |
| FS-023–FS-025 | Retired mechanism | Mongo-only collation/TTL options |
| FS-026–FS-028, FS-030 | D193 — **PENDING C3.2c2**, C12 supporting verifier unit coverage only | Real order replay index missing/nonunique/wrong-predicate/wrong-key-order readiness variants |
| FS-029, FS-031–FS-035 | Retired mechanism | Removed Mongo collation/TTL/build-repair/client-generation/readiness cache |
| FS-036–FS-046 / D194 | G01 — new PG PASS | Each missing balance expectation, precision/sign/coercion, UUID, hostile target, key, reason and unknown-field input rejects before acquisition |
| FS-047 | C09 + money numeric-mirror group; G01 additional support — existing unit PASS | Numeric mirror loss is explicit, exact string money stays valid, incompatible mutation is rejected |
| FS-048–FS-050 / D195 | G02 — new PG PASS | Missing/nonadministrator/inactive current authority, plus fresh role and token-version checks |
| FS-051 / D016 | G03 — new PG PASS | Full unchanged-account/evidence snapshot for stale expected balance |
| FS-052 | C02 — existing PG/unit PASS | Scoped atomic cents/CAS/journal, generated mirror rather than a writable Mongo money pair |
| FS-053 / D014, D015 | G04 — new PG PASS; historical unit replay remains supporting coverage | Replay is the original historical receipt after another committed adjustment |
| FS-054–FS-056 / D017 | G05 — new PG PASS | Balance, expected balance and reason each independently conflict under one key |
| FS-057 | C03 — existing PG PASS | Recognized duplicate resolution follows actual rollback and clean transaction |
| FS-058 | C10 — existing unit PASS | Unrelated uniqueness constraint cannot become idempotency success |
| FS-059 | C04 — existing PG PASS | Unknown COMMIT without receipt requires identical-key recovery and never repeats mutation internally |
| FS-060 | C05 — existing PG PASS | Actual durable COMMIT acknowledgement loss resolves original receipt |
| FS-061 / D197 | G06 — new PG PASS | Fresh authorization after retryable rollback; revoked actor token is not reused |
| FS-062 / D198 | G07 — new PG PASS | Unavailable recovery read stays unknown, never definite failure or hidden replacement write |
| FS-063 / D199 | G08 — new PG PASS | Precommit infrastructure failure rolls back and never publishes the pending receipt |
| FS-064 | C11 — existing unit PASS | Cleanup failure does not erase confirmed success |

Current FS allocation: **27 executed/credited PG + 4 executed existing non-PG + 11 pending C3.2c2 + 22 retired = 64**. This intentionally differs from the historical 5/4/33/22 allocation without changing its original source rows.

Money-only historical closure: **FM-003–FM-014 / D163** (all 12 original invalid/coerced cents variants) now have executed non-PG coverage at `money-contracts.test.js:65`. **D165** precision parsing, **D175** underlying numeric validation and **D177** checked arithmetic have executed money-only support, but compound FM-020–FM-022, FM-062–FM-065 still require generated mirror/journal/SQL destinations in C3.2c2. No pure money test is falsely credited as a real journal or repository integration.

Conservative cumulative status for explicitly reassessed source obligations: **210 existing PG / 27 existing non-PG / 201 pending new / 25 changed disabled / 61 retired = 524**. Only the 22 FS operational and 12 FM cents obligations move dispositions in this sub-phase; other financial source inventories and compound SQL requirements retain their pending status until their owning phase reconciles them.

### Verification and deletion gate

- New money suite: **PASS — 1/1 suite, 36/36 tests, 0 snapshots, 0.506 s** — `npx jest backend/tests/money-contracts.test.js --runInBand`.
- Targeted coordinator PG suite: **PASS — 1/1 suite, 35/35 tests (27 existing + 8 new), 0 snapshots, 4.662 s** — `bash backend/tests/run-disposable-pg.sh backend/tests/financial-coordinator.pg.test.js`. All five migrations applied against the verified-TLS disposable PG18 database.
- Unchanged supporting unit suites: **PASS — 3/3 suites, 237/237 tests, 0 snapshots, 2.541 s** — `npx jest backend/tests/financial-coordinator.test.js backend/tests/user-repository.test.js backend/tests/pg-financial-schema-verification.test.js --runInBand`. These are extra credit verification, not additions to the 36 new unit or PG counts.
- Full-PG acceptance before deletion: **PASS — 9/9 suites, 763/763 tests (755 + 8), 0 snapshots, 121.449 s** — `bash backend/tests/run-disposable-pg.sh backend/tests/*.pg.test.js`. Two earlier safety-check timeouts prevented execution; the subsequent successful run applied all five migrations and satisfied the deletion gate.
- Deleted **only `backend/tests/financial-service.test.js`** after the passing full PG run and a fresh importer scan. **Zero references/importers** outside this historical ledger were found before deletion, excluding dependency/git directories. Post-deletion grep confirms the same zero result. `financial-models.test.js` remains unchanged for C3.2c2.
- Final money verification after deletion: **PASS — 1/1 suite, 36/36 tests, 0 snapshots, 0.288 s** — `npx jest backend/tests/money-contracts.test.js --runInBand`.
- Final full-PG verification **after deletion**: **PASS — 9/9 suites, 763/763 tests (755 existing + 8 new), 0 snapshots, 121.365 s** — `bash backend/tests/run-disposable-pg.sh backend/tests/*.pg.test.js`. All five migrations applied to disposable verified-TLS PG18; no skipped tests or Mongo fallback.
- Money suite SHA256: `069b1ca21962c0327854a9a882fd5ce8ccf835a593755c0c2bbbc479b154d281`.
- Coordinator suite SHA256: `882a2496368283f961831ae2e2dff64ece6908c871e8f6b70149c4804b68a2fe`.
- Static/protected-file checks: **PASS** — all 524 historical source rows remain byte-for-byte unchanged; all 64 FS IDs are mapped exactly once; every original coordinator byte is preserved as a prefix; eight new PG registrations and 25 money registrations have no skip/focus; existing/new title and registration-line citations resolve. Verified suite hashes match this record. Tracked changes are exactly the coordinator additions, legacy financial-service deletion and ledger, plus the new money suite; other tracked files match HEAD, with no staged changes. `git diff --check` passes.
- Only the new money contract suite, appended coordinator gaps, this ledger and the authorized legacy financial-service suite deletion are changed. No runtime, migrations, packages, financial models/invariants, other PG suites, disabled features, payments/notifications/Nodemailer or preserved feature is edited. C3.2c2 requires separate approval after this sub-phase's verification and completion.

## C3.2c2 — implementation checkpoint (superseded by verified cleanup record below)

The user approved C3.2c2 after committing C3.2c1. `backend/tests/financial-invariants.pg.test.js` is now implemented with **20 registrations / 28 expanded Jest cases**: 17 ordinary registrations and three literal `test.each` tables expanding to 4 + 3 + 4 cases. Assertion loops are not additional Jest cases. **PG execution is blocked before execution by the unavailable safety checker; none of these 28 cases is reported passing yet.** The previous verified checkpoint remains **763 PG tests / 9 suites**. The expected acceptance count is **763 + 28 = 791 / 10 suites**, not an executed result.

The mappings below supersede the applicable historical planned destination titles at the source-present/implementation level only. They do **not** close pending obligations until PG acceptance. All 524 historical source rows remain unchanged. `financial-models.test.js` remains present, byte-for-byte unchanged, pending the deletion gate. No runtime, migrations, package files, other PG/unit suites, protected notifications/Nodemailer/disabled-feature suites, or preserved features are modified.

### Implemented invariants allocation — awaiting PG PASS

All paths in this table are `backend/tests/financial-invariants.pg.test.js`; titles are exact registrations.

| Case | Registration line / exact title | Cases | Intended invariant and distinct gap |
|---|---|---:|---|
| I01 | L125 `zero registration and exact cents generate the required NUMERIC balance mirror` | 1 | Mandatory zero initialization plus all five historical exact-cent variants (0, 1, 29, 100, 12345); SQL-generated decimal mirror |
| I02 | L133 `negative user cents fail the balance constraint on insert and update without side effects` | 1 | Exact balance CHECK rejection on both write paths, full unchanged snapshots |
| I03 | L139 `MAX_SAFE_INTEGER cents retain an exact SQL mirror and the next cent is rejected` | 1 | Exact SQL MAX mirror is valid even when a JavaScript numeric mirror is lossy; MAX+1 fails INSERT and UPDATE |
| I04 | L147 `generated user balance cannot be supplied or independently overwritten` | 1 | Generated-column rejection for all three historical mismatch/precision amounts, without disabling generation |
| I05 | L154 `authoritative user cents reject NULL on insertion and removal` | 1 | Exact NOT NULL column errors on INSERT and UPDATE |
| I06 | L160 `exhausted row_version freezes money and metadata while caller overrides cannot reset versions` | 1 | Exhausted row blocks money/theme/reset attempts; ordinary caller version override is replaced by automatic +1 |
| I07 | L171 `source-free journal generates exact signed deltas and canonical replay evidence without writable metadata` | 1 | Positive/zero/full-boundary signed deltas, canonical USD/replay evidence; delta/result/source projections cannot be assigned; no arbitrary extra/result SQL metadata column |
| I08 | L191 `journal before and after cents enforce mandatory integer and safe bounds independently` | 1 | Each authoritative journal input has mandatory/safe/integer rejection with valid actor/owner and source-free surroundings |
| I09 | L205 `journal keys hashes currency and reasons reject malformed evidence with valid actors and owners` | 1 | Exact malformed-key/hash/reason/currency constraints, including terminal newline and oversized key |
| I10 | L219 `journal source groups type effect owner and delta direction cannot contradict valid source fixtures` | 1 | All-or-none adjustment sources; missing source-backed identity; type/effect/owner/direction checks use actual existing order/payment/user fixtures |
| I11 | L242 `migration-shaped journal evidence preserves value and identifies the actual existing target` | 1 | SQL audit contract only: value preservation and actual target; no Mongoose/lazy runtime migration |
| I12 | L251 `journal rejects identity and evidence rewrites deletion and cascading truncation while retaining every row` | 1 | Immutable identity/key/hash/cents/time/resource fields, DELETE and TRUNCATE with real referencing rows; existing reason-UPDATE case is credited rather than copied |
| I13 | L272 `journal idempotency is scoped by actor operation and case-sensitive key while source-free rows coexist` | 1 | Duplicate keys including changed hash fail the exact unique guard; distinct actor/type/case and independent source-free rows are valid; real history index keys/direction and retention support |
| I14 | L290 `source-effect uniqueness spans actors but separates source types and original debit from refund` | 1 | Actual duplicate source/effect across actors fails; same UUID across user/adjustment/order/payment source types is valid; paired debit/refund share an order source without collision |
| I15 | L307 `order cross-table evidence rejects mismatched receipts and unpaired refunds and rolls back account writes` | 1 | Deferred amount/key/hash/resource/balance/reference/owner mismatches, uncancelled refund and existing wrong-kind refund FK; attempted account writes and new evidence roll back, prior rows survive |
| I16 | L335 `payment cross-table evidence rejects mismatched credits and pending-source credits with complete fixtures` | 1 | Deferred amount/actor/owner/key/hash/reason/resource/balance/reference mismatches, unapproved pending credit; attempted account writes/new evidence roll back; valid control shows generated claim/USD/replay mirrors |
| I17 | L359 `resource guards retain immutable claims snapshots and terminal decisions across update delete and truncate` | 1 | Payment claims/receipts/terminal decisions, order catalog/request/charge/owner immutability, resource DELETE/TRUNCATE; existing order fulfillment UPDATE is credited instead |
| I18 | L442, title L447 `journal index readiness rejects %s without weakening enforcement or repairing schema` | 4 | D191: missing, notUnique, wrongPartial, wrongKeyOrder |
| I19 | L452, title L456 `payment decision index readiness rejects %s without weakening enforcement or repairing schema` | 3 | D192: missing, notUnique, wrongPartial |
| I20 | L463, title L468 `order replay index readiness rejects %s without weakening enforcement or repairing schema` | 4 | D193: missing, notUnique, wrongPartial, wrongKeyOrder |
| **Total** | **20 registrations; no skip/focus** | **28** | **Implemented, awaiting actual PG execution** |

### All 11 reserved schema-index obligations — exact implemented cases, execution pending

Each historical obligation maps once to an expanded case below. These remain **pending PG verification**, not discarded or credited to the previous fake-catalog unit fixtures.

| Historical obligation | Destination | Exact expanded title in financial-invariants.pg.test.js |
|---|---|---|
| FS-013 / D191 | I18 / missing | `journal index readiness rejects missing without weakening enforcement or repairing schema` |
| FS-014 / D191 | I18 / notUnique | `journal index readiness rejects notUnique without weakening enforcement or repairing schema` |
| FS-015 / D191 | I18 / wrongPartial | `journal index readiness rejects wrongPartial without weakening enforcement or repairing schema` |
| FS-017 / D191 | I18 / wrongKeyOrder | `journal index readiness rejects wrongKeyOrder without weakening enforcement or repairing schema` |
| FS-020 / D192 | I19 / missing | `payment decision index readiness rejects missing without weakening enforcement or repairing schema` |
| FS-021 / D192 | I19 / notUnique | `payment decision index readiness rejects notUnique without weakening enforcement or repairing schema` |
| FS-022 / D192 | I19 / wrongPartial | `payment decision index readiness rejects wrongPartial without weakening enforcement or repairing schema` |
| FS-026 / D193 | I20 / missing | `order replay index readiness rejects missing without weakening enforcement or repairing schema` |
| FS-027 / D193 | I20 / notUnique | `order replay index readiness rejects notUnique without weakening enforcement or repairing schema` |
| FS-028 / D193 | I20 / wrongPartial | `order replay index readiness rejects wrongPartial without weakening enforcement or repairing schema` |
| FS-030 / D193 | I20 / wrongKeyOrder | `order replay index readiness rejects wrongKeyOrder without weakening enforcement or repairing schema` |

Index drift does **not** drop/disable the real required guards: the original unique index/constraint is retained under a temporary name, with its valid/ready/unique status, predicate and definition asserted unchanged. Missing means missing the required catalog name; nonunique/wrong-key/wrong-predicate variants add a same-named incompatible shadow alongside the retained guard. `verifyRuntime` uses a real independently checked-out TLS client and its genuine READ ONLY transaction; refusal must be sanitized `PG_BOOTSTRAP_SCHEMA_MISMATCH`, followed by ROLLBACK and clean release, with no COMMIT/DDL/DML or automatic repair. All account/resource/journal rows and the migration ledger must remain identical. Finally only test-created shadow indexes are dropped and original names restored; exact index catalog equality and successful readiness are required. The order wrongPartial variant targets the actual **decision** partial index; purchase uniqueness is unconditional SQL and is not weakened or replaced with an invented Mongo-shaped partial purchase rule.

### financial-models.test.js — all 78 historical obligations mapped once

New I-cases below are implemented, **not yet executed**. Existing independent unit credits are intentionally retained as unit coverage, not recounted as PG. Retired mechanisms keep their original rationale and, where applicable, independent portable protection; no Mongoose behavior is recreated.

| Historical source IDs | Exact implemented / existing destination | Portable obligation and current status |
|---|---|---|
| FM-001 | Retired hydration mechanism; I01/I05 independently protect mandatory SQL cents | No nullable-cent Mongoose hydration/default/migration API |
| FM-002 / D162 | I01 | Explicit zero initialization and generated mirror — awaiting PG PASS |
| FM-003–FM-014 / D163 | `money-contracts.test.js:65` — `invalid cents reject the entire historical coercion and unsafe-value matrix` | All 12 JavaScript invalid/coerced-cent variants closed in verified C3.2c1; not PG executions |
| FM-015–FM-019 / D164 | I01 | All five exact generated-mirror cent variants — awaiting PG PASS |
| FM-020–FM-022 / D165, D166 | I04 + `money-contracts.test.js:48` — `string precision beyond two digits is rejected even for trailing zeros`; `:53` — `numeric excess precision and nonfinite or signed amounts are rejected` | SQL generated protection plus executed unit precision rejection; compound closure awaits PG PASS |
| FM-023 / D167 | `user-repository.test.js:419` — `unrepresentable numeric mirrors are rejected before a cents update`; `financial-coordinator.pg.test.js:1432` — `malformed adjustment matrix rejects before pool acquisition or account effects` | Existing verified write-boundary rejection; I03 separately proves exact SQL MAX remains valid |
| FM-024 | Retired Mongoose validation-disable option; I04 independently protects generated mirrors | No save-validation flag or middleware analogue |
| FM-025 / D168, D169 | `financial-coordinator.pg.test.js:1008` — `production scope authority rejects forgeries and revokes committed handles`; `user-repository.test.js:345` — `financial cents compare-and-swap uses one scoped client and neither writes mirrors nor commits` | Existing PG scope and supporting unit CAS; do not duplicate |
| FM-026 / D169, D012 | `user-repository.test.js:345`; `:432` — `financial stale versions and changed before cents fail before mutation` | Existing verified independent CAS/read-state unit credit; not an extra PG test |
| FM-027–FM-031 | Retired document markModified/lazy migration and overwritten legacy-float mechanisms; I01/I04 and executed money precision cases independently protect current representation | No legacy writable pair adoption/hydration path |
| FM-032 / D011 | `user-repository.test.js:82` — `safe mappings reject coerced BIGINT and inconsistent generated balance, without creating defaults` | Existing verified unit corrupt-read evidence; do not disable generation to fabricate impossible SQL drift |
| FM-033 | Retired partial hydrated document migration; existing safe mapping at `user-repository.test.js:82` | No partial-document source/default fabrication |
| FM-034 / D170 | I05 | Mandatory cents cannot be removed — awaiting PG PASS |
| FM-035–FM-046 | Retired Mongo operator/session matrix; I04 and existing scope/CAS cases independently protect current writes | No operator emulation or arbitrary Mongo ClientSession |
| FM-047 / D168, D171 | `financial-coordinator.pg.test.js:1008`; `:1067` — `rollback also revokes its scope and balance handle` | Existing verified active private scope and rollback revocation |
| FM-048–FM-052 / D172 | I04/I15/I16 + `financial-coordinator.pg.test.js:1432` | Existing strict canonical intent validation plus generated mirror and scoped rollback/evidence protection; compound SQL closure awaits PG PASS, no writable Mongo pair syntax |
| FM-053–FM-057 | Retired implicit/explicit $set session forwarding and query-driven legacy migration/defaults; existing scoped-client/CAS and safe mapping units remain | No query hydration or migration API |
| FM-058 / D011 | `user-repository.test.js:82` | Existing verified unit inconsistent read-evidence rejection |
| FM-059 | Retired Mongoose upsert/multi-account/untargeted model APIs; existing `financial-coordinator.pg.test.js:1008` protects owner-bound scope | No new balance setter/upsert API |
| FM-060 / D173 | `users-server.pg.test.js:227` — `theme-only update keeps token version, sessions and money unchanged` | Existing verified ordinary nonfinancial mutation |
| FM-061 / D174 | I07 | Source-free canonical USD/replay evidence — awaiting PG PASS |
| FM-062–FM-064 / D175 | I07/I08 + executed `money-contracts.test.js:65`, `financial-coordinator.test.js:155` — `noncanonical or invalid desired cents %s are rejected before connecting` | Mandatory safe SQL before/after, nonwritable generated delta, strict independent application cents; SQL transport strings are not public coercion acceptance; compound closure awaits PG PASS |
| FM-065 / D176, D177 | I07/I10/I11 + executed `money-contracts.test.js:100` — `addition is exact at the safe boundary and rejects overflow`; `:106` — `subtraction permits exact zero but rejects underflow` | Exact signed generated full-boundary deltas and directional contracts plus checked unit arithmetic — awaiting PG PASS |
| FM-066–FM-067 / D178 | I09 + existing `financial-coordinator.test.js:168` — `invalid key %j is rejected without acquiring a client` | Real SQL evidence/key/hash grammar plus application coercion rejection — awaiting PG PASS |
| FM-068 / D179 | I10 | Complete or absent adjustment source — awaiting PG PASS |
| FM-069 / D180 | I10 | Source-backed identity cannot be omitted — awaiting PG PASS |
| FM-070 / D181 | I10 | Source/type/effect/owner/direction consistency — awaiting PG PASS |
| FM-071 / D182 | I11 | Migration-shaped audit preserves value/actual target — awaiting PG PASS |
| FM-072 / D183 | I07 | Canonical generated replay balance, not an independently writable result — awaiting PG PASS |
| FM-073 / D184 | I07 + existing `financial-coordinator.test.js:161` — `unknown privileged field %s is rejected before any connection` | Fixed SQL columns/generated evidence and narrow JS allowlists replace StrictModeError/metadata APIs — awaiting PG PASS |
| FM-074 / D013, D185 | `financial-coordinator.pg.test.js:466` — `adjustment atomically commits exact balance, version and journal`; `financial-coordinator.test.js:62` — `BEGIN, limits, sorted locks, financial DML, evidence check and COMMIT precede one clean release` | Existing PG atomic transaction/scoped client, supporting unit sequence |
| FM-075 | Retired Mongoose save-validation option; I08/I09 independently protect SQL evidence | No save-validation bypass API |
| FM-076 / D013, D186 | `financial-coordinator.pg.test.js:466`; `:1392` — `append-only and immutable guards remain enabled in the disposable schema`; I12 supplies additional immutable/DELETE/TRUNCATE paths | Existing PG shared transaction and append-only guard credit, without duplicating original reason/fulfillment UPDATE |
| FM-077 / D187 | I12 | Real immutable row UPDATE/DELETE/TRUNCATE protection; model bulk/hydrate/replace syntax retires — awaiting PG PASS |
| FM-078 / D001 | I13/I14/I12 + I18–I20 | Real unique/source/history definitions, scope behavior and durable retention; no autoIndex/autoCreate/TTL emulation — awaiting PG PASS |

Historical FM accounting remains unchanged until verification: 5 existing PG / 4 existing non-PG / 42 new / 27 retired = 78. C3.2c1 already closed 12 of the 42 new via executed money units; **30 FM compound/SQL obligations and all 11 FS schema obligations await this pass's PG acceptance**. Once verified, the intended FM reconciliation is **35 executed/credited PG + 16 executed non-PG + 27 retired = 78**, and FS becomes **38 executed/credited PG + 4 executed non-PG + 22 retired = 64**. These are projected dispositions, not current pass claims. Other historical inventories are not silently reclassified merely because they share a destination. Current verified cumulative accounting remains **210 PG / 27 non-PG / 201 pending new / 25 changed disabled / 61 retired = 524** until acceptance.

### Allocation deviations and isolation

- Original forecast 6 user + 8 journal + 6 uniqueness + 8 append/resource = 28 is reconciled as **6 user + 6 journal/generated + 5 scope/resource + 11 real index-readiness = 28**. The 11 required schema variants receive their own executions rather than disappearing inside a generic unit credit. Related matrices share one registration; no assertion loop is counted as multiple cases.
- Existing reason UPDATE, order fulfillment UPDATE, scoped authority/CAS, successful coordinator atomic writes and nonfinancial mutation are credited, not reimplemented. New immutable identity/evidence columns, DELETE/TRUNCATE and negative cross-table contracts add genuine SQL gaps.
- Negative resource cases have successful complete control pairs, actual existing actor/owner/source/FK targets, intended CHECK/trigger error assertions and complete before/after snapshots after rollback. Wrong-kind refund references a real existing journal, not a missing UUID. TRUNCATE uses actual dependent rows with CASCADE so the append guard, not an unrelated FK refusal, is tested.
- Index drift retains original enforcement; neither triggers nor constraints/generated columns are disabled. Historical Mongoose casts/defaults/save hooks and Mongo-only index options retire, while portable money/evidence/security obligations remain mapped independently.

### Verification status and safe deletion gate

- `node --check backend/tests/financial-invariants.pg.test.js`: **PASS** (syntax only, not Jest/PG execution).
- New suite SHA256: `3556debfece3c3449ce15caeabd068ec92f65ec5bf781af312317729d3034355`.
- `financial-models.test.js` SHA256 remains `edd7d8175945d3e303bff3f23934c2d52f1a9c5a003c85cbfea49f41d793c6a9`; **not deleted** because the required new-suite/full-PG gate has not run.
- Whole-tree importer/reference scan: `grep -RIn --exclude=COVERAGE_LEDGER.md --exclude-dir=node_modules -- 'financial-models' backend/tests/` — **zero matches** before any deletion. A fresh scan is required again immediately before authorized cleanup after acceptance.
- `money-contracts.test.js` SHA256 remains `069b1ca21962c0327854a9a882fd5ce8ccf835a593755c0c2bbbc479b154d281`; no unit test code changed. Previous verified counts remain 36/36 money and 237/237 supporting units; they are not claimed rerun in C3.2c2.
- Targeted command (blocked before execution; awaiting actual output): `bash backend/tests/run-disposable-pg.sh backend/tests/financial-invariants.pg.test.js` — expected 28 cases / 1 suite.
- Full command (blocked before execution; awaiting actual output): `bash backend/tests/run-disposable-pg.sh backend/tests/*.pg.test.js` — expected 791 cases / 10 suites.
- Static reconciliation: **PASS** — all 524 historical source rows byte-for-byte unchanged; all 78 FM IDs mapped exactly once; all 11 pending FS schema IDs mapped exactly once; exact I-case titles/registration lines resolve; 17 plain registrations plus 11 table expansions; no skip/focus, trigger disabling, constraint dropping, replication-role bypass or generated-column override.
- Final `git diff --check`: **PASS**. Working tree changes are only this ledger and the new invariants suite; the legacy models suite and every other tracked file remain unchanged. No commit performed in this pass.
- Safety-check failures did not execute the commands; no override or harness bypass used. The exact commands were provided to the user for manual execution. Deletion and passing/closed ledger statuses remain gated on real passing output. C3.2d has not begun.

## C3.2c2 — verified targeted completion and authorized cleanup

**This completion record supersedes every pending/not-executed status in the C3.2c2 implementation checkpoint above, and the applicable historical planned destinations, without rewriting the 524 historical source rows.** All **I01–I20** allocation rows above are now **executed PG PASS**: 17 ordinary cases plus 4 + 3 + 4 index-table expansions = **28/28 passing cases across 20 registrations**. Assertion loops remain one Jest case, not additional executions. The corrected targeted result was supplied by the user from the real disposable PG18 harness: **1/1 suite, 28/28 tests, 0 snapshots, 4.757 s**, with all five migrations applied. Final full-PG cleanup acceptance is now **EXECUTED AND PASSING**: the user's post-cleanup run passed **791/791 tests across 10/10 suites**, 0 snapshots, **125.304 s**; the final acceptance record below supersedes the earlier pending checkpoint.

### Exact executed allocation and index closure

Executed breakdown: **6 user-balance/frozen-version + 6 journal/generated-contract + 5 scope/resource-evidence + 11 real index-readiness = 28 PG cases**. All exact I-case titles, registration lines and the complete 78-row FM reconciliation remain in the implementation table above; their new PG destinations are now PASS, not pending. Existing scope/CAS, atomic writes, reason UPDATE, order fulfillment UPDATE, nonfinancial mutation, strict money/unit validation and safe read mapping are credited at their exact surviving destinations rather than duplicated.

All **11 formerly pending schema-index obligations are now closed** by these exact expanded passing names in `financial-invariants.pg.test.js`:

| Historical obligation | Executed PG PASS destination |
|---|---|
| FS-013 / D191 | `journal index readiness rejects missing without weakening enforcement or repairing schema` |
| FS-014 / D191 | `journal index readiness rejects notUnique without weakening enforcement or repairing schema` |
| FS-015 / D191 | `journal index readiness rejects wrongPartial without weakening enforcement or repairing schema` |
| FS-017 / D191 | `journal index readiness rejects wrongKeyOrder without weakening enforcement or repairing schema` |
| FS-020 / D192 | `payment decision index readiness rejects missing without weakening enforcement or repairing schema` |
| FS-021 / D192 | `payment decision index readiness rejects notUnique without weakening enforcement or repairing schema` |
| FS-022 / D192 | `payment decision index readiness rejects wrongPartial without weakening enforcement or repairing schema` |
| FS-026 / D193 | `order replay index readiness rejects missing without weakening enforcement or repairing schema` |
| FS-027 / D193 | `order replay index readiness rejects notUnique without weakening enforcement or repairing schema` |
| FS-028 / D193 | `order replay index readiness rejects wrongPartial without weakening enforcement or repairing schema` |
| FS-030 / D193 | `order replay index readiness rejects wrongKeyOrder without weakening enforcement or repairing schema` |

The complete FM map above remains authoritative. The **30 remaining FM compound/SQL obligations** now closed are **FM-002, FM-015–FM-022, FM-034, FM-048–FM-052, FM-061–FM-073 and FM-077–FM-078**. Their exact I-case and supporting existing-unit/PG destinations are unchanged; every new I-case now has executed evidence. FM-003–FM-014 were already closed by the 12 verified C3.2c1 money-unit obligations. Existing FM credits and all 27 retired mechanisms retain their original independent rationale; no Mongoose casts/defaults/save hooks, writable mirrors, lazy migration, Mongo operator emulation or TTL options were recreated.

Current **FM reconciliation: 35 executed/credited PG + 16 executed non-PG + 27 retired = 78**. Current **FS reconciliation: 38 executed/credited PG + 4 executed non-PG + 22 retired = 64**. No portable FM or FS obligation remains pending. Conservative current cumulative accounting for explicitly reassessed source obligations: **251 PG / 27 non-PG / 160 pending new / 25 changed disabled / 61 retired = 524**. This pass moves **41 obligations** (30 FM + 11 FS) from pending to executed/credited PG; it does **not** claim 41 new tests. Other historical inventories are not silently reclassified merely because they share a destination.

### Corrected test query, deletion and verification gate

- Earlier manual targeted run: **27 passed / 1 failed / 28 total**. Earlier full manual run: **790 passed / 1 failed / 791 total; 9 suites passed / 1 failed / 10 total**. Every other PG suite passed; the sole failure was the new I15 test query's shared UUID/VARCHAR parameter typing, not runtime/schema/trigger/constraint behavior. These failed runs are not relabeled as passing.
- The only test fix was at **L330** in the query beginning at L327: `decision_result_operation_reference=$4` became `decision_result_operation_reference=$4::UUID::TEXT`, matching the UUID typing already required by `refund_operation_id=$4::UUID`. The expected `23514 / ORDER_REFUND_EVIDENCE_MISMATCH` assertion was not weakened. No other query, assertion, test file, runtime, migration, package or preserved feature was changed by the fix.
- Corrected targeted manual run: **PASS — 28/28 tests, 1/1 suite, 0 snapshots, 4.757 s** — `bash backend/tests/run-disposable-pg.sh backend/tests/financial-invariants.pg.test.js`. Exact 28 passing titles and all five applied migrations were supplied by the user; the previously failing I15 now passes.
- Corrected invariants suite SHA256: `825030dd8d0111749a43ce9158dd5ab47deb9e8a39fc6ce10f0f09dadd6aee39` (supersedes the pre-fix hash in the implementation checkpoint).
- A fresh whole-tree pre-deletion scan — `grep -RIn --exclude=COVERAGE_LEDGER.md --exclude-dir=node_modules -- 'financial-models' backend/tests/` — found **zero references/importers outside this ledger**. The unchanged pre-deletion legacy SHA256 was `edd7d8175945d3e303bff3f23934c2d52f1a9c5a003c85cbfea49f41d793c6a9`.
- **Deleted only `backend/tests/financial-models.test.js`**, after the user's corrected 28/28 PASS and the fresh zero-importer scan, as explicitly authorized. The earlier checkpoint's retained-file/pending-deletion statements are superseded. No additional helper or test was deleted.
- Unit test code is unaffected. `money-contracts.test.js` SHA256 remains `069b1ca21962c0327854a9a882fd5ce8ccf835a593755c0c2bbbc479b154d281`. Prior verified counts remain **36/36 money + 237/237 supporting units**; these are not claimed rerun in this cleanup pass.
- Final full PG run **after deletion**: **EXECUTED / PASSING** — `bash backend/tests/run-disposable-pg.sh backend/tests/*.pg.test.js`; the user supplied **791/791 passing tests across 10/10 passing suites, 0 snapshots, 125.304 s**. Acceptance recorded at **2026-10-31T07:22:47+03:00** (record-observation timestamp, not an inferred test start/end time). The earlier normal tool attempt was blocked before execution by the unavailable safety checker; the subsequent manual harness result completes the acceptance gate. No safety override, application .env sourcing or harness bypass was used.
- Allocation deviations are exactly those recorded above: consolidate related matrices and credit existing PG cases to allocate **11 distinct schema-readiness executions** within the 28-case target. The order wrongPartial case tests the actual **decision** partial index; purchase uniqueness remains unconditional SQL. Real enforcing indexes are retained, triggers/constraints/generated columns stay enabled, and negative resource fixtures fail for their intended invariant.
- Post-deletion whole-tests-tree reference/importer scan: **zero matches outside this ledger**. The authorized file is confirmed absent.
- Final static reconciliation and syntax checks: **PASS** — all 524 historical source rows byte-for-byte unchanged; all 78 FM IDs and all 11 FS schema IDs mapped exactly once in their respective reconciliation records; exact I-case titles/lines and corrected suite hash resolve; obligation totals balance; only the ledger, new invariants suite and legacy models deletion differ from HEAD; no staged changes. `git diff --check` passes.
- Protected boundaries remain unchanged: no runtime/migration/package edits, no edits to payment-notifications/Nodemailer/disabled-feature suites or other preserved features. No commit performed in this pass. **C3.2d has not begun and requires user approval.**

## C3.2c — final full-PG acceptance and phase closure

**Acceptance recorded at 2026-10-31T07:22:47+03:00.** This is the time the supplied result was recorded/observed, not a test execution start or end time. The user supplied the final post-cleanup disposable-PG result: **EXECUTED / PASSING — 10/10 suites, 791/791 tests, 0 snapshots, 125.304 s**. This completes C3.2c2's final acceptance gate; earlier failed and blocked runs remain accurate historical checkpoints.

### Closed approved C3.2c1/c2 obligations

- **C3.2c1: CLOSED** — 36/36 independent money cases, all eight added coordinator gaps (35/35 total coordinator PG cases), 237/237 supporting unit cases, 763/763 then-current full PG cases, authorized financial-service deletion and zero importers.
- **C3.2c2: FULLY VERIFIED / CLOSED** — 28/28 invariants cases, all 11 explicitly reserved FS schema-index obligations and all 30 remaining FM obligations executed/credited at their exact destinations, authorized financial-models deletion with fresh zero-importer checks, and final 791/791 full-PG acceptance.
- **No approved C3.2c1/c2 deliverable or portable FM/FS obligation remains pending.** FM remains 35 executed/credited PG + 16 executed non-PG + 27 retired = 78; FS remains 38 executed/credited PG + 4 executed non-PG + 22 retired = 64.
- Final verified PG total: **791 tests / 10 suites**, including 28 invariants and 35 coordinator cases; these targeted counts are subsets, not additional cases. Selected verified independent unit total: **36 money + 237 supporting = 273 cases across 4 suites**. Unit code was unchanged and these units were not rerun during final ledger bookkeeping; 273 is not a claim about the repository-wide unit suite.

**Accounting boundary:** phase closure does not retroactively reconcile the four earlier deleted Mongo inventories. The conservative source-obligation rollup remains **251 PG / 27 non-PG / 160 pending new / 25 changed disabled / 61 retired = 524**. The 160 unreconciled entries comprise **9 financial-models.mongo + 23 financial-service.mongo + 69 orders.mongo + 59 payments.mongo**. They may have surviving destinations, but exact complete reconciliation has not been established by this finalization; neither passing test totals nor matching suite filenames justify blanket coverage credit. This is outstanding historical accounting, not a claim that 160 distinct runtime gaps exist, and not a newly implemented C3.2c deliverable. The overall C3.2 ledger is therefore not wholly closed.

### Verified C3.2 deletion inventory

Git comparison **7439b8d..113313e** records **14 deleted test/helper files** across C3.2:

- Four Mongo suites: `financial-models.mongo.test.js`, `financial-service.mongo.test.js`, `orders.mongo.test.js`, `payments.mongo.test.js`.
- Three C3.2a helpers: `helpers/legacyOrdersRoutes.js`, `helpers/legacyPaymentsRoutes.js`, `helpers/mongoServer.js`.
- Three later helpers: `helpers/legacyCsrf.js`, `helpers/legacyMongoAuth.js`, `helpers/legacyUsersRoutes.js`.
- Four converted legacy suites: `avatar-upload.test.js`, `users-admin-authorization.test.js`, `financial-service.test.js`, `financial-models.test.js`.

All paths are relative to `backend/tests/`. The requested **11-file grouping** is four Mongo suites + three later helpers + four converted suites; adding the three C3.2a helpers gives the actual **14-file all-phase total**. No further file is deleted in this ledger-only finalization.

### Historical-row preservation and finalization boundary

- **524 historical source-obligation rows remain byte-for-byte unchanged.** The original C3.2a ledger had 550 table-data rows: 524 source rows plus 26 supporting data rows. The current ledger has **769 table-data rows = 524 historical source + 26 original supporting + 219 added completion/reconciliation rows**. Headers and separator rows are excluded. This final acceptance record uses prose/bullets, so it adds no table-data rows; it does not turn the supplemental 245 rows into historical source cases.
- Only `backend/tests/COVERAGE_LEDGER.md` changes during finalization. Runtime, migrations, package files, test implementations and preserved features remain untouched. No new PG rerun is claimed for a documentation-only edit and no commit is performed.

### C3.2d1 — plan only, implementation not authorized

Planning budget remains approximately **73 new cases**: **16** in `disabled-features.pg.test.js`, **33** in `disabled-features.test.js`, and **24** in the replacement `payment-notifications.test.js`. Counts are forecasts, not execution claims or quotas permitting duplicate coverage.

- **PG (~16):** audit and credit existing disabled-prefix, admin, reserve/restore, HEAD and preflight cases first. Add only genuine gaps in non-admin disabled prefixes (including compare-token), credential-independent rejection with zero database/session activity, bodyless HEAD and real composition CORS/preflight/cache behavior, and prefix/subpath isolation. Use the guarded real disposable PG harness; preserve FEATURE_UNAVAILABLE, ENDPOINT_DISABLED and enabled-route distinctions. Do not recreate already covered D132/D161/D223/D159 behavior merely to fill the budget.
- **Independent disabled units (~33):** cover actual isolated router/controller contracts and inert socket, scheduler, backup, cleanup, admin-notification and legacy-session stubs. Preserve the existing direct legacy-admin validation/auth behavior separately from the application's disabled prefix. Assert exact POSTGRES_MIGRATION_PENDING markers and absence of database/storage/SMTP/socket/queue/timer/secret-generation side effects. Do not import or mock deleted Mongo models or enable any disabled entrypoint.
- **Notification units (~24):** reconcile all **23 PN historical obligations** to the current wholly disabled utility contract, then add one genuine contract gap for the frozen, uniform unavailable result. Financial and generic/nonfinancial dispatch both remain unavailable. Initialization adds no listeners; notify neither sends nor queues; markNotificationSent performs no read/write. Use inert/hostile inputs and side-effect assertions, not legacy Mongo fixtures or real sockets.
- **Approval/verification gates:** obtain user approval before creating or changing tests; map exact cases and credit existing coverage before implementation; run targeted units/PG and full PG, check zero deleted-model imports and unchanged protected files, and update ledger with executed counts only after passing output. If normal execution is safety-blocked, supply the exact approved harness commands for manual execution; never override safety or bypass harness guards.
- **Nodemailer is deferred and untouched.** Its retained real SMTP coverage and obsolete controller coupling require a separately approved phase. No C3.2d implementation has begun.
