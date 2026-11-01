# C5b — Frontend contracts

Baseline audit: `frontend-overhaul`, HEAD `fcbd810`, 2026-11-01. Current source contracts, not desired migration contracts. C5b.1 updates the five coordinator-backed mutation HTTP envelopes after the approved Option B fix: financial HTTP 196/196 and full PostgreSQL 829/829 passed. No new live-browser verification; C5a's user-verified authentication/visual results remain separate.

Companions: [BINDINGS.md](BINDINGS.md), [GAPS.md](GAPS.md). `C-*` are contract identifiers; `N01`–`N60` cover every inventoried fetch/secureFetch/fetcher/read call site. All citations are repository-relative; `js/` abbreviates `frontend/public/assets/js/`.

## C-TRANSPORT — cookies, headers, CSRF, response wrappers

- Actual route mounts: `backend/services/serverApplication.js:58–95`; historical routers are not evidence of enabled endpoints.
- Same-origin native fetch sends same-origin cookies by default. Missing `credentials:'include'` alone is not a cookie defect.
- Auth cookies: HttpOnly `session_token`, `customSessionId`, path `/`, SameSite Lax, Secure according to deployment. Signed HttpOnly Express cookie sessionId binds exact server state, distinct from customSessionId (`backend/services/auth/httpSessionAdapter.js:7–14`). Readable `x-csrf-token` cookie is SameSite Strict, also published as response header (`backend/services/auth/httpRouter.js:22–38`).
- Optional `Authorization: Bearer <token>` and `x-session-id` must agree with cookies; stale stored credentials can cause `CREDENTIAL_CONFLICT` (`backend/middlewares/auth.js`). Cookie authority is not overridden by headers.
- Ordinary modifying auth/profile/financial requests require current `x-csrf-token` tied to the exact authenticated/Express session (`backend/services/auth/httpCsrf.js`). CSRF, row-version, purchase idempotency, and payment submission identifiers are distinct.
- secureFetch (`js/securefetch.js:77–137`) accepts only same-origin HTTP(S), no embedded URL credentials; uses credentials include, redirect error, JSON content type for non-FormData bodies, CSRF bootstrap for non-GET/HEAD/OPTIONS. Bootstrap GET `/api/auth/csrf` is no-store, shared, validates hex64 token against readable cookie and follows rotation. No automatic write replay; CSRF_INVALID resets initialization.
- secureFetch returns **not a native Response**: `{success:true,status:number,data:any}` or `{success:false,status:number,code:string,error:string,type:string,remainingAttempts?:number}`. Client codes include CROSS_ORIGIN_REQUEST_BLOCKED, CSRF_BOOTSTRAP_FAILED, CSRF_COOKIE_UNAVAILABLE, INVALID_RESPONSE, NETWORK_ERROR. N26 is the loader wrapper's actual native dispatch.
- PurchaseClient.headers (`js/utils/purchaseClient.js:10–19`) emits JSON content type, Bearer from userToken, x-session-id from customSessionId (even empty values), CSRF only if cookie already exists. No independent CSRF bootstrap. OrderClient shares it and expects native Response. Do not substitute structured secureFetch without adapting financial semantics.
- Auth strict JSON ≤16KiB, 100 requests/15 minutes; financial writes strict JSON where applicable ≤16KiB, 60 requests/minute/actor. Both no-store (`backend/services/auth/httpRouter.js:11–17`; `backend/services/financial/httpCommon.js:10–17`). Browser supplies multipart boundaries.

## C-ERRORS — actual failure envelopes

Auth/user: `{success:false,code:string,error:code}`; full mappings `backend/services/auth/httpErrors.js:3–32`. No promised localized message, details, old invalid_username type, or remaining password-login attempts. Before route handling:503 SERVICE_NOT_READY and429 RATE_LIMITED use the same success:false/code/error envelope (`backend/services/serverApplication.js:44–56`); CORS403 `{code:'CORS_FORBIDDEN',error:'CORS_FORBIDDEN'}` (:98–99). Groups: invalid input400; missing/invalid/conflicting credentials401; CSRF/role/account restrictions403; missing user404; duplicate identifier/CAS409; rate limits429; storage/unknown outcome503; avatar provider502/504.

Financial: same base envelope, full mappings `backend/services/financial/financialErrors.js:3–42`; optional retryWithSameKey:true for FINANCIAL_OUTCOME_UNKNOWN and eligible FINANCIAL_UNAVAILABLE/FINANCIAL_RETRY_EXHAUSTED. Retry identical saved intent/key. PAYMENT_SUBMISSION_OUTCOME_UNKNOWN has optional paymentId and retrySubmission:false: recover, do not blindly re-upload. Upload size413 INVALID_PAYMENT_UPLOAD, reconciliation/funds/already-decided/conflict409, reads404/503, rate limit429.

Disabled prefixes (`backend/services/serverApplication.js:64`) return503 `{success:false,code:'FEATURE_UNAVAILABLE',error:'FEATURE_UNAVAILABLE'}`. Unknown `/api` paths return404 `{code:'NOT_FOUND',error:'NOT_FOUND'}` without success (`:77`). Catalog errors differ below. A network failure does not prove a write failed to commit.

## C-USER — public user and version types

Exactly projected by `backend/repositories/userRepository.js:95–104`:

```text
{id:UUID,username:string,email:string,emailVerified:boolean,phone:string|null,
 provider:string,theme:0|1,balanceCents:integer-string,balance:decimal-string,
 avatar:string,role:string,accountStatus:string,twoFAStatus:string,
 lastLogin:timestamp|null,activatedAt:timestamp|null,rowVersion:integer-string,
 createdAt:timestamp,updatedAt:timestamp}
```

No public _id, password hash, tokenVersion, loginAttempts. provider local/google; role user/admin/moderator; accountStatus active/suspended/deactivated; twoFAStatus disabled/pending/enabled (`backend/db/migrations/001_create_users_table.sql:23–43`). UUIDs canonical lowercase. expectedRowVersion is canonical nonnegative integer string,≤16 digits and≤9007199254740991 (`backend/services/auth/persistence.js:16`), from accepted DTO, not an implicit refreshed version after dispatch. Username trimmed ASCII `[A-Za-z0-9_]{3,30}`; email trimmed/lowercase valid email≤254 chars; phone server-validated international mobile (profile null clears). Password untrimmed,≥8 chars lower/upper/digit/symbol,≤72 UTF-8 bytes. Validation: userRepository and `backend/repositories/private/userProfileAtomic.js`.

## C-RESOURCE — financial DTOs, pagination, summaries

`backend/repositories/private/resourceReads.js:50–95`:

```text
Common={_id:UUID,id:UUID,userId:UUID,status:'pending'|'completed'|'cancelled',
 createdAt:timestamp,method:string,decisionReason:string|null,decidedAt:timestamp|null}
OrderDTO={...Common,orderId:string,service:string,quantity:number,chargeCurrency:string,
 chargeCents:integer-string,amount:decimal-string,refundAmountCents:integer-string|null}
PaymentDTO={...Common,paymentId:string,claimedAmountMinor:integer-string,amount:decimal-string,
 currency:string,amountCents:integer-string|null,amountInUSD:decimal-string,note:string|null}
Page<T>={items:T[],nextBefore:string|null}
OrderSummary={counts:{pending:integer-string,completed:integer-string,cancelled:integer-string},
 chargedCents:integer-string,refundedCents:integer-string,netChargeCents:integer-string}
PaymentSummary={counts:{pending:integer-string,completed:integer-string,cancelled:integer-string},
 approvedUsdCents:integer-string,claimedMinorByCurrency:{USD:integer-string,SYP:integer-string,USDT:integer-string}}
```

Public ord-/pay- references differ from row UUIDs; supported historical references use server key grammar. No receiptImage, legacy flag, or private fulfillment target in ordinary DTO. User/financial lists are objects, catalog lists arrays.

Queries (`backend/services/financial/httpCommon.js:20–29`): owner list optional limit integer-text1–100(default50), before opaque signed cursor, status enum; **no userId**. Admin `/all` additionally optional userId UUID; pending `/admin` only limit,before,userId. Owner summary no query; admin summary only userId; all detail/private/recovery no query fields. Cursor continuation via nextBefore, not an assumed complete limit100 history (`backend/repositories/private/pagination.js:1–20`).

## C-RESULT — committed financial acknowledgment

Coordinator receipts remain pure financial projections without a success field (`backend/services/financial/contracts.js:219–226`; `backend/services/financialCoordinator.js:207,230–232`), unchanged in C5b.1. The HTTP routers add success:true to a new object while preserving every receipt field (`backend/services/financial/ordersHttpRouter.js:14,34`; `backend/services/financial/paymentsHttpRouter.js:53,58`). The committed helper still sends its supplied value unchanged (`backend/services/financial/httpCommon.js:32–35`). HTTP acknowledgment shape:

```text
{success:true,orderId OR paymentId:string,userId:string,status:string,replayed:boolean,
 [purchase/cancel] chargeCurrency:'USD',chargeCents:integer-string,charge:decimal-string,quantity:number,
 [payment approve] currency:'USD',amountCents:integer-string,
 [journal-backed] balanceCents:integer-string,balance:decimal-string,operationId:string}
```

Purchase replay reports the original pending snapshot; decision results report decided status. Non-journal decisions need not have balance fields. **All five mutation endpoints and their replays include success:true only in the HTTP envelope**; upload submission and all read/recovery shapes remain unchanged. Both frontend result.success===true guards are unchanged and now compatible (**G-P0-01 RESOLVED**). Live HTTP acknowledgment assertions pass in financial-http.pg.test.js (196/196), alongside the unchanged 25/25 frontend suite and 829/829 full PostgreSQL gate.

## C-AUTH — local authentication/session flows

All modifying calls below use secureFetch C-TRANSPORT unless stated; no body fields beyond those listed. Anonymous registration/login reject existing credentials409 AUTH_ALREADY_AUTHENTICATED.

| Trigger / sites | Method/path and request | Actual success | Current frontend success/failure navigation |
|---|---|---|---|
| registerForm submit; N16 | POST `/api/auth/register`; username,email,password required strings; phone optional nonempty string | 201 `{success:true,user:UserDTO}`; account only, no login session | register.js:188–245 trims username/email; digits-only national phone+countryCode, omit empty phone; auth.register validates user.id; toast/alert→login.html1600ms. Failure stays, old type mapping falls back to raw/general code (G-AUTH-03) |
| loginForm submit; N17 | POST `/api/auth/login`; identifier,password required strings. Server allows exactly one of identifier/username/email plus password | 200 `{success:true,user:UserDTO,token:string,sessionId:string,csrfToken:hex64,expiresAt:ISO-timestamp,redirectTo:string}` and rotated cookies | auth.login validates, login.js persists three auth keys then redirects2100ms; admin→homepage.html, all others→`/`, ignoring backend redirectTo. Failure stays |
| First factor with enabled2FA | Same login request | 200 `{success:true,requires2FA:true,challengeId:string,csrfToken:hex64,expiresAt:ISO-timestamp}`; pending challenge cookie, no login | auth.js:48–51 returns TWO_FACTOR_AUTH_REQUIRED, never persists pending login. Overlay has no completion handlers (G-AUTH-02) |
| homepage logoutBtn+confirmation; N18 | POST `/api/auth/logout`, no body; auth+CSRF | 200 `{success:true}`, exact session revoked, cookies cleared | auth.js:76–82 clears auth-owned keys after success, returns success/message only; manager clearBrowserData(false), replace logout.html100ms. Failure toast, manager also clears browser data on failure. logout.html itself makes no logout call (G-STORAGE-01) |
| login DOM ready; N24 | GET `/api/auth/check-session`, no body | `{success:true,isAuthenticated:true,user:UserDTO}`; unauthenticated401, not anonymous200 | Authenticated uses local mapper above; failed check stays login. Cosmetic401 user-reported |
| HomePage init/second DOM-ready startup; N19 | Same GET, auth.checkSession(expectedRole?) | Same success | auth helper failure/unauthenticated/wrong role→401.html, null (`auth.js:90–116`); separate startup callers can check session |
| secureFetch bootstrap; N25 | GET `/api/auth/csrf`; Accept JSON,include cookies,no-store,reject redirect,no body | `{success:true,csrfToken:hex64}`+matching cookie/header | Cookie comparison before write; bootstrap failure structured, no write/navigation |
| Before purchase/decision; N55,N57 | GET `/api/auth/session-info`, shared legacy headers+cookies; OrderClient no-store | `{success:true,isAuthenticated:true,userId:UUID,expiresAt:epoch-ms}` | Verify original actor and unchanged storage/header pair; throw on failure, retain prior intent, no automatic navigation |

Backend evidence: `backend/services/auth/httpRouter.js:56–89,111–119`; UI `js/login.js:5–23,180–263,270–299`; `js/register.js:176–257`. Register errors400 INVALID_* /409 USER_USERNAME/EMAIL/PHONE_TAKEN; login401 INVALID_LOGIN,403 AUTH_FORBIDDEN/CSRF_INVALID; auth throttle429 AUTH_RATE_LIMITED; common storage503. Password login promises no remaining-attempt count. Normal login expiry ISO string (`backend/services/auth/sessionIssuance.js:27`); pending2FA expiry ISO string (`backend/services/auth/pendingChallenges.js:37,100`); session-info exposes middleware epoch milliseconds.

## C-OAUTH — native Google flows and Apple placeholder

- Login Google click `js/login.js:34–38`; register has placeholder no-op listener `js/register.js:24` plus actual navigation `:56–58`. Native GET `/api/auth/google`, no user profile/body authority, anonymous session regenerated; sealed state/nonce/PKCE;302 provider authorization.
- Provider GET `/api/auth/google/callback`: required query state; allowed code,scope,authuser,prompt,error,error_description; consume state before verified provider exchange, Google subject lookup/create, no automatic email linking. Errors OAUTH_STATE_INVALID/GOOGLE_PROVIDER_INVALID401, GOOGLE_ACCOUNT_LINK_REQUIRED409, GOOGLE_AUTH_UNAVAILABLE503 plus C-ERRORS (`backend/services/auth/httpRouter.js:91–109`).
- HTML callback sets cookies then admin302→`/protectedViews/admin.html`, other302→`/google-redirect.html`, pending2FA→`/login.html?twoFactor=required`. JSON Accept callback returns normal/pending C-AUTH envelope. **No token/session query parameters appended.**
- google-redirect.js:18–56 requires token/customSessionId query or immediately→login.html. N23 GET `/api/users/me` sends query-derived Bearer/x-session-id, expects plain UserDTO, writes welcomeMessage/auth storage; success role destination after2500ms: admin protectedViews/admin.html, user homepage.html, moderator moderator/dashboard.html, support support/center.html; failure alert→login. Current cookie-only callback cannot meet legacy query contract (G-AUTH-01). Do not add real credentials to URLs as a workaround.
- Apple login/register click navigates `https://appleid.apple.com/auth/authorize` with placeholder client_id, deployment `/api/auth/apple/callback`, response_type=code,scope=email name,response_mode=form_post (`js/login.js:42–51`; `js/register.js:60–68`). No live Apple callback or promised success shape (G-FEATURE-01).

## C-PURCHASE — server-priced persisted intent

Catalog card click opens PurchaseDialog; confirm-btn click `js/dialogs/purchaseDialog.js:143–181`. Required category apps|games|cryptos|balances string; productId positive safe integer; exactly one quantity positive safe integer OR packageIndex nonnegative safe integer (not -0). Required idempotencyKey string1–128, first alphanumeric then `[A-Za-z0-9._:-]`, added as purchase-UUID. Optional fulfillmentTarget only per product policy (`backend/utils/orderInput.js`; `backend/utils/fulfillmentTarget.js`). No owner/client price/player-name authority/chosen network fields.

N58 POST `/api/orders/purchase`, exact saved JSON, no query, auth+CSRF+rate limit. Required target exactly one matching property accountId|playerId|walletAddress|email|phone:string. Server validates/canonicalizes and derives network bitcoin-mainnet/ethereum-mainnet/tron-mainnet/bsc-mainnet; no target for products not requiring one. Server derives quantity/pricing/limits/availability.

Success201 new/200 replay **C-RESULT with success:true**; replay also has replayed:true (G-P0-01 RESOLVED). The unchanged client accepts the acknowledgment, emits purchaseConfirmed, and the dialog success handler alerts orderId/charge and closes. Failure stays dialog/restores safe-text saved selection/target. Errors400 input/key/target;409 funds/conflict/product/reconciliation;401/403 auth/CSRF;429;503 configuration/unknown/unavailable.

PurchaseClient (`js/utils/purchaseClient.js:32–69`) checks owner/session first, saves exact intent/key before dispatch, marks unknown before network, rejects replacing saved selection; in-flight suppressed by dialog. Unknown transport/JSON retains key. New definite400 or INSUFFICIENT_FUNDS may clear; prior unknown remains on later auth/business/503. Replayed historical balance must not replace current balance. These invariants constrain any C5c repair.

## C-ORDERS — list/private read/admin decisions

| Trigger/sites | Request (no body on GET) | Actual success/current behavior |
|---|---|---|
| Orders init/filter/refresh after purchase N27 | GET `/api/orders?limit=100`, owner query C-RESOURCE | Page<OrderDTO>; orderstab.js:54 expects array (G-DATA-01), local filter, no redirect |
| Orders details-btn N28 | GET `/api/orders/:orderId/fulfillment`, no query, owner | `{orderId,userId,fulfillmentSnapshot:null\|{schema,validationVersion:1,network,target:{[schema]:string}}}`; modal shows authorized target/error |
| Admin startup/generated refresh N51 | GET `/api/orders/admin?limit=100`, admin | Pending Page<OrderDTO>; adminOrders expects array (G-DATA-01) |
| Recover saved decision absent from queue N52 | GET `/api/orders/admin/:orderId`, no query, admin | Plain OrderDTO; error notification, no redirect |
| Generated admin fulfillment button N53 | GET `/api/orders/admin/:orderId/fulfillment`, no query, admin | Same authorized private shape, not list target |
| Generated admin accept/reject/retry N56 | PUT `/api/orders/:orderId/accept` or reject; required idempotencyKey,reason strings; no query,admin+CSRF | 200 C-RESULT with success:true; accept status completed, reject status cancelled; cancellation journal refund; identical-decision replays retain success:true/replayed:true (G-P0-01 RESOLVED) |

Reason string, trimmed/nonempty≤500 chars; order decisions also reject control characters and `<>&'"` plus backtick. Key grammar as purchase (`backend/services/financial/contracts.js:58–61`). OrderClient (`js/utils/orderClient.js:31–48`) verifies original actor, saves action/reason/key decision-UUID before dispatch, retains rejection/unknown for reconciliation, retries identical intent, never applies historical balance. Errors400 invalid input/key/reason,404 resource,409 already-decided/conflict/reconciliation,429,503 and auth/CSRF. Backend `backend/services/financial/ordersHttpRouter.js:8–35`.

## C-PAYMENT-SUBMIT — wallet and recovery

Wallet add-funds-btn uses payment-method-select,amount-input,receipt-upload,note-input. N46 POST `/api/payments` multipart **currently emits** userId,method,amount,amountInUSD,receipt file,note; native same-origin cookies, no CSRF/submission header (`js/tabs/wallettab.js:196–212`). FX/fees preview only.

Live contract (`backend/services/financial/paymentsHttpRouter.js:9–24`; `backend/services/paymentSubmissionService.js:21–30`): auth+CSRF, required `x-submission-id:UUID`, no query; multipart one receipt file, required text method/amount decimal-string, optional note string≤500 no angle brackets, trimmed. Exactly three allowed text fields; no userId/amountInUSD/currency/provider authority. File≤5MiB, one JPEG/PNG/WebP, validated content/no animation≤16M pixels,≤800×800 JPG, private server-owned receipt (`backend/middlewares/paymentUpload.js`).

Server claimed limits (`backend/config/paymentMethods.js:5–12`): visa USD10–100; shamcashdol USD10–200000; shamcash SYP10000–200000000; syriatel/mtn SYP5000–550000; bank USD50–1000; webmoney USD20–200000; usdt USDT10–200000000. No immediate balance credit from claim/FX.

Success201 `{paymentId:string,status:'pending'}` without success flag; current status==='success' condition never resets/callbacks on live success (G-PAYMENT-01). Failure alert/stay; errors400 upload/method/amount/note/UUID,413 file size,409 PAYMENT_SUBMISSION_EXISTS,503 receipt/submission/unknown plus auth/CSRF/rate limit.

GET `/api/payments/submissions/:submissionId`, authenticated,no query/body→`{outcome:'committed',payment:PaymentDTO}` OR `{outcome:'unresolved',paymentId:string,retrySubmission:false}`. Wallet has no saved submission UUID or recovery caller. PAYMENT_SUBMISSION_OUTCOME_UNKNOWN must reconcile here, **not** blindly resubmit with new UUID (G-FORM-01).

## C-PAYMENTS-READ — history, signed receipt, admin decisions

- N29 PaymentsTab init/filter GET `/api/payments?userId=<stored-id>`: invalid owner query; live Page<PaymentDTO>, client bare array/quiet[] fallback, accepted/rejected/receiptImage assumptions. Details button reads cache, not server detail/receipt (G-DATA-02).
- N05 admin pending GET `/api/payments/admin`: admin Page<PaymentDTO>, legacy array renderer (G-DATA-01).
- N10/N11 admin generated accept/reject PUT `/api/payments/:paymentId/accept|reject`, JSON content type **no body/CSRF**. Live accept requires approvedAmount decimal-string,idempotencyKey string,reason string; reject requires key/reason; admin+CSRF,no query,200 C-RESULT with success:true (accept status completed, reject status cancelled), including success:true/replayed:true on identical-decision replay. Current notification removed in finally even failure/unknown (G-PAYMENT-02). Errors400 fields/amount/key/reason,403,409 already-decided/conflict/reconciliation,503 unknown,429.
- GET `/api/payments/:paymentId/receipt`, owner/admin,no query/body→`{url:string,expiresAt:epoch-ms}`, signed provider URL about60 seconds, Referrer-Policy:no-referrer. No current caller. Legacy `/images/payments`410 LEGACY_RECEIPT_UNAVAILABLE is not a substitute.
- Other list/detail/summary variants are C-RESOURCE; backend `backend/services/financial/paymentsHttpRouter.js:19–58`. No frontend authority over approved credit from FX.

## C-PORTFOLIO — read-only data and local exports

Initialization, time/transaction-filter click, refresh-portfolio click reload/locally filter (`js/tabs/portfoliotab.js:137–181,217–245`). N30 GET `/api/users/:id/balance`→`{balanceCents:integer-string,balance:decimal-string,rowVersion:integer-string}`. N31 GET `/api/payments?userId=…` invalid owner query; N32 GET `/api/orders?limit=100` Page. Shared legacy headers+cookies, no body. Current direct .filter on JSON objects fails; local displayed balance/FX not authority (G-DATA-02/03).

N33/N34 GET `/api/payments/summary`, `/api/orders/summary`, no query/body; actual C-RESOURCE summaries, renderer expects old totalInUSD/totalCompleted/totalPending/totalCancelled and pending/completed/cancelled/netCharges (`:606–692`). Error logs/local empty/error UI, no redirect. Export TXT/JSON local Blob/download, PNG experimental alert only (`:736–806`); no export backend request. Local time filter does not complete server pagination.

## C-PROFILE — self profile, theme, completion

- N23 GET `/api/users/me` OAuth redirect, query-derived matching headers; N48 GET `/api/users/:id` UserManager only after obsolete probe; self/admin plain UserDTO. N30 balance projection above. No body; errors401/403/404/503. UserManager validates numeric balance/uses .toFixed, incompatible with current string DTO (G-USER-01).
- N44 settings-form PUT `/api/users/:id` currently optional nonempty name,email,phone,password,avatar, Bearer+JSON, no CSRF/version/currentPassword; upload precedes patch. Live **self-only** required expectedRowVersion integer-string plus nonempty allowed patch username/email/phone/theme/password/currentPassword; rejects name/avatar/extra fields; currentPassword required for password change; phone nullable. Success200 `{success:true,user:UserDTO,requiresReauthentication:boolean}`; identity/password changes revoke session graph/clear cookies; theme-only keeps auth. UI does not honor reauth (G-PROFILE-01).
- N49 UserManager.saveUser PUT `/api/users/:id`: entire private user object, Bearer only, JSON string without JSON content type, obsolete probe prerequisite. Same required live patch/version/CSRF contract; current toast only/no reauth handling.
- N50 UserManager.setUserTheme PUT `/api/users/${this.#user._id}/theme`, `{theme:number}`, Bearer+JSON, no CSRF/version. Live public id, required expectedRowVersion string/theme0|1; same atomic result. Private user may be null before try. Local theme.js visual switch is not successful server persistence (G-USER-01).
- N01 completeProfileForm POST `/api/auth/complete-profile`, currently fullName,country,phone strings JSON/no CSRF/version. Live auth+CSRF required expectedRowVersion string, optional username string/phone string|null, nonempty patch, same reauth result. Intended SweetAlert→homepage.html2000ms on res.ok; failure obsolete message (G-PROFILE-02).

Sources: `backend/services/users/httpRouter.js:51–73`; `backend/services/auth/httpRouter.js:124–129`; `js/tabs/settingstab.js:73–106,209–260`. Settings computes hasErrors but still saves. CAS409 USER_VERSION_CONFLICT is not permission for implicit fresh-version replay. Other errors400 INVALID_* fields/version,403 CURRENT_PASSWORD_INVALID/CSRF_INVALID,409 duplicate identity,503 unknown/storage.

## C-AVATAR — upload/removal

N42 picker/save POST `/api/users/:id/avatar`, FormData one avatar file/Bearer only, **missing CSRF/x-row-version**. Live self+CSRF, required `x-row-version:integer-string`; zero text fields; one≤5MiB JPEG/PNG/WebP/BMP/TIFF supported image, generated owned provider ID,≤800×800 JPG,30sec provider timeout (`backend/middlewares/upload.js`; `backend/services/users/httpRouter.js:86–108`). Client is narrower JPEG/PNG/WebP≤2MiB (`js/tabs/settingstab.js:111–134`). Success200 `{success:true,avatar:string,user:UserDTO}`; current uploader reads avatar without res.ok check.

N43 remove-avatar-btn confirmation POST avatar/remove Bearer/no body; live required JSON `{expectedRowVersion:integer-string}`+CSRF; success200 `{success:true,avatar:'',user:UserDTO}`. Preview/toast/refresh or failure toast, no navigation (G-PROFILE-01). Errors400 avatar/version/fields,409 CAS,502 provider fail,504 timeout,503 uncertainty. Never erase assets after uncertain commit or accept client-chosen provider URL as profile authority.

## C-ADMIN-USERS — legacy controls versus enabled routes

`backend/protectedViews/admin.html:38–66`; `js/admin.js:79–114,201–299`; `backend/services/users/httpRouter.js:41–84`.

| Sites/trigger | Emitted request | Actual contract/outcome |
|---|---|---|
| N04 loadUsers | GET `/api/users`, no body/headers | Admin Page<UserDTO>; optional limit1–100,before,role,accountStatus; legacy array/_id assumptions (G-DATA-01) |
| N06 updateBalanceBtn | PUT users/:id/balance, JSON balance:number via parseFloat, no CSRF | Admin+CSRF then503 FINANCIAL_UNAVAILABLE, not enabled adjustment; result error shown |
| N07 updateStatusBtn | PUT users/:id/status, JSON status:string, no CSRF | Absent PUT route404; enabled POST auth/admin/update-status requires userId UUID,newStatus active|suspended,expectedRowVersion string,admin+CSRF→success/user |
| N08 generated deleteUser | DELETE users/:id, no body/CSRF | Live admin+CSRF, JSON expectedRowVersion required; deactivation not hard delete→success/atomic result |
| N09 generated unbanUser | POST users/:id/unban, no body/CSRF | Absent404; live PUT users/:id/activate, expectedRowVersion,admin+CSRF→success/atomic result |

All paths `/api/` prefixed. No frontend automatic redirects. Self-status/deactivation may clear cookies; invalid ID/version400,role/CSRF403,missing404,CAS409,storage503. Self-profile PUT is not an admin-edit-other-user endpoint (G-ADMIN-01).

## C-LEGACY — absent and explicitly disabled operations

| Sites/screen trigger | Request fields/transport | Actual result and frontend behavior |
|---|---|---|
| N47 UserManager load/save prerequisite | POST `/api/compare-token`, clientToken:string JSON,Bearer,include cookies | Disabled503; expects match===true, blocks load/save. Locked C6; not landing probe (G-USER-01) |
| N14 AppManager init | GET `/api/cards`, no body | Disabled503→[]; actual categories C-CATALOG |
| N13 dashboard analytics only if authToken stored | POST `/api/analytics`, Bearer+JSON content type, no body | Absent404, warning/no navigation |
| N02 forgotPasswordForm | POST `/api/auth/forgot-password`, email:string JSON,no CSRF | Absent404; intended success alert only; failure error alert |
| N03 resetPasswordForm | POST `/api/auth/reset-password`, token:string query/hidden,newPassword:string JSON, confirmation local | Absent404; intended success alert→relative login.html, failure alert |
| verify.html:14 native form | POST `/api/auth/request-activation`, URL-encoded username='[[USERNAME_HERE]]',no CSRF | Absent404 JSON through native navigation; support.html absent |
| N35 SecurityTab init | GET `/api/security/status` | Disabled503, reads absent emailVerified/twoFAEnabled |
| N36 verify-email-btn | POST `/api/auth/send-email-verification`, no body/CSRF | Absent404, obsolete message read |
| N37 enable-2fa-qr-btn | GET `/api/security/generate-qr` | Disabled503, expects success/qr, failure status |
| N38 missing verify-2fa-btn | POST `/api/security/verify-token`, token:string JSON,no CSRF | Disabled503; missing token-input/button prevents UI dispatch (G-BIND-02) |
| N39 send-2fa-email-btn | POST `/api/security/send-2fa-email`, no body/CSRF | Disabled503, obsolete message read |
| N40 verify-2fa-email-btn | POST `/api/security/verify-2fa-email`, token:string JSON,no CSRF | Disabled503, expects success/message |
| N41 confirm-disable-btn | POST `/api/security/disable-2fa`, confirmCode:string JSON,no CSRF | Disabled503, expects success/message |
| N12 admin test-button | POST `/dev/simulate-notification`, type:string,payload:{status:accepted-or-rejected,amount:100,service:string,paymentId:'test-pay-id',orderId:'test-order-id'},targetRole:'user',targetUserId:string JSON,no CSRF | Disabled503; client alerts data.message (undefined on fixed code/error response), no supported live notification |

Legacy SecurityTab changes are not calls to live pending-login2FA. Disabled routes share C-ERRORS; no fabricated legacy success DTO. All failures stay screen except native form navigation. Missing features G-FEATURE-01/02; do not remount historical backend services under this audit.

## C-CATALOG — arrays of operator products

N22 `js/core/cards.js:38` called by `js/appmanager.js:213–217`: GET `/api/apps`, `/api/games`, `/api/cryptos`, `/api/balances`, options default{}, no body/required auth/CSRF→product arrays. N15 _fetchAppsData GET apps is dormant (no discovered caller).

`backend/routes/catalog.js:6–12`; `backend/services/catalogService.js:35–60,78`: raw operator product plus normalized/derived fields, variable schema, not closed UserDTO. Required id:number,name:string,category:string,available:boolean,requiresFulfillmentTarget:boolean,fulfillmentSchema:string|null,sourceFile:string. Current scalar price is a decimal **string**, quantity:number, priceCents:number; package pricing menuPrice:true,price:(number|string)[],quantity:number[],pricesCents:number[]. games.json uses numeric price arrays; balances.json menu products use string arrays; all current scalar prices are strings. Derived minQuantity,maxQuantity,minChargeCents,maxChargeCents numbers. Additional current raw keys: icon:string,fulfillmentValidationVersion:1,fulfillmentNetwork:string|null,optional menuPrice:boolean and minLimit/maxLimit:number. Apps omit menuPrice/limits; games use menus; balances mixes scalar/menu; crypto sources scalar. Operator properties retained without a closed extra-field whitelist; no description field in current data files. Data variants `backend/data/{apps,games,balances,cryptos,payments,mobile-payments}.json`.

Invalid configuration atomic fail503 `{success:false,code:'FULFILLMENT_CONFIGURATION_INVALID'|'UNSUPPORTED_NETWORK',error:'The category catalog is unavailable'}`; UI logs/[]/error, no redirect. Displayed price never purchase authority.

## C-EXTERNAL — provider and WebSocket requests

- N45 Wallet GET `https://v6.exchangerate-api.com/v6/<client-key>/latest/<base-currency>`, no body/auth/session/CSRF; result==='success' conversion_rates or local rate fallback (`js/tabs/wallettab.js:88–113`). Embedded key deliberately omitted; errors/network warning→fallback, no redirect (G-FEATURE-03).
- Admin active ws(s)://same host (`js/admin.js:12–54`), open sends JSON type:'auth',role:'admin',userId:stored; backupStatus handled, financial types ignored; close retry5sec.
- Homepage active socket after second authenticated startup (`js/homepage.js:509–578`), same-origin; sends type:'auth',role:'user',userId:stored,sessionId:stored-or-generated. Expects userId-matching welcome/newPayment/newOrder/balanceUpdate, accepted/rejected messages. No current composition-root WebSocket upgrade initialization: frontend expectations, **not supported backend authorization contracts** (G-FEATURE-02). Wallet socket commented/excluded.
- Native external script/style/image/navigation loads: Font Awesome/cdnjs, jsDelivr Chart.js/CryptoJS/SweetAlert and HTTPS js-cookie ES-module import (`js/core/taber.js:1`), md5, DiceBear (`js/tabs/settingstab.js:48–50`), ui-avatars (`js/usermanager.js:155–156`), Wikimedia/advertisement images, WhatsApp. No deliberate auth/CSRF fields. Page entrypoints/resources in BINDINGS; not backend JSON calls.
- No axios/XMLHttpRequest/sendBeacon calls found in frontend JS/HTML/protected admin/public401 scope.

## C-ASSETS — icon fetches and service-worker pass-through

N20 `js/core/cache-manager.js:135` GET iconPath→blob/image cache; N21 `:175` HEAD candidate paths→response.ok, no body/JSON envelope. N59 `frontend/public/sw.js:71` GET decoded `/icons/<name>` for `/cache/<base64-name>`, image validation/cache-first/default icon fallback.

N60 `sw.js:102` fetch(original Request) preserves method/body/headers/credentials. **No explicit API/auth/financial bypass**; non-/cache/ paths network-first. Only GET image responses deliberately cached, not auth/financial JSON. Network exception tries caches.match then503 text 'Service unavailable', possibly invalid/unknown to JSON clients. No write replay. Fetch loader messages; homepage module worker registration scope `/` (`js/homepage.js:585–588`), commented class-local registration/message listener excluded. G-ASSET-01 is scope/privacy review, not observed financial-response caching.

## C-NO-FORM — enabled backend coverage not currently bound

Missing caller is not always missing form; reads/bootstrap/recovery may be programmatic. Evidence G-FORM-01.

| Enabled endpoint (all /api prefixed except health) | Exact request/success | Current coverage |
|---|---|---|
| GET auth/pending-2fa | Anonymous pending cookie/Express binding,no body→success/requires2FA/challengeId/csrfToken/expiresAt | No caller, legacy overlay unbound |
| POST auth/verify-2fa-login | Anonymous+CSRF,challengeId/code strings→normal login or403/429 `{success:false,code:'INVALID_2FA_CODE'|'TOO_MANY_2FA_ATTEMPTS',remainingAttempts:number}` | No login completion handler |
| POST auth/refresh-csrf | Auth,no body→success/csrfToken | No direct caller; GET bootstrap used |
| POST auth/admin/update-status | userId,newStatus,expectedRowVersion required;admin+CSRF→success/user | Button calls wrong endpoint |
| PUT users/:id/activate | expectedRowVersion required;admin+CSRF→success/atomic result | Unban wrong method/path |
| GET orders/:id; orders/all; orders/summary/all | Plain OrderDTO;admin Page<OrderDTO>;admin OrderSummary | No callers; owner summary via portfolio; admin pending/detail/private covered |
| GET payments/:id; payments/admin/:id; payments/all; payments/summary/all | Plain PaymentDTO;admin detail;admin Page<PaymentDTO>;admin PaymentSummary | No callers; owner summary via portfolio |
| GET payments/submissions/:submissionId; payments/:id/receipt | Recovery / signed-link C-PAYMENT-SUBMIT and C-PAYMENTS-READ contracts | Missing programmatic recovery/receipt consumer |
| GET essential | Operator parsed JSON;503 CONFIGURATION_UNAVAILABLE | No frontend fetch; config/infrastructure |
| GET /health | 200/503 `{status:'ok'|'NOT_READY',ready:boolean,database:'postgresql'}` (`backend/services/serverApplication.js:32–42`) | Infrastructure; no user form expected |

User queries optional limit,before,role,accountStatus; financial queries C-RESOURCE. GET users/:id and balance permit self/admin; PUT profile/theme/avatar self-only. Disabled POST orders410 LEGACY_ORDER_CREATION_DISABLED, users reserve/restore410 ENDPOINT_DISABLED, disabled prefixes and absent reset/Apple/security routes are not enabled missing forms.

## C-ROUTING — actual destinations

`backend/services/serverApplication.js:88–95`: `/` and `/dashboard` public dashboard; `/login`/`/register` aliases. `/homepage[.html]` and `/admin[.html]` authenticated **admin-only**. Served admin source `backend/protectedViews/admin.html`, no frontend/public/admin.html. `/protectedViews/admin.html` not mounted protected/static route. `/google-redirect.html` public legacy-query-dependent. `/401.html` from backend/public. Local nonadmin login intentionally `/`, no user dashboard. Moderator/support destinations/support.html absent (G-ROUTE-01/02). Authorization restriction is not itself a P0 bug.

## Network call-site coverage

The following appendix enumerates dispatch helpers as well as their callers. Dynamic endpoints resolve through the contracts above; absence/dormancy is explicit, not silently omitted.


| Site | Source/function | Contract | Emitted call |
|---|---|---|---|
| N01 | `frontend/public/complete-profile.html:45` module/inline | C-PROFILE | `fetch('/api/auth/complete-profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fullName, country, phone }) })` |
| N02 | `frontend/public/forget-password.html:116` module/inline | C-LEGACY | `fetch('/api/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })` |
| N03 | `frontend/public/reset-password.html:103` module/inline | C-LEGACY | `fetch('/api/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: document.getElementById('token').value, newPassword }) })` |
| N04 | `frontend/public/assets/js/admin.js:83` loadUsers | C-ADMIN-USERS | `fetch('/api/users')` |
| N05 | `frontend/public/assets/js/admin.js:120` loadPendingPayments | C-PAYMENTS-READ | `fetch('/api/payments/admin')` |
| N06 | `frontend/public/assets/js/admin.js:212` module/inline | C-ADMIN-USERS | `fetch(/api/users/${userId}/balance, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ balance: parseFloat(newBalance) }) })` |
| N07 | `frontend/public/assets/js/admin.js:245` module/inline | C-ADMIN-USERS | `fetch(/api/users/${userId}/status, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }) })` |
| N08 | `frontend/public/assets/js/admin.js:271` deleteUser | C-ADMIN-USERS | `fetch(/api/users/${id}, { method: 'DELETE' })` |
| N09 | `frontend/public/assets/js/admin.js:288` unbanUser | C-ADMIN-USERS | `fetch(/api/users/${id}/unban, { method: 'POST' })` |
| N10 | `frontend/public/assets/js/admin.js:315` module/inline | C-PAYMENTS-READ | `fetch(/api/payments/${paymentId}/accept, { method: 'PUT', headers: { 'Content-Type': 'application/json' } })` |
| N11 | `frontend/public/assets/js/admin.js:339` module/inline | C-PAYMENTS-READ | `fetch(/api/payments/${paymentId}/reject, { method: 'PUT', headers: { 'Content-Type': 'application/json' } })` |
| N12 | `frontend/public/assets/js/admin.js:384` sendTestNotification | C-LEGACY | `fetch('/dev/simulate-notification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, payload, targetRole: 'user', targetUserId: userId }) })` |
| N13 | `frontend/public/assets/js/app.js:115` sendAnalytics | C-LEGACY | `fetch('/api/analytics', { method: 'POST', headers: { 'Authorization': Bearer ${localStorage.getItem('authToken')}, 'Content-Type': 'application/json' } })` |
| N14 | `frontend/public/assets/js/appmanager.js:53` fetchCards | C-LEGACY | `fetch('/api/cards')` |
| N15 | `frontend/public/assets/js/appmanager.js:69` _fetchAppsData | C-CATALOG | `fetch('/api/apps')` |
| N16 | `frontend/public/assets/js/auth.js:21` register | C-AUTH | `secureFetch('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) })` |
| N17 | `frontend/public/assets/js/auth.js:41` login | C-AUTH | `secureFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) })` |
| N18 | `frontend/public/assets/js/auth.js:68` logout | C-AUTH | `secureFetch('/api/auth/logout', { method: 'POST' })` |
| N19 | `frontend/public/assets/js/auth.js:92` checkSession | C-AUTH | `secureFetch('/api/auth/check-session', { method: 'GET', })` |
| N20 | `frontend/public/assets/js/core/cache-manager.js:135` fetchFromNetwork | C-ASSETS | `fetch(iconPath)` |
| N21 | `frontend/public/assets/js/core/cache-manager.js:175` _findIconPath | C-ASSETS | `fetch(path, { method: 'HEAD' })` |
| N22 | `frontend/public/assets/js/core/cards.js:38` fetchCards | C-CATALOG | `fetch(this.apiEndpoint, this.options)` |
| N23 | `frontend/public/assets/js/google-redirect.js:24` module/inline | C-OAUTH | `fetch('/api/users/me', { headers: { Authorization: Bearer ${token}, 'x-session-id': sessionId } })` |
| N24 | `frontend/public/assets/js/login.js:18` module/inline | C-AUTH | `secureFetch('/api/auth/check-session')` |
| N25 | `frontend/public/assets/js/securefetch.js:48` ensureCsrfToken | C-TRANSPORT | `fetch('/api/auth/csrf', { method: 'GET', headers: { Accept: 'application/json' }, credentials: 'include', redirect: 'error', cache: 'no-store' })` |
| N26 | `frontend/public/assets/js/securefetch.js:137` secureFetchWithLoader | C-TRANSPORT | `fetch(url, options)` |
| N27 | `frontend/public/assets/js/tabs/orderstab.js:53` loadOrders | C-ORDERS | `this.client.read('/api/orders?limit=100')` |
| N28 | `frontend/public/assets/js/tabs/orderstab.js:146` showDetailsModal | C-ORDERS | `this.client.read(/api/orders/${encodeURIComponent(order.orderId)}/fulfillment)` |
| N29 | `frontend/public/assets/js/tabs/paymentstab.js:46` loadPayments | C-PAYMENTS-READ | `fetch(/api/payments?userId=${this.userId})` |
| N30 | `frontend/public/assets/js/tabs/portfoliotab.js:223` _fetchData | C-PORTFOLIO | `fetch(/api/users/${this.userId}/balance, { headers: this.orderClient.headers(), credentials: 'include' })` |
| N31 | `frontend/public/assets/js/tabs/portfoliotab.js:231` _fetchData | C-PORTFOLIO | `fetch(/api/payments?userId=${this.userId}, { headers: this.orderClient.headers(), credentials: 'include' })` |
| N32 | `frontend/public/assets/js/tabs/portfoliotab.js:240` _fetchData | C-PORTFOLIO | `fetch('/api/orders?limit=100', { headers: this.orderClient.headers(), credentials: 'include' })` |
| N33 | `frontend/public/assets/js/tabs/portfoliotab.js:606` fetchGlobalSummary | C-PORTFOLIO | `this.orderClient.read('/api/payments/summary')` |
| N34 | `frontend/public/assets/js/tabs/portfoliotab.js:607` fetchGlobalSummary | C-PORTFOLIO | `this.orderClient.read('/api/orders/summary')` |
| N35 | `frontend/public/assets/js/tabs/securitytab.js:36` _fetchStatus | C-LEGACY | `fetch('/api/security/status')` |
| N36 | `frontend/public/assets/js/tabs/securitytab.js:104` _sendEmailVerification | C-LEGACY | `fetch('/api/auth/send-email-verification', { method: 'POST' })` |
| N37 | `frontend/public/assets/js/tabs/securitytab.js:121` _generateQR | C-LEGACY | `fetch('/api/security/generate-qr')` |
| N38 | `frontend/public/assets/js/tabs/securitytab.js:139` _verifyToken | C-LEGACY | `fetch('/api/security/verify-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })` |
| N39 | `frontend/public/assets/js/tabs/securitytab.js:158` _sendEmailKey | C-LEGACY | `fetch('/api/security/send-2fa-email', { method: 'POST' })` |
| N40 | `frontend/public/assets/js/tabs/securitytab.js:168` _verifyEmailToken | C-LEGACY | `fetch('/api/security/verify-2fa-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })` |
| N41 | `frontend/public/assets/js/tabs/securitytab.js:188` _confirmDisable | C-LEGACY | `fetch('/api/security/disable-2fa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmCode: code }) })` |
| N42 | `frontend/public/assets/js/tabs/settingstab.js:158` uploadAvatarToServer | C-AVATAR | `fetch(/api/users/${this.userId}/avatar, { method: 'POST', headers: { Authorization: Bearer ${this.token} }, body: formData })` |
| N43 | `frontend/public/assets/js/tabs/settingstab.js:179` removeAvatar | C-AVATAR | `fetch(/api/users/${this.userId}/avatar/remove, { method: 'POST', headers: { Authorization: Bearer ${this.token} } })` |
| N44 | `frontend/public/assets/js/tabs/settingstab.js:221` saveProfile | C-PROFILE | `fetch(/api/users/${this.userId}, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: Bearer ${this.token} }, body: JSON.stringify(payload) })` |
| N45 | `frontend/public/assets/js/tabs/wallettab.js:97` fetchExchangeRates | C-EXTERNAL | `fetch(https://v6.exchangerate-api.com/v6/${API_KEY}/latest/${BASE_CURRENCY})` |
| N46 | `frontend/public/assets/js/tabs/wallettab.js:208` _submitPayment | C-PAYMENT-SUBMIT | `fetch('/api/payments', { method: 'POST', body: formData })` |
| N47 | `frontend/public/assets/js/usermanager.js:59` isValidToken | C-LEGACY | `fetch('/api/compare-token', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: Bearer ${token} }, credentials: 'include', body: JSON.stringify({ clientToken: token }) })` |
| N48 | `frontend/public/assets/js/usermanager.js:84` loadUser | C-PROFILE | `fetch(/api/users/${userId}, { headers: { Authorization: Bearer ${token} } })` |
| N49 | `frontend/public/assets/js/usermanager.js:169` saveUser | C-PROFILE | `fetch(/api/users/${userId}, { method: 'PUT', headers: { Authorization: Bearer ${token} }, body: JSON.stringify(this.#user) })` |
| N50 | `frontend/public/assets/js/usermanager.js:192` setUserTheme | C-PROFILE | `fetch(/api/users/${this.#user._id}/theme, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: Bearer ${this._getToken()} }, body: JSON.stringify({ theme }) })` |
| N51 | `frontend/public/assets/js/utils/adminOrders.js:11` loadPendingOrders | C-ORDERS | `client.read('/api/orders/admin?limit=100')` |
| N52 | `frontend/public/assets/js/utils/adminOrders.js:13` loadPendingOrders | C-ORDERS | `client.read(/api/orders/admin/${encodeURIComponent(attempt.orderId)})` |
| N53 | `frontend/public/assets/js/utils/adminOrders.js:31` renderOrder | C-ORDERS | `client.read(/api/orders/admin/${encodeURIComponent(order.orderId)}/fulfillment)` |
| N54 | `frontend/public/assets/js/utils/orderClient.js:6` read | C-TRANSPORT | `this.fetcher(endpoint, { headers: this.headers(), credentials: 'include', cache: 'no-store' })` |
| N55 | `frontend/public/assets/js/utils/orderClient.js:11` verifyOwner | C-AUTH | `this.fetcher('/api/auth/session-info', { headers, credentials: 'include', cache: 'no-store' })` |
| N56 | `frontend/public/assets/js/utils/orderClient.js:43` decide | C-ORDERS | `this.fetcher(/api/orders/${encodeURIComponent(orderId)}/${action}, { method: 'PUT', headers, credentials: 'include', body: JSON.stringify(attempt.payload) })` |
| N57 | `frontend/public/assets/js/utils/purchaseClient.js:34` purchase | C-AUTH | `this.fetcher('/api/auth/session-info', { headers, credentials: 'include' })` |
| N58 | `frontend/public/assets/js/utils/purchaseClient.js:54` purchase | C-PURCHASE | `this.fetcher('/api/orders/purchase', { method: 'POST', headers, credentials: 'include', body: JSON.stringify(attempt.payload) })` |
| N59 | `frontend/public/sw.js:71` handleIconRequest | C-ASSETS | `fetch(iconUrl)` |
| N60 | `frontend/public/sw.js:102` handleNormalRequest | C-ASSETS | `fetch(request)` |

## Fixed server error code/status appendix

These are the complete router error allowlists, not a claim that every code is reachable from every action. Route-specific/common dependencies are described above. Unknown internal errors collapse to the router default, never raw provider/SQL text.

Source: `backend/services/auth/httpErrors.js:3`.

| HTTP status | Fixed codes |
|---|---|
| 400 | `INVALID_AUTH_INPUT`, `INVALID_USER_ID`, `INVALID_AUTH_VERSION`, `INVALID_USERNAME`, `INVALID_EMAIL`, `INVALID_PHONE`, `INVALID_PASSWORD`, `INVALID_USER_CREATE_FIELDS`, `INVALID_USER_PROFILE_FIELDS`, `INVALID_AUTH_IDENTIFIER`, `INVALID_THEME`, `INVALID_AVATAR`, `INVALID_SESSION_ID`, `INVALID_SESSION_DATA`, `INVALID_SESSION_EXPIRY`, `INVALID_ROW_VERSION`, `INVALID_PAGINATION`, `AVATAR_UPLOAD_ABORTED` |
| 401 | `MISSING_CREDENTIALS`, `INVALID_CREDENTIALS`, `INVALID_AUTHORIZATION`, `CREDENTIAL_CONFLICT`, `INVALID_COOKIE`, `INVALID_AUTH_TOKEN`, `AUTH_SESSION_INVALID`, `AUTH_CHALLENGE_INVALID`, `OAUTH_STATE_INVALID`, `GOOGLE_PROVIDER_INVALID`, `INVALID_LOGIN`, `UNAUTHENTICATED` |
| 403 | `CSRF_INVALID`, `AUTH_FORBIDDEN`, `FORBIDDEN`, `CURRENT_PASSWORD_INVALID`, `AUTH_PROOF_REQUIRED`, `SECOND_FACTOR_REQUIRED` |
| 404 | `USER_NOT_FOUND` |
| 409 | `USER_VERSION_CONFLICT`, `SESSION_VERSION_CONFLICT`, `USER_VERSION_EXHAUSTED`, `AUTH_CONFLICT`, `GOOGLE_ACCOUNT_LINK_REQUIRED`, `AUTH_ALREADY_AUTHENTICATED`, `USER_EMAIL_TAKEN`, `USER_USERNAME_TAKEN`, `USER_PHONE_TAKEN`, `USER_DUPLICATE`, `USER_IDENTIFIER_AMBIGUOUS` |
| 429 | `TOO_MANY_2FA_ATTEMPTS`, `AUTH_RATE_LIMITED` |
| 502 | `AVATAR_UPLOAD_FAILED` |
| 503 | `AUTH_UNAVAILABLE`, `SESSION_UNAVAILABLE`, `AUTH_OUTCOME_UNKNOWN`, `USER_WRITE_OUTCOME_UNKNOWN`, `USER_STORAGE_ERROR`, `USER_STATE_INVALID`, `AUTH_STATE_INVALID`, `TWO_FA_STATE_INVALID`, `AUTH_RETRY_EXHAUSTED`, `AUTH_HTTP_CONFIGURATION_INVALID`, `GOOGLE_AUTH_UNAVAILABLE` |
| 504 | `AVATAR_UPLOAD_TIMEOUT` |

Source: `backend/services/financial/financialErrors.js:3`.

| HTTP status | Fixed codes |
|---|---|
| 400 | `INVALID_FINANCIAL_INPUT`, `INVALID_PURCHASE_INPUT`, `UNKNOWN_PURCHASE_FIELD`, `INVALID_IDEMPOTENCY_KEY`, `INVALID_FINANCIAL_REASON`, `INVALID_CENTS`, `INVALID_TOKEN_VERSION`, `INVALID_APPROVED_AMOUNT`, `MONEY_OVERFLOW`, `MONEY_MIRROR_UNREPRESENTABLE`, `INVALID_FULFILLMENT_TARGET`, `FULFILLMENT_TARGET_REQUIRED`, `INVALID_RESOURCE_ID`, `INVALID_RESOURCE_FILTER`, `INVALID_PAGINATION`, `INVALID_SUBMISSION_ID`, `INVALID_PAYMENT_UPLOAD`, `INVALID_PAYMENT_METHOD`, `INVALID_PAYMENT_AMOUNT`, `INVALID_PAYMENT_NOTE`, `INVALID_AUTH_INPUT`, `INVALID_USER_ID`, `INVALID_AUTH_VERSION` |
| 401 | `MISSING_CREDENTIALS`, `INVALID_CREDENTIALS`, `INVALID_AUTHORIZATION`, `CREDENTIAL_CONFLICT`, `INVALID_COOKIE`, `INVALID_AUTH_TOKEN`, `AUTH_SESSION_INVALID`, `UNAUTHENTICATED` |
| 403 | `CSRF_INVALID`, `AUTH_FORBIDDEN`, `FORBIDDEN`, `FINANCIAL_FORBIDDEN` |
| 404 | `ORDER_NOT_FOUND`, `PAYMENT_NOT_FOUND`, `FINANCIAL_USER_NOT_FOUND`, `USER_NOT_FOUND` |
| 409 | `INSUFFICIENT_FUNDS`, `IDEMPOTENCY_CONFLICT`, `ORDER_ALREADY_DECIDED`, `PAYMENT_ALREADY_DECIDED`, `ORDER_RECONCILIATION_REQUIRED`, `PAYMENT_RECONCILIATION_REQUIRED`, `FINANCIAL_RECONCILIATION_REQUIRED`, `BALANCE_RECONCILIATION_REQUIRED`, `FINANCIAL_USER_INACTIVE`, `BALANCE_CONFLICT`, `PAYMENT_SUBMISSION_EXISTS`, `PRODUCT_UNAVAILABLE` |
| 410 | `LEGACY_RECEIPT_UNAVAILABLE`, `LEGACY_ORDER_CREATION_DISABLED` |
| 429 | `FINANCIAL_RATE_LIMITED` |
| 503 | `FINANCIAL_UNAVAILABLE`, `FINANCIAL_RETRY_EXHAUSTED`, `FINANCIAL_OUTCOME_UNKNOWN`, `FULFILLMENT_CONFIGURATION_INVALID`, `UNSUPPORTED_NETWORK`, `RESOURCE_READ_UNAVAILABLE`, `RECEIPT_STORAGE_UNAVAILABLE`, `INVALID_RECEIPT_STORAGE`, `PAYMENT_SUBMISSION_UNAVAILABLE`, `PAYMENT_SUBMISSION_OUTCOME_UNKNOWN`, `AUTH_UNAVAILABLE`, `SESSION_UNAVAILABLE`, `AUTH_STATE_INVALID`, `AUTH_HTTP_CONFIGURATION_INVALID`, `AUTH_OUTCOME_UNKNOWN`, `AUTH_RETRY_EXHAUSTED` |

Exceptions: financial upload-size413; pending-login2FA403/429 has remainingAttempts and may omit error; catalog503 has human fixed error string; absent-route404 has no success; legacy receipt410 only code; global readiness/throttle/CORS as C-ERRORS.
