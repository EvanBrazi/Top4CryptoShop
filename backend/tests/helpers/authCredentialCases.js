'use strict';
// Pure parser regression cases only. All issuance/authority cases formerly in
// auth-jwt-issuance.test.js now exercise real HTTP + PostgreSQL in auth-http.pg.
const { extractCredentials, validateCredentials, readCookies } = require('../../middlewares/auth');
const TOKEN = 'compact.jwt.value', SID = 's'.repeat(43);
test('cookie and header credentials remain distinct from signed Express SID', () => {
  expect(extractCredentials({ headers: { cookie: `sessionId=s%3Asigned; session_token=${TOKEN}; customSessionId=${SID}` } })).toEqual({ token: TOKEN, sessionId: SID });
});
test('matching cookie/header credentials are accepted and frozen', () => {
  const result = extractCredentials({ headers: { authorization: 'Bearer ' + TOKEN, 'x-session-id': SID }, cookies: { session_token: TOKEN, customSessionId: SID } });
  expect(result).toEqual({ token: TOKEN, sessionId: SID }); expect(Object.isFrozen(result)).toBe(true);
});
test.each(['Basic value', 'Bearer', 'Bearer a b', 'Bearer token\n', ['Bearer value'], 7])('rejects malformed authorization %p', authorization => {
  expect(() => extractCredentials({ headers: { authorization, 'x-session-id': SID } })).toThrow('INVALID_AUTHORIZATION');
});
test.each(['', 'short', 'a'.repeat(257), 'a b'.repeat(10), 'é'.repeat(43), 1, null])('rejects malformed application secret %p', sessionId => {
  expect(() => validateCredentials({ token: TOKEN, sessionId })).toThrow();
});
test.each(['', 'x'.repeat(4097), 'a b', 'a\nb', 7, null])('rejects missing/oversized/whitespace token %p', token => {
  expect(() => validateCredentials({ token, sessionId: SID })).toThrow();
});
test.each(['session_token=a; session_token=b', 'customSessionId=a; customSessionId=a', 'session_token=%ZZ'])('rejects ambiguous/malformed raw cookies %s', header => {
  expect(() => readCookies(header)).toThrow('INVALID_COOKIE');
});
test('a conflicting header does not override a cookie', () => {
  expect(() => extractCredentials({ headers: { authorization: 'Bearer different' }, cookies: { session_token: TOKEN, customSessionId: SID } })).toThrow('CREDENTIAL_CONFLICT');
  expect(() => extractCredentials({ headers: { 'x-session-id': 'different'.repeat(5) }, cookies: { session_token: TOKEN, customSessionId: SID } })).toThrow('CREDENTIAL_CONFLICT');
});
test('Express cookie alone is not authentication', () => {
  expect(() => extractCredentials({ headers: { cookie: 'sessionId=s%3Asigned-cookie' } })).toThrow('MISSING_CREDENTIALS');
});
test('raw Cookie takes precedence over a stale parsed cookie object', () => {
  expect(() => extractCredentials({ headers: { cookie: 'sessionId=s%3Asigned-cookie' }, cookies: { session_token: TOKEN, customSessionId: SID } })).toThrow('MISSING_CREDENTIALS');
});
