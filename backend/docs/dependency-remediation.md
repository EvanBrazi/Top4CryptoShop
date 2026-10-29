# Targeted dependency remediation — Phases 1–4

Historical checkpoint report. Root Phase 5 has since been completed; see
[root Phase 5 results](root-phase5-remediation.md) for the current root audit.

Scope: `postgres-migration`, local project completion. No hosting/deployment changes,
PostgreSQL application code, Neon connections, database credentials, or Git commits
were made in this remediation pass. The MongoDB implementation on `main` remains
unchanged as the migration reference.

## Installed targets

| Phase | Direct dependencies |
| --- | --- |
| 1 | express 4.22.3; body-parser 2.4.0; compression 1.8.2; express-rate-limit 8.7.1 |
| 2 | multer 2.5.0; sharp 0.35.5; cloudinary 2.11.0; remove multer-storage-cloudinary |
| 3 | axios 1.21.0; express-validator 7.3.2; validator 13.15.35; ws 8.22.0; ethers 6.17.0; nodemailer 10.2.1 |
| 4 | nodemon 3.1.14 |

Changed direct declarations are exact pins. Parent-scoped overrides preserve compatible
transitive major lines, including Express body-parser 1.20.9/path-to-regexp 0.1.13,
proxy-addr 2.0.8, ip-address 10.7.5, Axios form-data 4.0.6, Cheerio Undici 7.30.1,
Lodash 4.18.1, JWS 3.2.3/4.0.1, Sentry Minimatch 9.0.9/brace-expansion 2.1.7,
and Nodemon Minimatch 10.2.6/brace-expansion 5.0.12/Picomatch 2.3.2.
Ethers 6.17.0 retains its own patched ws 8.21.0, separately from direct ws 8.22.0.
No Express 5, Undici 8, Sentry major migration, or incompatible global glob override.

MongoDB lockfile entries and installed versions remain unchanged:
mongoose **8.17.1**, mongodb **6.18.0**, connect-mongo **5.1.0**, bson **6.10.4**.
No-version-change direct pins and scoped driver/BSON overrides prevent solver drift.
Unrelated direct backend dependencies and both root manifest/lockfile contents were
checked against the remediation baseline and remained unchanged.

Lockfiles were resolved selectively, reviewed, then installed with `npm ci`.
Lifecycle scripts stayed disabled, consistent with the existing backend `.npmrc`.
Sharp 0.35.5 and bundled libvips 8.18.7 loaded and passed real receipt decoding tests
on the current Linux/Node 22.22.2 runtime. Other native platforms are not certified.
No `npm audit fix`, `--force`, or `--legacy-peer-deps` was used.

## Cloudinary adapter replacement

The obsolete adapter was active on the self-only avatar endpoint, not payment receipts.
`middlewares/upload.js` now provides the existing `single('avatar')` interface using
bounded Multer memory parsing followed by Cloudinary v2 `upload_stream`. Parsing
finishes before provider writes, so bad boundaries, extra fields/files, or limits
cannot create an avatar asset. The request cap is 5 MiB, one file, and no profile fields.

The existing avatar formats, 800x800 limit/JPEG transformation, public delivery,
`req.file.path`/`filename` contract, legacy folder, and route-owned cleanup are retained.
Generated UUID asset IDs cannot overwrite or select another user's asset. Provider
response identity/type/format/URL evidence is checked before persistence. SDK failures
are sanitized; stream errors, timeouts, client interruption, and late provider success
have owned, best-effort cleanup. Duplicate success cannot delete an accepted avatar,
and synchronous provider rejection cannot continue sending a file.

Existing route authentication, self-only authorization, CSRF, and guarded persistence
were not relaxed. Private payment receipts continue to use the separate reencoding,
authenticated-delivery, and short-lived-link implementation. Storage cleanup remains
best effort: there is no durable orphan reconciliation/outbox in this pass.

## Nodemailer compatibility

The existing `createTransport({ service: 'gmail', auth })` / `sendMail` controller API
remains compatible with Nodemailer 10.2.1; no application mail-controller rewrite was
required. Tests use the actual library and an owned loopback SMTP server for MIME
serialization, sending, authentication success/rejection, and required-TLS failure.
The controller's existing email path is exercised with database access isolated.
Gmail transport configuration still resolves to smtp.gmail.com, port 465, TLS enabled.
No external Gmail delivery or real Cloudinary upload was attempted. This is not a
2FA/OAuth security redesign or a certification of production provider credentials.

## Actual verification results

`npm test -- --runInBand` works from backend via a forwarding script to the unchanged
root Jest runner. All original 617 assertions across 11 suites were explicitly verified
as passing in the final machine-readable report; none were removed or skipped.

| Checkpoint | Tests passed | Suites passed | Reported time |
| --- | ---: | ---: | ---: |
| Phase 1 | 617/617 | 11/11 | 17.974 s |
| Phase 2: Multer alone | 617/617 | 11/11 | 16.743 s |
| Phase 2: Sharp alone | 617/617 | 11/11 | 16.492 s |
| Phase 2 complete | 653/653 | 12/12 | 17.110 s |
| Phase 3: clients/validators/wallet | 653/653 | 12/12 | 16.979 s |
| Phase 3 complete | 666/666 | 14/14 | 17.767 s |
| Phase 4 final clean install | **669/669** | **15/15** | **22.944 s** |

The final 52 added regressions cover real multipart/shared authentication, avatar
provider failure/cleanup, controlled SMTP and HTTP/proxy/multipart behavior, Undici,
WebSocket library limits, compatible glob APIs, and owned Nodemon start/ignore/restart.
Application financial WebSocket notifications remain disabled. Test timestamp assertions
account for existing Mongoose-created timestamps; financial mutation checks were not
weakened. Syntax and `git diff --check` passed.

## Audit results and scope

Production audits: `npm --prefix backend audit --omit=dev` (also inspected as JSON).

| Backend checkpoint | Critical | High | Moderate | Low | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Before Phase 1 | 1 | 21 | 17 | 2 | 41 |
| After Phase 1 | 0 | 15 | 17 | 2 | 34 |
| After Phase 2 | 0 | 10 | 17 | 2 | 29 |
| After Phase 3 | 0 | 3 | 14 | 2 | 19 |
| After Phase 4 | **0** | **1** | **14** | **2** | **17** |

The sole remaining backend High entry is deliberately frozen **mongoose**. All targeted
retained Critical/High entries are absent. The all-dependency backend audit has the
same final counts. Audit exit 1 is expected, not an audit execution failure.

Remaining Moderate/Low entries: OpenTelemetry core/http/knex/mongoose/mysql/mysql2/pg/
tedious/resources/sdk-trace-base, Sentry, bn.js, morgan, qs, cookie, and csurf. Their
presence is not proof of active exploitation, nor is this a zero-vulnerability baseline.
In particular, do not enable vulnerable PostgreSQL telemetry during migration.

The separately planned **root Phase 5 was not executed**: this continuation authorized
Phases 2–4. The unchanged root production audit reports **1 Critical (shell-quote),
2 High (jws, lodash), 1 Moderate**, total 4. Root all-dependency audit reports 17 findings:
1 Critical, 8 High, 2 Moderate, 6 Low. Backend overrides do not remediate the root tree.
Frontend dependencies have no lockfile and remain outside the audited scopes.
