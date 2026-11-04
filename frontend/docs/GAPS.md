# C5b — Gap register and binding audit

Baseline `frontend-overhaul` / `fcbd810`, audited 2026-11-01. C5b was documentation only. **C5b.1 implements the approved G-P0-01 Option B HTTP acknowledgment fix**: four router-line replacements, HTTP regressions and documentation updates only. No coordinator/frontend/storage/design/feature changes, no commit/push. The five pre-existing backend/db modifications remain byte-for-byte untouched.

Companions: [CONTRACTS.md](CONTRACTS.md) (`C-*`, N01–N60 request sites), [BINDINGS.md](BINDINGS.md) (172 static ID rows, dynamic IDs, selector/listener census). All paths repository-relative; `js/` = `frontend/public/assets/js/`. Findings are static unless explicitly marked user-reported; no fresh live-browser/database reproduction is claimed.

## Classification and P0 gate

- **P0-review:** critical mismatch in documented functionality; pause before implementation. At most five executable lines is only an eligibility limit, not permission. No nominal one-line guard change is safe without validating acknowledgment/reconciliation behavior.
- **P1 / C5c:** existing interactive/contract mismatch, coordinated repair (often more than five lines). Prior financial/auth locks and storage restrictions remain effective.
- **P2 / C5d:** design/display review only; no deletion or redesign here.
- **C5e:** missing supported user feature/form; disabled backend functionality is not authorization to build/remount a feature.
- **C6:** locked legacy UserManager/auth migration boundary. Current TODO(C5b) cookie-migration comments are historical labels, not approval to migrate in this documentation phase.
- **Intentional / dormant / candidate:** not a live critical bug without reachable evidence. Literal non-use is not proof of dead code.

## Resolved

### G-P0-01 — RESOLVED: committed purchase/order HTTP acknowledgment

**Original P0:** PurchaseClient and OrderClient require result.success===true (`js/utils/purchaseClient.js:59`; `js/utils/orderClient.js:46`), but successful coordinator receipts omit success (`backend/services/financial/contracts.js:219–226`). Previously the HTTP layer sent those receipts unchanged, so committed purchases/decisions were reported as rejected or unresolved and saved keys remained. This was not evidence of duplicate charging. C-RESULT/C-PURCHASE/C-ORDERS.

Resolution: Option B — HTTP acknowledgment wrapper in ordersHttpRouter.js and paymentsHttpRouter.js. 4 lines added, 4 removed. No coordinator/financial-layer changes. Verified by financial-http.pg.test.js assertions.

The HTTP layer now adds success:true for purchase201/replay200, order completion/cancellation200, and payment approval/rejection200, including decision replays. All original receipt fields and status codes are preserved. Payment upload submission, submission recovery, read endpoints and success:false failures remain unchanged. Frontend guards, saved-intent/storage behavior, contracts.js and financialCoordinator.js are untouched.

| C5b.1 verification | Exact result |
|---|---|
| Six new HTTP acknowledgment cases before fix | Expected **6 failed**, 190 skipped, solely missing success:true; 3.171 s |
| Same six cases after fix | **6 passed**, 190 skipped; 2.478 s; purchase201/replay200 full receipt and four decisions plus their replays |
| Unchanged frontend purchase/decision suite | **25/25 passed**, 1/1 suites, 0 snapshots; 0.358 s |
| Full financial HTTP suite | **196/196 passed**, 1/1 suites, 0 snapshots; 37.266 s |
| Full PostgreSQL gate | **829/829 passed**, 13/13 suites, 0 failures/skips/snapshots; 131.82 s; includes coordinator and invariants |

G-P0-01 is resolved; manual verification and commit/push approval remain pending. G-STORAGE-01 remains **P0-Deferred-to-C5c**, with no storage/logout changes.

## Request/response discrepancies (both sides)

| Finding / classification | Frontend evidence | Backend/other-side evidence | Effect / phase / contract |
|---|---|---|---|
| G-AUTH-01 P1 OAuth continuation | google-redirect.js:18–24 requires query token/customSessionId or→login; :44–56 legacy destinations | auth/httpRouter.js:31–38 sets cookies and redirects with no credential query; serverApplication.js:88–95 has no protectedViews static route | Google continuation incompatible; coordinated cookie/role migration C5c/C5e, not credential-in-URL workaround. C-OAUTH |
| G-AUTH-02 P1 missing login2FA completion / ignored preference | login.html:54 rememberDevice; :64–73 twofa overlay/input/buttons/status; auth.js:48–51 returns TWO_FACTOR_AUTH_REQUIRED; login.js:270–299 only normal submit | auth/httpRouter.js:75–89 enabled pending challenge/read/verify, not bound by frontend; login.js:16–51 startup only check/OAuth | rememberDevice unconsumed; both verify/cancel buttons unbound. C5c/C5e; C-AUTH/C-NO-FORM |
| G-AUTH-03 P2 raw error UX (user-reported) | register.js:214–233 old type-based mapping/default general error; securefetch.js:114–124 infers legacy type from localized text | auth/httpErrors.js:16–26 fixed INVALID_*/USER_USERNAME_TAKEN/etc. strings, not old localized types | User observed raw USER_USERNAME_TAKEN; C5c translation/field mapping, not auth backend change. C-ERRORS |
| G-DATA-01 P1 paginated list treated as array | orderstab.js:53–54; adminOrders.js:11–16 .some/.push/iteration; admin.js:83–90 users.forEach and :120–123 payments.forEach | resourceReads.js:73–74 Page; users/httpRouter.js:41–49 + private/userListing.js:24 paginated users | Existing lists cannot consume current DTO; unwrap plus cursor/recovery review, coordinated >5-line C5c. C-RESOURCE/C-ORDERS/C-ADMIN-USERS |
| G-DATA-02 P1 owner payment filters/DTO | paymentstab.js:46–49 GET ?userId and bare-array fallback; :79–82,:120–130 old receiptImage/status fields; portfoliotab.js:231–236 same forbidden filter | financial/httpCommon.js:20–23 owner allowed query excludes userId; resourceReads.js:50–56 no receiptImage; paymentsHttpRouter.js:32–36 signed receipt | Empty/error history, unsupported receipt path/status; C5c with authorized signed-link consumer, not public receipt fallback. C-PAYMENTS-READ |
| G-DATA-03 P1 portfolio list/summary | portfoliotab.js:236,245 .filter on raw JSON; :633–636 old aggregate fields; :653 label says all users | resourceReads.js:73–95 Page/exact counts+cents; financial/httpCommon.js:20–23 summary scope; portfoliotab.js:606–608 actually owner summaries | Chart/history DTO adaptation, precision/pagination/scope labels C5c/C5d. C-PORTFOLIO |
| G-PAYMENT-01 P1 wallet submission contract | wallettab.js:196–212 sends extra userId/amountInUSD, no CSRF/submission UUID; :213–221 status==='success' | paymentsHttpRouter.js:9–17 required CSRF/x-submission-id; paymentSubmissionService.js:21–30 exact method/amount/note; :74 pending result | Multiple independent rejection/success handling gaps; must add uncertain-outcome recovery design (>5 lines), C5c. C-PAYMENT-SUBMIT |
| G-PAYMENT-02 P1 admin decisions/reconciliation risk | admin.js:315–329,:339–353 no body/CSRF, old accepted/rejected, remove noteBox in finally even failed/unknown | paymentsHttpRouter.js:43–58 required amount/key/reason/admin+CSRF; financialErrors.js:35–39 unknown outcome protocols | Cannot safely decide or show unresolved state; coordinated persisted-decision/recovery C5c, no quick row-removal edit. C-PAYMENTS-READ |
| G-PROFILE-01 P1 settings/avatar/CAS | settingstab.js:89–100 computes hasErrors without stopping; :158–163 avatar no version/CSRF; :179–184 remove no body; :209–229 sends name/avatar, missing expectedRowVersion/currentPassword/CSRF | users/httpRouter.js:62–72 allowed username/etc + version; :86–114 avatar header/remove JSON; private/userProfileAtomic.js:25–56 password proof/reauth | Self-profile/avatar writes incompatible; C5c coordinated validation, CAS, reauth and upload sequence. C-PROFILE/C-AVATAR |
| G-PROFILE-02 P1 legacy completion form | complete-profile.html:40–48 fullName/country/phone, no CSRF/version, :54 homepage redirect | auth/httpRouter.js:124–129 accepts expectedRowVersion + username/phone; serverApplication.js:88 homepage admin-only | Existing form not live compatible; C5c/C5e. C-PROFILE |
| G-USER-01 locked legacy UserManager (C6) | usermanager.js:59–69 disabled probe; :82 gate; :108 numeric balance, :125 .toFixed; :169–172 entire user PUT; :190 null write before try; :192 _id/theme/no version | serverApplication.js:64 probe disabled503; userRepository.js:95–104 id/string balance; users/httpRouter.js:62–72 version/self/CSRF | Load/save blocked, theme may throw on null user; not landing probe. No executable UserManager edit here; coordinated C6/C5c review. C-LEGACY/C-PROFILE |
| G-ADMIN-01 P1 old user actions | admin.js:212 balance, :245 PUT status, :271 delete no version/CSRF, :288 POST unban, :100–102 _id buttons | users/httpRouter.js:74–84 unavailable balance/activate/delete; auth/httpRouter.js:131–137 status route; userRepository.js:98 public id | Disabled/missing route and DTO mismatches; C5c admin bindings, no backend balance feature implementation. C-ADMIN-USERS |
| G-STORAGE-01 P0-Deferred-to-C5c (critical recovery concern; C6 boundary retained) | usermanager.js:223,227 calls clearBrowserData(false) on logout success **and failure**; appUtils.js:16–26 localStorage.clear/sessionStorage.clear/cookie deletion | auth.js:76–78 intends auth-only cleanup preserving financial intents; purchaseClient.js:40–51 and orderClient.js:34–39 persist exact unresolved keys there | Broad cleanup can destroy unresolved purchase/decision keys; existing behavior, no runtime reproduction. Explicit storage restriction means no fix here; recovery policy cannot be settled by a ≤5-line cleanup patch. C-AUTH/C-PURCHASE |
| G-ADMIN-02 P2 order amount display | adminOrders.js:25 line('المبلغ USD',order.charge) | resourceReads.js:53–54 OrderDTO amount/chargeCents, no charge property (C-RESULT has charge but list does not) | List amount displays '-' despite value; C5c DTO/C5d display, not backend modification |

Backend paths abbreviated in table: auth/*=`backend/services/auth/*`; financial/*=`backend/services/financial/*`; users/*=`backend/services/users/*`; resourceReads=`backend/repositories/private/resourceReads.js`; userRepository=`backend/repositories/userRepository.js`; serverApplication=`backend/services/serverApplication.js`. Frontend names are `js/` unless `.html` explicitly named.

## HTML IDs without current matching JS consumers

This category is separate from removability. Every ID is accounted for in BINDINGS; page-scoped negative searches include all entrypoint imports, helpers, constructor arguments and generated markup.

| ID(s) / definition side | JS/other-consumer side evidence | Classification |
|---|---|---|
| rememberDevice login.html:54 | login.js:270–299 reads username/password only; no remember preference consumer in login/auth modules | G-AUTH-02 ignored checkbox, C5c |
| twofa-overlay,twofa-token-input,verify-2fa-login-btn,cancel-2fa-btn,twofa-status-message login.html:64–73 | auth.js:48–51 pending auth returns failure; login.js:16–51,270–299 has no overlay/completion binding; live auth router:75–89 | G-AUTH-02 missing login2FA feature/bindings; not dead CSS deletion |
| fullName-icon/fullName-msg homepage.html:397–398; newPassword-icon/msg:418–419; confirmPassword-icon/msg:426–427 | settingstab.js:63–69,89 passes name/password/confirm; appUtils.js:103–104 derives key-icon/msg | G-BIND-03 caller/HTML mismatch; C5c. email/phone visual IDs DO match |
| searchinfo-tab-container homepage.html:178 | SearchManager:34–36 sections only home/apps/games/cryptos/balances, :113 current-category container; Taber:149 generic panes | G-BIND-04 placeholder/no specific content producer; C5e review, not automatic deletion |
| aboutDialogTitle/contactDialogTitle dashboard.html:99,132 | dashboard.html:97,130 aria-labelledby | Intentional accessibility IDs, no JS needed |
| loader index.html:42 | index.html:24 #loader style; :50–60 timer controls text not loader ID | Intentional CSS-only decoration, not missing handler |
| product-description generated purchaseDialog.js:589 | purchaseDialog.js:587–591 static description, no specific ID lookup | Intentional generated copy; no interaction required |
| global-loader-img generated loader.js:8 | loader.js:34 styles parent img; :62,74 controls parent loader | Intentional generated image, no separate ID listener |

## Handlers attached to nonexistent elements / expected missing elements

| Finding | JS expecting side | Current markup/producer side | Reachability / phase |
|---|---|---|---|
| G-BIND-01 globalSearchBar | appmanager.js:380–385 guarded lookup | homepage.html:142–145 actual .search-container/main-search-input/search-suggestions; SearchManager:65–77 class visibility works | Missing old global ID; avoid creating duplicate search component. C5c |
| G-BIND-01 current-page-indicator | homepage.js:79 caches ID | homepage.html:44–61 current topbar/back controls; no such live/generated definition in BINDINGS | Missing display hook; guarded/unused cache, not P0. C5d/C5e |
| G-BIND-02 verify-2fa-btn / token-input | securitytab.js:59 optional click attach; :136 required token read | homepage.html:469–480 QR/email controls, :479 email-token-input, :490 auth-confirm-input; neither expected ID exists | Missing QR verification pair; _verifyToken not reachable through current UI. Disabled security endpoints remain503; C5e/C5c |
| G-BIND-01 currency-select | wallettab.js:65–71 updateConvertedAmount | homepage.html:184–198 has payment-method-select, amount fields | Dormant helper, no discovered invocation; C5c review, no live P0 |
| G-BIND-03 name-icon/msg,password-icon/msg,confirm-icon/msg | appUtils.js:103–104 with settingstab.js:63–69 names | homepage.html:396–427 fullName/newPassword/confirmPassword visual IDs | Missing *computed* counterparts; use mapping review, not duplicated elements. C5c |
| G-BIND-05 last-login tag selector / undefined user | homepage.js:138–148 selects literal tag last-login, accesses undeclared user | _loadUserData call to _updateUserUI commented at homepage.js:127; homepage.html profile:73–91 no last-login tag | Dormant invalid helper; no observed live P0. C5c/C5d |

**Excluded false alarm:** homepage.html:527–540 comments out old payment-dialog, closePaymentDialog/submitPayment onclick and repeated input IDs. Those are not live nonexistent-handler findings. Constructor adsWrapper and Taber pane/container IDs are live dynamic bindings, not unreferenced. No duplicate live IDs found within a page in static parsing.

## CSS classes never literally produced / dynamic exceptions

Conservative whole-frontend lexical scan matched every other current CSS class candidate to HTML/JS. This is **not** a semantic proof all matching classes are live. Six unmatched literal candidates were reviewed; no CSS changed.

| CSS definition side | HTML/JS producer/authority side | Finding/classification |
|---|---|---|
| security-tab.css:85 .success-flash | securitytab.js:55–98 state rendering adds active/theme classes, :104–205 responses/status updates never add success-flash; homepage.html:438–501 security markup lacks it | G-CSS-01 unmatched producer candidate, disabled-security boundary. Retained; C5d review, not deletion approval |
| modal-manager.css:119 .status.approved | paymentstab.js:79,122 interpolates payment.status; resourceReads.js:16–17 limits pending/completed/cancelled | G-CSS-02 legacy approved status selector not reached by current server statuses. Dynamic interpolation means not safely declared dead solely by literal scan; C5d after C5c status mapping |
| toast-manager.css:42,46,50,54 toast-success/error/info/warning | homepage.js:442 generates toast-${type}; :481–501 success/error/info producers | Dynamic classes **not dead**; literal scanner false positives |

CSS file prefix is `frontend/public/assets/css/`. Retain H01 favorite-btn/H04 card-shadow/H05 update-time attributes for C5d visual review (`frontend/docs/CLEANUP_REPORT.md:164–168`); homepage.html:85,294 are still intentional retained hooks. No design removal now.

## Buttons without handlers versus native/placeholder behavior

| Definition side | Handler/search side | Classification |
|---|---|---|
| homepage.html:85 favorite-btn | homepage.js:225–241 wallet/settings/back bindings; appmanager.js:333–385 back/search, no favorite handler in page graph | G-BUTTON-01 true unbound favorites action; feature C5e, retained design hook C5d |
| login.html:70,71 verify-2fa-login-btn/cancel-2fa-btn | login.js normal submit/OAuth only; auth.js:48–51 does not bind overlay | G-AUTH-02 true unbound2FA buttons, C5c/C5e |
| homepage.html:267 PNG export | portfoliotab.js:167–170 bound click, :757–760 alert-only export | G-FEATURE-03 bound placeholder, **not** missing handler |
| admin.js:100 generated edit-btn | admin.js:365–368 delegated click shows notification only | G-FEATURE-03 bound placeholder, no admin-edit form, C5e |
| settings save homepage.html:431; verify.html:16; login/register submit | settingstab.js:75/form handlers; verify native action:14 | Native submit buttons, **not** missing click handlers |
| dashboard contact:141; status-page links; modal close buttons homepage:523,543,566,618 | Native links; assigned onclick at paymentstab.js:138/orderstab.js:155; homepage.js:294 | Working binding/native behavior; not missing handlers |

## Backend endpoints without frontend forms / callers

G-FORM-01 classifies every enabled unconsumed operation in C-NO-FORM; route definitions are the positive evidence, actual closest UI/caller is the other side. Reads/recovery need consumers, not necessarily forms.

| Backend definition | Missing/mismatched frontend counterpart | Phase |
|---|---|---|
| auth/httpRouter.js:75–89 pending-2fa / verify-2fa-login | login.html:64–73 unbound overlay; auth.js:48–51 short-circuits pending | C5c/C5e login2FA |
| auth/httpRouter.js:121–122 refresh-csrf | securefetch.js:48 uses GET csrf, no direct POST refresh caller | Intentional alternative bootstrap; financial freshness policy C5c |
| auth/httpRouter.js:131–137 admin/update-status | admin.js:245 calls users/:id/status instead | C5c existing button mismatch |
| users/httpRouter.js:78–84 activate | admin.js:288 calls POST unban | C5c existing button mismatch |
| ordersHttpRouter.js:18,24–25 admin all/summary-all and owner detail | orderstab.js:53 list, :146 private fulfillment; adminOrders.js:11,13,31 pending/admin detail/private only | C5e if needed; read endpoints need no native forms |
| paymentsHttpRouter.js:19–24 submission recovery | wallettab.js:196–225 no saved UUID/recovery | C5c required uncertain-submission consumer |
| paymentsHttpRouter.js:32–41 signed receipt/owner+admin detail | paymentstab.js:109–130 cached old receiptImage view, no signed-link read | C5c receipt access; C5e detail needs |
| paymentsHttpRouter.js:27 admin all/summary-all | admin.js:120 pending queue only; portfoliotab.js:606 owner summary only | C5e if needed; no misleading global user portfolio |
| serverApplication.js:32–42 health, :72–75 essential | AppManager category fetches:213–217, no infrastructure forms/callers | Intentional infrastructure/configuration, not missing user features |

Orders/payments router prefix `backend/services/financial/`; auth/users as above. Remaining enabled endpoints have callers mapped in CONTRACTS. Disabled POST orders, reserve/restore, notification/security/admin/cards prefixes and absent recovery/activation/Apple routes are not enabled missing forms.

## Missing routing/features, dormant calls and service-worker scope

| Finding / status | Frontend side | Backend/other side | Review phase |
|---|---|---|---|
| G-ROUTE-01 user dashboard / incompatible destinations | login.js:5–8 intentionally admin homepage/others `/`; google-redirect.js:44–56 old role destinations; auth/httpRouter.js:23,36 backend redirects | serverApplication.js:88–95 homepage/admin admin-only, `/` public, no protectedViews path; no moderator/support pages | User reported nonadmins cannot access admin/homepage; authorization intentional. Build user dashboard C5e, fix OAuth continuation C5c; not broaden access |
| G-ROUTE-02 placeholder/missing destinations | verify.html:19 support.html; homepage.html:127–131 social href='#'; google-redirect.js:44–48 moderator/support | serverApplication.js:93–97 static roots/fallback; no target files; root file inventory | C5e route/support features; C5d navigation design |
| G-FEATURE-01 absent auth workflows | forget-password.html:116/reset-password.html:103/verify.html:14; securitytab.js:104; login.js:45–51 Apple placeholder | auth/httpRouter.js:56–138 complete mounted router, no forgot/reset/request-activation/send-email-verification/Apple; serverApplication.js:77 fallback404 | C5e planning only, no backend changes |
| G-FEATURE-02 explicitly disabled security/notifications/socket | securitytab.js:36,121,139,158,168,188; admin.js:16,384; homepage.js:520 | serverApplication.js:60–64 explicitly no WebSocket/notification/security initialization | Existing controls have no live service; C5e/backend roadmap separately, not P0 remount |
| G-FEATURE-03 bound placeholders/provider dependency | portfoliotab.js:757 PNG alert; admin.js:365–368 edit notification; wallettab.js:94–113 embedded FX provider key/fallback | homepage.html:267 export option; admin.js:100 edit button; backend/config/paymentMethods.js:3–12 credit authority stays server | C5e feature/C5c FX preview review; do not expose key in docs or use FX for credit |
| G-DORMANT-01 obsolete helper calls | appmanager.js:69 _fetchAppsData; wallettab.js:65 updateConvertedAmount; homepage.js:127 commented _updateUserUI | category fetches use CardsService appmanager.js:213–217; active wallet listener calls updatePaymentInfo:43–44 | Dormant, no live P0; retained C5c/C5d review |
| G-ASSET-01 SW broad scope, conditional privacy/cache review | homepage.js:587 registers worker scope `/`; sw.js:102–155 intercepts all non-cache requests, GET image caching/no API exclusion | auth/financial routers no-store; sw.js:105–124 caches image responses, not deliberately JSON; signed receipt endpoint paymentsHttpRouter.js:32–36 | No observed JSON financial caching/replay. Review private-image/no-store/cache policy C5c; no SW source edit |

## User-reported C5a observations (not new reproductions)

C5a closed as fully verified and committed: one startup banner, no Token:false, no landing compare-token503, local registration/login/persistence/logout working, visuals unchanged, purchase tests25/25. User deferred raw USER_USERNAME_TAKEN and login-page check-session401 to C5c, nonadmin missing dashboard to C5e. Static discrepancies above do not invalidate those manual results; they expose flows/DTO assumptions not covered by that report.

## Deferred to C5d/C5e

Follow-up inspection after the owner verified and committed C5c.2a (`fb2a88a`),
2026-11-02. Documentation only: no layout, notification, backend, storage, or
financial changes. Visual symptoms are user-reported, not browser-reproduced.

### G-LAYOUT-01 — Homepage card alignment/distribution

- **Description:** On the admin-authorized `/homepage.html`, cards have visible
  alignment, spacing, or distribution problems.
- **Classification:** **(b) Likely pre-existing issue**, supported by source/history;
  not a confirmed C5a regression or a confirmed newly introduced defect. The exact
  affected tab/viewport and visual cause remain unverified.
- **Suspected source:** Home cards combine a 400px minimum grid track, percentage
  margins/asymmetric padding, and CSS card sizes with viewport-based inline width
  and height overrides in `js/tabs/hometab.js:238–262`. Product tabs have another
  candidate: `homepage.html:160–175` already supplies `.grid-layout` roots, while
  apps/games/cryptos/balances render a nested `.grid-layout`. They also redundantly
  inject the stylesheet already loaded in the page head.
- **History evidence:** `tabs-layout.css:4–11` still defines the product grid
  (`display:grid`, auto-fit/minmax columns, gap and padding); that file has no diff
  from `342b666^` to `fb2a88a`. C5a `342b666` removed only unused
  `.big-card-description` rules from `card-grid.css`, not its grid rules. Home card
  sizing and the reviewed product-grid construction existed before C5a; reviewed
  tab JS changes were logging/no-op fallback cleanup, not layout rewrites.
- **Priority / recommended phase:** **P2 → C5d** responsive-layout review. Compare
  pre-C5a/current screenshots at the same viewport and active tab, inspect computed
  grid/card sizes, then review conflicting size ownership and nested grids.
  No CSS/JS adjustment is authorized by this entry.

### G-NOTIFICATIONS-01 — Unexpected pending indicators on admin homepage

- **Description:** The owner sees indicators apparently representing pending
  purchase/sale approvals; possible earlier `games` product 1 / `apps` product 1
  test purchases. Whether these correspond to real pending rows or stale UI state
  is **not yet confirmed**.
- **Suspected source / source evidence:** Real undecided test orders are one
  possibility. However, `homepage.html:37` contains `#user-notifications`, whereas
  the admin pending queue's `#admin-notifications` is on
  `backend/protectedViews/admin.html:65`, loaded through `js/admin.js` and
  `js/utils/adminOrders.js:4–20`. The latter reads `/api/orders/admin?limit=100` and
  can include saved decision recovery rows; those are not automatically stale.
  Existing Page-versus-array and amount-field mismatches are already registered
  as **G-DATA-01 (P1)** and **G-ADMIN-02**; their original priorities/phases remain.
- **Notification-state evidence:** Homepage's legacy `notificationQueue` is
  in-memory (`js/homepage.js:426`), not a persistent notification store. Current
  `backend/services/serverApplication.js:60–64` disables WebSocket initialization
  and `/api/notifications`. The service worker's normal GET caching branch stores
  images, not JSON (`frontend/public/sw.js:102–124`). None of these observations
  proves what produced the reported indicator; do not assume stale JSON caching.
- **Database evidence / limitation:** A successful metadata-only, read-only
  inspection of the loopback database configured in `backend/.env.local` confirmed
  PostgreSQL 18.6 and public `orders`, `payments`, and `financial_operations` tables,
  with no public notification table. It did **not** read order/payment rows.
  Subsequent status-count/product-1 SELECT attempts were blocked by tool
  classifier timeouts/permission errors before execution. No pending counts,
  matching test order IDs, or debit/refund links are confirmed. The inspected local
  database has also not been established as the database behind the owner's
  observed browser session; the remote configuration was not queried.
- **Priority / recommended phase:** **P2 → C5d** indicator/source triage, then
  **C5e** supported queue/empty-state workflow review after existing contract gaps
  are resolved. Notification transport re-enablement remains the separate C7
  dependency, not permission to remount it in C5d/C5e.
- **Next read-only check:** Establish the browser/runtime database target, run the
  following queries there, then correlate returned public order IDs, timestamps,
  and statuses with the actual visible DOM and network responses. These queries
  are recorded for follow-up and **have not successfully executed in this pass**:

```sql
BEGIN READ ONLY;
SELECT status, count(*)::text AS count
FROM public.orders GROUP BY status ORDER BY status;
SELECT status, count(*)::text AS count
FROM public.payments GROUP BY status ORDER BY status;
SELECT order_id, catalog_category, catalog_product_id::text,
       quantity, charge_cents::text, status, created_at
FROM public.orders
WHERE catalog_category IN ('games', 'apps') AND catalog_product_id = 1
ORDER BY created_at LIMIT 50;
ROLLBACK;
```

- **Cleanup versus investigation:** If confirmed to be exclusively disposable
  test data, a separately approved SQL test-data reset is possible, but must
  reconcile/reset associated journal references and balances together. A bare
  order DELETE or status UPDATE can break financial invariants; do not use it to
  hide a badge. Non-disposable debited orders require the supported, audited
  decision/refund flow. If indicators lack matching pending database rows,
  investigate page/asset versions, DOM producer, endpoint DTOs and recovery state
  instead. Do not clear preserved purchase/order-decision intents as cleanup.
  **No SQL mutation, cancellation, refund, storage clearing, or UI fix performed.**

## Verification and scope (historical C5b documentation audit)

| Check | Result |
|---|---|
| Purchase regression suite | **25/25 passed**, `node_modules/.bin/jest --runInBand backend/tests/purchase-client.test.js`; actual browser module source with mocked responses |
| Static parsing | **PASS**:38 JS files +8 live inline script blocks +3 generated event attributes; no live HTML event attributes; commented payment markup excluded |
| Local imports/entrypoints | **PASS**:61 local static import targets and imported exports;13 local HTML script sources. One additional HTTPS js-cookie import recognized; external CDN availability not tested (62 imports total) |
| Document coverage | **PASS**:60 network sites,172 static ID occurrences,112 addEventListener sites,279 DOM selector sites, plus dynamic/native/property-handler tables; companion links and C-/G- references checked |
| Whitespace | **PASS** `git diff --check`, plus `git diff --no-index --check /dev/null` separately for all three untracked documents |
| Application source invariance | **PASS** no frontend/public, protected admin, or backend/public diff; no staged changes; HEAD remains fcbd810 |
| Protected backend/db files | **PASS** all five SHA-256 hashes exactly match C5b start; their pre-existing local modifications remain untouched |
| Browser/live backend/visual testing | Not rerun in C5b; this documentation audit reports static discrepancies, not new runtime reproductions |

The first audit-checker run needed to recognize a valid external HTTPS import and correct an obsolete documentation-only contract label; no application test failed or source fix was made. Documentation findings are not implementation approvals. The individually approved C5b.1 G-P0-01 fix and current verification are recorded in Resolved above; no C5c work has begun. **No commit/push** until user verification; G-STORAGE-01 remains P0-Deferred-to-C5c with storage/logout untouched.

## G-REACTIVATION-01 (P2 → C5c.3)

**Deferred; documentation only in C5c.2a.** Suspended users currently see a
plain-text WhatsApp number (`+963980217649`) to contact support manually.
No reactivation endpoint, modal, migration, admin workflow, or redirect is
implemented by C5c.2a. Interim copy is not an automatic account reactivation.

C5c.3 will add:
- `POST /api/auth/reactivation-request`: public, CSRF-protected, rate-limited.
- Migration 006: `reactivation_requests` table with `id`, `username`, `user_id`,
  `reason`, `contact_email`, `contact_phone`, `ip_address`, `status`, `reviewed_by`,
  `reviewed_at`, `review_note`, and `created_at`.
- Unique partial index on `(username) WHERE status = 'pending'`.
- Frontend modal: reason (10–500 characters) plus optional contact details.
- Admin view within the existing `/homepage.html` admin section.
- Admin approve/reject workflow with audit.
- Prevent duplicate pending requests per username.
- Rate limiting: 3 requests/IP/hour and 1 request/username/24 hours.
- Uniform response to prevent username enumeration, including duplicate cases.

## G-CHAT-AND-SECURITY-VISION (P3 → C7/C8)

**Deferred long-term vision, not implemented.** These features are outside
C5c.2a, C5c.2b, C5c.2c, C5d, and C5e. They are recorded so the requirements are
not lost; their presence here does not authorize implementation or claim that
security, legal, infrastructure, or provider decisions have been completed.

### In-Site Chat (C7)

- Real-time messaging between suspended/suspended-adjacent users and admins.
- WebSocket-based, reusing existing socket infrastructure after Step 5 C4.
- Persistent message store: new `chat_messages` table.
- Read receipts and optional typing indicators.
- Verification-document attachments using private uploads.
- AI assistant for FAQ deflection:
  - Simple rule-based plus LLM hybrid.
  - Never claims to be human and never approves anything itself.
  - Escalates complex queries to a human admin.
  - Canned answers for password reset, suspended accounts, KYC, and refund policy.
  - Rate-limited, logged, and clearly labeled "AI assistant".

### Password Change Request via Chat (C7)

- User initiates the request from chat.
- Enforced requirements:
  - A human admin responds: NOT AI and NOT a robot.
  - Justification text: minimum 50 characters, including a specific reason.
  - Admin verifies identity through chat using country-specific KYC.
  - Admin checks account history, IP, and device to confirm it is not fraudulent.
  - No policy violations in the reason.
  - Admin approval requires an explicit confirmation checkbox.
- Upon approval:
  - Generate a password reset link with a single-use token.
  - User must set the new password within 15 minutes.
  - Token expires after use.
  - Invalidate all existing sessions.
  - Email notification to the user's registered email address.

### Security Policies After Password Change (C7)

- Cooling-off window: 24-hour purchase restriction after password change.
- During cooling-off, users may log in, view balance, and browse.
- Users cannot purchase, withdraw, submit payments, or approve orders.
- Rationale: prevent immediate financial exploitation after account takeover.
- Notify the user at login:
  "Your account has a 24h restriction after recent password change. Purchases
  will unlock on [date]."
- Emergency admin override requires an audit log.

### Country-Specific KYC (C8)

- ID verification required for high-value transactions, password changes, and
  account reactivation.
- Country tiers:
  - Tier 1 (low risk): email and phone only.
  - Tier 2 (medium): additionally government ID.
  - Tier 3 (high): additionally proof of address and video verification.
- Identity documents stored privately in Cloudinary using signed URLs, with
  7-day retention.
- Admin verification workflow with an audit trail.
- GDPR/data residency compliance where required.
- Refuse service to users from embargoed countries per OFAC/EU lists maintained
  externally; legal counsel must determine the applicable policy before rollout.

### Policy Enforcement

- Every password change request must include:
  - Reason: minimum 50 characters.
  - Admin notes: minimum 30 characters.
  - Verification method used, such as in-person, video, or ID.
  - Timestamp, admin user ID, and user ID.
- Log all actions to an immutable audit table: append-only, no DELETE.
- Monthly review of password change requests by a second admin.
- Suspicious pattern detection: 3+ requests from the same IP in 24 hours → freeze.

### Dependencies

- C7 depends on Step 5 WebSocket authentication, completed in C4 as reported by
  the project owner; this documentation update does not reverify that gate.
- C7 depends on notification infrastructure: currently disabled and must be
  re-enabled in C7.
- C8 depends on KYC provider selection; decide before C8 starts.
- C8 depends on legal counsel for country lists and retention policies: a
  non-technical prerequisite.

## G-UI-ADMIN-HOMEPAGE-01 (P1 → C5e)
After C3 removed Mongoose features, /homepage.html (admin) has multiple broken flows:
- appmanager.js:478 — TypeError on destroy() (stopAutoRefresh undefined)
- GET /api/cards → 503 (feature disabled, UI not updated)
- GET /api/security/status → 503 (feature disabled)
- GET /api/payments?userId=X → 400 (strict DTO rejects query param)
- GET /api/orders?limit=100 → 503 (order read endpoint disabled or strict)
- WebSocket handshake failure (notifications disabled, expected)
- POST /api/compare-token → 503 (documented, C6)

These are UI cleanup work, not C5c.2b.1 regressions.
Target: C5e (admin dashboard + user dashboard build-out).

## G-UI-ADMIN-NAV-01 (P3 → C5e.3+)
Direct /admin navigation while unauthenticated returns HTTP 401.
Direct /admin navigation while non-admin returns HTTP 403.
Server-authoritative by design. Future: friendly redirect to /login.html.
Not in MVP scope.

## G-UI-ADMIN-LEGACY-01 (P3 → C6)
After C5e.2a, these files are no longer used by the canonical password-login admin path:
- backend/protectedViews/admin.html (was /admin target; replaced by frontend/public/admin.html)
- frontend/public/assets/js/admin.js and admin.css (replaced by C5e.2a content)
- frontend/public/homepage.html and its modules (homepage.js, appmanager.js, usermanager.js, tabs/*) remain reachable through the still-guarded /homepage and /homepage.html routes.

Legacy OAuth destinations in backend/services/auth/httpRouter.js:23,36-38 continue to
reference legacy paths and remain outside this MVP.

C6 will decide: repair, replace, or redirect /homepage to /admin.

## G-PROXY-01 (RESOLVED — configuration/log warning; coarse buckets accepted)
express-rate-limit logged ERR_ERL_UNEXPECTED_X_FORWARDED_FOR behind
Render/Cloudflare because Express trust proxy was false, sharing proxy-IP buckets.
Fix: TRUST_PROXY env var (numeric hop count 1-9), fail-closed parsing
(rejects "true", "0", "10+", non-numeric). Explicit trustProxy option
preserves precedence for tests. Default when unset = false.
Production evidence reported by the user on 2026-11-03:
- Render deployed commit 1b36b56 from main; TRUST_PROXY=2 remains in Render env.
- Custom-domain /__debug/ip returned HTTP 200.
- req.ip was 172.71.151.112 (Cloudflare edge), not the real client 46.213.209.142.
- XFF was "46.213.209.142, 172.71.151.112, 10.196.147.54"; socket peer was 127.0.0.1.
- Render logs showed zero ERR_ERL_UNEXPECTED_X_FORWARDED_FOR after deployment.
Acceptance: proxy configuration/log-warning fix is resolved; shared Cloudflare-edge
buckets are accepted for MVP. This is not verified real-client-IP rate limiting or
a guarantee against spoofing across all ingress paths; remaining work is G-PROXY-02.
The v1.5.1 cleanup removes the temporary /__debug/ip route.

## G-PROXY-02 (P2 → C5e.3 or C6)
Real-client-IP rate limiting and verified proxy/header trust remain open.
With TRUST_PROXY=2 on the observed custom-domain path, multiple clients using the
same Cloudflare edge share a rate-limit bucket; one actor can exhaust that bucket.
The forged-XFF curl test was not performed: refreshing the page injected no header.
Raw Render hostname IP/spoofing results were not supplied in this verification.
Numeric hop-count trust is positional, not proxy-identity verification. A selected
Cloudflare-looking address alone does not prove header sanitization or safety on
shorter/direct ingress paths. Verify all reachable paths with forged XFF headers.
Candidate: use CF-Connecting-IP only after enforcing/validating trusted Cloudflare
ingress, with Cloudflare IP allowlisting at the appropriate ingress boundary or a
verified, sanitized intermediary chain. Do not trust that header based solely on
loopback req.socket.remoteAddress or unverified forwarded-address claims.
Alternative: TRUST_PROXY=3 requires real-client-IP and spoofing verification on
both custom-domain and direct Render paths before changing the deployment value.
IP-based buckets are per client IP, not per user account; shared public IPs remain shared.
No resolver, rate-limiter/keyGenerator, CSRF, cookie, or session-adapter changes in
this cleanup. Keep TRUST_PROXY=2; follow-up is outside MVP scope.
