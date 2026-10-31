'use strict';
const H = require('./helpers/disposablePg');
const { randomUUID } = require('node:crypto');
const { createFinancialCoordinator } = require('../services/financialCoordinator');
const { createOrderRepository } = require('../repositories/orderRepository');
const { createPaymentRepository } = require('../repositories/paymentRepository');
jest.setTimeout(20000);
let db, orders, payments, finance;
const catalog = { ensureLoaded: async()=>{}, resolvePurchase: ()=>({chargeCents:1000,quantity:100,snapshot:{category:'apps',productId:1,productName:'Disposable test service',sourceFile:'apps.json',catalogRevision:'a'.repeat(64),pricingVersion:1,mode:'proportional',priceCents:1000,baseQuantity:100,minQuantity:1,maxQuantity:1000000,minChargeCents:50,maxChargeCents:100000,requiresFulfillmentTarget:true,fulfillmentSchema:'accountId',fulfillmentValidationVersion:1,fulfillmentNetwork:null}}) };
async function purchase(owner=H.OWNER) { return finance.purchaseOrder({principal:H.principal(owner),category:'apps',productId:1,quantity:100,fulfillmentTarget:{accountId:'private_target_123'},idempotencyKey:randomUUID()}); }
async function payment(owner=H.OWNER,extra={}) {
  const id=randomUUID(), paymentId=`pay-${id}`;
  await db.pool.query(`INSERT INTO public.payments (id,payment_id,user_id,submission_version,claimed_amount_minor,currency,method,receipt_public_id,receipt_format,receipt_delivery_type,status)
    VALUES($1::UUID,$2,$3::UUID,1,$4::BIGINT,$5,$6,$7,'jpg','authenticated','pending')`,[id,paymentId,owner,extra.claimed??'1000',extra.currency??'USD',extra.method??'visa',`private_payment_receipts/${id}`]); return {id,paymentId};
}
const options=()=>({poolProvider:()=>db.pool,cursorSecret:H.CURSOR_SECRET});
beforeAll(async()=>{db=await H.open();});
beforeEach(async()=>{await db.reset();await db.seed();orders=createOrderRepository(options());payments=createPaymentRepository(options());finance=createFinancialCoordinator({poolProvider:()=>db.pool,catalogService:catalog});});
afterAll(async()=>{await db?.close();});

test('read repositories expose only narrow read APIs, with no transaction or write authority',()=>{
  for(const repo of [orders,payments]) {expect(Object.isFrozen(repo)).toBe(true);expect(Object.keys(repo).join(' ')).not.toMatch(/create|insert|update|delete|query|transaction|financial|reserve|restore/i);}
});
test.each(['orders','payments'])('%s empty owner/admin pages preserve authorization',async kind=>{
  const repo=kind==='orders'?orders:payments;expect(await repo.listForOwner({principal:H.principal()})).toEqual({items:[],nextBefore:null});
  expect(await repo.listForAdmin({principal:H.principal(H.ADMIN)})).toEqual({items:[],nextBefore:null});
  await expect(repo.listForAdmin({principal:H.principal()})).rejects.toMatchObject({code:'AUTH_FORBIDDEN'});
});
test('order owner history/detail cannot expose another owner or immutable fulfillment target',async()=>{
  const own=await purchase(), foreign=await purchase(H.OTHER);
  const page=await orders.listForOwner({principal:H.principal()});expect(page.items).toHaveLength(1);expect(page.items[0].orderId).toBe(own.orderId);expect(page.items[0].chargeCents).toBe('1000');expect(page.items[0].amount).toBe('10.00');
  expect(await orders.findByOrderIdForOwner({principal:H.principal(),orderId:foreign.orderId})).toBeNull();
  expect(await orders.findByOrderIdForOwner({principal:H.principal(),orderId:own.orderId})).toEqual(page.items[0]);
  expect(JSON.stringify(page)).not.toMatch(/private_target|fulfillment|payload_hash|balance_cents|operation_id|idempotency/i);
  await expect(orders.listForOwner({principal:H.principal(),userId:H.OTHER})).rejects.toMatchObject({code:'INVALID_AUTH_INPUT'});
});
test('payment owner history/detail is receipt-safe; private receipt reads are separately owner scoped',async()=>{
  const own=await payment(), foreign=await payment(H.OTHER);const page=await payments.listForOwner({principal:H.principal()});expect(page.items).toHaveLength(1);expect(page.items[0].paymentId).toBe(own.paymentId);
  expect(await payments.findByPaymentIdForOwner({principal:H.principal(),paymentId:foreign.paymentId})).toBeNull();expect(JSON.stringify(page)).not.toMatch(/private_payment_receipts|receipt|payload_hash|operation_id/i);
  expect(await payments.findReceiptForOwner({principal:H.principal(),paymentId:foreign.paymentId})).toBeNull();
  expect((await payments.findReceiptForOwner({principal:H.principal(),paymentId:own.paymentId})).receipt).toEqual({publicId:`private_payment_receipts/${own.id}`,format:'jpg',deliveryType:'authenticated'});
});
test('explicit admin detail/queues and private fulfillment reads require fresh active administrator',async()=>{
  const own=await purchase();await purchase(H.OTHER);const pay=await payment();
  expect((await orders.listForAdmin({principal:H.principal(H.ADMIN)})).items).toHaveLength(2);
  expect((await orders.listForAdmin({principal:H.principal(H.ADMIN),userId:H.OTHER})).items).toHaveLength(1);
  expect((await orders.findFulfillmentForAdmin({principal:H.principal(H.ADMIN),orderId:own.orderId})).fulfillmentSnapshot.target).toEqual({accountId:'private_target_123'});
  expect((await payments.findReceiptForAdmin({principal:H.principal(H.ADMIN),paymentId:pay.paymentId})).receipt.deliveryType).toBe('authenticated');
  await expect(orders.findFulfillmentForAdmin({principal:H.principal(),orderId:own.orderId})).rejects.toMatchObject({code:'AUTH_FORBIDDEN'});
  await db.pool.query("UPDATE public.users SET role='user' WHERE id=$1::UUID",[H.ADMIN]);await expect(orders.findByOrderIdForAdmin({principal:H.principal(H.ADMIN),orderId:own.orderId})).rejects.toMatchObject({code:'AUTH_FORBIDDEN'});
});
test.each(['orders','payments'])('%s read statement rejects stale version and inactive caller without any row leakage',async kind=>{
  const repo=kind==='orders'?orders:payments;await expect(repo.listForOwner({principal:H.principal(H.OWNER,'0')})).rejects.toMatchObject({code:'AUTH_FORBIDDEN'});
  await db.pool.query("UPDATE public.users SET account_status='suspended' WHERE id=$1::UUID",[H.OWNER]);await expect(repo.listForOwner({principal:H.principal()})).rejects.toMatchObject({code:'AUTH_FORBIDDEN'});
});
test('order queues/status filters reflect validated completion and full-charge refunds',async()=>{
  const a=await purchase(),b=await purchase(),c=await purchase();
  await finance.completeOrder({principal:H.principal(H.ADMIN),orderId:a.orderId,idempotencyKey:randomUUID(),reason:'Completed test'});
  await finance.cancelOrder({principal:H.principal(H.ADMIN),orderId:b.orderId,idempotencyKey:randomUUID(),reason:'Cancelled test'});
  expect((await orders.listPendingForAdmin({principal:H.principal(H.ADMIN)})).items.map(x=>x.orderId)).toEqual([c.orderId]);
  const cancelled=await orders.listForOwner({principal:H.principal(),status:'cancelled'});expect(cancelled.items[0].refundAmountCents).toBe('1000');
  expect(await orders.summarizeForOwner({principal:H.principal()})).toEqual({counts:{pending:'1',completed:'1',cancelled:'1'},chargedCents:'3000',refundedCents:'1000',netChargeCents:'2000'});
});
test('payment queues/detail and exact mixed-currency summaries validate credit/rejection evidence',async()=>{
  const a=await payment(),b=await payment(),c=await payment(H.OWNER,{method:'syriatel',currency:'SYP',claimed:'500000'});
  await finance.approvePayment({principal:H.principal(H.ADMIN),paymentId:a.paymentId,approvedAmountCents:'1500',idempotencyKey:randomUUID(),reason:'Verified test'});
  await finance.rejectPayment({principal:H.principal(H.ADMIN),paymentId:b.paymentId,idempotencyKey:randomUUID(),reason:'Rejected test'});
  expect((await payments.listPendingForAdmin({principal:H.principal(H.ADMIN)})).items.map(x=>x.paymentId)).toEqual([c.paymentId]);
  expect((await payments.findByPaymentIdForOwner({principal:H.principal(),paymentId:a.paymentId})).amountCents).toBe('1500');
  expect(await payments.summarizeForOwner({principal:H.principal()})).toEqual({counts:{pending:'1',completed:'1',cancelled:'1'},approvedUsdCents:'1500',claimedMinorByCurrency:{USD:'2000',SYP:'500000',USDT:'0'}});
});
test('summaries are owner scoped and explicit admin summaries can select a target',async()=>{
  await purchase();await purchase(H.OTHER);await payment();await payment(H.OTHER);
  expect((await orders.summarizeForOwner({principal:H.principal()})).chargedCents).toBe('1000');
  expect((await orders.summarizeForAdmin({principal:H.principal(H.ADMIN)})).chargedCents).toBe('2000');
  expect((await payments.summarizeForAdmin({principal:H.principal(H.ADMIN),userId:H.OTHER})).claimedMinorByCurrency.USD).toBe('1000');
  await expect(payments.summarizeForAdmin({principal:H.principal()})).rejects.toMatchObject({code:'AUTH_FORBIDDEN'});
});
test.each(['orders','payments'])('%s rejects unknown/financial/ownership flags, contradictory pending filters, and bad limits',async kind=>{
  const repo=kind==='orders'?orders:payments;
  for(const patch of [{admin:true},{balanceCents:'5'},{query:{}},{status:'unknown'},{limit:0},{limit:101},{limit:'1'},{before:''}]) await expect(repo.listForOwner({principal:H.principal(),...patch})).rejects.toHaveProperty('code');
  await expect(repo.listPendingForAdmin({principal:H.principal(H.ADMIN),status:'completed'})).rejects.toMatchObject({code:'INVALID_AUTH_INPUT'});
});
test.each(['orders','payments'])('%s authenticated cursor cannot be forged or transferred across owners, filters, or views',async kind=>{
  const repo=kind==='orders'?orders:payments;if(kind==='orders'){await purchase();await purchase();}else{await payment();await payment();}
  const first=await repo.listForOwner({principal:H.principal(),limit:1});expect(first.nextBefore).toBeTruthy();
  const cursor=first.nextBefore;const [body,sig]=cursor.split('.');const bad=`${body}.${sig[0]==='A'?'B':'A'}${sig.slice(1)}`;
  for(const input of [{principal:H.principal(),before:bad},{principal:H.principal(H.OTHER),before:cursor},{principal:H.principal(),before:cursor,status:'pending'}])await expect(repo.listForOwner(input)).rejects.toMatchObject({code:'INVALID_PAGINATION'});
  await expect(repo.listForAdmin({principal:H.principal(H.ADMIN),before:cursor})).rejects.toMatchObject({code:'INVALID_PAGINATION'});
});
test('order cursors preserve the exact PostgreSQL microseconds rather than round through JavaScript Date',async()=>{
  await purchase();await purchase();await purchase();
  // Financial created_at remains immutable. Compare cursor bytes to native PG text.
  const rows=(await db.pool.query("SELECT id,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS exact FROM public.orders ORDER BY created_at DESC,id DESC")).rows;
  const seen=[];let before;
  for(let i=0;i<3;i++){const page=await orders.listForOwner({principal:H.principal(),limit:1,...(before?{before}:{})});seen.push(page.items[0].id);if(page.nextBefore){const decoded=JSON.parse(Buffer.from(page.nextBefore.split('.')[0],'base64url').toString());expect(decoded[1]).toBe(rows[i].exact);expect(decoded[1]).toMatch(/\.\d{6}Z$/);}before=page.nextBefore;}
  expect(seen).toEqual(rows.map(x=>x.id));expect(new Set(seen).size).toBe(3);
});
test('equal-timestamp payment pages use descending UUID tie-breakers without duplicates',async()=>{
  const c=await db.pool.connect();try{await c.query('BEGIN');for(let i=0;i<3;i++){const id=randomUUID();await c.query("INSERT INTO public.payments(id,payment_id,user_id,submission_version,claimed_amount_minor,currency,method,receipt_public_id,receipt_format,receipt_delivery_type,status,created_at) VALUES($1::UUID,$2,$3::UUID,1,1000,'USD','visa',$4,'jpg','authenticated','pending','2026-01-01 00:00:00.123456+00')",[id,`pay-${id}`,H.OWNER,`private_payment_receipts/${id}`]);}await c.query('COMMIT');}finally{c.release();}
  const ids=(await db.pool.query('SELECT id FROM public.payments ORDER BY created_at DESC,id DESC')).rows.map(x=>x.id), seen=[];let before;
  for(let i=0;i<3;i++){const page=await payments.listForOwner({principal:H.principal(),limit:1,...(before?{before}:{})});seen.push(page.items[0].id);before=page.nextBefore;}
  expect(seen).toEqual(ids);expect(before).toBeNull();
});
test('server-side summary cursor fetches bounded batches and keeps sums as strings',async()=>{
  for(let i=0;i<105;i++)await payment(H.OWNER,{method:'usdt',currency:'USDT',claimed:'20000000000'});
  const queries=[], provider=()=>({connect:async()=>{const c=await db.pool.connect();return{query:config=>{queries.push(config.text);return c.query(config)},on:(...a)=>c.on(...a),removeListener:(...a)=>c.removeListener(...a),release:(...a)=>c.release(...a)}}});
  const repo=createPaymentRepository({...options(),poolProvider:provider});const result=await repo.summarizeForOwner({principal:H.principal()});expect(result.counts.pending).toBe('105');expect(result.claimedMinorByCurrency.USDT).toBe('2100000000000');
  expect(queries[0]).toBe('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');expect(queries.filter(q=>q==='FETCH FORWARD 100 FROM resource_summary')).toHaveLength(2);
  expect(queries).toContain('CLOSE resource_summary');
});
test('unversioned payment submissions are rejected by PostgreSQL rather than treated as verified imports',async()=>{
  const id=randomUUID();await expect(db.pool.query("INSERT INTO public.payments(id,payment_id,user_id,claimed_amount_minor,currency,method,receipt_public_id,receipt_format,receipt_delivery_type,status) VALUES($1::UUID,$2,$3::UUID,1000,'USD','visa',$4,'jpg','authenticated','pending')",[id,`legacy-${id}`,H.OWNER,`private_payment_receipts/${id}`])).rejects.toMatchObject({code:'23502'});
  expect((await payments.listForOwner({principal:H.principal()})).items).toHaveLength(0);
});
test.each(['orders','payments'])('%s detects contradictory evidence in a controlled real-query result injection',async kind=>{
  if(kind==='orders')await purchase();else await payment();
  // Execute real SQL first. Corrupt only the intercepted result, never bypass DB
  // triggers or persist unsupported financial rows to make a fixture pass.
  const provider=()=>({query:async config=>{const result=await db.pool.query(config);for(const row of result.rows){if(kind==='orders')row.r_charge_cents='1001';else row.r_submission_version=2;}return result}});
  const repo=kind==='orders'?createOrderRepository({...options(),poolProvider:provider}):createPaymentRepository({...options(),poolProvider:provider});
  await expect(repo.listForOwner({principal:H.principal()})).rejects.toMatchObject({code:kind==='orders'?'ORDER_RECONCILIATION_REQUIRED':'PAYMENT_RECONCILIATION_REQUIRED'});
});
test('exact admin aggregates may exceed MAX_CENTS without conversion to Number',async()=>{
  await db.pool.query('UPDATE public.users SET balance_cents=0 WHERE id=ANY($1::UUID[])',[[H.OWNER,H.OTHER]]);
  for(const owner of [H.OWNER,H.OTHER]){const p=await payment(owner);await finance.approvePayment({principal:H.principal(H.ADMIN),paymentId:p.paymentId,approvedAmountCents:'9000000000000000',idempotencyKey:randomUUID(),reason:'Reviewed large exact credit'});}
  const summary=await payments.summarizeForAdmin({principal:H.principal(H.ADMIN)});expect(summary.approvedUsdCents).toBe('18000000000000000');expect(typeof summary.approvedUsdCents).toBe('string');
});
test('same-millisecond payment records preserve fractional-microsecond keyset boundaries',async()=>{
  for(const fraction of ['123450','123456','123459']){const id=randomUUID();await db.pool.query("INSERT INTO public.payments(id,payment_id,user_id,submission_version,claimed_amount_minor,currency,method,receipt_public_id,receipt_format,receipt_delivery_type,status,created_at) VALUES($1::UUID,$2,$3::UUID,1,1000,'USD','visa',$4,'jpg','authenticated','pending',$5::TIMESTAMPTZ)",[id,`pay-${id}`,H.OWNER,`private_payment_receipts/${id}`,`2026-01-01T00:00:00.${fraction}Z`]);}
  const seen=[];let before;
  for(let i=0;i<3;i++){const page=await payments.listForOwner({principal:H.principal(),limit:1,...(before?{before}:{})});seen.push(page.items[0].id);if(page.nextBefore){const decoded=JSON.parse(Buffer.from(page.nextBefore.split('.')[0],'base64url').toString());expect(decoded[1]).toBe(`2026-01-01T00:00:00.${['123459','123456'][i]}Z`);}before=page.nextBefore;}
  expect(new Set(seen).size).toBe(3);expect(before).toBeNull();
});
test('read failure exposes no SQL, fulfillment target, receipt path, or transport detail',async()=>{
  const failing=createOrderRepository({...options(),poolProvider:()=>({query:async()=>{throw new Error('private_target_123 SQL receipt private path')}})});
  await expect(failing.listForOwner({principal:H.principal()})).rejects.toMatchObject({code:'RESOURCE_READ_UNAVAILABLE',message:'RESOURCE_READ_UNAVAILABLE'});
});
