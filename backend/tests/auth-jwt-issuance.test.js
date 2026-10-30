'use strict';
// PostgreSQL credential parser regressions. Real HTTP/PG issuance, version
// invalidation, session-info, second-factor failures and cookie contracts
// are exercised in auth-http.pg.test.js; no legacy auth mocks or skips.
require('./helpers/authCredentialCases');
