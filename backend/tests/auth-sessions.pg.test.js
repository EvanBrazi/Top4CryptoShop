'use strict';
const H = require('./helpers/disposablePg');
const { createHash, createHmac } = require('node:crypto');
const jwt = require('../node_modules/jsonwebtoken');
const speakeasy = require('../node_modules/speakeasy');
const { createUserRepository } = require('../repositories/userRepository');
const { createSessionStore } = require('../services/sessionStore');
jest.setTimeout(20000);
let db, repo, sessions;
const cb = (method, ...args) => H.callback(sessions.expressStore, method, ...args);
const pair = issued => ({ token: issued.token, sessionId: issued.sessionId });
const state = (id = H.OWNER) => repo.findAuthStateById(id);
const actor = async (id = H.OWNER) => H.principal(id, (await state(id)).tokenVersion);
async function proof(id = H.OWNER, password = H.PASSWORD) {
  const row = (await db.pool.query('SELECT email FROM public.users WHERE id = $1::UUID', [id])).rows[0];
  const handle = await repo.findForAuth(row.email); await handle.verifyPassword(password); return handle;
}
async function anonymous(data = H.sessionData()) { const sid = H.sid(); await cb('set', sid, data); return { sid, data }; }
async function login(id = H.OWNER) { const parent = await anonymous(); const handle = await proof(id); return { parent, handle, ...(await sessions.issueAuthenticatedSession({ authenticationProof: handle, expressSid: parent.sid })) }; }
async function graph() { return (await db.pool.query('SELECT (SELECT count(*)::TEXT FROM public.express_sessions) AS express, (SELECT count(*)::TEXT FROM public.application_sessions) AS application, (SELECT count(*)::TEXT FROM public.token_revocations) AS revocations')).rows[0]; }
async function historicParent(userId = H.OWNER, offset = '-2 days', rawSid = null) {
  const digest = rawSid ? createHmac('sha256',H.LOOKUP_SECRET).update('express:v1\0').update(rawSid).digest('hex') : createHash('sha256').update(H.sid()).digest('hex');
  return (await db.pool.query(`INSERT INTO public.express_sessions (sid_digest,user_id,session_data,created_at,expires_at)
    VALUES ($1,$2::UUID,'{}',statement_timestamp()-interval '3 days',statement_timestamp()+$3::INTERVAL) RETURNING id`, [digest, userId, offset])).rows[0].id;
}
beforeAll(async () => { db = await H.open(); });
beforeEach(async () => { await db.reset(); await db.seed(); repo = createUserRepository({ poolProvider: () => db.pool, cursorSecret: H.CURSOR_SECRET }); sessions = createSessionStore({ poolProvider: () => db.pool, userRepository: repo, lookupSecret: H.LOOKUP_SECRET, jwtSecret: H.JWT_SECRET }); });
afterEach(() => jest.restoreAllMocks());
afterAll(async () => { await db?.close(); });

test('all five migrations, auth tables, owner FKs, and cleanup indexes are present', async () => {
  expect((await db.pool.query('SELECT count(*)::INTEGER AS n FROM public.schema_migrations')).rows[0].n).toBe(5);
  const names = (await db.pool.query("SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename IN ('express_sessions','application_sessions','token_revocations')")).rows.map(x => x.indexname);
  expect(names).toEqual(expect.arrayContaining(['express_session_expiry','express_session_owner','application_session_expiry','application_session_active_owner','application_session_express_parent','token_revocation_expiry','token_revocation_owner']));
  const fk = (await db.pool.query("SELECT conname FROM pg_constraint WHERE contype='f' AND conrelid='public.application_sessions'::regclass")).rows.map(x => x.conname);
  expect(fk).toContain('application_session_express_owner');
});
test.each(['UPPERCASE','f'.repeat(63),'g'.repeat(64),'f'.repeat(64)+'\n'])('Express digest constraint rejects %s', async digest => {
  await expect(db.pool.query("INSERT INTO public.express_sessions(sid_digest,session_data,expires_at) VALUES($1,'{}',now()+interval '1 hour')",[digest])).rejects.toMatchObject({code:'23514'});
});
test.each(['[]','null','"x"'])('Express data must be an object: %s', async json => {
  await expect(db.pool.query("INSERT INTO public.express_sessions(sid_digest,session_data,expires_at) VALUES($1,$2::JSONB,now()+interval '1 hour')",['a'.repeat(64),json])).rejects.toMatchObject({code:'23514'});
});
test('composite FK rejects binding an application session to another owner', async () => {
  const id = await historicParent(H.OWNER, '1 hour');
  await expect(db.pool.query("INSERT INTO public.application_sessions(session_digest,user_id,express_session_id,token_digest,token_version,expires_at) VALUES($1,$2::UUID,$3::UUID,$4,1,now()+interval '1 hour')",['b'.repeat(64),H.OTHER,id,'c'.repeat(64)])).rejects.toMatchObject({code:'23503'});
});
test.each(['express_sessions','application_sessions','token_revocations'])('PUBLIC has no privileges on %s', async table => {
  const grants = (await db.pool.query("SELECT privilege_type FROM information_schema.table_privileges WHERE table_schema='public' AND table_name=$1 AND grantee='PUBLIC'",[table])).rows;
  expect(grants).toHaveLength(0);
});
test('Express round trip stores a domain-separated digest, not the SID', async () => {
  const p = await anonymous(); const loaded = await cb('get',p.sid); expect(loaded.value).toBe(1);
  expect(loaded.__top4StoreRevision.version).toBe('0');
  const row = (await db.pool.query('SELECT * FROM public.express_sessions')).rows[0];
  expect(row.sid_digest).toMatch(/^[a-f0-9]{64}$/); expect(JSON.stringify(row)).not.toContain(p.sid);
  expect(row.session_data).not.toHaveProperty('__top4StoreRevision'); expect(typeof row.row_version).toBe('string');
});
test('missing sessions return null; duplicate initial set cannot overwrite', async () => {
  expect(await cb('get',H.sid())).toBeNull(); const p = await anonymous();
  await expect(cb('set',p.sid,H.sessionData())).rejects.toMatchObject({code:'SESSION_VERSION_CONFLICT'});
  expect((await cb('get',p.sid)).value).toBe(1);
});
test('CAS permits one concurrent set and rejects its stale competitor', async () => {
  const p = await anonymous(), a = await cb('get',p.sid), b = await cb('get',p.sid); a.value=2; b.value=3;
  const results = await Promise.allSettled([cb('set',p.sid,a),cb('set',p.sid,b)]);
  expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);
  expect(results.find(x=>x.status==='rejected').reason.code).toBe('SESSION_VERSION_CONFLICT');
  expect((await cb('get',p.sid)).__top4StoreRevision.version).toBe('1');
});
test('revision seals cannot be forged or moved to another SID', async () => {
  const a=await anonymous(), b=await anonymous(), data=await cb('get',a.sid);
  await expect(cb('set',b.sid,data)).rejects.toMatchObject({code:'SESSION_VERSION_CONFLICT'});
  data.__top4StoreRevision.version='99'; await expect(cb('set',a.sid,data)).rejects.toMatchObject({code:'SESSION_VERSION_CONFLICT'});
});
test('touch changes expiry/version but never session data and never overwrites newer data', async () => {
  const p=await anonymous(), data=await cb('get',p.sid), stale=await cb('get',p.sid); data.value=99;
  await cb('touch',p.sid,data); const loaded=await cb('get',p.sid); expect(loaded.value).toBe(1);
  await expect(cb('touch',p.sid,stale)).rejects.toMatchObject({code:'SESSION_VERSION_CONFLICT'});
});
test('destroy leaves a cleared tombstone and rejects both late set and touch', async () => {
  const p=await anonymous(), data=await cb('get',p.sid); await cb('destroy',p.sid); await cb('destroy',p.sid);
  expect(await cb('get',p.sid)).toBeNull();
  await expect(cb('set',p.sid,data)).rejects.toMatchObject({code:'SESSION_VERSION_CONFLICT'});
  await expect(cb('touch',p.sid,data)).rejects.toMatchObject({code:'SESSION_VERSION_CONFLICT'});
  const row=(await db.pool.query('SELECT session_data,revoked_at FROM public.express_sessions')).rows[0]; expect(row.session_data).toEqual({}); expect(row.revoked_at).toBeInstanceOf(Date);
});
test('expired Express sessions cannot be read, extended, or resurrected', async () => {
  const sid=H.sid(), id=await historicParent(null,'-2 days',sid); expect(await cb('get',sid)).toBeNull();
  await expect(db.pool.query("UPDATE public.express_sessions SET expires_at=now()+interval '1 hour' WHERE id=$1::UUID",[id])).rejects.toMatchObject({code:'23514'});
  await db.pool.query("UPDATE public.express_sessions SET revoked_at=statement_timestamp(),session_data='{}' WHERE id=$1::UUID",[id]);
});
test.each(['id','sid_digest','created_at','user_id'])('Express identity is immutable after binding: %s', async field => {
  const id=await historicParent(H.OWNER,'1 hour');
  const values={id:"gen_random_uuid()",sid_digest:"repeat('d',64)",created_at:"created_at-interval '1 second'",user_id:`'${H.OTHER}'::UUID`};
  await expect(db.pool.query(`UPDATE public.express_sessions SET ${field}=${values[field]} WHERE id=$1::UUID`,[id])).rejects.toMatchObject({code:'23514'});
});
test.each([null,'bad','2099-01-01',new Date(0).toISOString()])('invalid or unbounded cookie expiry fails closed: %s', async expires => {
  const data=H.sessionData(); data.cookie.expires=expires; await expect(cb('set',H.sid(),data)).rejects.toMatchObject({code:'INVALID_SESSION_EXPIRY'}); expect((await graph()).express).toBe('0');
});
test.each(['password_hash','twoFASecret','resetPasswordToken','token','session_token','__proto__'])('unsafe JSON field is rejected: %s', async field => {
  const data=H.sessionData(); Object.defineProperty(data,field,{value:'private',enumerable:true}); await expect(cb('set',H.sid(),data)).rejects.toMatchObject({code:'INVALID_SESSION_DATA'});
});

test('issuance authenticates fresh UUID/string-version state and binds exact JWT, Express SID, and CSRF', async () => {
  const issued=await login(); const auth=await sessions.authenticate(pair(issued)); expect(auth.principal).toEqual(H.principal()); expect(auth.role).toBe('user');
  const decoded=jwt.verify(issued.token,H.JWT_SECRET,{algorithms:['HS256'],issuer:'your-app-api'}); expect(decoded.tokenVersion).toBe('1'); expect(decoded.userId).toBe(H.OWNER);
  const loaded=await cb('get',issued.parent.sid); expect(loaded.csrfToken).toBe(issued.csrfToken); expect(loaded.userId).toBe(H.OWNER);
  const app=(await db.pool.query('SELECT * FROM public.application_sessions')).rows[0]; const parent=(await db.pool.query('SELECT * FROM public.express_sessions')).rows[0];
  expect(app.express_session_id).toBe(parent.id); expect(app.token_digest).toBe(createHash('sha256').update(issued.token).digest('hex'));
  expect(app.session_digest).not.toBe(createHash('sha256').update(issued.sessionId).digest('hex'));
  const persisted=JSON.stringify([app,parent]); expect(persisted).not.toContain(issued.token); expect(persisted).not.toContain(issued.sessionId); expect(persisted).not.toContain(issued.parent.sid);
  expect((await state()).lastLogin).not.toBeNull(); expect(JSON.stringify(auth)).not.toMatch(/password|secret|csrf|digest/i);
});
test('admin issuance uses admin-panel but fresh database role overrides JWT role', async () => {
  const issued=await login(H.ADMIN); expect(jwt.decode(issued.token).iss).toBe('admin-panel');
  await db.pool.query("UPDATE public.users SET role='user' WHERE id=$1::UUID",[H.ADMIN]); expect((await sessions.authenticate(pair(issued))).role).toBe('user');
});
test('same-second tokens are unique; swapping either token/session half is rejected', async () => {
  const a=await login(), b=await login(); expect(a.token).not.toBe(b.token);
  await expect(sessions.authenticate({token:a.token,sessionId:b.sessionId})).rejects.toMatchObject({code:'AUTH_SESSION_INVALID'});
  await expect(sessions.authenticate({token:b.token,sessionId:a.sessionId})).rejects.toMatchObject({code:'AUTH_SESSION_INVALID'});
});
test('one proof cannot issue twice, concurrently, or through a forged body identity', async () => {
  const p=await anonymous(), handle=await proof(); const input={authenticationProof:handle,expressSid:p.sid};
  const results=await Promise.allSettled([sessions.issueAuthenticatedSession(input),sessions.issueAuthenticatedSession(input)]); expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);
  await expect(sessions.issueAuthenticatedSession(input)).rejects.toMatchObject({code:'AUTH_PROOF_REQUIRED'});
  await expect(sessions.issueAuthenticatedSession({authenticationProof:{userId:H.OWNER,passwordVerified:true},expressSid:p.sid})).rejects.toMatchObject({code:'AUTH_PROOF_REQUIRED'});
  expect((await graph()).application).toBe('1');
});
test('session fixation is rejected: issuance requires fresh unbound Express SID', async () => {
  const issued=await login(), handle=await proof(); await expect(sessions.issueAuthenticatedSession({authenticationProof:handle,expressSid:issued.parent.sid})).rejects.toMatchObject({code:'SESSION_NOT_ACTIVE'});
});
test('failed comparison and stale row-version proofs cannot issue', async () => {
  const p=await anonymous(), handle=await proof(H.OWNER,'wrong'); await expect(sessions.issueAuthenticatedSession({authenticationProof:handle,expressSid:p.sid})).rejects.toMatchObject({code:'AUTH_PROOF_REQUIRED'});
  const good=await proof(); await db.pool.query("UPDATE public.users SET theme='dark' WHERE id=$1::UUID",[H.OWNER]);
  await expect(sessions.issueAuthenticatedSession({authenticationProof:good,expressSid:p.sid})).rejects.toMatchObject({code:'USER_VERSION_CONFLICT'});
});
test.each(['userId','tokenVersion','admin'])('body-supplied %s cannot influence issuance', async field => {
  const p=await anonymous(); await expect(sessions.issueAuthenticatedSession({authenticationProof:await proof(),expressSid:p.sid,[field]:H.ADMIN})).rejects.toMatchObject({code:'INVALID_AUTH_INPUT'});
});
test('bound session data cannot replace the authenticated owner or its CSRF secret', async () => {
  const issued=await login(), data=await cb('get',issued.parent.sid); data.userId=H.OTHER;
  await expect(cb('set',issued.parent.sid,data)).rejects.toMatchObject({code:'SESSION_VERSION_CONFLICT'});
  data.userId=H.OWNER; data.csrfToken='attacker'; await expect(cb('set',issued.parent.sid,data)).rejects.toMatchObject({code:'SESSION_VERSION_CONFLICT'});
});
test('touch may not shorten the Express parent below an active JWT expiry', async () => {
  const issued=await login(), data=await cb('get',issued.parent.sid); data.cookie.expires=new Date(Date.now()+10000).toISOString();
  await expect(cb('touch',issued.parent.sid,data)).rejects.toMatchObject({code:'SESSION_VERSION_CONFLICT'});
});
test.each(['account_status','token_version'])('authentication reads fresh %s from PostgreSQL', async field => {
  const issued=await login(); await db.pool.query(`UPDATE public.users SET ${field}=${field==='account_status'?"'suspended'":'token_version+1'} WHERE id=$1::UUID`,[H.OWNER]);
  await expect(sessions.authenticate(pair(issued))).rejects.toMatchObject({code:'AUTH_SESSION_INVALID'});
});
test('database application expiry is authoritative even when the application clock lags', async () => {
  const now=Date.now(), parent=await anonymous({...H.sessionData(),cookie:{expires:new Date((Math.floor(now/1000)+3)*1000+900).toISOString()}});
  const issued=await sessions.issueAuthenticatedSession({authenticationProof:await proof(),expressSid:parent.sid});
  jest.spyOn(Date,'now').mockReturnValue(now);
  const wait=Math.max(0,(new Date(issued.expiresAt).getTime()+100-now)/1000); await db.pool.query('SELECT pg_sleep($1)',[wait]);
  expect((await db.pool.query('SELECT expires_at>statement_timestamp() AS active FROM public.express_sessions')).rows[0].active).toBe(true);
  await expect(sessions.authenticate(pair(issued))).rejects.toMatchObject({code:'AUTH_SESSION_INVALID'});
});
test('expired JWT is rejected before database access', async () => {
  const issued=await login(); jest.spyOn(Date,'now').mockReturnValue(new Date(issued.expiresAt).getTime()+1000);
  await expect(sessions.authenticate(pair(issued))).rejects.toMatchObject({code:'INVALID_AUTH_TOKEN'});
});
test.each([{algorithm:'HS384'}, {issuer:'foreign-api'}, {tokenVersion:1}, {userId:'a'.repeat(24)}])('JWT verification fails closed for %j', async change => {
  const issued=await login(), claims=jwt.decode(issued.token); delete claims.iss;
  const {algorithm='HS256',issuer='your-app-api',...patch}=change;
  const token=jwt.sign({...claims,...patch},H.JWT_SECRET,{algorithm,issuer}); await expect(sessions.authenticate({token,sessionId:issued.sessionId})).rejects.toMatchObject({code:'INVALID_AUTH_TOKEN'});
});
test('logout atomically revokes both sessions, clears CSRF, and inserts immutable token evidence', async () => {
  const issued=await login(); expect(await sessions.revokeAuthenticatedSession(pair(issued))).toEqual({revoked:true}); expect(await sessions.revokeAuthenticatedSession(pair(issued))).toEqual({revoked:true});
  expect(await cb('get',issued.parent.sid)).toBeNull(); await expect(sessions.authenticate(pair(issued))).rejects.toMatchObject({code:'AUTH_SESSION_INVALID'});
  expect(await graph()).toEqual({express:'1',application:'1',revocations:'1'});
  const row=(await db.pool.query('SELECT revocation_reason FROM public.application_sessions')).rows[0]; expect(row.revocation_reason).toBe('logout');
});
test('Express destroy cascades logical revocation to its application session', async () => {
  const issued=await login(); await cb('destroy',issued.parent.sid); await expect(sessions.authenticate(pair(issued))).rejects.toMatchObject({code:'AUTH_SESSION_INVALID'});
  expect((await db.pool.query('SELECT revocation_reason FROM public.application_sessions')).rows[0].revocation_reason).toBe('express_session_destroyed');
});
test('logout racing a stale Express save cannot resurrect authentication', async () => {
  const issued=await login(), data=await cb('get',issued.parent.sid); data.value=2;
  await Promise.allSettled([sessions.revokeAuthenticatedSession(pair(issued)),cb('set',issued.parent.sid,data)]);
  expect(await cb('get',issued.parent.sid)).toBeNull(); await expect(sessions.authenticate(pair(issued))).rejects.toMatchObject({code:'AUTH_SESSION_INVALID'});
});
test('direct token digest revocation invalidates an otherwise active session', async () => {
  const issued=await login(); await db.pool.query("INSERT INTO public.token_revocations(token_digest,user_id,expires_at,reason) VALUES($1,$2::UUID,$3,'administrative_revocation')",[createHash('sha256').update(issued.token).digest('hex'),H.OWNER,issued.expiresAt]);
  await expect(sessions.authenticate(pair(issued))).rejects.toMatchObject({code:'AUTH_SESSION_INVALID'});
});
test.each(['UPDATE public.application_sessions SET token_version=2','UPDATE public.application_sessions SET expires_at=expires_at+interval \'1 hour\'','UPDATE public.application_sessions SET session_digest=repeat(\'d\',64)'])('application records reject rewrites: %s', async sql => {
  await login(); await expect(db.pool.query(sql)).rejects.toMatchObject({code:'23514'});
});
test('revoked application records cannot be restored or re-revoked', async () => {
  const issued=await login(); await sessions.revokeAuthenticatedSession(pair(issued));
  await expect(db.pool.query('UPDATE public.application_sessions SET revoked_at=NULL,revocation_reason=NULL')).rejects.toMatchObject({code:'23514'});
  await expect(db.pool.query("UPDATE public.application_sessions SET revocation_reason='password_change'")).rejects.toMatchObject({code:'23514'});
});
test.each(['UPDATE public.token_revocations SET reason=\'identity_change\'','DELETE FROM public.token_revocations','TRUNCATE public.token_revocations'])('unexpired token revocations are immutable: %s', async sql => {
  const issued=await login(); await sessions.revokeAuthenticatedSession(pair(issued)); await expect(db.pool.query(sql)).rejects.toMatchObject({code:'23514'});
});
test('cleanup is explicit, bounded, expiry-only, and retains recent Express tombstones', async () => {
  const live=await login(); await sessions.revokeAuthenticatedSession(pair(live));
  for(let i=0;i<3;i++) {
    const id=await historicParent(); await db.pool.query("INSERT INTO public.application_sessions(session_digest,user_id,express_session_id,token_digest,token_version,issued_at,expires_at) VALUES($1,$2::UUID,$3::UUID,$4,1,now()-interval '3 days',now()-interval '2 days')",[createHash('sha256').update(H.sid()).digest('hex'),H.OWNER,id,createHash('sha256').update(H.sid()).digest('hex')]);
    await db.pool.query("INSERT INTO public.token_revocations(token_digest,user_id,revoked_at,expires_at,reason) VALUES($1,$2::UUID,now()-interval '3 days',now()-interval '2 days','logout')",[createHash('sha256').update(H.sid()).digest('hex'),H.OWNER]);
  }
  expect(await sessions.cleanupExpired({limit:2})).toEqual({application_sessions:2,token_revocations:2,express_sessions:2});
  expect(await graph()).toEqual({express:'2',application:'2',revocations:'2'});
  await sessions.cleanupExpired({limit:2}); expect(await graph()).toEqual({express:'1',application:'1',revocations:'1'});
  await expect(sessions.cleanupExpired({limit:1001})).rejects.toMatchObject({code:'INVALID_CLEANUP_LIMIT'});
});

test.each([['updateUsername',{username:'Changed_User'}],['updateEmail',{email:'changed@example.test'}],['updatePhone',{phone:'+12025550123'}],['updatePhone',{phone:null}]])('%s atomically invalidates all sessions without financial changes', async (method,fields) => {
  const issued=await login(), before=await state(); const result=await repo[method]({principal:await actor(),expectedRowVersion:before.rowVersion,...fields});
  expect(result.requiresReauthentication).toBe(true); expect(result.user.balanceCents).toBe('10000'); expect(JSON.stringify(result)).not.toMatch(/password_hash|two_fa_secret|reset_password/i);
  expect((await state()).tokenVersion).toBe('2'); await expect(sessions.authenticate(pair(issued))).rejects.toMatchObject({code:'AUTH_SESSION_INVALID'}); expect(await cb('get',issued.parent.sid)).toBeNull();
  expect((await db.pool.query('SELECT count(*)::TEXT AS n FROM public.financial_operations')).rows[0].n).toBe('0');
});
test('password change verifies current password, increments version exactly once, and invalidates sessions', async () => {
  const issued=await login(), before=await state();
  await expect(repo.updatePassword({principal:await actor(),expectedRowVersion:before.rowVersion,currentPassword:'wrong',newPassword:'Changed1!pass'})).rejects.toMatchObject({code:'CURRENT_PASSWORD_INVALID'});
  expect(await sessions.authenticate(pair(issued))).toHaveProperty('role','user');
  await repo.updatePassword({principal:await actor(),expectedRowVersion:before.rowVersion,currentPassword:H.PASSWORD,newPassword:'Changed1!pass'});
  expect((await state()).tokenVersion).toBe('2'); expect(await (await proof(H.OWNER,'Changed1!pass')).verifyPassword('Changed1!pass')).toBe(true);
  expect(await (await repo.findForAuth('u@example.test')).verifyPassword(H.PASSWORD)).toBe(false); await expect(sessions.authenticate(pair(issued))).rejects.toMatchObject({code:'AUTH_SESSION_INVALID'});
});
test('concurrent identity mutations are CAS-protected and do not double-increment token version', async () => {
  const issued=await login(), before=await state(), p=await actor();
  const results=await Promise.allSettled([repo.updateUsername({principal:p,expectedRowVersion:before.rowVersion,username:'First_User'}),repo.updatePhone({principal:p,expectedRowVersion:before.rowVersion,phone:'+12025550123'})]);
  expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1); expect((await state()).tokenVersion).toBe('2'); await expect(sessions.authenticate(pair(issued))).rejects.toMatchObject({code:'AUTH_SESSION_INVALID'});
});
test('forced session-invalidation failure rolls back the account mutation and keeps old auth state intact', async () => {
  const issued=await login(), before=await state();
  await db.pool.query("CREATE FUNCTION public.test_revoke_failure() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='fixture failure'; END $$; CREATE TRIGGER test_revoke_failure BEFORE UPDATE ON public.express_sessions FOR EACH ROW EXECUTE FUNCTION public.test_revoke_failure()");
  try {
    await expect(repo.updatePhone({principal:await actor(),expectedRowVersion:before.rowVersion,phone:'+12025550123'})).rejects.toMatchObject({code:'AUTH_UNAVAILABLE'});
    expect(await state()).toEqual(before); expect((await sessions.authenticate(pair(issued))).principal).toEqual(H.principal());
  } finally { await db.pool.query('DROP TRIGGER test_revoke_failure ON public.express_sessions; DROP FUNCTION public.test_revoke_failure()'); }
});
test('status changes require fresh admin authority; deactivation is non-deleting and revokes sessions', async () => {
  const issued=await login(), before=await state();
  await expect(repo.deactivateAccount({principal:await actor(),userId:H.OTHER,expectedRowVersion:'0'})).rejects.toMatchObject({code:'AUTH_FORBIDDEN'});
  await repo.deactivateAccount({principal:await actor(H.ADMIN),userId:H.OWNER,expectedRowVersion:before.rowVersion});
  expect((await state()).accountStatus).toBe('deactivated'); await expect(sessions.authenticate(pair(issued))).rejects.toMatchObject({code:'AUTH_SESSION_INVALID'});
  const current=await state(); await repo.activateAccount({principal:await actor(H.ADMIN),userId:H.OWNER,expectedRowVersion:current.rowVersion});
  expect((await state()).accountStatus).toBe('active'); expect((await state()).tokenVersion).toBe('3'); expect((await repo.findById(H.OWNER)).balanceCents).toBe('10000');
});
test('five genuine failed password comparisons suspend the account and revoke authentication', async () => {
  const issued=await login();
  for(let i=0;i<5;i++) { const current=await state(), handle=await proof(H.OWNER,'wrong'); await repo.incrementLoginAttempts({authHandle:handle,expectedRowVersion:current.rowVersion}); }
  const current=await state(); expect(current.loginAttempts).toBe(5); expect(current.accountStatus).toBe('suspended'); expect(current.tokenVersion).toBe('2');
  await expect(sessions.authenticate(pair(issued))).rejects.toMatchObject({code:'AUTH_SESSION_INVALID'});
});
test('attempt bookkeeping requires genuine comparison handles and consumes them', async () => {
  await expect(repo.incrementLoginAttempts({authHandle:{userId:H.OWNER},expectedRowVersion:'0'})).rejects.toMatchObject({code:'AUTH_PROOF_REQUIRED'});
  let current=await state(), handle=await proof(H.OWNER,'wrong'); await repo.incrementLoginAttempts({authHandle:handle,expectedRowVersion:current.rowVersion});
  current=await state(); await expect(repo.incrementLoginAttempts({authHandle:handle,expectedRowVersion:current.rowVersion})).rejects.toMatchObject({code:'AUTH_PROOF_REQUIRED'});
  handle=await proof(); await repo.resetLoginAttempts({authHandle:handle,expectedRowVersion:current.rowVersion}); expect((await state()).loginAttempts).toBe(0);
  handle=await proof(); current=await state(); await repo.updateLastLogin({authenticationProof:handle,expectedRowVersion:current.rowVersion}); expect((await state()).lastLogin).not.toBeNull();
});
test('fresh admin user listing is secret-safe and has authenticated stable pagination', async () => {
  const p=await actor(H.ADMIN), first=await repo.listUsers({principal:p,limit:1}); expect(first.items).toHaveLength(1); expect(first.nextBefore).not.toBeNull();
  const second=await repo.listUsers({principal:p,limit:1,before:first.nextBefore}); expect(second.items[0].id).not.toBe(first.items[0].id);
  expect(JSON.stringify(first)).not.toMatch(/password_hash|two_fa_secret|token_version|trusted_devices/);
  await expect(repo.listUsers({principal:await actor()})).rejects.toMatchObject({code:'AUTH_FORBIDDEN'});
  await expect(repo.listUsers({principal:p,before:''})).rejects.toMatchObject({code:'INVALID_PAGINATION'});
  await expect(repo.listUsers({principal:p,before:first.nextBefore,role:'user'})).rejects.toMatchObject({code:'INVALID_PAGINATION'});
});
async function beginEnrollment() {
  const issued=await login(), handle=await proof(), current=await state();
  const enrollment=await repo.update2FA({authenticationContext:handle,action:'begin_enrollment',expectedRowVersion:current.rowVersion});
  const secret=new URL(enrollment.otpauthUrl).searchParams.get('secret'); return {issued,enrollment,secret};
}
async function confirmEnrollment(enrollment,secret) {
  const factor=await repo.findFor2FA({authenticationContext:enrollment.enrollmentContext}); expect(await factor.verifyTotp(speakeasy.totp({secret,encoding:'base32'}))).toBe(true);
  return repo.update2FA({authenticationContext:factor,action:'confirm_enrollment',expectedRowVersion:(await state()).rowVersion});
}
test('2FA enrollment is server-generated, pending, secret-safe, and invalidates old sessions', async () => {
  const {issued,enrollment,secret}=await beginEnrollment(); expect(secret).toMatch(/^[A-Z2-7]+$/); expect(enrollment.user.twoFAStatus).toBe('pending'); expect(JSON.stringify(enrollment.user)).not.toContain(secret);
  await expect(sessions.authenticate(pair(issued))).rejects.toMatchObject({code:'AUTH_SESSION_INVALID'});
  const p=await anonymous(); await expect(sessions.issueAuthenticatedSession({authenticationProof:enrollment.enrollmentContext,expressSid:p.sid})).rejects.toMatchObject({code:'AUTH_PROOF_REQUIRED'});
  await expect(sessions.issueAuthenticatedSession({authenticationProof:await proof(),expressSid:p.sid})).rejects.toMatchObject({code:'SECOND_FACTOR_REQUIRED'});
});
test('enabled 2FA requires private TOTP verification in addition to password before session issuance', async () => {
  const {enrollment,secret}=await beginEnrollment(); await confirmEnrollment(enrollment,secret);
  const p=await anonymous(); await expect(sessions.issueAuthenticatedSession({authenticationProof:await proof(),expressSid:p.sid})).rejects.toMatchObject({code:'SECOND_FACTOR_REQUIRED'});
  const handle=await proof(), factor=await repo.findFor2FA({authenticationContext:handle}); expect(JSON.stringify(factor)).not.toContain(secret);
  expect(await factor.verifyTotp(speakeasy.totp({secret,encoding:'base32'}))).toBe(true);
  const issued=await sessions.issueAuthenticatedSession({authenticationProof:handle,expressSid:p.sid}); expect((await sessions.authenticate(pair(issued))).principal.tokenVersion).toBe('3');
  await expect(factor.verifyTotp('000000')).rejects.toMatchObject({code:'AUTH_PROOF_REQUIRED'});
});
test('2FA cannot accept body identity/boolean proof or use a factor handle as a login credential', async () => {
  await expect(repo.findFor2FA({authenticationContext:{userId:H.OWNER,passwordVerified:true}})).rejects.toMatchObject({code:'AUTH_PROOF_REQUIRED'});
  const {enrollment,secret}=await beginEnrollment(); await confirmEnrollment(enrollment,secret); const handle=await proof(), factor=await repo.findFor2FA({authenticationContext:handle});
  await factor.verifyTotp(speakeasy.totp({secret,encoding:'base32'})); const p=await anonymous();
  await expect(sessions.issueAuthenticatedSession({authenticationProof:factor,expressSid:p.sid})).rejects.toMatchObject({code:'AUTH_PROOF_REQUIRED'});
  await expect(repo.update2FA({authenticationContext:handle,action:'disable',expectedRowVersion:(await state()).rowVersion,userId:H.OTHER})).rejects.toMatchObject({code:'INVALID_AUTH_INPUT'});
});
test('2FA disable requires a verified factor, clears secrets, and invalidates old token version', async () => {
  const {enrollment,secret}=await beginEnrollment(); await confirmEnrollment(enrollment,secret);
  let handle=await proof(); await expect(repo.update2FA({authenticationContext:handle,action:'disable',expectedRowVersion:(await state()).rowVersion})).rejects.toMatchObject({code:'AUTH_PROOF_REQUIRED'});
  let factor=await repo.findFor2FA({authenticationContext:handle}); await factor.verifyTotp(speakeasy.totp({secret,encoding:'base32'})); const p=await anonymous(); const issued=await sessions.issueAuthenticatedSession({authenticationProof:handle,expressSid:p.sid});
  handle=await proof(); factor=await repo.findFor2FA({authenticationContext:handle}); await factor.verifyTotp(speakeasy.totp({secret,encoding:'base32'}));
  await repo.update2FA({authenticationContext:factor,action:'disable',expectedRowVersion:(await state()).rowVersion}); expect((await state()).twoFAStatus).toBe('disabled');
  expect((await db.pool.query('SELECT two_fa_secret FROM public.users WHERE id=$1::UUID',[H.OWNER])).rows[0].two_fa_secret).toBeNull();
  await expect(sessions.authenticate(pair(issued))).rejects.toMatchObject({code:'AUTH_SESSION_INVALID'});
});
test('2FA failure/reset bookkeeping requires actual factor results and obeys row-version CAS', async () => {
  const {enrollment,secret}=await beginEnrollment(); await confirmEnrollment(enrollment,secret);
  let handle=await proof(), factor=await repo.findFor2FA({authenticationContext:handle}); await factor.verifyTotp('not-six-digits');
  await repo.update2FA({authenticationContext:factor,action:'record_failure',expectedRowVersion:(await state()).rowVersion});
  handle=await proof(); factor=await repo.findFor2FA({authenticationContext:handle}); expect(factor.getState().attempts).toBe(1); await factor.verifyTotp(speakeasy.totp({secret,encoding:'base32'}));
  await repo.update2FA({authenticationContext:factor,action:'reset_attempts',expectedRowVersion:(await state()).rowVersion}); expect((await db.pool.query('SELECT two_fa_attempts FROM public.users WHERE id=$1::UUID',[H.OWNER])).rows[0].two_fa_attempts).toBe(0);
});
test('administrative session revocation has fresh authorization, CAS, and version invalidation', async () => {
  const issued=await login(); await expect(sessions.revokeUserSessions({principal:await actor(H.OTHER),userId:H.OWNER,expectedRowVersion:(await state()).rowVersion})).rejects.toMatchObject({code:'AUTH_FORBIDDEN'});
  await sessions.revokeUserSessions({principal:await actor(H.ADMIN),userId:H.OWNER,expectedRowVersion:(await state()).rowVersion}); expect((await state()).tokenVersion).toBe('2'); await expect(sessions.authenticate(pair(issued))).rejects.toMatchObject({code:'AUTH_SESSION_INVALID'});
});
test('Google creation/authentication accepts only private verified identity and never email-links a local account', async () => {
  const identities=new WeakMap(), authority={resolve:h=>identities.get(h)}, handle=Object.freeze({});
  repo=createUserRepository({poolProvider:()=>db.pool,googleIdentityAuthority:authority,cursorSecret:H.CURSOR_SECRET}); sessions=createSessionStore({poolProvider:()=>db.pool,userRepository:repo,lookupSecret:H.LOOKUP_SECRET,jwtSecret:H.JWT_SECRET});
  await expect(repo.createGoogleUser({verifiedIdentity:{googleId:'subject',emailVerified:true},username:'Google_User'})).rejects.toMatchObject({code:'AUTH_PROOF_REQUIRED'});
  identities.set(handle,Object.freeze({googleId:'subject',email:'u@example.test',emailVerified:true}));
  await expect(repo.createGoogleUser({verifiedIdentity:handle,username:'Google_User'})).rejects.toMatchObject({code:'GOOGLE_ACCOUNT_LINK_REQUIRED'});
  identities.set(handle,Object.freeze({googleId:'subject',email:'google@example.test',emailVerified:true})); const user=await repo.createGoogleUser({verifiedIdentity:handle,username:'Google_User'}); expect(user.balanceCents).toBe('0'); expect(user.role).toBe('user'); expect(user.provider).toBe('google');
  expect((await repo.findByGoogleId('subject')).id).toBe(user.id); const parent=await anonymous(); const authProof=await repo.findForGoogleAuth({verifiedIdentity:handle});
  const issued=await sessions.issueAuthenticatedSession({authenticationProof:authProof,expressSid:parent.sid}); expect((await sessions.authenticate(pair(issued))).principal.userId).toBe(user.id);
  await expect(repo.updateEmail({principal:H.principal(user.id),expectedRowVersion:(await state(user.id)).rowVersion,email:'other-google@example.test'})).rejects.toMatchObject({code:'GOOGLE_ACCOUNT_LINK_REQUIRED'});
});
test('database outages fail closed for Express/custom authentication without raw error leakage or cache fallback', async () => {
  const issued=await login(), error=new Error('private SQL and database URL'), failing=createSessionStore({poolProvider:()=>({query:async()=>{throw error}}),userRepository:repo,lookupSecret:H.LOOKUP_SECRET,jwtSecret:H.JWT_SECRET});
  await expect(failing.authenticate(pair(issued))).rejects.toMatchObject({code:'AUTH_UNAVAILABLE',message:'AUTH_UNAVAILABLE'});
  await expect(H.callback(failing.expressStore,'get',issued.parent.sid)).rejects.toMatchObject({code:'SESSION_UNAVAILABLE',message:'SESSION_UNAVAILABLE'});
});
test('lost real COMMIT acknowledgement never repeats issuance or returns unconfirmed credentials', async () => {
  let commits=0,begins=0; const releases=[];
  const provider=()=>({connect:async()=>{const c=await db.pool.connect();return {on:(...a)=>c.on(...a),removeListener:(...a)=>c.removeListener(...a),release:x=>{releases.push(Boolean(x));c.release(x)},query:async config=>{if(config.text.startsWith('BEGIN'))begins++;const result=await c.query(config);if(config.text==='COMMIT'){commits++;throw new Error('lost acknowledgement')}return result}}}});
  const unknown=createSessionStore({poolProvider:provider,userRepository:repo,lookupSecret:H.LOOKUP_SECRET,jwtSecret:H.JWT_SECRET}); const parent=await anonymous(), handle=await proof();
  await expect(unknown.issueAuthenticatedSession({authenticationProof:handle,expressSid:parent.sid})).rejects.toMatchObject({code:'AUTH_OUTCOME_UNKNOWN',status:503});
  expect(commits).toBe(1); expect(begins).toBe(1); expect(releases).toEqual([true]); expect((await graph()).application).toBe('1');
  await expect(sessions.issueAuthenticatedSession({authenticationProof:handle,expressSid:parent.sid})).rejects.toMatchObject({code:'AUTH_PROOF_REQUIRED'});
});
