# C5a — Cleanup & Legacy Removal

## Scope, baseline, and status

- Baseline: `v1.0.0`; working branch: `frontend-overhaul`.
- **Cleanup implemented; verification incomplete. Static and 25 purchase-client tests PASS. Runtime, real browser-auth, and visual checks are BLOCKED by repeated tool permission-classifier timeouts. C5a is not ready for acceptance.**
- No commit or push. Owner manual verification and approval are required before committing.
- Source locations below are original pre-cleanup lines, unless explicitly labeled current.
- Five existing `backend/db/*` modifications predate this cleanup and were not edited.
- No backend, auth/CSRF/JWT logic, financial-client, or storage-write changes were made.
- Baseline frontend and protected-file fingerprints were saved outside the repository in `/tmp/top4-c5a.r8IXXN` before implementation.

## Removed

### Landing probe and JavaScript

| Item | File | Original lines | Reason/evidence | Status |
|---|---|---|---|---|
| Probe utility | `frontend/public/assets/js/utils/appUtils.js` | 39–64, with following separator | Only utility consumer was landing IIFE; deprecated `/api/compare-token` returns 503. Internal error at 61 explicitly approved for deletion with function. | Implemented; static checks pass; browser coverage pending |
| Probe caller/import | `frontend/public/assets/js/app.js` | 1, 141–148 | Both validations, token read, log, alert, and homepage redirect removed; other handlers preserved. No replacement auth check. | Implemented; static checks pass; browser coverage pending |
| J02 | `frontend/public/assets/js/admin.js` | 132–137, with following separator | `getReceiptImageUrl()` had no caller/export in repository search. | Implemented; static checks pass; browser coverage pending |
| J03 | `frontend/public/assets/js/core/taber.js` | 62–73, with following separator | `_handleTabClick()` had no caller; actual click binding calls `activateTab()` at 54. | Implemented; static checks pass; browser coverage pending |
| J01 | `frontend/public/assets/js/core/card-component.js` | 1–95 | No import/script consumer; class references limited to own comment/declaration. | **Deleted with `git rm -f`; staged deletion; static checks pass** |

### Console cleanup

All 58 executable `console.log` calls were removed and the post-change AST inventory passes. Final executable counts: log=0, debug=0, info=1, warn=28, error=45, table=1, trace=1. Exactly one version info statement was added at the top of `app.js`: `console.info('[Top4] v1.0.0 loaded');`. It runs once per module load, not on pages that do not load `app.js`. Browser emission counts remain unverified.

Paths below are relative to `frontend/public/`.

| File | Original log lines | Calls |
|---|---|---:|
| `assets/js/admin.js` | 12, 17, 81, 133 | 4 |
| `assets/js/app.js` | 143 | 1 |
| `assets/js/appmanager.js` | 187, 207, 311, 350, 355, 400, 413, 424, 431, 453, 491 | 11 |
| `assets/js/core/cache-manager.js` | 224, 252 | 2 |
| `assets/js/core/search-manager.js` | 31, 57, 115 | 3 |
| `assets/js/core/taber.js` | 142, 178 | 2 |
| `assets/js/dialogs/purchaseDialog.js` | 466 | 1 |
| `assets/js/google-redirect.js` | 9, 23, 43 | 3 |
| `assets/js/homepage.js` | 55, 61, 521, 524, 527, 541, 543, 579, 594, 604 | 10 |
| `assets/js/tabs/appstab.js` | 34, 53, 60 | 3 |
| `assets/js/tabs/balancestab.js` | 34, 53, 60 | 3 |
| `assets/js/tabs/cryptostab.js` | 34, 53, 60 | 3 |
| `assets/js/tabs/gamestab.js` | 34, 53, 60 | 3 |
| `assets/js/tabs/hometab.js` | 116 | 1 |
| `assets/js/tabs/portfoliotab.js` | 303, 760, 839 | 3 |
| `assets/js/tabs/wallettab.js` | 131 | 1 |
| `assets/js/theme.js` | 31 | 1 |
| `assets/js/utils/appUtils.js` | 36, 67 | 2 |
| `sw.js` | 30 | 1 |
| **Total** | | **58** |

Raw token/session dumps at `google-redirect.js:9,23` and `homepage.js:524` were prioritized. Whole-object dumps were removed too. The misleading `Token` label in `app.js:143` actually logged a validation result; removed with its IIFE.

Four log-only fallback callbacks became no-ops. The service-worker success ternary branch became `undefined`, leaving the warning branch intact. All 28 warnings and the 45 errors outside the deleted probe were left unchanged; post-change verification confirms their call-source strings match baseline byte-for-byte. No existing log was converted.

### All 45 CSS candidate decisions

Paths below are relative to `frontend/public/assets/css/`. Removed means implemented but not browser-verified. High confidence refers to audited source evidence, not completed acceptance tests. For shared lists only dead selector branches were removed; live declarations and order were retained. No keyframe deletion or consolidation.

| ID | File:original lines | Class | Confidence | Decision/evidence |
|---|---|---|---|---|
| C01 | admin.css:143,152 | order-header | High | Removed: current admin renderer appends paragraphs directly; no producer. |
| C02 | admin.css:158 | order-time | High | Removed: no markup/JS producer. |
| C03 | admin.css:163,167 | order-details | High | Removed: no class producer; order-details-modal is a different ID. |
| C04 | admin.css:172 | order-actions | High | Removed: current renderer appends buttons without this wrapper. |
| C05 | admin.css:177,186,191 | accept-order-btn | High | Removed: no class assignment in current order renderer. |
| C06 | admin.css:177,195,200 | reject-order-btn | High | Removed: no class assignment in current order renderer. |
| C07 | admin.css:204,211,216 | status-badge | High | Removed: current order status rendered as text, no producer. |
| C08 | card-grid.css:81,99,118 | big-card-description | High | Removed: no markup/JS producer. |
| C09 | homepage.css:27,52,249 | sidebar-open | High | Removed: sidebar code toggles active instead. |
| C10 | homepage.css:133 | loading-screen | High | Removed: loader uses global-loader. |
| C11 | homepage.css:169 | loader-content | High | Removed: absent from actual loader markup. |
| C12 | homepage.css:179 | loader-text | High | Removed: absent from actual loader markup. |
| C13 | homepage.css:205 | stat-card | High | Removed: no markup/JS producer. |
| C14 | homepage.css:212 | stat-value | High | Removed: no markup/JS producer. |
| C15 | homepage.css:218 | setting-item | High | Removed: current settings markup uses no such class. |
| C16 | homepage.css:226,235 | change-password-btn | High | Removed: current settings controls use no such class. |
| C17 | login.css:304–328 | links | High | Removed: no HTML/JS class consumer; four associated rules. |
| C18 | modal-manager.css:2,33,58,133 | payments-modal | High | Removed: current payment modal uses generic modal. |
| C19 | modal-manager.css:20,138 | payments-modal-content | High | Removed: current markup uses modal-content. |
| C20 | modal-manager.css:41,51 | payments-modal-header | High | Removed: generic modal header used; no exact producer. |
| C21 | modal-manager.css:73,83 | payments-body | High | Removed: current payment renderer uses modal-body. |
| C22 | modal-manager.css:127 | approved | Low | Kept: payment.status interpolated into status classes at paymentstab.js:79,123. |
| C23 | portfolio-tab.css:2,353 | portfolio-container | High | Removed: no current wrapper producer. |
| C24 | register.css:328–352 | links | High | Removed: no HTML/JS class consumer; four associated rules. |
| C25 | search-manager.css:170,182,186,465 | search__icon | High | Removed: no exact-class producer. |
| C26 | search-manager.css:269 | icon-placeholder | High | Removed: suggestions create images/spans, not this placeholder. |
| C27 | search-manager.css:408 | pulse-effect | High | Removed: no assignment; independently used animations kept. |
| C28 | search-manager.css:412 | animated-gradient | High | Removed: no assignment; keyframes kept. |
| C29 | security-tab.css:85 | success-flash | Medium | Kept: protected security/auth UI. |
| C30 | sidebar-manager.css:35 | sidebar-content | High | Removed: no exact class; dash-sidebar-content is distinct. |
| C31 | standard-table.css:206,218,227,232 | modal-grid | High | Removed: no current details-markup producer. |
| C32 | standard-table.css:214 | modal-grid-content | High | Removed: no markup/JS producer. |
| C33 | standard-table.css:246 | modal-info-grid-content | High | Removed: distinct from used modal-info-grid. |
| C34 | tab-manager.css:6 | tabs-header | High | Removed: no current markup/generator. |
| C35 | tab-manager.css:39 | wallet-content | High | Removed: no exact producer; live shared-rule branches kept. |
| C36 | tab-manager.css:40 | payments-list | High | Removed: no exact producer. |
| C37 | tab-manager.css:41 | portfolio-stats | High | Removed: no exact producer. |
| C38 | tab-manager.css:43 | security-settings | High | Removed: no exact producer; security logic unchanged. |
| C39 | toast-manager.css:42 | toast-success | High | Kept: generated by toast-${type}. |
| C40 | toast-manager.css:46 | toast-error | High | Kept: generated by toast-${type}. |
| C41 | toast-manager.css:50 | toast-info | High | Kept: generated by toast-${type}. |
| C42 | toast-manager.css:54 | toast-warning | High | Kept: generated by toast-${type}. |
| C43 | toast-manager.css:59 | toast-hidden | High | Removed: current dismissal does not assign it. |
| C44 | toast-manager.css:65 | toast-slide-in | High | Removed: no assignment/reference. |
| C45 | toast-manager.css:69 | toast-slide-out | High | Removed: no assignment/reference. |

## Kept (with reason)

### Locked user-manager probe

Deferred to C5b or C6: `usermanager.js` has a second `/api/compare-token` probe (lines 55-58) that is actively used by `loadUser()` (line 81) and `saveUser()` (line 165). Removing it requires a full auth migration of the user manager.

Only `// TODO(C6): Migrate to cookie-based session check. See CLEANUP_REPORT.md.` was added above the method. Executable code was not edited. Zero compare-token requests is the public-page/user-login-flow target, not a global claim about this locked admin-homepage path.

### Auth storage — S01–S07 unchanged

| ID | File:original line | Key | Reason |
|---|---|---|---|
| S01 | `assets/js/login.js:61` | userId | Successful login calls saveSession at 242; existing readers depend on key. |
| S02 | `assets/js/login.js:62` | userToken | Existing frontend/financial clients still read key. |
| S03 | `assets/js/login.js:63` | customSessionId | Existing session-aware clients still read key. |
| S04 | `assets/js/google-redirect.js:10` | userId | OAuth handler calls saveSession at 45. |
| S05 | `assets/js/google-redirect.js:11` | userToken | Same OAuth path. |
| S06 | `assets/js/google-redirect.js:12` | customSessionId | Same OAuth path. |
| S07 | `assets/js/homepage.js:525` | customSessionId | Conditional fallback used in WebSocket authentication at 529–533. |

Exactly three block markers were added: `// TODO(C5b): Migrate to cookie-only. See CLEANUP_REPORT.md.` Writes, keys, values, order, conditions, and call sites were not changed. No auth-related direct sessionStorage.setItem was found. Theme, active-tab, financial intent/decision storage remain untouched. purchaseClient.js, orderClient.js, adminOrders.js, auth.js, securefetch.js, and register.js were not edited.

### HTML decisions — kept unchanged in C5a

- H01 `favorite-btn`, H04 `card-shadow`, and H05 `update-time` remain reverted. The owner explicitly prohibited reapplying them in C5a; see **Deferred to C5d** below.
- The complete `homepage.html` file is byte-for-byte identical to the saved baseline. No visual result is inferred from this source check; screenshot comparisons remain blocked.
- H02 logout-btn: rejected for C5a, kept for C5b.
- H03 cards-grid-container: rejected for C5a, kept for potential C5d layout work.
- Dynamic tab IDs (${tabId}-tab), search-info hooks, field *-icon/*-msg selectors, remember-device/2FA markup, and externally consumed Font Awesome classes remain.

An implementation guard initially expected H01 to be standalone, stopped before writing HTML, and revealed its combined profile-btn attribute. Targeting was corrected to preserve the live class. This was an edit precondition, not an acceptance-test failure. The subsequent actual whitespace-check failure triggered the stop and rollback above.

### Uncertain APIs and duplicate CSS

Medium-confidence unused API candidates remain: AppManager.refreshCurrentTab; CacheManager.decodeCacheKey; CardsService.injectIconLoader/getProcessedCards; IconLoader.loadAsURL/preload/getInfo; Taber.addTab/removeTab/onTabClick/getTabCount/getActiveTabIndex; HomeTab.updateCards; WalletTab.updateConvertedAmount; UserManager.getCachedBalance/getUserName/getUserBalance/saveUser/clearUserUI. No frontend caller was found, but public APIs, wallet behavior, existing error handlers, and locked user-manager code require separate review.

No exact complete CSS rule duplicate was found in the same file/at-rule context during the initial audit, including inspected HTML inline styles. Repeated selectors with different declarations remain: purchase-dialog.css .quantity-container (297,378), settings-tab.css .form-group (99,127), standard-table.css .status.pending/.accepted/.rejected (8/80,13/85,18/90), toast-manager.css .toast-message (23,103). The initial 39 cross-file exact rule groups were primarily independent login/register styles; no consolidation performed. Only independently approved unused .links rules were removed.

All 16 dormant logging comments remain: cache-manager.js:174,177; unified-icon-system.js:66; purchaseDialog.js:438,442,457,462; appstab.js:177; balancestab.js:176; cryptostab.js:176; gamestab.js:177; wallettab.js:55,101,185,188,194. Fifteen contain console.log, one console.info; none executes. console.table at cache-manager.js:228 and console.trace at taber.js:16 remain outside approved method scope.

## Deferred to future phases

Routing suggestions only; future implementation still requires approval.

| Target | Items |
|---|---|
| C5b | S01–S07 cookie-only migration and dependent credential readers; OAuth/WebSocket storage; H02 logout hook. |
| C5c | Shared styles/cascade review; consolidation only if separately authorized. |
| C5d | H01/H04/H05 retained attributes, with proper visual comparison; H03 layout hook; unused public JS APIs; dormant comments and table/trace diagnostics. |
| C5e | Retained HTML hooks; final cross-page/browser/cache verification. |
| C6 | Locked user-manager cookie session migration; separate security/legacy-2FA review. |

### Deferred to C5d

H01/H04/H05 must stay unchanged throughout C5a. Design-phase removal requires proper before/after visual comparison and separate approval:

- **H01:** `favorite-btn` in `class="profile-btn favorite-btn"`; preserve the live `profile-btn` class.
- **H04:** `card-shadow` on the card SVG.
- **H05:** `update-time` on `#last-update-time`; preserve the ID/content unless separately approved.

## Test results

### Whitespace hygiene — repaired; PASS

The initial `git diff --check -- frontend` diagnostic was `frontend/public/assets/css/admin.css:142: new blank line at EOF.` The owner authorized whitespace-only repair and resumption. Trailing blank lines were removed, leaving one final newline; no CSS declaration was changed. This added 14 blank-line deletions to the initial CSS cleanup. Both the unstaged and staged frontend diff checks now pass.

| Category | Result | Evidence / limitation |
|---|---|---|
| Static | **PASS** | Whitespace checks; 65 baseline and 64 current JS/inline blocks parsed; 38 current JS files; 61 local import declarations and imported exports resolved. One module was intentionally deleted. |
| Runtime | **BLOCKED / NOT RUN** | Actual public `/`, `/login`, `/register`, `/dashboard` rendering, console and network checks could not execute. Sandboxed Chrome startup preflight alone passed. |
| Real browser auth | **BLOCKED / NOT RUN** | Actual login → `/`, reload persistence, second-tab `/login.html` auto-redirect, module logout, and session-info `401 MISSING_CREDENTIALS` have not been exercised in this cleanup run. |
| Visual | **BLOCKED / NOT RUN** | Saved pre-cleanup source is available, but no before/after screenshot comparisons at 375px/1440px in day/night mode were produced. No claim of unchanged visuals is made. |
| Purchase client | **PASS** | `npx --no-install jest backend/tests/purchase-client.test.js --runInBand`: 1/1 suite, 25/25 tests, 0 snapshots; latest run 0.408 s. Real frontend module source evaluated with mocked requests; no live financial dispatch. |

### Static preservation and removal checks — PASS

- Executable console inventory: log=0, debug=0, info=1, warn=28, error=45; table=1 and trace=1 retained.
- All warning/error source strings match baseline, except the explicitly approved utility-probe error deletion.
- All frontend `.setItem(...)` call ASTs match baseline, including S01–S07 and financial storage clients.
- Exactly one C5b TODO marker exists in each of login.js, google-redirect.js, and homepage.js.
- User-manager executable AST is unchanged; only the approved C6 comment was added.
- All 309 saved protected-file fingerprints match the pre-C5a working tree, including existing backend changes and protected frontend clients.
- `homepage.html` is unchanged. J01 is absent and its deletion is staged.
- The landing caller/import and utility export of `isValidToken` are absent; `STORAGE_KEYS` remains exported. Zero runtime compare-token requests has **not** been verified.

### Browser/database automation blocker

Sandboxed Chrome 156.0.8078.73 successfully rendered `about:blank` in a fresh temporary profile (exit 0). This is a tooling preflight, not a public-page test. Browser security was not disabled.

Repeated attempts to finish/execute temporary browser helpers and the guarded disposable database runner were rejected before execution with: `gpt-6.1-sol is temporarily unavailable (timed out), so auto mode cannot determine the safety of Bash/Edit right now.` A fallback attempt to run existing real-auth PostgreSQL suites was blocked by the same classifier timeout. No disposable PostgreSQL container or actual application server was started; no app-level runtime/auth/visual failure has been established.

Temporary harness files and baseline artifacts remain outside the repository. The planned database setup retained exact disposable URLs, TLS/identity/checksum guards and test-only secrets, and would not source `.env`. No production/Neon testing, new financial operations, dependency installation, commit or push occurred. Remaining acceptance checks must be completed before calling C5a verified.

## Diff summary

Frontend-only source line counts relative to HEAD include staged and unstaged changes, J01 deletion, and whitespace hygiene. Existing backend changes are excluded. The new report is listed separately because it is untracked. No commit/push.

| File | Added | Removed |
|---|---:|---:|
| `frontend/public/assets/css/admin.css` | 0 | 78 |
| `frontend/public/assets/css/card-grid.css` | 0 | 12 |
| `frontend/public/assets/css/homepage.css` | 0 | 67 |
| `frontend/public/assets/css/login.css` | 0 | 22 |
| `frontend/public/assets/css/modal-manager.css` | 2 | 12 |
| `frontend/public/assets/css/portfolio-tab.css` | 0 | 8 |
| `frontend/public/assets/css/register.css` | 0 | 22 |
| `frontend/public/assets/css/search-manager.css` | 0 | 39 |
| `frontend/public/assets/css/sidebar-manager.css` | 0 | 5 |
| `frontend/public/assets/css/standard-table.css` | 0 | 29 |
| `frontend/public/assets/css/tab-manager.css` | 0 | 7 |
| `frontend/public/assets/css/toast-manager.css` | 0 | 11 |
| `frontend/public/assets/js/admin.js` | 0 | 10 |
| `frontend/public/assets/js/app.js` | 1 | 9 |
| `frontend/public/assets/js/appmanager.js` | 0 | 11 |
| `frontend/public/assets/js/core/cache-manager.js` | 0 | 2 |
| `frontend/public/assets/js/core/card-component.js` (deleted) | 0 | 95 |
| `frontend/public/assets/js/core/search-manager.js` | 0 | 3 |
| `frontend/public/assets/js/core/taber.js` | 0 | 15 |
| `frontend/public/assets/js/dialogs/purchaseDialog.js` | 0 | 1 |
| `frontend/public/assets/js/google-redirect.js` | 1 | 3 |
| `frontend/public/assets/js/homepage.js` | 2 | 10 |
| `frontend/public/assets/js/login.js` | 1 | 0 |
| `frontend/public/assets/js/tabs/appstab.js` | 1 | 3 |
| `frontend/public/assets/js/tabs/balancestab.js` | 1 | 3 |
| `frontend/public/assets/js/tabs/cryptostab.js` | 1 | 3 |
| `frontend/public/assets/js/tabs/gamestab.js` | 1 | 3 |
| `frontend/public/assets/js/tabs/hometab.js` | 0 | 1 |
| `frontend/public/assets/js/tabs/portfoliotab.js` | 0 | 3 |
| `frontend/public/assets/js/tabs/wallettab.js` | 0 | 1 |
| `frontend/public/assets/js/theme.js` | 0 | 1 |
| `frontend/public/assets/js/usermanager.js` | 1 | 0 |
| `frontend/public/assets/js/utils/appUtils.js` | 0 | 29 |
| `frontend/public/sw.js` | 0 | 1 |
| **Tracked frontend source total (34 files)** | **12** | **519** |

- CSS subtotal: 12 files, +2/−312; **310 net lines removed**, including 14 EOF blank lines. Live shared-selector declarations remain unchanged; no consolidation.
- `frontend/public/homepage.html` has no diff. H01/H04/H05 remain reverted and deferred to C5d.
- J01 deletion is staged; other source edits remain unstaged. This report is untracked; nothing was committed or pushed.
- Outstanding: runtime, real browser-auth and visual verification blocked by the test-tool permission classifier. Do not infer successful login/logout or unchanged visuals from static tests alone.

Report file: **250 added lines**, zero removed. Combined C5a scope: **35 files, +262/−519** (including this new report; excluding pre-existing backend changes).
