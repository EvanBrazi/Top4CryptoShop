'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

const EXPECTED_URL =
  'postgresql://top4_test:Top4_Local_Test_Only_18@localhost:5433/top4_financial_test?sslmode=require';

if (
  process.env.TOP4_PG_TEST_ALLOW_RESET !== 'YES_DISPOSABLE_LOCAL_PG18' ||
  process.env.DATABASE_URL !== EXPECTED_URL ||
  process.env.DIRECT_URL !== EXPECTED_URL ||
  !process.env.NODE_EXTRA_CA_CERTS
) {
  throw new Error(
    'PG_TEST_CONFIGURATION_REFUSED: use only the documented disposable local PostgreSQL test environment'
  );
}

const { Pool } = require('../node_modules/pg');
const { connectionOptions } = require('../db/connection');
const {
  createFinancialCoordinator
} = require('../services/financialCoordinator');
const {
  createUserRepository
} = require('../repositories/userRepository');

jest.setTimeout(20000);

const ADMIN_A = '00000000-0000-4000-8000-000000000001';
const ADMIN_B = '00000000-0000-4000-8000-000000000002';
const OWNER = '00000000-0000-4000-8000-000000000003';

const MIGRATIONS = [
  [
    '001_create_users_table.sql',
    'dcad707a0db33d20fafcbc0d936eb7e473daadc2a43a80b99de2bba5d51e8147'
  ],
  [
    '002_create_financial_operations_table.sql',
    'b5d596e09e1cafc777d9ae9805658e507625113306ae01d5d6f80232a49ad05f'
  ],
  [
    '003_create_payments_table.sql',
    'b9b3534d65d9b1115a6055f5940017470f49c52bf29f95e23067fb2d17f58210'
  ],
  [
    '004_create_orders_table.sql',
    '0e5b70f44cd832bc6b671109bf4aeead465f0edff498da75bcd5ba0f24b1ed70'
  ],
  ['005_create_auth_session_tables.sql', '2b14cb8e91faff6c53ce0f54f9f917b8b0678b070c9c3659a8c3b2b6e69f580c']
];

// Reset all five approved migrations without leaving dangling auth foreign keys.
const DOMAIN_FUNCTIONS = [
  'public.express_session_guard()',
  'public.application_session_guard()',
  'public.token_revocation_guard()',
  'public.users_metadata_guard()',
  'public.financial_append_only_guard()',
  'public.payment_immutable_guard()',
  'public.payment_journal_evidence_guard()',
  'public.order_immutable_guard()',
  'public.order_journal_evidence_guard()',
  'public.usd_cents_text(BIGINT)',
  'public.receipt_reference_matches(TEXT, UUID, TEXT)'
];

const ADVISORY_LOCK = [74382601, 733];

let pool;
let guardClient;
let guardLocked = false;
let verifiedDisposableDatabase = false;
let migrationSql;
let coordinator;

function principal(userId = ADMIN_A) {
  return { userId, tokenVersion: '1' };
}

function adjustment(extra = {}) {
  return {
    principal: principal(),
    userId: OWNER,
    newBalanceCents: '12000',
    expectedBalanceCents: '10000',
    idempotencyKey: 'adjustment-1',
    reason: 'Reviewed adjustment',
    ...extra
  };
}

function purchase(extra = {}) {
  return {
    principal: principal(OWNER),
    category: 'apps',
    productId: 1,
    quantity: 100,
    fulfillmentTarget: { accountId: 'user_123' },
    idempotencyKey: 'purchase-1',
    ...extra
  };
}

function approval(paymentId, extra = {}) {
  return {
    principal: principal(),
    paymentId,
    approvedAmountCents: '1500',
    idempotencyKey: 'approval-1',
    reason: 'Verified receipt',
    ...extra
  };
}

function paymentRejection(paymentId, extra = {}) {
  return {
    principal: principal(),
    paymentId,
    idempotencyKey: 'rejection-1',
    reason: 'Receipt rejected after review',
    ...extra
  };
}

function orderDecision(orderId, extra = {}) {
  return {
    principal: principal(),
    orderId,
    idempotencyKey: 'order-decision-1',
    reason: 'Reviewed order decision',
    ...extra
  };
}

function catalogFixture(priceCents = 1000) {
  return {
    ensureLoaded: jest.fn(),
    resolvePurchase: jest.fn(() => ({
      chargeCents: priceCents,
      quantity: 100,
      snapshot: {
        category: 'apps',
        productId: 1,
        productName: 'Disposable test service',
        sourceFile: 'apps.json',
        catalogRevision: 'a'.repeat(64),
        pricingVersion: 1,
        mode: 'proportional',
        priceCents,
        baseQuantity: 100,
        minQuantity: 1,
        maxQuantity: 1000000,
        minChargeCents: 50,
        maxChargeCents: 100000,
        requiresFulfillmentTarget: true,
        fulfillmentSchema: 'accountId',
        fulfillmentValidationVersion: 1,
        fulfillmentNetwork: null
      }
    }))
  };
}

function createCoordinator(options = {}) {
  return createFinancialCoordinator({
    poolProvider: () => pool,
    catalogService: catalogFixture(),
    ...options
  });
}

// Wraps real checked-out pg clients. SQL still executes against PostgreSQL,
// except where a test explicitly injects a stale read or lost response.
function interceptedCoordinator(intercept, options = {}) {
  const events = [];
  const releases = [];

  const poolProvider = () => ({
    async connect() {
      const rawClient = await pool.connect();

      return {
        query(config) {
          events.push({
            text: config.text,
            values: config.values
          });

          return intercept(
            rawClient,
            config,
            () => rawClient.query(config)
          );
        },

        on(...args) {
          return rawClient.on(...args);
        },

        removeListener(...args) {
          return rawClient.removeListener(...args);
        },

        release(destroy) {
          releases.push(Boolean(destroy));
          rawClient.release(destroy);
        }
      };
    }
  });

  return {
    events,
    releases,
    coordinator: createCoordinator({
      ...options,
      poolProvider
    })
  };
}

function rendezvous(participants = 2) {
  let arrivals = 0;
  let release;
  const gate = new Promise(resolve => {
    release = resolve;
  });

  return async () => {
    arrivals += 1;
    if (arrivals === participants) release();
    await gate;
  };
}

async function account(userId = OWNER) {
  const result = await pool.query(
    `SELECT balance_cents, balance, row_version
     FROM public.users
     WHERE id = $1::UUID`,
    [userId]
  );

  return result.rows[0];
}

async function counts() {
  const result = await pool.query(`
    SELECT
      (SELECT count(*)::INTEGER
       FROM public.financial_operations) AS journal,
      (SELECT count(*)::INTEGER
       FROM public.orders) AS orders,
      (SELECT count(*)::INTEGER
       FROM public.payments) AS payments
  `);

  return result.rows[0];
}

async function createPayment() {
  const id = randomUUID();
  const paymentId = `pay-${id}`;

  await pool.query(
    `INSERT INTO public.payments (
       id, payment_id, user_id, submission_version,
       claimed_amount_minor, currency, method,
       receipt_public_id, receipt_format,
       receipt_delivery_type, status
     )
     VALUES (
       $1::UUID, $2, $3::UUID, 1,
       1000, 'USD', 'visa',
       $4, 'jpg', 'authenticated', 'pending'
     )`,
    [
      id,
      paymentId,
      OWNER,
      `private_payment_receipts/${randomUUID()}`
    ]
  );

  return paymentId;
}

async function resetDomainTables() {
  if (!verifiedDisposableDatabase || !guardLocked) {
    throw new Error('PG_TEST_RESET_REFUSED');
  }

  const client = await pool.connect();
  let clean = false;

  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '2s'");
    await client.query("SET LOCAL statement_timeout = '10s'");

    // Destructive, but restricted to the positively verified disposable DB.
    // The administrative schema_migrations ledger is deliberately preserved.
    await client.query(`
      DROP TABLE
        public.application_sessions,
        public.token_revocations,
        public.express_sessions,
        public.orders,
        public.payments,
        public.financial_operations,
        public.users
      CASCADE
    `);

    for (const signature of DOMAIN_FUNCTIONS) {
      await client.query(
        `DROP FUNCTION IF EXISTS ${signature} CASCADE`
      );
    }

    for (const sql of migrationSql) {
      await client.query(sql);
    }

    await client.query('COMMIT');
    clean = true;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
      clean = true;
    } catch (_) {
      clean = false;
    }
    throw error;
  } finally {
    client.release(!clean);
  }
}

beforeAll(async () => {
  migrationSql = MIGRATIONS.map(([filename, checksum]) => {
    const sql = fs.readFileSync(
      path.join(__dirname, '../db/migrations', filename),
      'utf8'
    );

    expect(
      createHash('sha256').update(sql).digest('hex')
    ).toBe(checksum);

    return sql;
  });

  pool = new Pool({
    ...connectionOptions(process.env, 'DATABASE_URL'),
    max: 10,
    query_timeout: 10000
  });

  // Deliberate disconnect tests must not cause unhandled idle-client events.
  pool.on('error', () => {});

  guardClient = await pool.connect();

  const stream = guardClient.connection.stream;
  expect(stream.encrypted).toBe(true);
  expect(stream.authorized).toBe(true);

  const identity = (
    await guardClient.query(`
      SELECT
        current_database() AS database_name,
        current_user AS user_name,
        current_setting('server_version_num')::INTEGER AS version_num
    `)
  ).rows[0];

  expect(identity.database_name).toBe('top4_financial_test');
  expect(identity.user_name).toBe('top4_test');
  expect(identity.version_num).toBeGreaterThanOrEqual(180000);
  expect(identity.version_num).toBeLessThan(190000);

  const ledger = (
    await guardClient.query(`
      SELECT version, filename, checksum
      FROM public.schema_migrations
      ORDER BY version
    `)
  ).rows;

  expect(ledger).toEqual(
    MIGRATIONS.map(([filename, checksum], index) => ({
      version: index + 1,
      filename,
      checksum
    }))
  );

  const lock = (
    await guardClient.query(
      'SELECT pg_try_advisory_lock($1, $2) AS acquired',
      ADVISORY_LOCK
    )
  ).rows[0];

  expect(lock.acquired).toBe(true);
  guardLocked = true;
  verifiedDisposableDatabase = true;
}, 60000);

beforeEach(async () => {
  await resetDomainTables();

  // Raw inserts are fixtures only, in this disposable database.
  await pool.query(
    `INSERT INTO public.users (
       id, username, email, provider,
       role, token_version, balance_cents
     )
     VALUES
       ($1::UUID, 'Admin_A', 'a@example.test',
        'google', 'admin', 1, 10000),
       ($2::UUID, 'Admin_B', 'b@example.test',
        'google', 'admin', 1, 10000),
       ($3::UUID, 'Owner_U', 'u@example.test',
        'google', 'user', 1, 10000)`,
    [ADMIN_A, ADMIN_B, OWNER]
  );

  coordinator = createCoordinator();
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  verifiedDisposableDatabase = false;

  if (guardClient) {
    let destroy = false;

    try {
      if (guardLocked) {
        await guardClient.query(
          'SELECT pg_advisory_unlock($1, $2)',
          ADVISORY_LOCK
        );
      }
    } catch (_) {
      destroy = true;
    } finally {
      guardLocked = false;
      guardClient.release(destroy);
      guardClient = null;
    }
  }

  if (pool) await pool.end();
}, 30000);

test('adjustment atomically commits exact balance, version and journal', async () => {
  const receipt = await coordinator.adjustBalance(adjustment());

  expect(receipt).toMatchObject({
    userId: OWNER,
    currency: 'USD',
    balanceCents: '12000',
    balance: '120.00',
    replayed: false
  });

  expect(Object.isFrozen(receipt)).toBe(true);

  expect(await account()).toEqual({
    balance_cents: '12000',
    balance: '120.00',
    row_version: '1'
  });

  const journal = (
    await pool.query(`
      SELECT before_cents, after_cents, delta_cents
      FROM public.financial_operations
    `)
  ).rows;

  expect(journal).toEqual([{
    before_cents: '10000',
    after_cents: '12000',
    delta_cents: '2000'
  }]);
});

test('purchase atomically commits paired debit/order and immutable fulfillment', async () => {
  const receipt = await coordinator.purchaseOrder(purchase());

  expect(receipt).toMatchObject({
    userId: OWNER,
    status: 'pending',
    chargeCents: '1000',
    charge: '10.00',
    balanceCents: '9000',
    quantity: 100,
    replayed: false
  });

  expect(await counts()).toEqual({
    journal: 1,
    orders: 1,
    payments: 0
  });

  const stored = (
    await pool.query(`
      SELECT fulfillment_target, charge_cents, debit_operation_id
      FROM public.orders
    `)
  ).rows[0];

  expect(stored).toEqual({
    fulfillment_target: 'user_123',
    charge_cents: '1000',
    debit_operation_id: receipt.operationId
  });
});

test('approval separates authoritative USD from the submitted claim', async () => {
  const paymentId = await createPayment();
  const receipt = await coordinator.approvePayment(
    approval(paymentId)
  );

  expect(receipt).toMatchObject({
    paymentId,
    status: 'completed',
    amountCents: '1500',
    balanceCents: '11500',
    replayed: false
  });

  const stored = (
    await pool.query(`
      SELECT claimed_amount_minor, amount_cents,
             amount_in_usd, status
      FROM public.payments
    `)
  ).rows[0];

  expect(stored).toEqual({
    claimed_amount_minor: '1000',
    amount_cents: '1500',
    amount_in_usd: '15.00',
    status: 'completed'
  });
});

test('overlapping concurrent purchases cannot overspend one balance', async () => {
  const meet = rendezvous();

  const wrapped = interceptedCoordinator(
    async (_raw, query, next) => {
      if (query.text.includes('financial:accounts')) {
        await meet();
      }
      return next();
    },
    { catalogService: catalogFixture(6000) }
  );

  const outcomes = await Promise.allSettled([
    wrapped.coordinator.purchaseOrder(
      purchase({ idempotencyKey: 'spend-a' })
    ),
    wrapped.coordinator.purchaseOrder(
      purchase({ idempotencyKey: 'spend-b' })
    )
  ]);

  expect(
    outcomes.filter(result => result.status === 'fulfilled')
  ).toHaveLength(1);

  expect(
    outcomes.find(result => result.status === 'rejected').reason
  ).toMatchObject({
    status: 409,
    code: 'INSUFFICIENT_FUNDS'
  });

  expect((await account()).balance_cents).toBe('4000');
  expect(await counts()).toEqual({
    journal: 1,
    orders: 1,
    payments: 0
  });
});

test('reversed admin/target pairs overlap but use one UUID order without retries', async () => {
  const meet = rendezvous();
  const lockOrders = [];

  const wrapped = interceptedCoordinator(
    async (_raw, query, next) => {
      if (query.text.includes('financial:accounts')) {
        lockOrders.push(query.values[0]);
        await meet();
      }
      return next();
    }
  );

  await Promise.all([
    wrapped.coordinator.adjustBalance(
      adjustment({
        userId: ADMIN_B,
        newBalanceCents: '11000',
        idempotencyKey: 'a-adjusts-b'
      })
    ),
    wrapped.coordinator.adjustBalance(
      adjustment({
        principal: principal(ADMIN_B),
        userId: ADMIN_A,
        newBalanceCents: '11000',
        idempotencyKey: 'b-adjusts-a'
      })
    )
  ]);

  expect(lockOrders).toEqual([
    [ADMIN_A, ADMIN_B],
    [ADMIN_A, ADMIN_B]
  ]);

  expect(
    wrapped.events.filter(event =>
      event.text.startsWith('BEGIN')
    )
  ).toHaveLength(2);

  expect((await account(ADMIN_A)).balance_cents).toBe('11000');
  expect((await account(ADMIN_B)).balance_cents).toBe('11000');
});

test('concurrent same-key purchases produce one debit and one historical replay', async () => {
  const meet = rendezvous();

  const wrapped = interceptedCoordinator(
    async (_raw, query, next) => {
      if (query.text.includes('financial:accounts')) {
        await meet();
      }
      return next();
    }
  );

  const receipts = await Promise.all([
    wrapped.coordinator.purchaseOrder(purchase()),
    wrapped.coordinator.purchaseOrder(purchase())
  ]);

  expect(receipts.map(receipt => receipt.replayed).sort())
    .toEqual([false, true]);

  expect(receipts[0].operationId).toBe(receipts[1].operationId);
  expect(receipts[0].orderId).toBe(receipts[1].orderId);

  expect((await account()).balance_cents).toBe('9000');
  expect((await counts()).journal).toBe(1);
  expect((await counts()).orders).toBe(1);
});

test('real adjustment-journal 23505 rolls back before clean replay resolution', async () => {
  // A zero-delta adjustment leaves the expected balance unchanged.
  const request = adjustment({
    newBalanceCents: '10000'
  });

  const original = await coordinator.adjustBalance(request);

  let hiddenReads = 0;
  let observedDuplicate;

  const wrapped = interceptedCoordinator(
    async (_raw, query, next) => {
      // Test-only stale reads force execution to reach the real unique index.
      if (
        query.text.includes('financial:replay:adjust') &&
        hiddenReads++ < 2
      ) {
        return { rows: [], rowCount: 0 };
      }

      try {
        return await next();
      } catch (error) {
        if (error.code === '23505') {
          observedDuplicate = {
            code: error.code,
            constraint: error.constraint
          };
        }
        throw error;
      }
    }
  );

  expect(
    await wrapped.coordinator.adjustBalance(request)
  ).toEqual({
    ...original,
    replayed: true
  });

  expect(observedDuplicate).toEqual({
    code: '23505',
    constraint: 'financial_actor_operation_idempotency'
  });

  // The losing UPDATE advanced row_version inside its transaction,
  // but rollback restored the winner's committed version.
  expect(await account()).toMatchObject({
    balance_cents: '10000',
    row_version: '1'
  });

  expect((await counts()).journal).toBe(1);

  const sql = wrapped.events.map(event => event.text);
  const rollbackIndex = sql.indexOf('ROLLBACK');

  expect(rollbackIndex).toBeGreaterThan(0);
  expect(
    sql.indexOf(
      'BEGIN ISOLATION LEVEL READ COMMITTED',
      rollbackIndex
    )
  ).toBeGreaterThan(rollbackIndex);

  expect(wrapped.releases).toEqual([false, false]);
});

test('real purchase-journal 23505 cannot leave a second debit or order', async () => {
  const original = await coordinator.purchaseOrder(purchase());

  let hiddenReads = 0;
  let observedConstraint;

  const wrapped = interceptedCoordinator(
    async (_raw, query, next) => {
      if (
        query.text.includes('financial:replay:purchase') &&
        hiddenReads++ < 2
      ) {
        return { rows: [], rowCount: 0 };
      }

      try {
        return await next();
      } catch (error) {
        if (error.code === '23505') {
          observedConstraint = error.constraint;
        }
        throw error;
      }
    }
  );

  expect(
    await wrapped.coordinator.purchaseOrder(purchase())
  ).toEqual({
    ...original,
    replayed: true
  });

  expect(observedConstraint)
    .toBe('financial_actor_operation_idempotency');

  expect(await account()).toMatchObject({
    balance_cents: '9000',
    row_version: '1'
  });

  expect(await counts()).toEqual({
    journal: 1,
    orders: 1,
    payments: 0
  });
});

test.each(['40001', '40P01'])(
  'PostgreSQL-raised %s exhausts three attempts without effects',
  async sqlstate => {
    const wrapped = interceptedCoordinator(
      (raw, query, next) => {
        if (query.text.includes('financial:accounts')) {
          // sqlstate comes only from this fixed test.each list.
          return raw.query(`
            DO $$
            BEGIN
              RAISE EXCEPTION USING
                ERRCODE = '${sqlstate}',
                MESSAGE = 'test-only transaction conflict';
            END
            $$
          `);
        }

        return next();
      }
    );

    await expect(
      wrapped.coordinator.adjustBalance(adjustment())
    ).rejects.toMatchObject({
      status: 503,
      code: 'FINANCIAL_RETRY_EXHAUSTED',
      retryWithSameKey: true
    });

    expect(
      wrapped.events.filter(event =>
        event.text.startsWith('BEGIN')
      )
    ).toHaveLength(3);

    expect(
      wrapped.events.filter(event =>
        event.text === 'ROLLBACK'
      )
    ).toHaveLength(3);

    expect(wrapped.releases).toEqual([false, false, false]);

    expect(await account()).toMatchObject({
      balance_cents: '10000',
      row_version: '0'
    });

    expect((await counts()).journal).toBe(0);
  }
);

test('repository-mapped 40001 retries and then commits exactly once', async () => {
  let conflicts = 0;

  const wrapped = interceptedCoordinator(
    (raw, query, next) => {
      if (
        query.text.startsWith(
          'UPDATE public.users SET balance_cents'
        ) &&
        conflicts++ < 2
      ) {
        return raw.query(`
          DO $$
          BEGIN
            RAISE EXCEPTION USING
              ERRCODE = '40001',
              MESSAGE = 'test-only balance-update conflict';
          END
          $$
        `);
      }

      return next();
    }
  );

  const receipt = await wrapped.coordinator.adjustBalance(
    adjustment()
  );

  expect(receipt.replayed).toBe(false);

  expect(
    wrapped.events.filter(event =>
      event.text.startsWith('BEGIN')
    )
  ).toHaveLength(3);

  expect(await account()).toMatchObject({
    balance_cents: '12000',
    row_version: '1'
  });

  expect((await counts()).journal).toBe(1);
});

test('lost response after real COMMIT destroys the client and resolves the receipt', async () => {
  const wrapped = interceptedCoordinator(
    async (raw, query, next) => {
      const result = await next();

      if (query.text === 'COMMIT') {
        // PostgreSQL really committed. The interceptor withholds the
        // acknowledgement from the coordinator and destroys the connection.
        raw.connection.stream.destroy();

        throw Object.assign(
          new Error('test-only lost COMMIT acknowledgement'),
          { code: 'ECONNRESET' }
        );
      }

      return result;
    }
  );

  const receipt = await wrapped.coordinator.adjustBalance(
    adjustment()
  );

  expect(receipt).toMatchObject({
    balanceCents: '12000',
    replayed: true
  });

  expect(wrapped.releases).toEqual([true, false]);

  expect(
    wrapped.events.filter(event =>
      event.text.includes('financial:journal')
    )
  ).toHaveLength(1);

  expect((await account()).balance_cents).toBe('12000');
  expect((await counts()).journal).toBe(1);
});

test('disconnect at COMMIT without evidence returns unknown and never repeats the write', async () => {
  const wrapped = interceptedCoordinator(
    (raw, query, next) => {
      if (query.text === 'COMMIT') {
        // The coordinator has entered COMMIT-started state.
        // This fault destroys the connection before dispatching COMMIT.
        raw.connection.stream.destroy();

        throw Object.assign(
          new Error('test-only disconnect at COMMIT'),
          { code: 'ECONNRESET' }
        );
      }

      return next();
    }
  );

  await expect(
    wrapped.coordinator.adjustBalance(adjustment())
  ).rejects.toMatchObject({
    status: 503,
    code: 'FINANCIAL_OUTCOME_UNKNOWN',
    retryWithSameKey: true
  });

  expect(wrapped.releases).toEqual([true, false]);

  expect(
    wrapped.events.filter(event =>
      event.text.includes('financial:journal')
    )
  ).toHaveLength(1);

  expect((await account()).balance_cents).toBe('10000');
  expect((await counts()).journal).toBe(0);
});

test('lost purchase COMMIT response resolves one paired order/debit', async () => {
  const wrapped = interceptedCoordinator(
    async (raw, query, next) => {
      const result = await next();

      if (query.text === 'COMMIT') {
        raw.connection.stream.destroy();
        throw new Error('test-only lost purchase COMMIT response');
      }

      return result;
    }
  );

  const receipt = await wrapped.coordinator.purchaseOrder(
    purchase()
  );

  expect(receipt).toMatchObject({
    status: 'pending',
    chargeCents: '1000',
    balanceCents: '9000',
    replayed: true
  });

  expect(await counts()).toEqual({
    journal: 1,
    orders: 1,
    payments: 0
  });

  expect(wrapped.releases).toEqual([true, false]);
});

test('production scope authority rejects forgeries and revokes committed handles', async () => {
  let repository;
  let authority;
  let capturedScope;
  let capturedHandle;

  const scopedCoordinator = createCoordinator({
    userRepositoryFactory(options) {
      authority = options.financialScopeAuthority;
      repository = createUserRepository(options);

      return {
        internal: {
          forFinancialTransaction(scope) {
            capturedScope = scope;
            capturedHandle =
              repository.internal.forFinancialTransaction(scope);

            return capturedHandle;
          }
        }
      };
    }
  });

  const fakeQuery = jest.fn();

  for (const forged of [
    {},
    Object.freeze({}),
    {
      inTransaction: true,
      client: { query: fakeQuery },
      actorId: ADMIN_A,
      userId: OWNER,
      operationType: 'balance_adjustment'
    }
  ]) {
    expect(() =>
      repository.internal.forFinancialTransaction(forged)
    ).toThrow('FINANCIAL_TRANSACTION_REQUIRED');
  }

  expect(fakeQuery).not.toHaveBeenCalled();

  await scopedCoordinator.adjustBalance(adjustment());

  expect(Object.isFrozen(capturedScope)).toBe(true);
  expect(Object.keys(capturedScope)).toEqual([]);

  expect(() =>
    authority.resolve(capturedScope)
  ).toThrow('FINANCIAL_TRANSACTION_REQUIRED');

  await expect(
    capturedHandle.lockUsersForUpdate()
  ).rejects.toThrow('FINANCIAL_TRANSACTION_REQUIRED');
});

test('rollback also revokes its scope and balance handle', async () => {
  let capturedHandle;

  const scopedCoordinator = createCoordinator({
    userRepositoryFactory(options) {
      const repository = createUserRepository(options);

      return {
        internal: {
          forFinancialTransaction(scope) {
            capturedHandle =
              repository.internal.forFinancialTransaction(scope);

            return capturedHandle;
          }
        }
      };
    }
  });

  await expect(
    scopedCoordinator.adjustBalance(
      adjustment({ expectedBalanceCents: '0' })
    )
  ).rejects.toMatchObject({
    code: 'EXPECTED_BALANCE_MISMATCH'
  });

  await expect(
    capturedHandle.applyBalanceChange({
      beforeCents: '10000',
      afterCents: '12000',
      expectedRowVersion: '0'
    })
  ).rejects.toThrow('FINANCIAL_TRANSACTION_REQUIRED');

  expect((await account()).balance_cents).toBe('10000');
  expect((await counts()).journal).toBe(0);
});

test('rejection is nonmonetary and leaves owner balance/version unchanged', async () => {
  const paymentId = await createPayment();
  const before = await account();

  const receipt = await coordinator.rejectPayment(
    paymentRejection(paymentId)
  );

  expect(receipt).toEqual({
    paymentId,
    userId: OWNER,
    status: 'cancelled',
    replayed: false
  });

  expect(await account()).toEqual(before);
  expect((await counts()).journal).toBe(0);

  const stored = (
    await pool.query(`
      SELECT status, amount_cents, decision_operation_id
      FROM public.payments
    `)
  ).rows[0];

  expect(stored).toEqual({
    status: 'cancelled',
    amount_cents: null,
    decision_operation_id: null
  });
});

test('completion is nonmonetary and purchase replay retains original receipt', async () => {
  const original = await coordinator.purchaseOrder(purchase());
  const beforeCompletion = await account();

  const completed = await coordinator.completeOrder(
    orderDecision(original.orderId)
  );

  expect(completed).toEqual({
    orderId: original.orderId,
    userId: OWNER,
    status: 'completed',
    replayed: false
  });

  expect(await account()).toEqual(beforeCompletion);
  expect((await counts()).journal).toBe(1);

  expect(
    await coordinator.purchaseOrder(purchase())
  ).toEqual({
    ...original,
    replayed: true
  });
});

test('cancellation refunds full original charge and replay never refunds twice', async () => {
  const original = await coordinator.purchaseOrder(purchase());

  const changedCatalogCoordinator = createCoordinator({
    catalogService: catalogFixture(4500)
  });

  const request = orderDecision(original.orderId);
  const cancelled = await changedCatalogCoordinator.cancelOrder(
    request
  );

  expect(cancelled).toMatchObject({
    orderId: original.orderId,
    status: 'cancelled',
    chargeCents: '1000',
    balanceCents: '10000',
    replayed: false
  });

  expect((await account()).balance_cents).toBe('10000');
  expect((await counts()).journal).toBe(2);

  expect(
    await changedCatalogCoordinator.cancelOrder(request)
  ).toEqual({
    ...cancelled,
    replayed: true
  });

  expect((await counts()).journal).toBe(2);
});

test('original-charge refund may credit an inactive owner', async () => {
  const original = await coordinator.purchaseOrder(purchase());

  await pool.query(
    `UPDATE public.users
     SET account_status = 'deactivated'
     WHERE id = $1::UUID`,
    [OWNER]
  );

  const request = orderDecision(original.orderId);
  const cancelled = await coordinator.cancelOrder(request);

  expect(cancelled).toMatchObject({
    chargeCents: '1000',
    balanceCents: '10000',
    replayed: false
  });

  expect(
    await coordinator.cancelOrder(request)
  ).toEqual({
    ...cancelled,
    replayed: true
  });

  expect((await account()).balance_cents).toBe('10000');
});

test('purchase replay succeeds despite an unavailable current catalog', async () => {
  const original = await coordinator.purchaseOrder(purchase());

  const brokenCatalog = {
    ensureLoaded() {
      throw Object.assign(
        new Error('test-only unavailable catalog'),
        {
          status: 503,
          code: 'FULFILLMENT_CONFIGURATION_INVALID'
        }
      );
    },
    resolvePurchase: jest.fn()
  };

  const replayCoordinator = createCoordinator({
    catalogService: brokenCatalog
  });

  expect(
    await replayCoordinator.purchaseOrder(purchase())
  ).toEqual({
    ...original,
    replayed: true
  });

  expect(brokenCatalog.resolvePurchase).not.toHaveBeenCalled();

  await expect(
    replayCoordinator.purchaseOrder(
      purchase({ idempotencyKey: 'new-purchase' })
    )
  ).rejects.toMatchObject({
    code: 'FULFILLMENT_CONFIGURATION_INVALID'
  });

  expect((await counts()).journal).toBe(1);
});

test('adjustment replay precedes current target eligibility checks', async () => {
  const request = adjustment();
  const original = await coordinator.adjustBalance(request);

  await pool.query(
    `UPDATE public.users
     SET account_status = 'suspended'
     WHERE id = $1::UUID`,
    [OWNER]
  );

  expect(
    await coordinator.adjustBalance(request)
  ).toEqual({
    ...original,
    replayed: true
  });

  expect((await counts()).journal).toBe(1);
});

test('same key with different purchase intent is a conflict, not another debit', async () => {
  await coordinator.purchaseOrder(purchase());

  await expect(
    coordinator.purchaseOrder(
      purchase({
        fulfillmentTarget: { accountId: 'different_123' }
      })
    )
  ).rejects.toMatchObject({
    status: 409,
    code: 'IDEMPOTENCY_CONFLICT'
  });

  expect((await account()).balance_cents).toBe('9000');
  expect((await counts()).journal).toBe(1);
});

test('fresh token authorization is required even for a replay', async () => {
  await coordinator.purchaseOrder(purchase());

  await pool.query(
    `UPDATE public.users
     SET token_version = 2
     WHERE id = $1::UUID`,
    [OWNER]
  );

  await expect(
    coordinator.purchaseOrder(purchase())
  ).rejects.toMatchObject({
    status: 403,
    code: 'FINANCIAL_FORBIDDEN'
  });

  expect((await counts()).journal).toBe(1);
});

test('two administrators cannot approve one payment twice', async () => {
  const paymentId = await createPayment();
  const meet = rendezvous();

  const wrapped = interceptedCoordinator(
    async (_raw, query, next) => {
      if (query.text.includes('financial:accounts')) {
        await meet();
      }
      return next();
    }
  );

  const outcomes = await Promise.allSettled([
    wrapped.coordinator.approvePayment(
      approval(paymentId, {
        idempotencyKey: 'admin-a-approval'
      })
    ),
    wrapped.coordinator.approvePayment(
      approval(paymentId, {
        principal: principal(ADMIN_B),
        idempotencyKey: 'admin-b-approval'
      })
    )
  ]);

  expect(
    outcomes.filter(result => result.status === 'fulfilled')
  ).toHaveLength(1);

  expect(
    outcomes.find(result => result.status === 'rejected').reason
  ).toMatchObject({
    status: 409,
    code: 'PAYMENT_ALREADY_DECIDED'
  });

  expect((await account()).balance_cents).toBe('11500');
  expect((await counts()).journal).toBe(1);
});

test('approval replay returns historical balance after a later adjustment', async () => {
  const paymentId = await createPayment();
  const request = approval(paymentId);

  const original = await coordinator.approvePayment(request);

  await coordinator.adjustBalance(
    adjustment({
      expectedBalanceCents: '11500',
      newBalanceCents: '14000',
      idempotencyKey: 'later-adjustment'
    })
  );

  expect(
    await coordinator.approvePayment(request)
  ).toEqual({
    ...original,
    replayed: true
  });

  expect((await account()).balance_cents).toBe('14000');
});

test('append-only and immutable guards remain enabled in the disposable schema', async () => {
  const original = await coordinator.purchaseOrder(purchase());

  await expect(
    pool.query(
      `UPDATE public.financial_operations
       SET reason = 'tampered'
       WHERE id = $1::UUID`,
      [original.operationId]
    )
  ).rejects.toMatchObject({
    code: '23514'
  });

  await expect(
    pool.query(
      `UPDATE public.orders
       SET fulfillment_target = 'changed_123'
       WHERE order_id = $1`,
      [original.orderId]
    )
  ).rejects.toMatchObject({
    code: '23514'
  });

  expect((await account()).balance_cents).toBe('9000');
});