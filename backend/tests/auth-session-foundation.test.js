'use strict';
const { createSessionStore } = require('../services/sessionStore');
const { createUserAuthentication } = require('../repositories/private/userAuthentication');
const { cursorCodec,limit } = require('../repositories/private/pagination');
const ID='00000000-0000-4000-8000-000000000003';
const options={lookupSecret:'lookup-secret-'.repeat(4),jwtSecret:'jwt-secret-'.repeat(4)};
function authentication() {
  const a=createUserAuthentication({poolProvider:()=>{throw Error('no DB')},query:async()=>({rows:[{token_version:'1',row_version:'0',two_fa_status:'disabled',two_fa_attempts:0,two_fa_secret:null}]}),safeUser:x=>x});
  const handle=Object.freeze({});a.register(handle,{id:ID,token_version:'1',row_version:'0'});return {a,handle};
}
const originalLookupSecret=process.env.SESSION_LOOKUP_SECRET;
afterEach(()=>{jest.restoreAllMocks();if(originalLookupSecret===undefined)delete process.env.SESSION_LOOKUP_SECRET;else process.env.SESSION_LOOKUP_SECRET=originalLookupSecret;});
test('import and construction never connect, schedule cleanup, or create a fallback cache',()=>{
  const poolProvider=jest.fn(()=>{throw Error('unexpected connection')});const s=createSessionStore({...options,poolProvider});expect(poolProvider).not.toHaveBeenCalled();expect(s.expressStore.constructor.name).toBe('PgSessionStore');expect(Object.isFrozen(s)).toBe(true);
});
test.each([undefined,null,'','short',12])('dedicated lookup secret is mandatory: %s',lookupSecret=>{
  delete process.env.SESSION_LOOKUP_SECRET;expect(()=>createSessionStore({...options,lookupSecret})).toThrow('SESSION_LOOKUP_SECRET_REQUIRED');
});
test.each([null,'','short',12])('JWT secret has no insecure fallback: %s',jwtSecret=>expect(()=>createSessionStore({...options,jwtSecret})).toThrow('JWT_SECRET_REQUIRED'));
test.each([0,59,86401,'60',1.5])('session lifetime is bounded: %s',tokenTtlSeconds=>expect(()=>createSessionStore({...options,tokenTtlSeconds})).toThrow('INVALID_SESSION_EXPIRY'));
test('authentication snapshots are immutable, secret-free, and require positive private comparison',async()=>{
  const {a,handle}=authentication();expect(()=>a.snapshot(handle)).toThrow('AUTH_PROOF_REQUIRED');await a.compare(handle,async()=>true);expect(a.snapshot(handle)).toEqual({userId:ID,tokenVersion:'1',rowVersion:'0',twoFactorVerified:false});expect(Object.isFrozen(a.snapshot(handle))).toBe(true);
  expect(()=>a.snapshot({...handle,userId:ID,passwordVerified:true})).toThrow('AUTH_PROOF_REQUIRED');
});
test('claim reserves a credential synchronously and consumption permanently prevents reuse',async()=>{
  const {a,handle}=authentication();await a.compare(handle,async()=>true);expect(a.claim(handle).userId).toBe(ID);expect(()=>a.claim(handle)).toThrow('AUTH_PROOF_REQUIRED');await expect(a.compare(handle,async()=>true)).rejects.toThrow('AUTH_PROOF_REQUIRED');a.consume(handle);expect(()=>a.snapshot(handle)).toThrow('AUTH_PROOF_REQUIRED');
});
test('a thrown or negative password comparison cannot retain earlier positive proof',async()=>{
  const {a,handle}=authentication();await a.compare(handle,async()=>true);await expect(a.compare(handle,async()=>{throw Error('comparison failed')})).rejects.toThrow('comparison failed');expect(()=>a.snapshot(handle)).toThrow('AUTH_PROOF_REQUIRED');await a.compare(handle,async()=>true);expect(await a.compare(handle,async()=>false)).toBe(false);expect(()=>a.snapshot(handle)).toThrow('AUTH_PROOF_REQUIRED');
});
test('expired credentials and factor handles are not accepted for issuance',async()=>{
  const {a,handle}=authentication();await a.compare(handle,async()=>true);const factor=await a.methods.findFor2FA({authenticationContext:handle});expect(()=>a.snapshot(factor)).toThrow('AUTH_PROOF_REQUIRED');jest.spyOn(Date,'now').mockReturnValue(Date.now()+300001);expect(()=>a.snapshot(handle)).toThrow('AUTH_PROOF_REQUIRED');
});
test.each(['set','touch'])('frozen session data is rejected before %s can write or commit',async method=>{
  const poolProvider=jest.fn(()=>{throw Error('unexpected connection')}),s=createSessionStore({...options,poolProvider});
  const data=Object.freeze({cookie:{expires:new Date(Date.now()+3600000).toISOString()}});
  await expect(new Promise((resolve,reject)=>s.expressStore[method]('a'.repeat(32),data,e=>e?reject(e):resolve()))).rejects.toMatchObject({code:'INVALID_SESSION_DATA'});expect(poolProvider).not.toHaveBeenCalled();
});
test('cursor preserves native microseconds and binds an exact owner/filter view',()=>{
  const codec=cursorCodec('cursor-secret-'.repeat(4)), time='2026-10-28T12:30:45.123456Z', cursor=codec.encode(time,ID,'owner:1');expect(codec.decode(cursor,'owner:1')).toEqual({time,id:ID});expect(()=>codec.decode(cursor,'owner:2')).toThrow('INVALID_PAGINATION');
});
test.each(['',null,'broken','x'.repeat(2049),'a.a'])('malformed pagination fails closed: %s',cursor=>expect(()=>cursorCodec('cursor-secret-'.repeat(4)).decode(cursor,'view')).toThrow('INVALID_PAGINATION'));
test.each([0,101,-1,1.5,'1',null])('page limit rejects %s',value=>expect(()=>limit(value)).toThrow('INVALID_PAGINATION'));
