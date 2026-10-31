# Root Phase 5 — completed

Scope: independent root dependency tree, Node 22.22.2 / npm 12.2.1.
No `npm audit fix`, forced peer resolution, lifecycle scripts, staging or commits.
The backend manifest/lockfile and all installed MongoDB versions were preserved.

## Exact compatible overrides

- shell-quote 1.x -> 1.12.0
- jws 4.x -> 4.0.1; lodash 4.x -> 4.18.1
- browserslist 4.x -> 4.28.7; baseline-browser-mapping 2.x -> 2.11.0
- glob 10.x -> 10.5.0 (glob 7.2.3 retained for test-exclude)
- js-yaml 3.x -> 3.15.2
- minimatch 9.x -> 9.0.9 / brace-expansion 2.1.7
- minimatch 3.x -> 3.1.5 / brace-expansion 1.1.21
- picomatch 2.x -> 2.3.2 and 4.x -> 4.0.7
- qs 6.x -> 6.16.1

The two Moderate entries were baseline-browser-mapping and qs. Supporting
Browserslist data/update packages and compatible qs dependencies refreshed during
selective resolution. Root direct packages stayed concurrently 7.6.0,
googleapis 159.0.0 and Jest 30.1.3, with unchanged direct lock entries.

Resolved with `npm install --package-lock-only --ignore-scripts --no-audit --no-fund`,
reviewed, then clean-installed with `npm ci --ignore-scripts --no-audit --no-fund`.
Actual parent-resolved versions and quote/parse, JWS verification, qs prototype
handling, YAML parsing and both Minimatch APIs passed smoke checks.

The root lockfile was previously ignored and untracked. A root-only exception
`!/package-lock.json` now exposes the reviewed lockfile for a future commit.
Other ignore rules remain intact; nothing has been staged or committed.

## Audits

| Scope | Critical | High | Moderate | Low | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Root production before | 1 | 2 | 1 | 0 | 4 |
| Root all before | 1 | 8 | 2 | 6 | 17 |
| Root production after | **0** | **0** | **0** | **0** | **0** |
| Root all after | **0** | **0** | **0** | 6 | 6 |
| Backend all, unchanged | **0** | 1 | 14 | 2 | 17 |

Root remaining entries are Low: @babel/core, @jest/core, deepmerge, jest,
jest-cli and jest-config; all development-only. No High exception was needed.
Backend's sole High remains deliberately frozen mongoose 8.17.1; mongodb 6.18.0,
connect-mongo 5.1.0 and bson 6.10.4 remain unchanged. Old PG telemetry stays disabled.
Audit counts are affected package entries, not unique CVEs or proof of exploitation.
Deprecated Glob lines remain compatible but unsupported; zero audit findings is
not a support-life-cycle claim.

These audits cover the independent root/backend lockfile trees. Frontend still
has no lockfile; no repository-wide audit certification is claimed for that tree.

## Tests

- Root remediation checkpoint: **669/669**, **15/15 suites**, 21.997 s.
- Offline foundation regressions: **39/39**, one suite, 0.597 s.
- Final combined run: **708/708**, **16/16 suites**, 22.423 s, no failures/skips.
- All original **617 assertions across 11 original suites** explicitly verified
  from the final JSON report; all pre-foundation 669 passed as well.

The PostgreSQL tests isolate the driver and client; they test configuration,
planning, checksum history, locking/transaction sequencing, rollback, cleanup and
unknown-commit handling, NOT real PostgreSQL execution or Neon connectivity.

## PostgreSQL approval gate at the Phase 5 checkpoint

Historical checkpoint below: the foundation has since been approved and pg
installed. Current status is in [the connectivity pass](postgres-connectivity-pass.md).

Local review drafts only: db/connection.js, db/pg.js, db/migrate.js and
001_create_users_table.sql. Proposed driver is pg **8.23.1**, not installed or
added to the backend manifest/lockfile. No server wiring, Node repositories,
Neon connections, database changes, data imports, hosting work or Step 5/6 changes.
See [PostgreSQL foundation review](postgres-foundation-review.md).
