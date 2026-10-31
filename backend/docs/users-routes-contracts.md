# Users HTTP contracts — PostgreSQL C1

C1 wires PostgreSQL authentication and users only. Financial routes and the
other listed features remain unavailable. Browser callers using old Mongo IDs,
unversioned writes, or an unbounded users array must adopt these contracts;
this backend change does not migrate the frontend.

## Authentication, ownership and DTOs

- IDs are PostgreSQL UUIDs. Current database role, status and token version are
  authoritative. A signed Express cookie alone does not authenticate.
- Unsafe requests require the reviewed signed Express parent, the exact
  JWT/application-session credential pair, and its `x-csrf-token` binding.
  `x-session-id` is an application credential, **never** an Express SID.
- Profile, theme and avatar mutations are self-only, including for admins.
  Detail/balance reads are self-or-admin. Listing and lifecycle changes are admin-only.
- Public user DTOs omit `_id`, `tokenVersion`, password, TOTP and reset secrets.
  `rowVersion`, `balanceCents` and the decimal `balance` are strings.

## Profile, theme and lifecycle CAS

- `PUT /api/users/:id` accepts `expectedRowVersion` plus supported profile fields:
  `username`, `email`, `phone`, `theme`, `password`, `currentPassword`.
- `PUT /api/users/:id/theme` accepts `{ "expectedRowVersion": "…", "theme": 0 }`
  (theme may be `0` or `1`). JSON bodies are strict and limited to 16 KiB.
- `expectedRowVersion` is mandatory: use the canonical decimal string from the
  latest DTO, not a JavaScript Number. Stale CAS returns `409 USER_VERSION_CONFLICT`.
  Reload before deciding whether to retry; never blindly replace the expected version.
- Profile updates are atomic. Password changes require the current local
  password. Identity/password changes revoke the session graph and return
  `requiresReauthentication: true`; callers must sign in again. Email changes
  clear verification; Google email changes are rejected. Theme/avatar alone do
  not revoke credentials.
- `PUT /api/users/:id/activate` and `DELETE /api/users/:id` require admin,
  CSRF and a JSON `expectedRowVersion` for the **target**. DELETE logically
  deactivates, preserving the user, money and financial history. Lifecycle
  changes revoke target sessions; self-deactivation clears the actor's cookies.

## Administrative pagination

`GET /api/users` returns `{ "items": [SafeUser], "nextBefore": null | "opaque cursor" }`,
not an unbounded array. Optional filters are `role` and `accountStatus`; `limit`
is 1–100 (default 50). Pass `nextBefore` unchanged as `before` for the next page.
Cursors are signed, bound to the administrator and filters, and use timestamp/UUID
keyset ordering. Tampered or mismatched cursors are rejected. Runtime composition
must provide a strong `CURSOR_SECRET` (at least 32 bytes).

## Avatars

- Upload: `POST /api/users/:id/avatar`, one multipart file named `avatar`, maximum
  5 MiB, no text fields. Send the expected CAS string in **`x-row-version`**, plus
  `x-csrf-token`. Authentication, self-ownership, CSRF and version preflight run
  before parsing/provider upload. The repository reauthorizes and checks CAS
  again after upload. Only the server generates the owned Cloudinary public ID.
- Removal: `POST /api/users/:id/avatar/remove`, JSON `{ "expectedRowVersion": "…" }`,
  same self-ownership and CSRF requirements. Database CAS clearing the avatar
  commits **before** best-effort provider deletion.
- Cleanup is limited to owned `payments_receipts/<server UUID>` image IDs in the
  configured Cloudinary cloud. Foreign URLs/IDs are never deleted. Provider
  errors are sanitized. A rejected upload is cleaned up only when its database
  outcome is known; an unknown COMMIT must not erase a possibly accepted asset.
- Provider calls are outside database transactions. A cleanup failure after a
  committed removal does not undo that removal. No client URL/public ID is
  accepted as an avatar profile patch.

## Temporary unavailable features

- `/api/orders` and `/api/payments`, including subpaths, return
  **`503 FEATURE_UNAVAILABLE`** from temporary stubs without importing their
  legacy Mongo route modules. C2 is not wired.
- Notifications/WebSocket, backups/scheduler, security routes and icons remain
  explicitly disabled. Their API prefixes return `503 FEATURE_UNAVAILABLE`.
  Unported admin/cards/dev APIs and the legacy compare-token endpoint are also disabled.
- `PUT /api/users/:id/balance` remains admin/CSRF-protected and returns
  **`503 FINANCIAL_UNAVAILABLE`**; there is no direct balance-write fallback.
- Reserve/restore paths return **`410 ENDPOINT_DISABLED`** without financial or
  session-storage work. Legacy `/images/payments` files remain unavailable (410).

## Readiness and startup

Importing `backend/server.js` exports `createApplication` without connecting or
listening. Direct execution loads dotenv and awaits verified-TLS PostgreSQL
connectivity, the exact migrations 001–005 ledger/checksums, and required schema
objects before listening. Startup performs no migrations or grants. `/health`
returns 503 before readiness or during a PostgreSQL outage, and 200 when ready
and its database probe succeeds. Health/stub requests do not persist sessions.
