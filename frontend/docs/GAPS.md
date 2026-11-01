# C5b — Gap register and binding audit

Baseline `frontend-overhaul` / `fcbd810`, audited 2026-11-01. Documentation only: **no P0 fix implemented**, no frontend/backend/storage/financial-client changes, no design/features, no commit/push. The five pre-existing backend/db modifications must remain byte-for-byte untouched.

Companions: [CONTRACTS.md](CONTRACTS.md) (`C-*`, N01–N60 request sites), [BINDINGS.md](BINDINGS.md) (172 static ID rows, dynamic IDs, selector/listener census). All paths repository-relative; `js/` = `frontend/public/assets/js/`. Findings are static unless explicitly marked user-reported; no fresh live-browser/database reproduction is claimed.

## Classification and P0 gate

- **P0-review:** critical mismatch in documented functionality; pause before implementation. At most five executable lines is only an eligibility limit, not permission. No nominal one-line guard change is safe without validating acknowledgment/reconciliation behavior.
- **P1 / C5c:** existing interactive/contract mismatch, coordinated repair (often more than five lines). Prior financial/auth locks and storage restrictions remain effective.
- **P2 / C5d:** design/display review only; no deletion or redesign here.
- **C5e:** missing supported user feature/form; disabled backend functionality is not authorization to build/remount a feature.
- **C6:** locked legacy UserManager/auth migration boundary. Current TODO(C5b) cookie-migration comments are historical labels, not approval to migrate in this documentation phase.
- **Intentional / dormant / candidate:** not a live critical bug without reachable evidence. Literal non-use is not proof of dead code.

## G-P0-01 — committed purchase/order response rejected by clients (review only)

**Critical documented success-path mismatch.** PurchaseClient requires result.success===true (`js/utils/purchaseClient.js:54–64`); OrderClient decisions do too (`js/utils/orderClient.js:43–47`). Backend committed financial projection contains no success property (`backend/services/financial/contracts.js:219–226`); HTTP sends it unchanged (`backend/services/financial/httpCommon.js:32–35`; `backend/services/financialCoordinator.js:207,230–232`). Purchase route201/200 replay and decisions200 (`backend/services/financial/ordersHttpRouter.js:10–14,30–34`).

Thus a committed success is treated as unresolved/refused, confirmation not emitted, saved key retained. This is **not** evidence of duplicate charging; saved-key replay protections are still present. Mocked test receipt explicitly adds success:true (`backend/tests/purchase-client.test.js:18,23`), so 25/25 does not cover live response compatibility. C-RESULT/C-PURCHASE/C-ORDERS.

Possible guard changes touch two lines but would also alter acceptance of malformed HTTP200 responses; robust validation, tests and reconciliation review may exceed five lines and therefore belong in C5c. **Do not remove guards, wrap backend responses, or swap transports now. User review required before any code fix.**

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
| G-STORAGE-01 critical recovery concern, review C5c/C6 | usermanager.js:223,227 calls clearBrowserData(false) on logout success **and failure**; appUtils.js:16–26 localStorage.clear/sessionStorage.clear/cookie deletion | auth.js:76–78 intends auth-only cleanup preserving financial intents; purchaseClient.js:40–51 and orderClient.js:34–39 persist exact unresolved keys there | Broad cleanup can destroy unresolved purchase/decision keys; existing behavior, no runtime reproduction. Explicit storage restriction means no fix here; recovery policy cannot be settled by a ≤5-line cleanup patch. C-AUTH/C-PURCHASE |
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

## Verification and scope

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

The first audit-checker run needed to recognize a valid external HTTPS import and correct an obsolete documentation-only contract label; no application test failed or source fix was made. Documentation findings are not implementation approvals. **No commit/push** until user verification; all P0 proposals remain paused for individual review.
