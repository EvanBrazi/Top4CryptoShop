# C5b — Frontend binding map

Baseline `frontend-overhaul` / `fcbd810`, 2026-11-01. Documentation only. Companions: [CONTRACTS.md](CONTRACTS.md), [GAPS.md](GAPS.md). All source citations repository-relative; `js/` means `frontend/public/assets/js/`.

## B-SCOPE — evidence and reachability

172 live static HTML ID occurrences across the public pages, served protected admin, and backend/public/401.html are listed below (IDs repeated on different pages are not duplicate-DOM bugs). HTML comments are excluded. Consumers are restricted to each page's script/import graph; storage strings such as userId/token and validation keys are not counted as DOM references. Constructor arguments, configured containerId, generated tab IDs, class selectors, ARIA, and native submit behavior are included explicitly. A reference does not prove the handler reaches execution: startup may fail earlier; see GAPS.

`No listener` describes the element itself, not absence of functionality controlled by another element. Rows give reads/writes/purpose and listener ownership; source-located listener appendix includes indirect/aliased targets. No ID is approved for deletion by this audit.

## B-PAGE — backend/protectedViews/admin.html

Entrypoints: `frontend/public/assets/js/admin.js`. Import closure is used to scope consumers.

| Binding | ID / tag / definition | JS consumers (function and source) | Purpose / reads-writes | Listener / control |
|---|---|---|---|---|
| B001 | `connectionStatus` `<div>` `backend/protectedViews/admin.html:16` | `frontend/public/assets/js/admin.js:57` updateConnectionStatus | Legacy socket status display | none; updateConnectionStatus writes |
| B002 | `globalNotification` `<div>` `backend/protectedViews/admin.html:17` | `frontend/public/assets/js/admin.js:68` showNotification; `frontend/public/assets/js/utils/adminOrders.js:18` loadPendingOrders | Admin notification/error text | none; showNotification/orders writes |
| B003 | `backupNotifications` `<div>` `backend/protectedViews/admin.html:18` | `frontend/public/assets/js/admin.js:177` renderBackupNotification | Generated backup result boxes | no controls; renderBackupNotification prepends display entries |
| B004 | `notification-type` `<select>` `backend/protectedViews/admin.html:23` | `frontend/public/assets/js/admin.js:373` sendTestNotification | Test notification type | read on test-button click |
| B005 | `target-user-id` `<input>` `backend/protectedViews/admin.html:31` | `frontend/public/assets/js/admin.js:374` sendTestNotification | Test notification recipient | read on test-button click |
| B006 | `test-button` `<button>` `backend/protectedViews/admin.html:33` | `frontend/public/assets/js/admin.js:412` module/inline | Disabled notification simulation | click (admin.js:412) |
| B007 | `userId` `<input>` `backend/protectedViews/admin.html:40` | `frontend/public/assets/js/admin.js:202` module/inline | Admin balance-edit target UUID | read on updateBalanceBtn click (not storage userId) |
| B008 | `newBalance` `<input>` `backend/protectedViews/admin.html:42` | `frontend/public/assets/js/admin.js:203` module/inline | Legacy balance-edit numeric input | read on updateBalanceBtn click |
| B009 | `updateBalanceBtn` `<button>` `backend/protectedViews/admin.html:43` | `frontend/public/assets/js/admin.js:201` module/inline | Disabled balance-edit submit | click (admin.js:201) |
| B010 | `balanceResult` `<div>` `backend/protectedViews/admin.html:44` | `frontend/public/assets/js/admin.js:204` module/inline | Balance edit result text | none; update handler writes |
| B011 | `statusUserId` `<input>` `backend/protectedViews/admin.html:51` | `frontend/public/assets/js/admin.js:235` module/inline | Legacy status-edit target UUID | read on updateStatusBtn click |
| B012 | `newStatus` `<select>` `backend/protectedViews/admin.html:53` | `frontend/public/assets/js/admin.js:236` module/inline | Legacy user status choice | read on updateStatusBtn click |
| B013 | `updateStatusBtn` `<button>` `backend/protectedViews/admin.html:58` | `frontend/public/assets/js/admin.js:234` module/inline | Wrong-path status request | click (admin.js:234) |
| B014 | `statusResult` `<div>` `backend/protectedViews/admin.html:59` | `frontend/public/assets/js/admin.js:237` module/inline | Status edit result text | none; status handler writes |
| B015 | `admin-notifications` `<div>` `backend/protectedViews/admin.html:65` | `frontend/public/assets/js/admin.js:116` loadPendingPayments; `frontend/public/assets/js/admin.js:133` renderPaymentNotification; `frontend/public/assets/js/utils/adminOrders.js:5` loadPendingOrders; `frontend/public/assets/js/utils/adminOrders.js:60` initAdminOrders | Shared payment/order notification queue | generated decisions/view/retry; both renderers can alter container |
| B016 | `usersTable` `<table>` `backend/protectedViews/admin.html:66` | `frontend/public/assets/js/admin.js:79` loadUsers | Generated admin users tbody rows/actions | delegated document delete/unban/edit click; loadUsers writes |

## B-PAGE — backend/public/401.html

Entrypoints: inline only. Import closure is used to scope consumers.

| Binding | ID / tag / definition | JS consumers (function and source) | Purpose / reads-writes | Listener / control |
|---|---|---|---|---|
| B017 | `loginBtn` `<button>` `backend/public/401.html:99` | `backend/public/401.html:117` module/inline | Navigate login | click location; page-scoped consumer below |

## B-PAGE — frontend/public/adsManager.html

Entrypoints: inline only. Import closure is used to scope consumers.

| Binding | ID / tag / definition | JS consumers (function and source) | Purpose / reads-writes | Listener / control |
|---|---|---|---|---|
| B018 | `adsWrapper` `<div>` `frontend/public/adsManager.html:183` | `frontend/public/adsManager.html:301` DOMContentLoaded → new AdsManager; `frontend/public/adsManager.html:230` constructor wrapperSelector | Advertisement carousel wrapper | generated slide.onclick → ad.action; rotation timer; constructor selector |

## B-PAGE — frontend/public/complete-profile.html

Entrypoints: inline only. Import closure is used to scope consumers.

| Binding | ID / tag / definition | JS consumers (function and source) | Purpose / reads-writes | Listener / control |
|---|---|---|---|---|
| B019 | `completeProfileForm` `<form>` `frontend/public/complete-profile.html:16` | `frontend/public/complete-profile.html:38` module/inline | Legacy profile completion C-PROFILE | submit (HTML:38) |
| B020 | `fullName` `<input>` `frontend/public/complete-profile.html:18` | `frontend/public/complete-profile.html:40` module/inline | Legacy completion full name string | read on submit |
| B021 | `country` `<select>` `frontend/public/complete-profile.html:21` | `frontend/public/complete-profile.html:41` module/inline | Legacy profile country string | read on submit |
| B022 | `phone` `<input>` `frontend/public/complete-profile.html:31` | `frontend/public/complete-profile.html:42` module/inline | Legacy completion phone string | read on submit |

## B-PAGE — frontend/public/dashboard.html

Entrypoints: `frontend/public/assets/js/utils/loader.js`, `frontend/public/assets/js/app.js`. Import closure is used to scope consumers.

| Binding | ID / tag / definition | JS consumers (function and source) | Purpose / reads-writes | Listener / control |
|---|---|---|---|---|
| B023 | `menuBtn` `<button>` `frontend/public/dashboard.html:18` | `frontend/public/assets/js/app.js:3` module/inline | Open/close landing sidebar | click toggleSidebar (app.js:19) |
| B024 | `dash-sidebar` `<div>` `frontend/public/dashboard.html:23` | `frontend/public/assets/js/app.js:5` module/inline | Sidebar visibility/active state | none; controlled by menu/close/overlay |
| B025 | `closeBtn` `<button>` `frontend/public/dashboard.html:26` | `frontend/public/assets/js/app.js:4` module/inline | Close landing sidebar | click toggleSidebar (:20) |
| B026 | `aboutBtn` `<a>` `frontend/public/dashboard.html:33` | `frontend/public/assets/js/app.js:8` module/inline | Open about dialog | click showDialog (app.js:25) |
| B027 | `contactBtn` `<a>` `frontend/public/dashboard.html:36` | `frontend/public/assets/js/app.js:9` module/inline | Open contact dialog | click showDialog (:26) |
| B028 | `themeBtn` `<button>` `frontend/public/dashboard.html:43` | `frontend/public/assets/js/app.js:7` module/inline; `frontend/public/assets/js/app.js:51` loadSettings | Landing local theme/icon | click toggleTheme (app.js:23) |
| B029 | `loginBtn` `<button>` `frontend/public/dashboard.html:56` | `frontend/public/assets/js/app.js:15` module/inline | Navigate login | click location; page-scoped consumer below |
| B030 | `registerBtn` `<button>` `frontend/public/dashboard.html:57` | `frontend/public/assets/js/app.js:17` module/inline | Navigate registration | click location (app.js:147) |
| B031 | `aboutDialog` `<div>` `frontend/public/dashboard.html:97` | `frontend/public/assets/js/app.js:12` module/inline | About modal visibility | none directly; buttons/Escape/overlay |
| B032 | `aboutDialogTitle` `<h3>` `frontend/public/dashboard.html:99` | No page-scoped JS consumer found | Accessible about-dialog title | none; aria-labelledby, not dead |
| B033 | `closeAboutBtn` `<button>` `frontend/public/dashboard.html:100` | `frontend/public/assets/js/app.js:10` module/inline | Dismiss about dialog | click hideDialog (:27) |
| B034 | `contactDialog` `<div>` `frontend/public/dashboard.html:130` | `frontend/public/assets/js/app.js:13` module/inline | Contact modal visibility | none directly; buttons/Escape/overlay |
| B035 | `contactDialogTitle` `<h3>` `frontend/public/dashboard.html:132` | No page-scoped JS consumer found | Accessible contact-dialog title | none; aria-labelledby, not dead |
| B036 | `closeContactBtn` `<button>` `frontend/public/dashboard.html:133` | `frontend/public/assets/js/app.js:11` module/inline | Dismiss contact dialog | click hideDialog (:28) |
| B037 | `overlay` `<div>` `frontend/public/dashboard.html:157` | `frontend/public/assets/js/app.js:6` module/inline | Dismiss sidebar/dialog layer | click closeAll (app.js:21) |

## B-PAGE — frontend/public/forget-password.html

Entrypoints: inline only. Import closure is used to scope consumers.

| Binding | ID / tag / definition | JS consumers (function and source) | Purpose / reads-writes | Listener / control |
|---|---|---|---|---|
| B038 | `forgotPasswordForm` `<form>` `frontend/public/forget-password.html:95` | `frontend/public/forget-password.html:110` module/inline | Legacy recovery C-LEGACY | submit (HTML:110) |
| B039 | `email` `<input>` `frontend/public/forget-password.html:97` | `frontend/public/forget-password.html:113` module/inline | Registration/recovery email string | read on parent form submit |

## B-PAGE — frontend/public/google-redirect.html

Entrypoints: `frontend/public/assets/js/google-redirect.js`. Import closure is used to scope consumers.

| Binding | ID / tag / definition | JS consumers (function and source) | Purpose / reads-writes | Listener / control |
|---|---|---|---|---|
| B040 | `welcomeMessage` `<div>` `frontend/public/google-redirect.html:49` | `frontend/public/assets/js/google-redirect.js:35` module/inline | OAuth welcome text after profile read | none; google-redirect.js writes |

## B-PAGE — frontend/public/homepage.html

Entrypoints: `frontend/public/assets/js/utils/loader.js`, `frontend/public/assets/js/usermanager.js`, `frontend/public/assets/js/appmanager.js`, `frontend/public/assets/js/homepage.js`. Import closure is used to scope consumers.

| Binding | ID / tag / definition | JS consumers (function and source) | Purpose / reads-writes | Listener / control |
|---|---|---|---|---|
| B041 | `user-notifications` `<div>` `frontend/public/homepage.html:36` | `frontend/public/assets/js/homepage.js:458` showUserNotification | Transient user notification text/classes | none; showUserNotification writes |
| B042 | `pageLoader` `<div>` `frontend/public/homepage.html:37` | `frontend/public/assets/js/homepage.js:602` module/inline | Startup loading overlay | window load delayed fade/remove (homepage.js:600–605) |
| B043 | `add-balance-btn` `<button>` `frontend/public/homepage.html:49` | `frontend/public/assets/js/homepage.js:77` _cacheDOMElements | Activate wallet tab | click (homepage.js:225) |
| B044 | `top-balance-display` `<span>` `frontend/public/homepage.html:53` | `frontend/public/assets/js/homepage.js:83` _cacheDOMElements; `frontend/public/assets/js/usermanager.js:124` updateUserProfile array-ID iteration; `frontend/public/assets/js/usermanager.js:237` clearUserUI array-ID iteration | Topbar balance text | none; UserManager/HomePage writes |
| B045 | `back-btn` `<a>` `frontend/public/homepage.html:61` | `frontend/public/assets/js/appmanager.js:333` _setupEventListeners; `frontend/public/assets/js/appmanager.js:358` hideBackBtn; `frontend/public/assets/js/appmanager.js:369` updateBackBtnVisibility; `frontend/public/assets/js/homepage.js:78` _cacheDOMElements | Return home/restore search | click both homepage.js:241 and appmanager.js:335 |
| B046 | `user-avatar` `<img>` `frontend/public/homepage.html:73` | `frontend/public/assets/js/homepage.js:80` _cacheDOMElements; `frontend/public/assets/js/usermanager.js:128` updateUserProfile; `frontend/public/assets/js/usermanager.js:240` clearUserUI | User/default avatar source | none; image source writes |
| B047 | `username-display` `<span>` `frontend/public/homepage.html:78` | `frontend/public/assets/js/homepage.js:81` _cacheDOMElements; `frontend/public/assets/js/usermanager.js:122` updateUserProfile; `frontend/public/assets/js/usermanager.js:235` clearUserUI | Username text | none; profile writes |
| B048 | `balance-display` `<span>` `frontend/public/homepage.html:80` | `frontend/public/assets/js/homepage.js:82` _cacheDOMElements; `frontend/public/assets/js/usermanager.js:124` updateUserProfile array-ID iteration; `frontend/public/assets/js/usermanager.js:237` clearUserUI array-ID iteration | Profile balance text | none; UserManager/HomePage writes |
| B049 | `profile-edit-btn` `<button>` `frontend/public/homepage.html:88` | `frontend/public/assets/js/homepage.js:84` _cacheDOMElements | Activate settings | click (homepage.js:231) |
| B050 | `logoutBtn` `<button>` `frontend/public/homepage.html:91` | `frontend/public/assets/js/homepage.js:91` _cacheDOMElements | Confirmed logout C-AUTH | click _handleLogout (homepage.js:312) |
| B051 | `theme-toggle-btn` `<button>` `frontend/public/homepage.html:122` | `frontend/public/assets/js/theme.js:2` module/inline; `frontend/public/assets/js/theme.js:38` module/inline | Homepage visual theme plus legacy server persistence | click toggleTheme (theme.js:38); G-USER-01 |
| B052 | `adsWrapper` `<div>` `frontend/public/homepage.html:137` | `frontend/public/assets/js/appmanager.js:199` initAdsManager → new AdsManager(selector); `frontend/public/assets/js/utils/adsManager.js:45` constructor wrapper selector | Advertisement carousel wrapper | generated slide.onclick → ad.action; rotation timer; constructor selector |
| B053 | `main-search-input` `<input>` `frontend/public/homepage.html:143` | `frontend/public/assets/js/core/search-manager.js:7` constructor | Local catalog search query | input/focus (search-manager.js:18–19) |
| B054 | `search-suggestions` `<div>` `frontend/public/homepage.html:145` | `frontend/public/assets/js/core/search-manager.js:8` constructor | Generated search suggestion results | generated suggestion click (:247); document click dismiss (:24) |
| B055 | `tabs-container` `<div>` `frontend/public/homepage.html:148` | `frontend/public/assets/js/homepage.js:73` _cacheDOMElements via class | Tab content parent | no direct ID call; selected by class .tabs-container |
| B056 | `home-tab` `<div>` `frontend/public/homepage.html:149` | `frontend/public/assets/js/core/search-manager.js:84` isHomeTabActive; `frontend/public/assets/js/core/taber.js:149` activateTab matches pane.id | Tab pane selected by data-tab / programmatic activateTab | sidebar link click (taber.js:51); tabChange callbacks |
| B057 | `home-tab-container` `<div>` `frontend/public/homepage.html:151` | `frontend/public/assets/js/appmanager.js:222` initTabs containerId config; `frontend/public/assets/js/core/search-manager.js:36` storeOriginalContents (dynamic selector) | Catalog grid render/search restore container | generated card clicks; dynamic refresh |
| B058 | `apps-tab` `<div>` `frontend/public/homepage.html:158` | `frontend/public/assets/js/core/taber.js:149` activateTab matches pane.id | Tab pane selected by data-tab / programmatic activateTab | sidebar link click (taber.js:51); tabChange callbacks |
| B059 | `apps-tab-container` `<div>` `frontend/public/homepage.html:159` | `frontend/public/assets/js/appmanager.js:232` initTabs containerId config; `frontend/public/assets/js/core/search-manager.js:36` storeOriginalContents (dynamic selector) | Catalog grid render/search restore container | generated card clicks; dynamic refresh |
| B060 | `games-tab` `<div>` `frontend/public/homepage.html:163` | `frontend/public/assets/js/core/taber.js:149` activateTab matches pane.id | Tab pane selected by data-tab / programmatic activateTab | sidebar link click (taber.js:51); tabChange callbacks |
| B061 | `games-tab-container` `<div>` `frontend/public/homepage.html:164` | `frontend/public/assets/js/appmanager.js:242` initTabs containerId config; `frontend/public/assets/js/core/search-manager.js:36` storeOriginalContents (dynamic selector) | Catalog grid render/search restore container | generated card clicks; dynamic refresh |
| B062 | `cryptos-tab` `<div>` `frontend/public/homepage.html:168` | `frontend/public/assets/js/core/taber.js:149` activateTab matches pane.id | Tab pane selected by data-tab / programmatic activateTab | sidebar link click (taber.js:51); tabChange callbacks |
| B063 | `cryptos-tab-container` `<div>` `frontend/public/homepage.html:169` | `frontend/public/assets/js/appmanager.js:252` initTabs containerId config; `frontend/public/assets/js/core/search-manager.js:36` storeOriginalContents (dynamic selector) | Catalog grid render/search restore container | generated card clicks; dynamic refresh |
| B064 | `balances-tab` `<div>` `frontend/public/homepage.html:173` | `frontend/public/assets/js/core/taber.js:149` activateTab matches pane.id | Tab pane selected by data-tab / programmatic activateTab | sidebar link click (taber.js:51); tabChange callbacks |
| B065 | `balances-tab-container` `<div>` `frontend/public/homepage.html:174` | `frontend/public/assets/js/appmanager.js:262` initTabs containerId config; `frontend/public/assets/js/core/search-manager.js:36` storeOriginalContents (dynamic selector) | Catalog grid render/search restore container | generated card clicks; dynamic refresh |
| B066 | `searchinfo-tab` `<div>` `frontend/public/homepage.html:177` | `frontend/public/assets/js/core/taber.js:149` activateTab matches pane.id | Tab pane selected by data-tab / programmatic activateTab | sidebar link click (taber.js:51); tabChange callbacks |
| B067 | `searchinfo-tab-container` `<div>` `frontend/public/homepage.html:178` | No page-scoped JS consumer found | Empty searchinfo placeholder container | no specific producer/consumer found (G-BIND-04) |
| B068 | `wallet-tab` `<div>` `frontend/public/homepage.html:181` | `frontend/public/assets/js/core/taber.js:149` activateTab matches pane.id | Tab pane selected by data-tab / programmatic activateTab | sidebar link click (taber.js:51); tabChange callbacks |
| B069 | `payment-method-select` `<select>` `frontend/public/homepage.html:184` | `frontend/public/assets/js/tabs/wallettab.js:19` constructor | Wallet method/limits/FX preview | change updatePaymentInfo (wallettab.js:43) |
| B070 | `converted-amount-box` `<div>` `frontend/public/homepage.html:195` | `frontend/public/assets/js/tabs/wallettab.js:35` _init; `frontend/public/assets/js/tabs/wallettab.js:71` updateConvertedAmount | FX/amount conversion visibility | none; wallet writes |
| B071 | `amount-input` `<input>` `frontend/public/homepage.html:197` | `frontend/public/assets/js/tabs/wallettab.js:20` constructor; `frontend/public/assets/js/tabs/wallettab.js:66` updateConvertedAmount | Claimed wallet amount | input updatePaymentInfo (:44) |
| B072 | `amount-input-dol` `<input>` `frontend/public/homepage.html:198` | `frontend/public/assets/js/tabs/wallettab.js:36` _init | Converted amount display | none; updatePaymentInfo writes |
| B073 | `receipt-upload` `<input>` `frontend/public/homepage.html:200` | `frontend/public/assets/js/tabs/wallettab.js:21` constructor | Receipt file selection | change preview (:42) |
| B074 | `receipt-preview` `<img>` `frontend/public/homepage.html:201` | `frontend/public/assets/js/tabs/wallettab.js:23` constructor | Receipt preview image | none; FileReader/source writes |
| B075 | `note-input` `<textarea>` `frontend/public/homepage.html:203` | `frontend/public/assets/js/tabs/wallettab.js:22` constructor | Optional payment note | value read on add-funds click |
| B076 | `payments-tab` `<div>` `frontend/public/homepage.html:208` | `frontend/public/assets/js/core/taber.js:149` activateTab matches pane.id | Tab pane selected by data-tab / programmatic activateTab | sidebar link click (taber.js:51); tabChange callbacks |
| B077 | `payment-filter` `<select>` `frontend/public/homepage.html:211` | `frontend/public/assets/js/tabs/paymentstab.js:21` constructor | Local payment status filter | change renderPayments (paymentstab.js:37) |
| B078 | `portfolio-tab` `<div>` `frontend/public/homepage.html:238` | `frontend/public/assets/js/core/taber.js:149` activateTab matches pane.id | Tab pane selected by data-tab / programmatic activateTab | sidebar link click (taber.js:51); tabChange callbacks |
| B079 | `refresh-portfolio` `<button>` `frontend/public/homepage.html:259` | `frontend/public/assets/js/tabs/portfoliotab.js:77` initComponents | Reload read-only portfolio | click loadData (portfoliotab.js:156) |
| B080 | `export-portfolio` `<button>` `frontend/public/homepage.html:263` | `frontend/public/assets/js/tabs/portfoliotab.js:78` initComponents | Toggle local export menu | click (:161) |
| B081 | `performance-chart` `<canvas>` `frontend/public/homepage.html:279` | `frontend/public/assets/js/tabs/portfoliotab.js:86` initComponents | Portfolio performance canvas | Chart rendering, no click listener |
| B082 | `distribution-chart` `<canvas>` `frontend/public/homepage.html:284` | `frontend/public/assets/js/tabs/portfoliotab.js:87` initComponents | Distribution canvas | Chart rendering, no click listener |
| B083 | `three-dis-chart` `<canvas>` `frontend/public/homepage.html:290` | `frontend/public/assets/js/tabs/portfoliotab.js:88` initComponents | Global summary chart canvas | Chart rendering, no click listener |
| B084 | `last-update-time` `<div>` `frontend/public/homepage.html:294` | `frontend/public/assets/js/tabs/portfoliotab.js:692` render3DChart | Summary update timestamp | none; render3DChart writes (:692) |
| B085 | `orders-tab` `<div>` `frontend/public/homepage.html:348` | `frontend/public/assets/js/core/taber.js:149` activateTab matches pane.id | Tab pane selected by data-tab / programmatic activateTab | sidebar link click (taber.js:51); tabChange callbacks |
| B086 | `order-filter` `<select>` `frontend/public/homepage.html:351` | `frontend/public/assets/js/tabs/orderstab.js:17` constructor | Local order status filter | change renderOrders (orderstab.js:43) |
| B087 | `settings-tab` `<div>` `frontend/public/homepage.html:376` | `frontend/public/assets/js/core/taber.js:149` activateTab matches pane.id | Tab pane selected by data-tab / programmatic activateTab | sidebar link click (taber.js:51); tabChange callbacks |
| B088 | `settings-form` `<form>` `frontend/public/homepage.html:378` | `frontend/public/assets/js/tabs/settingstab.js:21` render | Self profile patch C-PROFILE | submit bindEvents (settingstab.js:75) |
| B089 | `avatar-preview` `<img>` `frontend/public/homepage.html:380` | `frontend/public/assets/js/tabs/settingstab.js:23` render; `frontend/public/assets/js/tabs/settingstab.js:29` render | Current/default/selected avatar image | none; injectUserData/FileReader/remove writes |
| B090 | `avatar-input` `<input>` `frontend/public/homepage.html:384` | `frontend/public/assets/js/tabs/settingstab.js:22` render | New avatar file/preview | change (:102) |
| B091 | `accept-avatar-btn` `<button>` `frontend/public/homepage.html:385` | `frontend/public/assets/js/tabs/settingstab.js:24` render | Open avatar file picker (upload during save) | click avatarInput.click (:139) |
| B092 | `remove-avatar-btn` `<button>` `frontend/public/homepage.html:388` | `frontend/public/assets/js/tabs/settingstab.js:25` render | Confirmed server avatar removal | click removeAvatar (:144) |
| B093 | `fullName` `<input>` `frontend/public/homepage.html:396` | `frontend/public/assets/js/tabs/settingstab.js:26` render | Settings profile/password value, injected/read on submit | input validation (settingstab.js:63–69); submit reads; visual-key gaps G-BIND-03 |
| B094 | `fullName-icon` `<span>` `frontend/public/homepage.html:397` | No page-scoped JS consumer found | Field validation icon | no actual matching caller key (G-BIND-03) |
| B095 | `fullName-msg` `<small>` `frontend/public/homepage.html:398` | No page-scoped JS consumer found | Field validation message | no actual matching caller key (G-BIND-03) |
| B096 | `email` `<input>` `frontend/public/homepage.html:402` | `frontend/public/assets/js/tabs/settingstab.js:27` render | Settings profile/password value, injected/read on submit | input validation (settingstab.js:63–69); submit reads; visual-key gaps G-BIND-03 |
| B097 | `email-icon` `<span>` `frontend/public/homepage.html:403` | `frontend/public/assets/js/utils/appUtils.js:103` updateFieldVisual dynamic fieldId | Field validation icon | none; dynamic write |
| B098 | `email-msg` `<small>` `frontend/public/homepage.html:404` | `frontend/public/assets/js/utils/appUtils.js:104` updateFieldVisual dynamic fieldId | Field validation message | none; dynamic write |
| B099 | `phone` `<input>` `frontend/public/homepage.html:409` | `frontend/public/assets/js/tabs/settingstab.js:28` render | Settings profile/password value, injected/read on submit | input validation (settingstab.js:63–69); submit reads; visual-key gaps G-BIND-03 |
| B100 | `phone-icon` `<span>` `frontend/public/homepage.html:410` | `frontend/public/assets/js/utils/appUtils.js:103` updateFieldVisual dynamic fieldId | Field validation icon | none; dynamic write |
| B101 | `phone-msg` `<small>` `frontend/public/homepage.html:411` | `frontend/public/assets/js/utils/appUtils.js:104` updateFieldVisual dynamic fieldId | Field validation message | none; dynamic write |
| B102 | `newPassword` `<input>` `frontend/public/homepage.html:416` | `frontend/public/assets/js/tabs/settingstab.js:30` render | Settings profile/password value, injected/read on submit | input validation (settingstab.js:63–69); submit reads; visual-key gaps G-BIND-03 |
| B103 | `newPassword-icon` `<span>` `frontend/public/homepage.html:418` | No page-scoped JS consumer found | Field validation icon | no actual matching caller key (G-BIND-03) |
| B104 | `newPassword-msg` `<small>` `frontend/public/homepage.html:419` | No page-scoped JS consumer found | Field validation message | no actual matching caller key (G-BIND-03) |
| B105 | `confirmPassword` `<input>` `frontend/public/homepage.html:424` | `frontend/public/assets/js/tabs/settingstab.js:31` render | Settings profile/password value, injected/read on submit | input validation (settingstab.js:63–69); submit reads; visual-key gaps G-BIND-03 |
| B106 | `confirmPassword-icon` `<span>` `frontend/public/homepage.html:426` | No page-scoped JS consumer found | Field validation icon | no actual matching caller key (G-BIND-03) |
| B107 | `confirmPassword-msg` `<small>` `frontend/public/homepage.html:427` | No page-scoped JS consumer found | Field validation message | no actual matching caller key (G-BIND-03) |
| B108 | `security-tab` `<div>` `frontend/public/homepage.html:438` | `frontend/public/assets/js/core/taber.js:149` activateTab matches pane.id | Tab pane selected by data-tab / programmatic activateTab | sidebar link click (taber.js:51); tabChange callbacks |
| B109 | `verify-email-btn` `<button>` `frontend/public/homepage.html:446` | `frontend/public/assets/js/tabs/securitytab.js:56` _bindEvents | Legacy email verification request | click (securitytab.js:56) |
| B110 | `email-status` `<span>` `frontend/public/homepage.html:447` | `frontend/public/assets/js/tabs/securitytab.js:69` _renderState | Email verified text/class | none; _renderState writes |
| B111 | `toggle-2fa` `<input>` `frontend/public/homepage.html:456` | `frontend/public/assets/js/tabs/securitytab.js:57` _bindEvents; `frontend/public/assets/js/tabs/securitytab.js:71` _renderState | Show legacy2FA options | change (:57); _renderState checks |
| B112 | `2fa-status` `<span>` `frontend/public/homepage.html:460` | `frontend/public/assets/js/tabs/securitytab.js:70` _renderState | 2FA status text/class | none; _renderState writes |
| B113 | `2fa-options` `<div>` `frontend/public/homepage.html:465` | `frontend/public/assets/js/tabs/securitytab.js:72` _renderState; `frontend/public/assets/js/tabs/securitytab.js:113` _toggle2FA | 2FA enrollment options visibility | none; _renderState/_toggle2FA writes |
| B114 | `enable-2fa-qr-btn` `<button>` `frontend/public/homepage.html:469` | `frontend/public/assets/js/tabs/securitytab.js:58` _bindEvents | Legacy QR generation | click (:58) |
| B115 | `qr-container` `<div>` `frontend/public/homepage.html:470` | `frontend/public/assets/js/tabs/securitytab.js:123` _generateQR | Generated QR image | none; _generateQR writes |
| B116 | `send-2fa-email-btn` `<button>` `frontend/public/homepage.html:477` | `frontend/public/assets/js/tabs/securitytab.js:60` _bindEvents | Legacy email2FA key request | click (:60) |
| B117 | `email-token-input` `<input>` `frontend/public/homepage.html:479` | `frontend/public/assets/js/tabs/securitytab.js:167` _verifyEmailToken | Email2FA code | read on verify click |
| B118 | `verify-2fa-email-btn` `<button>` `frontend/public/homepage.html:480` | `frontend/public/assets/js/tabs/securitytab.js:61` _bindEvents | Verify legacy email2FA token | click (:61) |
| B119 | `disable-2fa-section` `<div>` `frontend/public/homepage.html:486` | `frontend/public/assets/js/tabs/securitytab.js:73` _renderState | 2FA disable form visibility | none; _renderState writes |
| B120 | `auth-confirm-input` `<input>` `frontend/public/homepage.html:490` | `frontend/public/assets/js/tabs/securitytab.js:185` _confirmDisable | 2FA disable proof code | read on confirm click |
| B121 | `confirm-disable-btn` `<button>` `frontend/public/homepage.html:492` | `frontend/public/assets/js/tabs/securitytab.js:62` _bindEvents | Legacy2FA disable request | click (:62) |
| B122 | `status-message` `<div>` `frontend/public/homepage.html:501` | `frontend/public/assets/js/tabs/securitytab.js:205` _setStatus | Security operation status text | none; _setStatus writes |
| B123 | `about-tab` `<div>` `frontend/public/homepage.html:507` | `frontend/public/assets/js/core/taber.js:149` activateTab matches pane.id | Tab pane selected by data-tab / programmatic activateTab | sidebar link click (taber.js:51); tabChange callbacks |
| B124 | `payment-details-modal` `<div>` `frontend/public/homepage.html:521` | `frontend/public/assets/js/tabs/paymentstab.js:109` showDetailsModal | Cached payment details/image modal | assigned onclick close/backdrop; document.onkeydown; drag (paymentstab.js:138–159) |
| B125 | `order-details-modal` `<div>` `frontend/public/homepage.html:541` | `frontend/public/assets/js/tabs/orderstab.js:133` showDetailsModal | Order details/private fulfillment modal | assigned onclick close/backdrop; document.onkeydown; drag (orderstab.js:155–174) |
| B126 | `terms-btn` `<button>` `frontend/public/homepage.html:553` | `frontend/public/assets/js/homepage.js:85` _cacheDOMElements | Open terms modal | click (homepage.js:286) |
| B127 | `privacy-btn` `<button>` `frontend/public/homepage.html:554` | `frontend/public/assets/js/homepage.js:86` _cacheDOMElements | Open privacy modal | click (:289) |
| B128 | `terms-modal` `<div>` `frontend/public/homepage.html:562` | `frontend/public/assets/js/homepage.js:87` _cacheDOMElements | Terms visibility | window backdrop click/close-modal (:294–299) |
| B129 | `privacy-modal` `<div>` `frontend/public/homepage.html:614` | `frontend/public/assets/js/homepage.js:88` _cacheDOMElements | Privacy visibility | window backdrop click/close-modal (:294–299) |

## B-PAGE — frontend/public/index.html

Entrypoints: inline only. Import closure is used to scope consumers.

| Binding | ID / tag / definition | JS consumers (function and source) | Purpose / reads-writes | Listener / control |
|---|---|---|---|---|
| B130 | `loader` `<div>` `frontend/public/index.html:42` | No page-scoped JS consumer found | CSS-only status loader | none; intentional decorative ID |
| B131 | `status-message` `<div>` `frontend/public/index.html:43` | `frontend/public/index.html:50` module/inline | Automatic status/navigation text | inline timer writes |
| B132 | `countdown` `<span>` `frontend/public/index.html:44` | `frontend/public/index.html:51` module/inline | Automatic status-navigation countdown | none; inline timer writes |

## B-PAGE — frontend/public/login.html

Entrypoints: `frontend/public/assets/js/utils/loader.js`, `frontend/public/assets/js/login.js`. Import closure is used to scope consumers.

| Binding | ID / tag / definition | JS consumers (function and source) | Purpose / reads-writes | Listener / control |
|---|---|---|---|---|
| B133 | `generalError` `<div>` `frontend/public/login.html:18` | `frontend/public/assets/js/login.js:225` loginUser; `frontend/public/assets/js/login.js:236` loginUser; `frontend/public/assets/js/login.js:280` module/inline | Field error text/class | none; showError/submit writes |
| B134 | `googleSignIn` `<button>` `frontend/public/login.html:21` | `frontend/public/assets/js/login.js:34` module/inline | Native Google OAuth C-OAUTH | click; register has no-op plus navigation |
| B135 | `appleSignIn` `<button>` `frontend/public/login.html:28` | `frontend/public/assets/js/login.js:42` module/inline | Placeholder Apple OAuth C-OAUTH | click external navigation |
| B136 | `loginForm` `<form>` `frontend/public/login.html:36` | `frontend/public/assets/js/login.js:270` module/inline | Local login submit C-AUTH | submit (login.js:272) |
| B137 | `username` `<input>` `frontend/public/login.html:38` | `frontend/public/assets/js/login.js:284` module/inline | Username/identifier field | value read on parent form submit |
| B138 | `usernameError` `<div>` `frontend/public/login.html:39` | `frontend/public/assets/js/login.js:201` loginUser | Field error text/class | none; showError/submit writes |
| B139 | `password` `<input>` `frontend/public/login.html:42` | `frontend/public/assets/js/login.js:285` module/inline | Untrimmed local password field | value read on parent form submit |
| B140 | `passwordError` `<div>` `frontend/public/login.html:44` | `frontend/public/assets/js/login.js:207` loginUser; `frontend/public/assets/js/login.js:213` loginUser | Field error text/class | none; showError/submit writes |
| B141 | `attemptsWarning` `<div>` `frontend/public/login.html:45` | `frontend/public/assets/js/login.js:214` loginUser | Legacy login remaining-attempt warning | none; loginUser writes |
| B142 | `submitBtn` `<button>` `frontend/public/login.html:49` | `frontend/public/assets/js/login.js:13` module/inline | Native form submit/loading disable state | native submit through parent form, not missing click |
| B143 | `btnText` `<span>` `frontend/public/login.html:50` | `frontend/public/assets/js/login.js:12` module/inline | Submit button label visibility | none; loading writes |
| B144 | `spinner` `<div>` `frontend/public/login.html:51` | `frontend/public/assets/js/login.js:11` module/inline | Submit loading indicator | none; loading writes |
| B145 | `rememberDevice` `<input>` `frontend/public/login.html:54` | No page-scoped JS consumer found | Remember-device checkbox, no consumer | no listener (G-AUTH-02) |
| B146 | `twofa-overlay` `<div>` `frontend/public/login.html:64` | No page-scoped JS consumer found | Unmigrated login2FA UI | no listener/consumer (G-AUTH-02) |
| B147 | `twofa-token-input` `<input>` `frontend/public/login.html:68` | No page-scoped JS consumer found | Unmigrated login2FA UI | no listener/consumer (G-AUTH-02) |
| B148 | `verify-2fa-login-btn` `<button>` `frontend/public/login.html:70` | No page-scoped JS consumer found | Unmigrated login2FA UI | no listener/consumer (G-AUTH-02) |
| B149 | `cancel-2fa-btn` `<button>` `frontend/public/login.html:71` | No page-scoped JS consumer found | Unmigrated login2FA UI | no listener/consumer (G-AUTH-02) |
| B150 | `twofa-status-message` `<div>` `frontend/public/login.html:73` | No page-scoped JS consumer found | Unmigrated login2FA UI | no listener/consumer (G-AUTH-02) |

## B-PAGE — frontend/public/logout.html

Entrypoints: `frontend/public/assets/js/utils/loader.js`. Import closure is used to scope consumers.

| Binding | ID / tag / definition | JS consumers (function and source) | Purpose / reads-writes | Listener / control |
|---|---|---|---|---|
| B151 | `loginBtn` `<button>` `frontend/public/logout.html:269` | `frontend/public/logout.html:285` module/inline | Navigate login | click location; page-scoped consumer below |

## B-PAGE — frontend/public/register.html

Entrypoints: `frontend/public/assets/js/utils/loader.js`, `frontend/public/assets/js/register.js`. Import closure is used to scope consumers.

| Binding | ID / tag / definition | JS consumers (function and source) | Purpose / reads-writes | Listener / control |
|---|---|---|---|---|
| B152 | `generalError` `<div>` `frontend/public/register.html:17` | `frontend/public/assets/js/register.js:85` showGeneralError; `frontend/public/assets/js/register.js:184` module/inline; `frontend/public/assets/js/register.js:185` module/inline | Field error text/class | none; showError/submit writes |
| B153 | `googleSignIn` `<button>` `frontend/public/register.html:20` | `frontend/public/assets/js/register.js:24` module/inline; `frontend/public/assets/js/register.js:56` module/inline | Native Google OAuth C-OAUTH | click; register has no-op plus navigation |
| B154 | `appleSignIn` `<button>` `frontend/public/register.html:27` | `frontend/public/assets/js/register.js:60` module/inline | Placeholder Apple OAuth C-OAUTH | click external navigation |
| B155 | `registerForm` `<form>` `frontend/public/register.html:36` | `frontend/public/assets/js/register.js:176` module/inline | Local registration submit C-AUTH | submit (register.js:176) |
| B156 | `username` `<input>` `frontend/public/register.html:38` | `frontend/public/assets/js/register.js:188` module/inline; `frontend/public/assets/js/register.js:217` module/inline | Username/identifier field | value read on parent form submit |
| B157 | `usernameError` `<div>` `frontend/public/register.html:39` | `frontend/public/assets/js/register.js:216` module/inline | Field error text/class | none; showError/submit writes |
| B158 | `password` `<input>` `frontend/public/register.html:42` | `frontend/public/assets/js/register.js:189` module/inline; `frontend/public/assets/js/register.js:221` module/inline | Untrimmed local password field | value read on parent form submit |
| B159 | `passwordError` `<div>` `frontend/public/register.html:44` | `frontend/public/assets/js/register.js:220` module/inline | Field error text/class | none; showError/submit writes |
| B160 | `email` `<input>` `frontend/public/register.html:47` | `frontend/public/assets/js/register.js:190` module/inline; `frontend/public/assets/js/register.js:225` module/inline | Registration/recovery email string | read on parent form submit |
| B161 | `emailError` `<div>` `frontend/public/register.html:48` | `frontend/public/assets/js/register.js:224` module/inline | Field error text/class | none; showError/submit writes |
| B162 | `countryCode` `<select>` `frontend/public/register.html:52` | `frontend/public/assets/js/register.js:191` module/inline | International phone prefix | value read on registration submit |
| B163 | `phoneNumber` `<input>` `frontend/public/register.html:75` | `frontend/public/assets/js/register.js:192` module/inline; `frontend/public/assets/js/register.js:229` module/inline | National phone digits | input filter (register.js:45); submit read |
| B164 | `phoneError` `<div>` `frontend/public/register.html:78` | `frontend/public/assets/js/register.js:228` module/inline | Field error text/class | none; showError/submit writes |
| B165 | `submitBtn` `<button>` `frontend/public/register.html:80` | `frontend/public/assets/js/register.js:30` module/inline | Native form submit/loading disable state | native submit through parent form, not missing click |
| B166 | `btnText` `<span>` `frontend/public/register.html:81` | `frontend/public/assets/js/register.js:29` module/inline | Submit button label visibility | none; loading writes |
| B167 | `spinner` `<div>` `frontend/public/register.html:82` | `frontend/public/assets/js/register.js:28` module/inline | Submit loading indicator | none; loading writes |

## B-PAGE — frontend/public/reset-password.html

Entrypoints: inline only. Import closure is used to scope consumers.

| Binding | ID / tag / definition | JS consumers (function and source) | Purpose / reads-writes | Listener / control |
|---|---|---|---|---|
| B168 | `resetPasswordForm` `<form>` `frontend/public/reset-password.html:73` | `frontend/public/reset-password.html:91` module/inline | Legacy password reset C-LEGACY | submit (HTML:91) |
| B169 | `token` `<input>` `frontend/public/reset-password.html:74` | `frontend/public/reset-password.html:89` module/inline; `frontend/public/reset-password.html:109` module/inline | Query reset token hidden input | inline set value/read submit (not OAuth query binding) |
| B170 | `newPassword` `<input>` `frontend/public/reset-password.html:76` | `frontend/public/reset-password.html:94` module/inline | Reset new password | read on submit |
| B171 | `confirmPassword` `<input>` `frontend/public/reset-password.html:79` | `frontend/public/reset-password.html:95` module/inline | Local reset confirmation (not sent) | read on submit |

## B-PAGE — frontend/public/session-expired.html

Entrypoints: inline only. Import closure is used to scope consumers.

| Binding | ID / tag / definition | JS consumers (function and source) | Purpose / reads-writes | Listener / control |
|---|---|---|---|---|
| B172 | `loginBtn` `<button>` `frontend/public/session-expired.html:99` | `frontend/public/session-expired.html:108` module/inline | Navigate login | click location; page-scoped consumer below |

## B-DYNAMIC — generated IDs, helper selectors, and non-ID controls

Detailed dynamic bindings and listener inventory follow below.

### Generated and parameterized IDs

| ID/pattern / tag | Definition | Consumer / listeners / purpose |
|---|---|---|
| player-id / input | js/dialogs/purchaseDialog.js:572 | _setupDialogEvents reads target:156, input validation:232, _validateInputs:459; C-PURCHASE server policy authority |
| player-id-error / span | js/dialogs/purchaseDialog.js:573 | _validatePlayerId queries/writes:411; no own listener |
| player-name / input | js/dialogs/purchaseDialog.js:580 | _injectCardData and refresh-player-btn click:226–229 generate local display name; not purchase authority |
| product-description / p | js/dialogs/purchaseDialog.js:589 | Description markup; no own ID consumer/listener found, not a missing interactive binding |
| dialog-purchase-css / link | js/dialogs/purchaseDialog.js:75 | _loadCSS uses stylesheet presence query then installs link; dedup, no listener |
| reloadBtn / button | js/homepage.js:394 | _showFatalError:400 click→location.reload |
| global-loader / div | js/utils/loader.js:7 | showLoader:62, hideLoader:74; window load auto-hide:47; display/opacity state |
| global-loader-img / img | js/utils/loader.js:8 | Static image inside generated loader; styled through parent img:34, no separate ID consumer |
| apps-tab-styles / link | js/tabs/appstab.js:242–246 | _injectStyles getElementById(styleId):243; stylesheet dedup, no listener |
| games-tab-styles / link | js/tabs/gamestab.js:187–191 | _injectStyles:188; stylesheet dedup |
| cryptos-tab-styles / link | js/tabs/cryptostab.js:186–190 | _injectStyles:187; stylesheet dedup |
| balances-tab-styles / link | js/tabs/balancestab.js:186–190 | _injectStyles:187; stylesheet dedup |
| ${tabData.id}-tab / div | js/core/taber.js:231–235 | addTab generates pane; new link click:241; activateTab/find/remove/getTab match pane.id:149,267,313,340 |
| ${tabId}-tab / existing pane | homepage.html:149–507 | Taber pane-ID comparisons above; no literal ID selector required |
| ${section}-tab-container / div | homepage.html:151–174; appmanager.js:222–262 | SearchManager store/restore/display/clear/no-results:36,45,113,136,317; sections home/apps/games/cryptos/balances |
| containerId / constructor parameter | appmanager.js:222–300 | HomeTab:24; Apps/Games/Cryptos/Balances:20; Orders:13; Payments:17; Wallet:14; Portfolio:62; Settings:19; Security tabId:10; actual argument IDs in static table |
| ${fieldId}-icon / span; ${fieldId}-msg / small | homepage.html:397–427 | appUtils.updateFieldVisual:103–104; caller Settings bindEvents:63–69,89. email/phone match; name/password/confirm do not match fullName/newPassword/confirmPassword (G-BIND-03) |
| globalSearchBar / missing | No definition; search actual markup homepage.html:142–145 | AppManager._updateSearchBarVisibility:381 guarded lookup; SearchManager uses .search-container:65–77 (G-BIND-01) |
| current-page-indicator / missing | No definition in page/generated inventory | HomePage._cacheDOMElements:79; guarded visibility use, omitted display (G-BIND-01) |
| verify-2fa-btn / missing; token-input / missing | Actual security markup homepage.html:469–490 | securitytab.js:59 optional click handler and :136 nonoptional read; no QR token completion controls (G-BIND-02) |
| currency-select / missing | Wallet markup homepage.html:184–198 has payment-method-select | wallettab.js:67 in dormant updateConvertedAmount; no discovered call, not live P0 (G-BIND-01) |

### Controls without IDs, delegated events, and native behavior

| Markup/producer evidence | Consumer and listener | Controlled behavior / contract / gap |
|---|---|---|
| homepage.html:94–119 sidebar data-tab links | core/taber.js:51 click→activateTab; HomePage tabChange | Sidebar home/wallet/payments/portfolio/orders/settings/security/about; category panes are programmatically activated |
| homepage.html:29–32 libraries, :649–652 entrypoints | HomePage→AppManager→tab classes, UserManager→theme (cyclic imports allowed) | Chart.js/md5/CryptoJS/SweetAlert and Taber's external HTTPS js-cookie module resources; no API schema from resource loads |
| homepage.html:44 .toggle-sidebar and :548 .overlay | homepage.js:214–215 click | Sidebar visibility; distinct from dashboard #overlay |
| homepage.html:85 .favorite-btn | No consumer/listener in page module graph | Placeholder favorites action G-BUTTON-01 |
| homepage.html:127–131 social anchors href='#' | Native fragment navigation only | Placeholder social destinations G-ROUTE-02 |
| homepage.html:205 .add-funds-btn | wallettab.js:24,41 click→_submitPayment | C-PAYMENT-SUBMIT; not native form submit |
| homepage.html:251–255 .filter-btn/data-filter; :296–298 .trans-filter-btn/data-trans-filter | portfoliotab.js:141,149 click/data filter | Local data range/type, C-PORTFOLIO |
| homepage.html:267–269 .export-options buttons/data-export | portfoliotab.js:167–170 click→exportData; document click dismiss:175 | TXT/JSON local downloads; PNG experimental alert, not unbound (G-FEATURE-03) |
| homepage.html:431 .save-btn type=submit | settings-form submit settingstab.js:75 | Native submit is handled at parent; **not** missing click |
| homepage.html:523 .payments-close-btn; :543 .orders-close-btn | paymentstab.js:138–140 and orderstab.js:155–157 assigned onclick/backdrop/document.onkeydown; drag listeners | Modal close/Escape/drag; global property handlers can replace each other, not absent handlers |
| homepage.html:566,618 .close-modal | homepage.js:294 click; :297 window backdrop | Terms/privacy close |
| generated purchase buttons/dialog overlay; purchaseDialog.js:544–604 | :148–152 close/cancel/confirm clicks; :187 input; :226 refresh player; :232 target input; :360 price change; :403 quantity input | C-PURCHASE; selector aliases $/$$ must be included |
| unavailable dialog purchaseDialog.js:611–631 | _setupUnavailableEvents:507 close, :512 outside click, :527–528 support/WhatsApp | Support native external navigation, no purchase request |
| generated catalog cards in tab modules and SearchManager:125,247 | card click opens PurchaseDialog; suggestion click displays result | No per-product static IDs expected |
| generated order rows orderstab.js:107; payment rows paymentstab.js:82–100 | details-btn click/data-id (:120 / :96) | Detail modal; orders private read, payments cached legacy receipt |
| generated admin user rows admin.js:88–114 | document delegated click delete/unban/edit (:303,357–368) | C-ADMIN-USERS version/path gaps |
| generated payment boxes admin.js:132–171 | accept/reject onclick decision handlers:310–357 | C-PAYMENTS-READ; premature finally removal G-PAYMENT-02 |
| generated admin orders adminOrders.js:23–61 | view.onclick:28; decision button.onclick:42; refresh.onclick:61 | Authorized fulfillment, persisted exact decision/retry, C-ORDERS |
| generated ad slide utils/adsManager.js:77–89 and adsManager.html:253–265 | slide.onclick→ad.action;4sec rotation timer | WhatsApp or switchTab event; **no arrow/dot/swipe binding** in current implementation |
| generated toast homepage.js:430–450 | toast-close-btn click→remove/process queue | Toast classes toast-${type} generated, not dead CSS |
| generated AppManager fatal button appmanager.js:459 | inline onclick=location.reload() | Native reload, no ID expected |
| verify.html:14–19 form/button/support anchor | Native POST submit and link; no JS required for dispatch | C-LEGACY absent activation/support routes |
| index.html:45 and :55–60 | Native dashboard link/automatic timer | Status page redirects dashboard, no auth probe |
| dashboard.html:141 WhatsApp link | Native anchor, no JS listener needed | External contact; not missing handler |
| forget-password/reset/complete-profile native submit buttons | Parent form inline handlers at HTML:110/:91/:38 | C-LEGACY/C-PROFILE; no separate click required |

Homepage.html:527–540 is an **HTML comment** containing old payment-dialog/onclick markup. closePaymentDialog/submitPayment there are not live handlers, and repeated amount/receipt IDs there do not create duplicate live IDs.

### Listener census (source-located)

112 addEventListener calls in the AST inventory follow; document/window/socket listeners are retained because they affect controls. Property handlers and generated/native behavior are covered separately above. Callback snippets are identification aids, not a substitute for the detailed binding rows. Anonymous callbacks are labeled module/inline where no nearer named function exists.

| Listener | Source/function | Target/event/callback excerpt |
|---|---|---|
| E001 | `frontend/public/adsManager.html:301` module/inline | `document.addEventListener('DOMContentLoaded', () => { new AdsManager('#adsWrapper', ADS); })` |
| E002 | `frontend/public/complete-profile.html:38` module/inline | `document.getElementById('completeProfileForm').addEventListener('submit', async (e) => { e.preventDefault(); const fullName = document.getElementById('fullName').value; const count` |
| E003 | `frontend/public/forget-password.html:110` module/inline | `document.getElementById('forgotPasswordForm').addEventListener('submit', async (e) => { e.preventDefault(); const email = document.getElementById('email').value; try { const respon` |
| E004 | `frontend/public/logout.html:284` module/inline | `document.addEventListener('DOMContentLoaded', () => { document.getElementById('loginBtn')?.addEventListener('click', () => { window.location.href = './login.html'; }); /** * ✅ تطبي` |
| E005 | `frontend/public/reset-password.html:91` module/inline | `document.getElementById('resetPasswordForm').addEventListener('submit', async (e) => { e.preventDefault(); const newPassword = document.getElementById('newPassword').value; const c` |
| E006 | `frontend/public/session-expired.html:107` module/inline | `document.addEventListener('DOMContentLoaded', () => { document.getElementById('loginBtn')?.addEventListener('click', () => { window.location.href = './login.html'; }); })` |
| E007 | `backend/public/401.html:107` module/inline | `document.addEventListener('DOMContentLoaded', () => { // حذف التخزين المحلي localStorage.clear(); // حذف التخزين المؤقت للجلسة sessionStorage.clear(); // حذف الكوكيز document.cooki` |
| E008 | `frontend/public/assets/js/admin.js:201` module/inline | `document.getElementById('updateBalanceBtn').addEventListener('click', async () => { const userId = document.getElementById('userId').value.trim(); const newBalance = document.getEl` |
| E009 | `frontend/public/assets/js/admin.js:234` module/inline | `document.getElementById('updateStatusBtn').addEventListener('click', async () => { const userId = document.getElementById('statusUserId').value.trim(); const newStatus = document.g` |
| E010 | `frontend/public/assets/js/admin.js:303` module/inline | `document.addEventListener('click', (e) => { const target = e.target; // ✅ تحديد العنصر الذي يحتوي على الزر const noteBox = target.closest('.note-box'); if (target.classList.contain` |
| E011 | `frontend/public/assets/js/admin.js:407` module/inline | `window.addEventListener('DOMContentLoaded', () => { initAdminWebSocket(); loadUsers(); // تحميل المستخدمين loadPendingPayments(); // تحميل الدفعات المعلقة initAdminOrders(); // Aut` |
| E012 | `frontend/public/assets/js/admin.js:412` module/inline | `document.getElementById('test-button').addEventListener('click', sendTestNotification)` |
| E013 | `frontend/public/assets/js/app.js:19` module/inline | `menuBtn.addEventListener('click', toggleSidebar)` |
| E014 | `frontend/public/assets/js/app.js:20` module/inline | `closeBtn.addEventListener('click', toggleSidebar)` |
| E015 | `frontend/public/assets/js/app.js:21` module/inline | `overlay.addEventListener('click', closeAll)` |
| E016 | `frontend/public/assets/js/app.js:23` module/inline | `themeBtn.addEventListener('click', toggleTheme)` |
| E017 | `frontend/public/assets/js/app.js:25` module/inline | `aboutBtn.addEventListener('click', () => showDialog(aboutDialog))` |
| E018 | `frontend/public/assets/js/app.js:26` module/inline | `contactBtn.addEventListener('click', () => showDialog(contactDialog))` |
| E019 | `frontend/public/assets/js/app.js:27` module/inline | `closeAboutBtn.addEventListener('click', () => hideDialog(aboutDialog))` |
| E020 | `frontend/public/assets/js/app.js:28` module/inline | `closeContactBtn.addEventListener('click', () => hideDialog(contactDialog))` |
| E021 | `frontend/public/assets/js/app.js:30` module/inline | `document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && AppState.currentDialog) { hideDialog(AppState.currentDialog); } })` |
| E022 | `frontend/public/assets/js/app.js:137` module/inline | `document.addEventListener('DOMContentLoaded', loadSettings())` |
| E023 | `frontend/public/assets/js/app.js:140` module/inline | `document.addEventListener('DOMContentLoaded', function () { if (loginBtn) { loginBtn.addEventListener('click', function () { window.location.href = '/login.html'; }); } if (registe` |
| E024 | `frontend/public/assets/js/app.js:142` module/inline | `loginBtn.addEventListener('click', function () { window.location.href = '/login.html'; })` |
| E025 | `frontend/public/assets/js/app.js:147` module/inline | `registerBtn.addEventListener('click', function () { window.location.href = '/register.html'; })` |
| E026 | `frontend/public/assets/js/appmanager.js:335` _setupEventListeners | `backBtn.addEventListener('click', this._eventHandlers.backButton)` |
| E027 | `frontend/public/assets/js/appmanager.js:338` _setupEventListeners | `document.addEventListener('refreshData', this._eventHandlers.refreshData)` |
| E028 | `frontend/public/assets/js/core/search-manager.js:18` init | `this.searchInput.addEventListener('input', this.handleSearch.bind(this))` |
| E029 | `frontend/public/assets/js/core/search-manager.js:19` init | `this.searchInput.addEventListener('focus', () => { const query = this.searchInput.value.trim(); this.showSuggestions(query); })` |
| E030 | `frontend/public/assets/js/core/search-manager.js:24` init | `document.addEventListener('click', (e) => { if (!this.searchInput.contains(e.target) && !this.suggestionsContainer.contains(e.target)) { this.hideSuggestions(); } })` |
| E031 | `frontend/public/assets/js/core/search-manager.js:125` displaySingleResult | `card.addEventListener('click', () => this.handleCardClick(item, item.category))` |
| E032 | `frontend/public/assets/js/core/search-manager.js:247` createSuggestionElement | `suggestionItem.addEventListener('click', () => { this.searchInput.value = item.name; this.displaySingleResult(item); this.hideSuggestions(); })` |
| E033 | `frontend/public/assets/js/core/taber.js:51` _initialize | `link.addEventListener('click', (e) => { // ربط الأحداث e.preventDefault(); const tabId = link.getAttribute('data-tab'); this.activateTab(tabId); })` |
| E034 | `frontend/public/assets/js/core/taber.js:241` addTab | `a.addEventListener('click', (e) => { e.preventDefault(); this.activateTab(tabData.id); })` |
| E035 | `frontend/public/assets/js/dialogs/purchaseDialog.js:187` _setupDialogEvents | `el.addEventListener('input', () => { let quantity = parseInt($('.quantity-input')?.value \|\| $('.quantity-select')?.value \|\| '1', 10); let totalPrice = parseFloat(this.cardPrice \|\| ` |
| E036 | `frontend/public/assets/js/dialogs/purchaseDialog.js:360` _generateQuantityInput | `priceSelect.addEventListener('change', updateTotal)` |
| E037 | `frontend/public/assets/js/dialogs/purchaseDialog.js:403` _generateQuantityInput | `quantityInput.addEventListener('input', updateTotal)` |
| E038 | `frontend/public/assets/js/dialogs/purchaseDialog.js:507` _setupUnavailableEvents | `closeBtn.addEventListener('click', () => { this.close(); })` |
| E039 | `frontend/public/assets/js/dialogs/purchaseDialog.js:512` _setupUnavailableEvents | `document.addEventListener('click', (e) => { if (dialog && !dialog.contains(e.target)) { this.close(); } })` |
| E040 | `frontend/public/assets/js/dialogs/purchaseDialog.js:527` _setupUnavailableEvents | `supportPhoneEl.addEventListener('click', openWhatsApp)` |
| E041 | `frontend/public/assets/js/dialogs/purchaseDialog.js:528` _setupUnavailableEvents | `whatsappBtn.addEventListener('click', openWhatsApp)` |
| E042 | `frontend/public/assets/js/google-redirect.js:16` module/inline | `document.addEventListener('DOMContentLoaded', () => { const urlParams = new URLSearchParams(window.location.search); const token = urlParams.get('token'); const sessionId = urlPara` |
| E043 | `frontend/public/assets/js/homepage.js:214` _setupSidebarEvents | `toggleBtn.addEventListener('click', toggleSidebar)` |
| E044 | `frontend/public/assets/js/homepage.js:215` _setupSidebarEvents | `overlay.addEventListener('click', toggleSidebar)` |
| E045 | `frontend/public/assets/js/homepage.js:225` _setupWalletEvents | `this.domElements.addBalanceBtn.addEventListener('click', () => { this.components.taber.activateTab('wallet'); })` |
| E046 | `frontend/public/assets/js/homepage.js:231` _setupSettingsEvents | `this.domElements.editProfileBtn.addEventListener('click', () => { this.components.taber.activateTab('settings'); })` |
| E047 | `frontend/public/assets/js/homepage.js:241` _setupBackButtonEvents | `this.domElements.backBtn.addEventListener('click', (e) => { e.preventDefault(); this.components.taber.activateTab(APP_CONFIG.DEFAULT_TAB); })` |
| E048 | `frontend/public/assets/js/homepage.js:271` _setupScrollHandlers | `window.addEventListener('scroll', throttledScrollHandler)` |
| E049 | `frontend/public/assets/js/homepage.js:273` _setupScrollHandlers | `this.domElements.mainContent.addEventListener('scroll', () => { if (this.domElements.sidebar.classList.contains('active')) { this.eventListeners.toggleSidebar(); } })` |
| E050 | `frontend/public/assets/js/homepage.js:286` _setupModalHandlers | `this.domElements.termsBtn.addEventListener('click', () => this._openModal(this.domElements.termsModal))` |
| E051 | `frontend/public/assets/js/homepage.js:289` _setupModalHandlers | `this.domElements.privacyBtn.addEventListener('click', () => this._openModal(this.domElements.privacyModal))` |
| E052 | `frontend/public/assets/js/homepage.js:294` _setupModalHandlers | `btn.addEventListener('click', this._closeAllModals.bind(this))` |
| E053 | `frontend/public/assets/js/homepage.js:297` _setupModalHandlers | `window.addEventListener('click', (event) => { if ([this.domElements.termsModal, this.domElements.privacyModal].includes(event.target)) { this._closeAllModals(); } })` |
| E054 | `frontend/public/assets/js/homepage.js:312` _setupLogoutHandler | `this.domElements.logoutBtn.addEventListener('click', () => this.userManager._handleLogout())` |
| E055 | `frontend/public/assets/js/homepage.js:400` _showFatalError | `document.getElementById('reloadBtn').addEventListener('click', () => { window.location.reload(); })` |
| E056 | `frontend/public/assets/js/homepage.js:450` renderToast | `toast.querySelector('.toast-close-btn').addEventListener('click', () => { toast.remove(); isShowingNotification = false; processNotificationQueue(); })` |
| E057 | `frontend/public/assets/js/homepage.js:506` module/inline | `document.addEventListener('DOMContentLoaded', () => { //showLoader(); (async () => { const user = await checkSession(); // لا حاجة لدور معين if (!user) return; /** * homepage.js - ` |
| E058 | `frontend/public/assets/js/homepage.js:524` module/inline | `socket.addEventListener('open', () => { // تعريف المستخدم عند الاتصال socket.send(JSON.stringify({ type: 'auth', role: 'user', userId: localStorage.getItem(STORAGE_KEYS.USER_ID), /` |
| E059 | `frontend/public/assets/js/homepage.js:596` module/inline | `document.addEventListener('switchTab', (e) => { if (window.homePage?.components?.taber) window.homePage.components.taber.activateTab(e.detail); })` |
| E060 | `frontend/public/assets/js/homepage.js:600` module/inline | `window.addEventListener('load', () => { setTimeout(() => { const loader = document.getElementById('pageLoader'); if (loader) { loader.style.opacity = '0'; setTimeout(() => loader.r` |
| E061 | `frontend/public/assets/js/homepage.js:611` module/inline | `window.addEventListener('beforeunload', () => { window.homePage?.destroy(); })` |
| E062 | `frontend/public/assets/js/login.js:16` module/inline | `document.addEventListener('DOMContentLoaded', () => { (async () => { const result = await secureFetch('/api/auth/check-session'); if (result.success && result.data.isAuthenticated ` |
| E063 | `frontend/public/assets/js/login.js:36` module/inline | `googleBtn.addEventListener('click', () => { window.location.href = '/api/auth/google'; })` |
| E064 | `frontend/public/assets/js/login.js:44` module/inline | `appleBtn.addEventListener('click', () => { const appleAuthUrl = new URL('https://appleid.apple.com/auth/authorize'); appleAuthUrl.searchParams.set('client_id', 'YOUR_APPLE_SERVICE_` |
| E065 | `frontend/public/assets/js/login.js:272` module/inline | `loginForm.addEventListener('submit', async (e) => { e.preventDefault(); document.querySelectorAll('.error-message').forEach(el => { el.classList.remove('show'); el.textContent = ''` |
| E066 | `frontend/public/assets/js/register.js:24` module/inline | `byId('googleSignIn').addEventListener('click', () => { // ... })` |
| E067 | `frontend/public/assets/js/register.js:36` module/inline | `document.addEventListener('DOMContentLoaded', () => { /** * ✅ تطبيق الثيم المحفوظ في localStorage * يضبط مظهر الصفحة حسب تفضيل المستخدم **/ const savedTheme = localStorage.getItem(` |
| E068 | `frontend/public/assets/js/register.js:45` module/inline | `document.getElementById("phoneNumber").addEventListener("input", function (e) { let value = e.target.value; // السماح فقط بـ + في البداية ثم أرقام if (!/^\+?\d*$/.test(value)) { e.` |
| E069 | `frontend/public/assets/js/register.js:56` module/inline | `byId('googleSignIn').addEventListener('click', () => { window.location.href = '/api/auth/google'; })` |
| E070 | `frontend/public/assets/js/register.js:60` module/inline | `byId('appleSignIn').addEventListener('click', () => { window.location.href = 'https://appleid.apple.com/auth/authorize?' + 'client_id=YOUR_APPLE_SERVICE_ID&' + 'redirect_uri=https:` |
| E071 | `frontend/public/assets/js/register.js:176` module/inline | `byId('registerForm').addEventListener('submit', async (e) => { e.preventDefault(); // 🧹 تنظيف الأخطاء السابقة document.querySelectorAll('.error-message').forEach((el) => { el.class` |
| E072 | `frontend/public/assets/js/tabs/appstab.js:125` _createAppCard | `card.addEventListener('click', () => { const dialogPurchase = new DialogPurchase(app, { iconsBasePath: '/assets/images/', cssPath: '/assets/css/purchase-dialog.css', supportPhone: ` |
| E073 | `frontend/public/assets/js/tabs/balancestab.js:125` _createBalanceCard | `card.addEventListener('click', () => { const dialogPurchase = new DialogPurchase(balance, { iconsBasePath: '/assets/images/', cssPath: '/assets/css/purchase-dialog.css', supportPho` |
| E074 | `frontend/public/assets/js/tabs/cryptostab.js:125` _createCryptoCard | `card.addEventListener('click', () => { const dialogPurchase = new DialogPurchase(crypto, { iconsBasePath: '/assets/images/', cssPath: '/assets/css/purchase-dialog.css', supportPhon` |
| E075 | `frontend/public/assets/js/tabs/gamestab.js:126` _createGameCard | `card.addEventListener('click', () => { const dialogPurchase = new DialogPurchase(game, { iconsBasePath: '/assets/images/', cssPath: '/assets/css/purchase-dialog.css', supportPhone:` |
| E076 | `frontend/public/assets/js/tabs/hometab.js:199` _addCardEventListeners | `cardEl.addEventListener('click', () => this._handleCardClick(index, card))` |
| E077 | `frontend/public/assets/js/tabs/hometab.js:202` _addCardEventListeners | `cardEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' \|\| e.key === ' ') { e.preventDefault(); this._handleCardClick(index, card); } })` |
| E078 | `frontend/public/assets/js/tabs/hometab.js:323` _showErrorState | `this.container.querySelector('.retry-button').addEventListener('click', () => { this._initializeComponent(); })` |
| E079 | `frontend/public/assets/js/tabs/orderstab.js:24` constructor | `document.addEventListener('purchaseConfirmed', this.onPurchase)` |
| E080 | `frontend/public/assets/js/tabs/orderstab.js:43` init | `this.filterSelect.addEventListener('change', () => this.renderOrders())` |
| E081 | `frontend/public/assets/js/tabs/orderstab.js:120` attachDetailsHandlers | `btn.addEventListener('click', () => { const orderId = btn.dataset.id; const order = this.orders.find(o => o.orderId === orderId); this.showDetailsModal(order); })` |
| E082 | `frontend/public/assets/js/tabs/orderstab.js:159` showDetailsModal | `modalContent.addEventListener('mousedown', (e) => { isDragging = true; offsetX = e.clientX - modalContent.offsetLeft; offsetY = e.clientY - modalContent.offsetTop; modalContent.sty` |
| E083 | `frontend/public/assets/js/tabs/orderstab.js:166` showDetailsModal | `document.addEventListener('mousemove', (e) => { if (isDragging) { modalContent.style.left = ${e.clientX - offsetX}px; modalContent.style.top = ${e.clientY - offsetY}px; } })` |
| E084 | `frontend/public/assets/js/tabs/orderstab.js:172` showDetailsModal | `document.addEventListener('mouseup', () => { isDragging = false; })` |
| E085 | `frontend/public/assets/js/tabs/paymentstab.js:37` init | `this.filterSelect.addEventListener('change', () => this.renderPayments())` |
| E086 | `frontend/public/assets/js/tabs/paymentstab.js:96` attachDetailsHandlers | `btn.addEventListener('click', () => { const paymentId = btn.dataset.id; const payment = this.payments.find(p => p.paymentId === paymentId); this.showDetailsModal(payment); })` |
| E087 | `frontend/public/assets/js/tabs/paymentstab.js:144` showDetailsModal | `modalContent.addEventListener('mousedown', (e) => { isDragging = true; offsetX = e.clientX - modalContent.offsetLeft; offsetY = e.clientY - modalContent.offsetTop; modalContent.sty` |
| E088 | `frontend/public/assets/js/tabs/paymentstab.js:151` showDetailsModal | `document.addEventListener('mousemove', (e) => { if (isDragging) { modalContent.style.left = ${e.clientX - offsetX}px; modalContent.style.top = ${e.clientY - offsetY}px; } })` |
| E089 | `frontend/public/assets/js/tabs/paymentstab.js:157` showDetailsModal | `document.addEventListener('mouseup', () => { isDragging = false; })` |
| E090 | `frontend/public/assets/js/tabs/portfoliotab.js:20` constructor | `document.addEventListener('purchaseConfirmed', () => this.loadData(30))` |
| E091 | `frontend/public/assets/js/tabs/portfoliotab.js:128` createErrorIndicator | `errorDiv.querySelector('.retry-btn').addEventListener('click', () => { this.loadData(30); })` |
| E092 | `frontend/public/assets/js/tabs/portfoliotab.js:141` initEventListeners | `btn.addEventListener('click', (e) => { const filter = e.target.dataset.filter; this.handleFilterChange(filter); })` |
| E093 | `frontend/public/assets/js/tabs/portfoliotab.js:149` initEventListeners | `btn.addEventListener('click', (e) => { const filter = e.target.dataset.transFilter; this.handleTransactionFilter(filter); })` |
| E094 | `frontend/public/assets/js/tabs/portfoliotab.js:156` initEventListeners | `this.elements.refreshBtn.addEventListener('click', () => { this.loadData(30); })` |
| E095 | `frontend/public/assets/js/tabs/portfoliotab.js:161` initEventListeners | `this.elements.exportBtn.addEventListener('click', (e) => { e.stopPropagation(); const exportOptions = this.elements.exportBtn.nextElementSibling; exportOptions.style.display = expo` |
| E096 | `frontend/public/assets/js/tabs/portfoliotab.js:168` initEventListeners | `option.addEventListener('click', (e) => { const format = e.target.dataset.export; this.exportData(format); })` |
| E097 | `frontend/public/assets/js/tabs/portfoliotab.js:175` initEventListeners | `document.addEventListener('click', (e) => { if (!e.target.closest('.export-dropdown')) { const exportOptions = document.querySelector('.export-options'); if (exportOptions) exportO` |
| E098 | `frontend/public/assets/js/tabs/settingstab.js:66` bindEvents | `input.addEventListener('input', () => { const value = input.value.trim(); const passwordRef = this.passwordInput?.value.trim(); validateAndVisualizeField(key, value, passwordRef); ` |
| E099 | `frontend/public/assets/js/tabs/settingstab.js:75` bindEvents | `this.form.addEventListener('submit', (e) => { e.preventDefault(); const fields = { name: this.nameInput?.value.trim(), email: this.emailInput?.value.trim(), phone: this.phoneInput?` |
| E100 | `frontend/public/assets/js/tabs/settingstab.js:102` bindEvents | `this.avatarInput.addEventListener('change', (e) => { const file = e.target.files[0]; if (!file) { this.avatarPreview.src = ''; this.removeAvatarBtn.style.display = 'none'; return; ` |
| E101 | `frontend/public/assets/js/tabs/settingstab.js:139` bindEvents | `this.changeAvatarBtn.addEventListener('click', () => { this.avatarInput.click(); })` |
| E102 | `frontend/public/assets/js/tabs/settingstab.js:144` bindEvents | `this.removeAvatarBtn.addEventListener('click', () => this.removeAvatar())` |
| E103 | `frontend/public/assets/js/tabs/wallettab.js:41` _init | `this.submitBtn.addEventListener('click', () => this._submitPayment())` |
| E104 | `frontend/public/assets/js/tabs/wallettab.js:42` _init | `this.fileInput.addEventListener('change', () => this._previewImage())` |
| E105 | `frontend/public/assets/js/tabs/wallettab.js:43` _init | `this.select.addEventListener('change', () => this.updatePaymentInfo())` |
| E106 | `frontend/public/assets/js/tabs/wallettab.js:44` _init | `this.amountInput.addEventListener('input', () => this.updatePaymentInfo())` |
| E107 | `frontend/public/assets/js/theme.js:37` module/inline | `document.addEventListener('DOMContentLoaded', function () { document.getElementById('theme-toggle-btn').addEventListener('click', function () { toggleTheme(); }); initTheme(); })` |
| E108 | `frontend/public/assets/js/theme.js:38` module/inline | `document.getElementById('theme-toggle-btn').addEventListener('click', function () { toggleTheme(); })` |
| E109 | `frontend/public/assets/js/utils/loader.js:47` module/inline | `window.addEventListener('load', () => { setTimeout(() => { window.hideLoader(); }, 500); // تأخير بسيط لتجنب الوميض })` |
| E110 | `frontend/public/sw.js:35` module/inline | `self.addEventListener('install', (event) => { event.waitUntil( caches.open(CACHE_NAME) .then(cache => cache.addAll(PRECACHE_URLS)) .then(() => self.skipWaiting()) ); })` |
| E111 | `frontend/public/sw.js:44` module/inline | `self.addEventListener('activate', (event) => { event.waitUntil( caches.keys() .then(keys => Promise.all( keys.map(key => key !== CACHE_NAME && caches.delete(key)) )) .then(() => se` |
| E112 | `frontend/public/sw.js:131` module/inline | `self.addEventListener('fetch', event => { const url = new URL(event.request.url); // إشعار ببدء التحميل self.clients.matchAll().then(clients => { clients.forEach(client => { client` |

### Selector census (literal and parameterized)

279 DOM selector calls, including class controls/dynamic parameters; helper calls such as register byId, purchase $/$$, pane.id comparisons and constructor arguments are detailed above rather than mistaken for missing selectors.

| Selector | Source/function | Lookup |
|---|---|---|
| S001 | `frontend/public/adsManager.html:230` constructor | `document.querySelector(wrapperSelector)` |
| S002 | `frontend/public/complete-profile.html:38` module/inline | `document.getElementById('completeProfileForm')` |
| S003 | `frontend/public/complete-profile.html:40` module/inline | `document.getElementById('fullName')` |
| S004 | `frontend/public/complete-profile.html:41` module/inline | `document.getElementById('country')` |
| S005 | `frontend/public/complete-profile.html:42` module/inline | `document.getElementById('phone')` |
| S006 | `frontend/public/forget-password.html:110` module/inline | `document.getElementById('forgotPasswordForm')` |
| S007 | `frontend/public/forget-password.html:113` module/inline | `document.getElementById('email')` |
| S008 | `frontend/public/index.html:50` module/inline | `document.getElementById('status-message')` |
| S009 | `frontend/public/index.html:51` module/inline | `document.getElementById('countdown')` |
| S010 | `frontend/public/logout.html:285` module/inline | `document.getElementById('loginBtn')` |
| S011 | `frontend/public/reset-password.html:89` module/inline | `document.getElementById('token')` |
| S012 | `frontend/public/reset-password.html:91` module/inline | `document.getElementById('resetPasswordForm')` |
| S013 | `frontend/public/reset-password.html:94` module/inline | `document.getElementById('newPassword')` |
| S014 | `frontend/public/reset-password.html:95` module/inline | `document.getElementById('confirmPassword')` |
| S015 | `frontend/public/reset-password.html:109` module/inline | `document.getElementById('token')` |
| S016 | `frontend/public/session-expired.html:108` module/inline | `document.getElementById('loginBtn')` |
| S017 | `backend/public/401.html:117` module/inline | `document.getElementById('loginBtn')` |
| S018 | `frontend/public/assets/js/admin.js:57` updateConnectionStatus | `document.getElementById('connectionStatus')` |
| S019 | `frontend/public/assets/js/admin.js:68` showNotification | `document.getElementById('globalNotification')` |
| S020 | `frontend/public/assets/js/admin.js:79` loadUsers | `document.querySelector('#usersTable tbody')` |
| S021 | `frontend/public/assets/js/admin.js:116` loadPendingPayments | `document.getElementById('admin-notifications')` |
| S022 | `frontend/public/assets/js/admin.js:133` renderPaymentNotification | `document.getElementById('admin-notifications')` |
| S023 | `frontend/public/assets/js/admin.js:134` renderPaymentNotification | `container.querySelector([data-id="${data.paymentId}"])` |
| S024 | `frontend/public/assets/js/admin.js:177` renderBackupNotification | `document.getElementById('backupNotifications')` |
| S025 | `frontend/public/assets/js/admin.js:201` module/inline | `document.getElementById('updateBalanceBtn')` |
| S026 | `frontend/public/assets/js/admin.js:202` module/inline | `document.getElementById('userId')` |
| S027 | `frontend/public/assets/js/admin.js:203` module/inline | `document.getElementById('newBalance')` |
| S028 | `frontend/public/assets/js/admin.js:204` module/inline | `document.getElementById('balanceResult')` |
| S029 | `frontend/public/assets/js/admin.js:234` module/inline | `document.getElementById('updateStatusBtn')` |
| S030 | `frontend/public/assets/js/admin.js:235` module/inline | `document.getElementById('statusUserId')` |
| S031 | `frontend/public/assets/js/admin.js:236` module/inline | `document.getElementById('newStatus')` |
| S032 | `frontend/public/assets/js/admin.js:237` module/inline | `document.getElementById('statusResult')` |
| S033 | `frontend/public/assets/js/admin.js:373` sendTestNotification | `document.getElementById('notification-type')` |
| S034 | `frontend/public/assets/js/admin.js:374` sendTestNotification | `document.getElementById('target-user-id')` |
| S035 | `frontend/public/assets/js/admin.js:412` module/inline | `document.getElementById('test-button')` |
| S036 | `frontend/public/assets/js/app.js:3` module/inline | `document.getElementById('menuBtn')` |
| S037 | `frontend/public/assets/js/app.js:4` module/inline | `document.getElementById('closeBtn')` |
| S038 | `frontend/public/assets/js/app.js:5` module/inline | `document.getElementById('dash-sidebar')` |
| S039 | `frontend/public/assets/js/app.js:6` module/inline | `document.getElementById('overlay')` |
| S040 | `frontend/public/assets/js/app.js:7` module/inline | `document.getElementById('themeBtn')` |
| S041 | `frontend/public/assets/js/app.js:8` module/inline | `document.getElementById('aboutBtn')` |
| S042 | `frontend/public/assets/js/app.js:9` module/inline | `document.getElementById('contactBtn')` |
| S043 | `frontend/public/assets/js/app.js:10` module/inline | `document.getElementById('closeAboutBtn')` |
| S044 | `frontend/public/assets/js/app.js:11` module/inline | `document.getElementById('closeContactBtn')` |
| S045 | `frontend/public/assets/js/app.js:12` module/inline | `document.getElementById('aboutDialog')` |
| S046 | `frontend/public/assets/js/app.js:13` module/inline | `document.getElementById('contactDialog')` |
| S047 | `frontend/public/assets/js/app.js:15` module/inline | `document.getElementById('loginBtn')` |
| S048 | `frontend/public/assets/js/app.js:17` module/inline | `document.getElementById('registerBtn')` |
| S049 | `frontend/public/assets/js/app.js:51` loadSettings | `document.getElementById('themeBtn')` |
| S050 | `frontend/public/assets/js/app.js:52` loadSettings | `themeBtn.querySelector('i')` |
| S051 | `frontend/public/assets/js/app.js:73` closeAll | `document.querySelectorAll('.dialog.active')` |
| S052 | `frontend/public/assets/js/app.js:87` toggleTheme | `themeBtn.querySelector('i')` |
| S053 | `frontend/public/assets/js/appmanager.js:333` _setupEventListeners | `document.getElementById('back-btn')` |
| S054 | `frontend/public/assets/js/appmanager.js:347` _handleTabChange | `document.querySelector('.sidebar')` |
| S055 | `frontend/public/assets/js/appmanager.js:348` _handleTabChange | `document.querySelector('.overlay')` |
| S056 | `frontend/public/assets/js/appmanager.js:358` hideBackBtn | `document.getElementById('back-btn')` |
| S057 | `frontend/public/assets/js/appmanager.js:369` updateBackBtnVisibility | `document.getElementById('back-btn')` |
| S058 | `frontend/public/assets/js/appmanager.js:381` _updateSearchBarVisibility | `document.getElementById('globalSearchBar')` |
| S059 | `frontend/public/assets/js/core/search-manager.js:7` constructor | `document.getElementById('main-search-input')` |
| S060 | `frontend/public/assets/js/core/search-manager.js:8` constructor | `document.getElementById('search-suggestions')` |
| S061 | `frontend/public/assets/js/core/search-manager.js:36` storeOriginalContents | `document.getElementById(${section}-tab-container)` |
| S062 | `frontend/public/assets/js/core/search-manager.js:45` restoreOriginalContents | `document.getElementById(${section}-tab-container)` |
| S063 | `frontend/public/assets/js/core/search-manager.js:67` setupTabObserver | `document.querySelector('.search-container')` |
| S064 | `frontend/public/assets/js/core/search-manager.js:84` isHomeTabActive | `document.getElementById('home-tab')` |
| S065 | `frontend/public/assets/js/core/search-manager.js:113` displaySingleResult | `document.getElementById(${this.appManager.getActiveTabId()}-tab-container)` |
| S066 | `frontend/public/assets/js/core/search-manager.js:136` clearAllSections | `document.getElementById(${section}-tab-container)` |
| S067 | `frontend/public/assets/js/core/search-manager.js:154` addBackButton | `document.querySelector('.search-container')` |
| S068 | `frontend/public/assets/js/core/search-manager.js:282` loadCardIcon | `cardElement.querySelector('.icon')` |
| S069 | `frontend/public/assets/js/core/search-manager.js:317` showNoResultsAllSections | `document.getElementById(${section}-tab-container)` |
| S070 | `frontend/public/assets/js/core/taber.js:228` addTab | `this.sidebarContianer.querySelector('.sidebar-menu')` |
| S071 | `frontend/public/assets/js/core/taber.js:235` addTab | `this.tabsContentContainer.querySelector('.tabs-content')` |
| S072 | `frontend/public/assets/js/core/taber.js:299` _refreshElements | `this.sidebarContianer.querySelectorAll(this.options.tabLinkSelector)` |
| S073 | `frontend/public/assets/js/core/taber.js:300` _refreshElements | `this.tabsContentContainer.querySelectorAll(this.options.tabPaneSelector)` |
| S074 | `frontend/public/assets/js/dialogs/purchaseDialog.js:72` _loadCSS | `document.querySelector(link[href="${this.options.cssPath}"])` |
| S075 | `frontend/public/assets/js/dialogs/purchaseDialog.js:102` open | `this.overlay.querySelector('.purchase-dialog')` |
| S076 | `frontend/public/assets/js/dialogs/purchaseDialog.js:127` close | `this.overlay.querySelector('.purchase-dialog')` |
| S077 | `frontend/public/assets/js/dialogs/purchaseDialog.js:144` _setupDialogEvents | `this.overlay.querySelector(sel)` |
| S078 | `frontend/public/assets/js/dialogs/purchaseDialog.js:145` _setupDialogEvents | `this.overlay.querySelectorAll(sel)` |
| S079 | `frontend/public/assets/js/dialogs/purchaseDialog.js:210` _setupDialogEvents | `this.overlay.querySelector('.dialog-error')` |
| S080 | `frontend/public/assets/js/dialogs/purchaseDialog.js:242` _injectCardData | `this.overlay.querySelector(sel)` |
| S081 | `frontend/public/assets/js/dialogs/purchaseDialog.js:257` _injectCardData | `this.overlay.querySelector('.player-name-group')` |
| S082 | `frontend/public/assets/js/dialogs/purchaseDialog.js:262` _injectCardData | `this.overlay.querySelector('label[for="player-id"]')` |
| S083 | `frontend/public/assets/js/dialogs/purchaseDialog.js:267` _injectCardData | `this.overlay.querySelector('.dialog-error')` |
| S084 | `frontend/public/assets/js/dialogs/purchaseDialog.js:268` _injectCardData | `this.overlay.querySelectorAll('input, select')` |
| S085 | `frontend/public/assets/js/dialogs/purchaseDialog.js:280` _generateQuantityInput | `this.overlay.querySelector('.quantity-container')` |
| S086 | `frontend/public/assets/js/dialogs/purchaseDialog.js:342` _generateQuantityInput | `this.overlay.querySelector('.dialog-total')` |
| S087 | `frontend/public/assets/js/dialogs/purchaseDialog.js:346` _generateQuantityInput | `this.overlay.querySelector('.dialog-error')` |
| S088 | `frontend/public/assets/js/dialogs/purchaseDialog.js:387` _generateQuantityInput | `this.overlay.querySelector('.dialog-total')` |
| S089 | `frontend/public/assets/js/dialogs/purchaseDialog.js:390` _generateQuantityInput | `this.overlay.querySelector('.dialog-error')` |
| S090 | `frontend/public/assets/js/dialogs/purchaseDialog.js:440` _validateInputs | `overlay.querySelector('.quantity-error')` |
| S091 | `frontend/public/assets/js/dialogs/purchaseDialog.js:441` _validateInputs | `overlay.querySelector('.quantity-input, .quantity-select')` |
| S092 | `frontend/public/assets/js/dialogs/purchaseDialog.js:459` _validateInputs | `overlay.querySelector('#player-id')` |
| S093 | `frontend/public/assets/js/dialogs/purchaseDialog.js:500` _setupUnavailableEvents | `document.querySelector('.purchase-dialog')` |
| S094 | `frontend/public/assets/js/dialogs/purchaseDialog.js:502` _setupUnavailableEvents | `dialog.querySelector('.dialog-purchase-close-btn')` |
| S095 | `frontend/public/assets/js/dialogs/purchaseDialog.js:503` _setupUnavailableEvents | `dialog.querySelector('.support-phone')` |
| S096 | `frontend/public/assets/js/dialogs/purchaseDialog.js:504` _setupUnavailableEvents | `dialog.querySelector('.whatsapp-btn')` |
| S097 | `frontend/public/assets/js/google-redirect.js:35` module/inline | `document.getElementById('welcomeMessage')` |
| S098 | `frontend/public/assets/js/homepage.js:71` _cacheDOMElements | `document.querySelector('.sidebar')` |
| S099 | `frontend/public/assets/js/homepage.js:72` _cacheDOMElements | `document.querySelector('.sidebar-menu-container')` |
| S100 | `frontend/public/assets/js/homepage.js:73` _cacheDOMElements | `document.querySelector('.tabs-container')` |
| S101 | `frontend/public/assets/js/homepage.js:74` _cacheDOMElements | `document.querySelector('.toggle-sidebar')` |
| S102 | `frontend/public/assets/js/homepage.js:75` _cacheDOMElements | `document.querySelector('.overlay')` |
| S103 | `frontend/public/assets/js/homepage.js:77` _cacheDOMElements | `document.getElementById('add-balance-btn')` |
| S104 | `frontend/public/assets/js/homepage.js:78` _cacheDOMElements | `document.getElementById('back-btn')` |
| S105 | `frontend/public/assets/js/homepage.js:79` _cacheDOMElements | `document.getElementById('current-page-indicator')` |
| S106 | `frontend/public/assets/js/homepage.js:80` _cacheDOMElements | `document.getElementById('user-avatar')` |
| S107 | `frontend/public/assets/js/homepage.js:81` _cacheDOMElements | `document.getElementById('username-display')` |
| S108 | `frontend/public/assets/js/homepage.js:82` _cacheDOMElements | `document.getElementById('balance-display')` |
| S109 | `frontend/public/assets/js/homepage.js:83` _cacheDOMElements | `document.getElementById('top-balance-display')` |
| S110 | `frontend/public/assets/js/homepage.js:84` _cacheDOMElements | `document.getElementById('profile-edit-btn')` |
| S111 | `frontend/public/assets/js/homepage.js:85` _cacheDOMElements | `document.getElementById('terms-btn')` |
| S112 | `frontend/public/assets/js/homepage.js:86` _cacheDOMElements | `document.getElementById('privacy-btn')` |
| S113 | `frontend/public/assets/js/homepage.js:87` _cacheDOMElements | `document.getElementById('terms-modal')` |
| S114 | `frontend/public/assets/js/homepage.js:88` _cacheDOMElements | `document.getElementById('privacy-modal')` |
| S115 | `frontend/public/assets/js/homepage.js:89` _cacheDOMElements | `document.querySelectorAll('.close-modal')` |
| S116 | `frontend/public/assets/js/homepage.js:90` _cacheDOMElements | `document.querySelector('.main-content')` |
| S117 | `frontend/public/assets/js/homepage.js:91` _cacheDOMElements | `document.getElementById('logoutBtn')` |
| S118 | `frontend/public/assets/js/homepage.js:92` _cacheDOMElements | `document.querySelector('.site-footer')` |
| S119 | `frontend/public/assets/js/homepage.js:145` _updateUserUI | `document.querySelector('last-login')` |
| S120 | `frontend/public/assets/js/homepage.js:400` _showFatalError | `document.getElementById('reloadBtn')` |
| S121 | `frontend/public/assets/js/homepage.js:450` renderToast | `toast.querySelector('.toast-close-btn')` |
| S122 | `frontend/public/assets/js/homepage.js:458` showUserNotification | `document.getElementById('user-notifications')` |
| S123 | `frontend/public/assets/js/homepage.js:602` module/inline | `document.getElementById('pageLoader')` |
| S124 | `frontend/public/assets/js/login.js:11` module/inline | `document.getElementById('spinner')` |
| S125 | `frontend/public/assets/js/login.js:12` module/inline | `document.getElementById('btnText')` |
| S126 | `frontend/public/assets/js/login.js:13` module/inline | `document.getElementById('submitBtn')` |
| S127 | `frontend/public/assets/js/login.js:34` module/inline | `document.getElementById('googleSignIn')` |
| S128 | `frontend/public/assets/js/login.js:42` module/inline | `document.getElementById('appleSignIn')` |
| S129 | `frontend/public/assets/js/login.js:72` shakeElement | `document.getElementById(elementId)` |
| S130 | `frontend/public/assets/js/login.js:81` showError | `document.getElementById(elementId)` |
| S131 | `frontend/public/assets/js/login.js:89` clearErrors | `document.querySelectorAll('.error-message, .general-error')` |
| S132 | `frontend/public/assets/js/login.js:225` loginUser | `document.getElementById('generalError')` |
| S133 | `frontend/public/assets/js/login.js:270` module/inline | `document.getElementById('loginForm')` |
| S134 | `frontend/public/assets/js/login.js:275` module/inline | `document.querySelectorAll('.error-message')` |
| S135 | `frontend/public/assets/js/login.js:280` module/inline | `document.getElementById('generalError')` |
| S136 | `frontend/public/assets/js/login.js:284` module/inline | `document.getElementById('username')` |
| S137 | `frontend/public/assets/js/login.js:285` module/inline | `document.getElementById('password')` |
| S138 | `frontend/public/assets/js/register.js:21` module/inline | `document.getElementById(id)` |
| S139 | `frontend/public/assets/js/register.js:45` module/inline | `document.getElementById("phoneNumber")` |
| S140 | `frontend/public/assets/js/register.js:91` shakeElement | `document.getElementById(id)` |
| S141 | `frontend/public/assets/js/register.js:180` module/inline | `document.querySelectorAll('.error-message')` |
| S142 | `frontend/public/assets/js/tabs/appstab.js:20` constructor | `document.getElementById(containerId)` |
| S143 | `frontend/public/assets/js/tabs/appstab.js:24` constructor | `this.container.querySelectorAll('.card')` |
| S144 | `frontend/public/assets/js/tabs/appstab.js:52` init | `this.container.querySelector('.grid-layout')` |
| S145 | `frontend/public/assets/js/tabs/appstab.js:92` _renderAppsGrid | `this.container.querySelector('.skeleton-grid')` |
| S146 | `frontend/public/assets/js/tabs/appstab.js:157` _setupLazyLoading | `this.container.querySelectorAll('.card')` |
| S147 | `frontend/public/assets/js/tabs/appstab.js:168` _loadCardIcon | `card.querySelector('.icon')` |
| S148 | `frontend/public/assets/js/tabs/appstab.js:188` _renderFilteredGrid | `this.container.querySelector('.grid-layout')` |
| S149 | `frontend/public/assets/js/tabs/appstab.js:243` _injectStyles | `document.getElementById(styleId)` |
| S150 | `frontend/public/assets/js/tabs/balancestab.js:20` constructor | `document.getElementById(containerId)` |
| S151 | `frontend/public/assets/js/tabs/balancestab.js:24` constructor | `this.container.querySelectorAll('.card')` |
| S152 | `frontend/public/assets/js/tabs/balancestab.js:52` init | `this.container.querySelector('.grid-layout')` |
| S153 | `frontend/public/assets/js/tabs/balancestab.js:92` _renderBalancesGrid | `this.container.querySelector('.skeleton-grid')` |
| S154 | `frontend/public/assets/js/tabs/balancestab.js:156` _setupLazyLoading | `this.container.querySelectorAll('.card')` |
| S155 | `frontend/public/assets/js/tabs/balancestab.js:167` _loadCardIcon | `card.querySelector('.icon')` |
| S156 | `frontend/public/assets/js/tabs/balancestab.js:187` _injectStyles | `document.getElementById(styleId)` |
| S157 | `frontend/public/assets/js/tabs/balancestab.js:202` _renderFilteredGrid | `this.container.querySelector('.grid-layout')` |
| S158 | `frontend/public/assets/js/tabs/cryptostab.js:20` constructor | `document.getElementById(containerId)` |
| S159 | `frontend/public/assets/js/tabs/cryptostab.js:24` constructor | `this.container.querySelectorAll('.card')` |
| S160 | `frontend/public/assets/js/tabs/cryptostab.js:52` init | `this.container.querySelector('.grid-layout')` |
| S161 | `frontend/public/assets/js/tabs/cryptostab.js:92` _renderCryptosGrid | `this.container.querySelector('.skeleton-grid')` |
| S162 | `frontend/public/assets/js/tabs/cryptostab.js:156` _setupLazyLoading | `this.container.querySelectorAll('.card')` |
| S163 | `frontend/public/assets/js/tabs/cryptostab.js:167` _loadCardIcon | `card.querySelector('.icon')` |
| S164 | `frontend/public/assets/js/tabs/cryptostab.js:187` _injectStyles | `document.getElementById(styleId)` |
| S165 | `frontend/public/assets/js/tabs/cryptostab.js:202` _renderFilteredGrid | `this.container.querySelector('.grid-layout')` |
| S166 | `frontend/public/assets/js/tabs/gamestab.js:20` constructor | `document.getElementById(containerId)` |
| S167 | `frontend/public/assets/js/tabs/gamestab.js:24` constructor | `this.container.querySelectorAll('.card')` |
| S168 | `frontend/public/assets/js/tabs/gamestab.js:52` init | `this.container.querySelector('.grid-layout')` |
| S169 | `frontend/public/assets/js/tabs/gamestab.js:92` _renderGamesGrid | `this.container.querySelector('.skeleton-grid')` |
| S170 | `frontend/public/assets/js/tabs/gamestab.js:157` _setupLazyLoading | `this.container.querySelectorAll('.card')` |
| S171 | `frontend/public/assets/js/tabs/gamestab.js:168` _loadCardIcon | `card.querySelector('.icon')` |
| S172 | `frontend/public/assets/js/tabs/gamestab.js:188` _injectStyles | `document.getElementById(styleId)` |
| S173 | `frontend/public/assets/js/tabs/gamestab.js:203` _renderFilteredGrid | `this.container.querySelector('.grid-layout')` |
| S174 | `frontend/public/assets/js/tabs/hometab.js:24` constructor | `document.getElementById(containerId)` |
| S175 | `frontend/public/assets/js/tabs/hometab.js:76` _loadCSS | `document.querySelector(link[href*="${href}"])` |
| S176 | `frontend/public/assets/js/tabs/hometab.js:218` _handleCardClick | `this.container.querySelectorAll('.big-card')` |
| S177 | `frontend/public/assets/js/tabs/hometab.js:222` _handleCardClick | `this.container.querySelector(.big-card[data-index="${index}"])` |
| S178 | `frontend/public/assets/js/tabs/hometab.js:239` _adjustCardsToScreenSize | `this.container.querySelectorAll('.big-card')` |
| S179 | `frontend/public/assets/js/tabs/hometab.js:323` _showErrorState | `this.container.querySelector('.retry-button')` |
| S180 | `frontend/public/assets/js/tabs/orderstab.js:13` constructor | `document.getElementById(containerId)` |
| S181 | `frontend/public/assets/js/tabs/orderstab.js:16` constructor | `this.container.querySelector('tbody')` |
| S182 | `frontend/public/assets/js/tabs/orderstab.js:17` constructor | `this.container.querySelector('#order-filter')` |
| S183 | `frontend/public/assets/js/tabs/orderstab.js:66` renderSavedPurchases | `this.container.querySelector('.saved-purchases')` |
| S184 | `frontend/public/assets/js/tabs/orderstab.js:118` attachDetailsHandlers | `this.tbody.querySelectorAll('.details-btn')` |
| S185 | `frontend/public/assets/js/tabs/orderstab.js:133` showDetailsModal | `document.getElementById('order-details-modal')` |
| S186 | `frontend/public/assets/js/tabs/orderstab.js:134` showDetailsModal | `modal.querySelector('.modal-content')` |
| S187 | `frontend/public/assets/js/tabs/orderstab.js:135` showDetailsModal | `modal.querySelector('.orders-close-btn')` |
| S188 | `frontend/public/assets/js/tabs/orderstab.js:141` showDetailsModal | `modal.querySelector('.modal-body')` |
| S189 | `frontend/public/assets/js/tabs/orderstab.js:178` _closeModal | `modal.querySelector('.modal-content')` |
| S190 | `frontend/public/assets/js/tabs/paymentstab.js:17` constructor | `document.getElementById(containerId)` |
| S191 | `frontend/public/assets/js/tabs/paymentstab.js:20` constructor | `this.container.querySelector('tbody')` |
| S192 | `frontend/public/assets/js/tabs/paymentstab.js:21` constructor | `this.container.querySelector('#payment-filter')` |
| S193 | `frontend/public/assets/js/tabs/paymentstab.js:94` attachDetailsHandlers | `this.tbody.querySelectorAll('.details-btn')` |
| S194 | `frontend/public/assets/js/tabs/paymentstab.js:109` showDetailsModal | `document.getElementById('payment-details-modal')` |
| S195 | `frontend/public/assets/js/tabs/paymentstab.js:110` showDetailsModal | `modal.querySelector('.modal-content')` |
| S196 | `frontend/public/assets/js/tabs/paymentstab.js:111` showDetailsModal | `modal.querySelector('.payments-close-btn')` |
| S197 | `frontend/public/assets/js/tabs/paymentstab.js:119` showDetailsModal | `modal.querySelector('.modal-body')` |
| S198 | `frontend/public/assets/js/tabs/paymentstab.js:163` _closeModal | `modal.querySelector('.modal-content')` |
| S199 | `frontend/public/assets/js/tabs/portfoliotab.js:62` initComponents | `document.getElementById(this.containerId)` |
| S200 | `frontend/public/assets/js/tabs/portfoliotab.js:69` initComponents | `this.elements.container.querySelector('.balance-amount')` |
| S201 | `frontend/public/assets/js/tabs/portfoliotab.js:70` initComponents | `this.elements.container.querySelector('.balance-change')` |
| S202 | `frontend/public/assets/js/tabs/portfoliotab.js:71` initComponents | `this.elements.container.querySelector('.change-positive')` |
| S203 | `frontend/public/assets/js/tabs/portfoliotab.js:74` initComponents | `this.elements.container.querySelectorAll('.filter-btn')` |
| S204 | `frontend/public/assets/js/tabs/portfoliotab.js:77` initComponents | `this.elements.container.querySelector('#refresh-portfolio')` |
| S205 | `frontend/public/assets/js/tabs/portfoliotab.js:78` initComponents | `this.elements.container.querySelector('#export-portfolio')` |
| S206 | `frontend/public/assets/js/tabs/portfoliotab.js:79` initComponents | `this.elements.container.querySelectorAll('.export-options button')` |
| S207 | `frontend/public/assets/js/tabs/portfoliotab.js:86` initComponents | `this.elements.container.querySelector('#performance-chart')` |
| S208 | `frontend/public/assets/js/tabs/portfoliotab.js:87` initComponents | `this.elements.container.querySelector('#distribution-chart')` |
| S209 | `frontend/public/assets/js/tabs/portfoliotab.js:88` initComponents | `this.elements.container.querySelector('#three-dis-chart')` |
| S210 | `frontend/public/assets/js/tabs/portfoliotab.js:91` initComponents | `this.elements.container.querySelectorAll('.trans-filter-btn')` |
| S211 | `frontend/public/assets/js/tabs/portfoliotab.js:92` initComponents | `this.elements.container.querySelector('.transactions-list')` |
| S212 | `frontend/public/assets/js/tabs/portfoliotab.js:128` createErrorIndicator | `errorDiv.querySelector('.retry-btn')` |
| S213 | `frontend/public/assets/js/tabs/portfoliotab.js:177` initEventListeners | `document.querySelector('.export-options')` |
| S214 | `frontend/public/assets/js/tabs/portfoliotab.js:692` render3DChart | `document.querySelector('#last-update-time')` |
| S215 | `frontend/public/assets/js/tabs/portfoliotab.js:750` exportData | `document.querySelector('.export-options')` |
| S216 | `frontend/public/assets/js/tabs/securitytab.js:10` constructor | `document.getElementById(tabId)` |
| S217 | `frontend/public/assets/js/tabs/securitytab.js:56` _bindEvents | `document.getElementById('verify-email-btn')` |
| S218 | `frontend/public/assets/js/tabs/securitytab.js:57` _bindEvents | `document.getElementById('toggle-2fa')` |
| S219 | `frontend/public/assets/js/tabs/securitytab.js:58` _bindEvents | `document.getElementById('enable-2fa-qr-btn')` |
| S220 | `frontend/public/assets/js/tabs/securitytab.js:59` _bindEvents | `document.getElementById('verify-2fa-btn')` |
| S221 | `frontend/public/assets/js/tabs/securitytab.js:60` _bindEvents | `document.getElementById('send-2fa-email-btn')` |
| S222 | `frontend/public/assets/js/tabs/securitytab.js:61` _bindEvents | `document.getElementById('verify-2fa-email-btn')` |
| S223 | `frontend/public/assets/js/tabs/securitytab.js:62` _bindEvents | `document.getElementById('confirm-disable-btn')` |
| S224 | `frontend/public/assets/js/tabs/securitytab.js:69` _renderState | `document.getElementById('email-status')` |
| S225 | `frontend/public/assets/js/tabs/securitytab.js:70` _renderState | `document.getElementById('2fa-status')` |
| S226 | `frontend/public/assets/js/tabs/securitytab.js:71` _renderState | `document.getElementById('toggle-2fa')` |
| S227 | `frontend/public/assets/js/tabs/securitytab.js:72` _renderState | `document.getElementById('2fa-options')` |
| S228 | `frontend/public/assets/js/tabs/securitytab.js:73` _renderState | `document.getElementById('disable-2fa-section')` |
| S229 | `frontend/public/assets/js/tabs/securitytab.js:113` _toggle2FA | `document.getElementById('2fa-options')` |
| S230 | `frontend/public/assets/js/tabs/securitytab.js:123` _generateQR | `document.getElementById('qr-container')` |
| S231 | `frontend/public/assets/js/tabs/securitytab.js:136` _verifyToken | `document.getElementById('token-input')` |
| S232 | `frontend/public/assets/js/tabs/securitytab.js:167` _verifyEmailToken | `document.getElementById('email-token-input')` |
| S233 | `frontend/public/assets/js/tabs/securitytab.js:185` _confirmDisable | `document.getElementById('auth-confirm-input')` |
| S234 | `frontend/public/assets/js/tabs/securitytab.js:205` _setStatus | `document.getElementById('status-message')` |
| S235 | `frontend/public/assets/js/tabs/settingstab.js:19` render | `document.getElementById(this.containerId)` |
| S236 | `frontend/public/assets/js/tabs/settingstab.js:21` render | `document.getElementById('settings-form')` |
| S237 | `frontend/public/assets/js/tabs/settingstab.js:22` render | `document.getElementById('avatar-input')` |
| S238 | `frontend/public/assets/js/tabs/settingstab.js:23` render | `document.getElementById('avatar-preview')` |
| S239 | `frontend/public/assets/js/tabs/settingstab.js:24` render | `document.getElementById('accept-avatar-btn')` |
| S240 | `frontend/public/assets/js/tabs/settingstab.js:25` render | `document.getElementById('remove-avatar-btn')` |
| S241 | `frontend/public/assets/js/tabs/settingstab.js:26` render | `document.getElementById('fullName')` |
| S242 | `frontend/public/assets/js/tabs/settingstab.js:27` render | `document.getElementById('email')` |
| S243 | `frontend/public/assets/js/tabs/settingstab.js:28` render | `document.getElementById('phone')` |
| S244 | `frontend/public/assets/js/tabs/settingstab.js:29` render | `document.getElementById('avatar-preview')` |
| S245 | `frontend/public/assets/js/tabs/settingstab.js:30` render | `document.getElementById('newPassword')` |
| S246 | `frontend/public/assets/js/tabs/settingstab.js:31` render | `document.getElementById('confirmPassword')` |
| S247 | `frontend/public/assets/js/tabs/wallettab.js:14` constructor | `document.getElementById(containerId)` |
| S248 | `frontend/public/assets/js/tabs/wallettab.js:19` constructor | `this.container.querySelector('#payment-method-select')` |
| S249 | `frontend/public/assets/js/tabs/wallettab.js:20` constructor | `this.container.querySelector('#amount-input')` |
| S250 | `frontend/public/assets/js/tabs/wallettab.js:21` constructor | `this.container.querySelector('#receipt-upload')` |
| S251 | `frontend/public/assets/js/tabs/wallettab.js:22` constructor | `this.container.querySelector('#note-input')` |
| S252 | `frontend/public/assets/js/tabs/wallettab.js:23` constructor | `this.container.querySelector('#receipt-preview')` |
| S253 | `frontend/public/assets/js/tabs/wallettab.js:24` constructor | `this.container.querySelector('.add-funds-btn')` |
| S254 | `frontend/public/assets/js/tabs/wallettab.js:25` constructor | `this.container.querySelector('.balance-amount')` |
| S255 | `frontend/public/assets/js/tabs/wallettab.js:35` _init | `document.getElementById('converted-amount-box')` |
| S256 | `frontend/public/assets/js/tabs/wallettab.js:36` _init | `document.getElementById('amount-input-dol')` |
| S257 | `frontend/public/assets/js/tabs/wallettab.js:66` updateConvertedAmount | `document.getElementById('amount-input')` |
| S258 | `frontend/public/assets/js/tabs/wallettab.js:67` updateConvertedAmount | `document.getElementById('currency-select')` |
| S259 | `frontend/public/assets/js/tabs/wallettab.js:71` updateConvertedAmount | `document.getElementById('converted-amount-box')` |
| S260 | `frontend/public/assets/js/theme.js:2` module/inline | `document.getElementById('theme-toggle-btn')` |
| S261 | `frontend/public/assets/js/theme.js:9` initTheme | `themeBtn.querySelector('i')` |
| S262 | `frontend/public/assets/js/theme.js:20` toggleTheme | `themeBtn.querySelector('i')` |
| S263 | `frontend/public/assets/js/theme.js:38` module/inline | `document.getElementById('theme-toggle-btn')` |
| S264 | `frontend/public/assets/js/usermanager.js:122` updateUserProfile | `document.getElementById('username-display')` |
| S265 | `frontend/public/assets/js/usermanager.js:124` updateUserProfile | `document.getElementById(id)` |
| S266 | `frontend/public/assets/js/usermanager.js:128` updateUserProfile | `document.getElementById('user-avatar')` |
| S267 | `frontend/public/assets/js/usermanager.js:235` clearUserUI | `document.getElementById('username-display')` |
| S268 | `frontend/public/assets/js/usermanager.js:237` clearUserUI | `document.getElementById(id)` |
| S269 | `frontend/public/assets/js/usermanager.js:240` clearUserUI | `document.getElementById('user-avatar')` |
| S270 | `frontend/public/assets/js/utils/adminOrders.js:5` loadPendingOrders | `document.getElementById('admin-notifications')` |
| S271 | `frontend/public/assets/js/utils/adminOrders.js:15` loadPendingOrders | `container.querySelectorAll('.order-box')` |
| S272 | `frontend/public/assets/js/utils/adminOrders.js:18` loadPendingOrders | `document.getElementById('globalNotification')` |
| S273 | `frontend/public/assets/js/utils/adminOrders.js:60` initAdminOrders | `document.getElementById('admin-notifications')` |
| S274 | `frontend/public/assets/js/utils/adsManager.js:45` constructor | `document.querySelector(wrapperSelector)` |
| S275 | `frontend/public/assets/js/utils/adsManager.js:58` init | `document.querySelector(wrapperSelector)` |
| S276 | `frontend/public/assets/js/utils/appUtils.js:103` updateFieldVisual | `document.getElementById(${fieldId}-icon)` |
| S277 | `frontend/public/assets/js/utils/appUtils.js:104` updateFieldVisual | `document.getElementById(${fieldId}-msg)` |
| S278 | `frontend/public/assets/js/utils/loader.js:62` module/inline | `document.getElementById('global-loader')` |
| S279 | `frontend/public/assets/js/utils/loader.js:74` module/inline | `document.getElementById('global-loader')` |

Generated event attributes also parsed: `js/utils/adsManager.js:81` and `frontend/public/adsManager.html:257` image onerror fallbacks; `js/appmanager.js:459` onclick reload. The old attributes at homepage.html:529,538 are commented out.
