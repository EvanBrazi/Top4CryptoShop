-- REVIEW ONLY. Requires 002/003. No filesystem/provider/RPC work in these checks.
-- Catalog, selection, fulfillment and durable receipt snapshots are normalized,
-- immutable columns, not mutable JSON blobs. Future mapping preserves nested API
-- contracts and historical receipt references; full crypto/email validators remain
-- the existing pure Node validators (SQL shape checks are NOT checksum/ownership proof).
CREATE TABLE public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_mongo_id VARCHAR(24) COLLATE "C" UNIQUE
        CHECK (legacy_mongo_id IS NULL OR legacy_mongo_id ~ '^[a-f0-9]{24}$'),
    order_id VARCHAR(128) COLLATE "C" NOT NULL UNIQUE
        CHECK (order_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    financial_version SMALLINT NOT NULL CHECK (financial_version = 1), -- No legacy default.

    catalog_category TEXT NOT NULL CHECK (catalog_category IN ('apps', 'games', 'cryptos', 'balances')),
    catalog_product_id BIGINT NOT NULL CHECK (catalog_product_id BETWEEN 1 AND 9007199254740991),
    catalog_product_name VARCHAR(200) NOT NULL CHECK (char_length(catalog_product_name) >= 1),
    catalog_source_file TEXT NOT NULL CHECK (catalog_source_file IN
        ('cryptos.json', 'payments.json', 'mobile-payments.json', 'apps.json', 'games.json', 'balances.json')),
    catalog_revision TEXT COLLATE "C" NOT NULL CHECK (catalog_revision ~ '^[a-f0-9]{64}$'),
    catalog_pricing_version SMALLINT NOT NULL CHECK (catalog_pricing_version = 1),
    catalog_mode TEXT NOT NULL CHECK (catalog_mode IN ('package', 'proportional')),
    catalog_price_cents BIGINT NOT NULL CHECK (catalog_price_cents BETWEEN 1 AND 9007199254740991),
    catalog_base_quantity BIGINT NOT NULL CHECK (catalog_base_quantity BETWEEN 1 AND 9007199254740991),
    catalog_min_quantity BIGINT NOT NULL CHECK (catalog_min_quantity BETWEEN 1 AND 9007199254740991),
    catalog_max_quantity BIGINT NOT NULL CHECK (catalog_max_quantity BETWEEN 1 AND 9007199254740991),
    catalog_min_charge_cents BIGINT NOT NULL CHECK (catalog_min_charge_cents BETWEEN 1 AND 9007199254740991),
    catalog_max_charge_cents BIGINT NOT NULL CHECK (catalog_max_charge_cents BETWEEN 1 AND 9007199254740991),
    catalog_requires_fulfillment_target BOOLEAN NOT NULL,
    catalog_fulfillment_schema TEXT CHECK (catalog_fulfillment_schema IN
        ('accountId', 'playerId', 'walletAddress', 'email', 'phone')),
    catalog_fulfillment_validation_version SMALLINT NOT NULL CHECK (catalog_fulfillment_validation_version = 1),
    catalog_fulfillment_network TEXT,
    selection_package_index BIGINT CHECK (selection_package_index BETWEEN 0 AND 9007199254740991),
    selection_quantity BIGINT CHECK (selection_quantity BETWEEN 1 AND 9007199254740991),
    quantity BIGINT NOT NULL CHECK (quantity BETWEEN 1 AND 9007199254740991),
    charge_cents BIGINT NOT NULL CHECK (charge_cents BETWEEN 1 AND 9007199254740991),
    charge_currency TEXT NOT NULL DEFAULT 'USD' CHECK (charge_currency = 'USD'),
    amount NUMERIC(16,2) GENERATED ALWAYS AS (charge_cents::NUMERIC / 100) STORED,
    method TEXT GENERATED ALWAYS AS (catalog_category) STORED,
    service TEXT GENERATED ALWAYS AS (catalog_product_name) STORED,

    debit_operation_id UUID NOT NULL UNIQUE REFERENCES public.financial_operations(id)
        ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
    request_actor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    request_idempotency_key VARCHAR(128) COLLATE "C" NOT NULL
        CHECK (request_idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
    request_payload_hash TEXT COLLATE "C" NOT NULL CHECK (request_payload_hash ~ '^[a-f0-9]{64}$'),
    request_result_user_reference VARCHAR(36) COLLATE "C" NOT NULL,
    request_result_operation_reference VARCHAR(36) COLLATE "C" NOT NULL,
    request_result_balance_cents BIGINT NOT NULL CHECK (request_result_balance_cents BETWEEN 0 AND 9007199254740991),
    request_result_balance TEXT GENERATED ALWAYS AS (public.usd_cents_text(request_result_balance_cents)) STORED,
    fulfillment_schema TEXT,
    fulfillment_validation_version SMALLINT,
    fulfillment_network TEXT,
    fulfillment_target TEXT COLLATE "C",

    status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'cancelled')),
    decision_actor_id UUID REFERENCES public.users(id) ON DELETE RESTRICT,
    decision_type TEXT CHECK (decision_type IN ('complete', 'cancel')),
    decision_idempotency_key VARCHAR(128) COLLATE "C"
        CHECK (decision_idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
    decision_payload_hash TEXT COLLATE "C" CHECK (decision_payload_hash ~ '^[a-f0-9]{64}$'),
    decision_reason VARCHAR(500) CHECK (decision_reason IS NULL OR
        (char_length(btrim(decision_reason)) >= 1 AND decision_reason = btrim(decision_reason)
            AND decision_reason !~ '[[:cntrl:]<>&''"`]')),
    decided_at TIMESTAMPTZ,
    decision_result_user_reference VARCHAR(36) COLLATE "C",
    decision_result_operation_reference VARCHAR(36) COLLATE "C",
    decision_result_balance_cents BIGINT CHECK (decision_result_balance_cents BETWEEN 0 AND 9007199254740991),
    decision_result_balance TEXT GENERATED ALWAYS AS (public.usd_cents_text(decision_result_balance_cents)) STORED,
    refund_operation_id UUID UNIQUE REFERENCES public.financial_operations(id)
        ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
    refund_amount_cents BIGINT CHECK (refund_amount_cents BETWEEN 1 AND 9007199254740991),
    refunded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT order_purchase_actor_is_owner CHECK (request_actor_id = user_id),
    CONSTRAINT order_actor_purchase_idempotency UNIQUE (request_actor_id, request_idempotency_key),
    CONSTRAINT order_catalog_category_file CHECK (catalog_category = CASE catalog_source_file
        WHEN 'apps.json' THEN 'apps' WHEN 'games.json' THEN 'games' WHEN 'balances.json' THEN 'balances'
        WHEN 'cryptos.json' THEN 'cryptos' WHEN 'payments.json' THEN 'cryptos'
        WHEN 'mobile-payments.json' THEN 'cryptos' END),
    CONSTRAINT order_quantity_charge_bounds CHECK (
        catalog_min_quantity <= catalog_max_quantity AND quantity BETWEEN catalog_min_quantity AND catalog_max_quantity
        AND catalog_min_charge_cents <= catalog_max_charge_cents
        AND charge_cents BETWEEN catalog_min_charge_cents AND catalog_max_charge_cents),
    CONSTRAINT order_category_limits CHECK (
        (catalog_category = 'apps' AND catalog_min_quantity = 1 AND catalog_max_quantity = 1000000
            AND catalog_min_charge_cents = 50 AND catalog_max_charge_cents = 100000) OR
        (catalog_category = 'games' AND catalog_mode = 'package'
            AND catalog_min_charge_cents = 1 AND catalog_max_charge_cents = 50000) OR
        (catalog_category IN ('cryptos', 'balances') AND catalog_min_charge_cents = 1
            AND catalog_max_charge_cents = 9007199254740991)),
    CONSTRAINT order_selection_exact_pricing CHECK (coalesce(
        (catalog_mode = 'package' AND selection_package_index IS NOT NULL AND selection_quantity IS NULL
            AND quantity = catalog_base_quantity AND charge_cents = catalog_price_cents) OR
        (catalog_mode = 'proportional' AND selection_package_index IS NULL AND selection_quantity = quantity
            -- NUMERIC intermediates avoid BIGINT multiplication overflow; round half-up once.
            AND charge_cents::NUMERIC = floor((catalog_price_cents::NUMERIC * quantity
                + catalog_base_quantity::NUMERIC / 2) / catalog_base_quantity)), FALSE)),
    CONSTRAINT order_fulfillment_policy CHECK (coalesce(
        (NOT catalog_requires_fulfillment_target AND catalog_fulfillment_schema IS NULL
            AND catalog_fulfillment_network IS NULL AND fulfillment_schema IS NULL
            AND fulfillment_validation_version IS NULL AND fulfillment_network IS NULL AND fulfillment_target IS NULL) OR
        (catalog_requires_fulfillment_target AND catalog_fulfillment_schema = CASE catalog_source_file
            WHEN 'cryptos.json' THEN 'walletAddress' WHEN 'payments.json' THEN 'accountId'
            WHEN 'mobile-payments.json' THEN 'phone' WHEN 'apps.json' THEN 'accountId'
            WHEN 'games.json' THEN 'playerId' WHEN 'balances.json' THEN 'playerId' END
            AND fulfillment_schema = catalog_fulfillment_schema AND fulfillment_validation_version = 1
            AND fulfillment_network IS NOT DISTINCT FROM catalog_fulfillment_network AND fulfillment_target IS NOT NULL
            AND ((fulfillment_schema = 'walletAddress' AND catalog_fulfillment_network IN
                ('bitcoin-mainnet','ethereum-mainnet','tron-mainnet','bsc-mainnet')) OR
                (fulfillment_schema <> 'walletAddress' AND catalog_fulfillment_network IS NULL))), FALSE)),
    CONSTRAINT order_fulfillment_canonical_shape CHECK (coalesce(
        fulfillment_target IS NULL OR (fulfillment_target = btrim(fulfillment_target) AND
        CASE fulfillment_schema
            WHEN 'accountId' THEN fulfillment_target ~ '^[A-Za-z0-9_-]{3,32}$'
            WHEN 'playerId' THEN fulfillment_target ~ '^[A-Za-z0-9_-]{3,32}$'
            WHEN 'phone' THEN fulfillment_target ~ '^\+[1-9][0-9]{6,14}$'
            WHEN 'walletAddress' THEN CASE fulfillment_network
                WHEN 'ethereum-mainnet' THEN fulfillment_target ~ '^0x[0-9a-f]{40}$'
                    AND fulfillment_target <> '0x0000000000000000000000000000000000000000'
                WHEN 'bsc-mainnet' THEN fulfillment_target ~ '^0x[0-9a-f]{40}$'
                    AND fulfillment_target <> '0x0000000000000000000000000000000000000000'
                WHEN 'tron-mainnet' THEN fulfillment_target ~ '^T[1-9A-HJ-NP-Za-km-z]{33}$'
                WHEN 'bitcoin-mainnet' THEN fulfillment_target ~ '^[13][1-9A-HJ-NP-Za-km-z]{25,34}$'
                    OR (char_length(fulfillment_target) <= 90 AND fulfillment_target ~ '^bc1[ac-hj-np-z02-9]+$')
                ELSE FALSE END
            WHEN 'email' THEN char_length(fulfillment_target) <= 254
                AND fulfillment_target ~ '^[!-~]+@[A-Za-z0-9.-]+$'
                AND fulfillment_target !~ '[<>&''"`\\]'
            ELSE FALSE END), FALSE)),
    CONSTRAINT order_state_evidence CHECK (coalesce(
        (status = 'pending' AND decision_actor_id IS NULL AND decision_type IS NULL
            AND decision_idempotency_key IS NULL AND decision_payload_hash IS NULL AND decision_reason IS NULL
            AND decided_at IS NULL AND decision_result_user_reference IS NULL
            AND decision_result_operation_reference IS NULL AND decision_result_balance_cents IS NULL
            AND refund_operation_id IS NULL AND refund_amount_cents IS NULL AND refunded_at IS NULL) OR
        (status IN ('completed', 'cancelled') AND decision_actor_id IS NOT NULL AND decision_idempotency_key IS NOT NULL
            AND decision_payload_hash IS NOT NULL AND decision_reason IS NOT NULL AND decided_at IS NOT NULL
            AND decision_result_user_reference IS NOT NULL AND
            ((status = 'completed' AND decision_type = 'complete' AND decision_result_operation_reference IS NULL
                AND decision_result_balance_cents IS NULL AND refund_operation_id IS NULL
                AND refund_amount_cents IS NULL AND refunded_at IS NULL) OR
            (status = 'cancelled' AND decision_type = 'cancel' AND decision_result_operation_reference IS NOT NULL
                AND decision_result_balance_cents IS NOT NULL AND refund_operation_id IS NOT NULL
                AND refund_amount_cents = charge_cents AND refunded_at IS NOT NULL))), FALSE))
);

CREATE UNIQUE INDEX order_actor_decision_idempotency ON public.orders
    (decision_actor_id, decision_type, decision_idempotency_key) WHERE decision_actor_id IS NOT NULL;
CREATE INDEX order_owner_history ON public.orders (user_id, created_at DESC, id DESC);
CREATE INDEX order_pending_queue ON public.orders (financial_version, status, created_at DESC, id DESC);
ALTER TABLE public.financial_operations ADD CONSTRAINT financial_order_source_fk
    FOREIGN KEY (source_order_id) REFERENCES public.orders(id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION public.order_immutable_guard() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status IS DISTINCT FROM 'pending' THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ORDER_CREATION_MUST_BE_PENDING';
        END IF;
        RETURN NEW;
    END IF;
    IF TG_OP <> 'UPDATE' THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ORDER_DELETE_OR_TRUNCATE_DISABLED';
    END IF;
    IF OLD.status IS DISTINCT FROM 'pending' OR NEW.status NOT IN ('completed', 'cancelled') OR
       (to_jsonb(NEW) - ARRAY['status','decision_actor_id','decision_type','decision_idempotency_key',
        'decision_payload_hash','decision_reason','decided_at','decision_result_user_reference',
        'decision_result_operation_reference','decision_result_balance_cents','refund_operation_id',
        'refund_amount_cents','refunded_at','amount','method','service','request_result_balance','decision_result_balance']) IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status','decision_actor_id','decision_type','decision_idempotency_key',
        'decision_payload_hash','decision_reason','decided_at','decision_result_user_reference',
        'decision_result_operation_reference','decision_result_balance_cents','refund_operation_id',
        'refund_amount_cents','refunded_at','amount','method','service','request_result_balance','decision_result_balance']) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'UNSAFE_ORDER_UPDATE';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER order_immutable_rows BEFORE INSERT OR UPDATE OR DELETE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.order_immutable_guard();
CREATE TRIGGER order_no_truncate BEFORE TRUNCATE ON public.orders
    FOR EACH STATEMENT EXECUTE FUNCTION public.order_immutable_guard();

CREATE FUNCTION public.order_journal_evidence_guard() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
    o public.orders%ROWTYPE;
    debit public.financial_operations%ROWTYPE;
    refund public.financial_operations%ROWTYPE;
    owner_legacy TEXT;
BEGIN
    IF TG_TABLE_NAME = 'financial_operations' THEN
        IF NEW.source_type IS DISTINCT FROM 'order' THEN RETURN NULL; END IF;
        SELECT * INTO o FROM public.orders WHERE id = NEW.source_id;
    ELSE
        SELECT * INTO o FROM public.orders WHERE id = NEW.id;
    END IF;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ORDER_SOURCE_MISSING'; END IF;
    SELECT legacy_mongo_id INTO owner_legacy FROM public.users WHERE id = o.user_id;
    IF NOT public.receipt_reference_matches(o.request_result_user_reference, o.user_id, owner_legacy) OR
       (o.status <> 'pending' AND NOT public.receipt_reference_matches(o.decision_result_user_reference, o.user_id, owner_legacy)) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ORDER_RECEIPT_OWNER_MISMATCH';
    END IF;
    SELECT * INTO debit FROM public.financial_operations WHERE id = o.debit_operation_id;
    IF NOT FOUND OR debit.operation_type IS DISTINCT FROM 'order_debit' OR debit.currency IS DISTINCT FROM 'USD'
       OR debit.source_type IS DISTINCT FROM 'order' OR debit.source_id IS DISTINCT FROM o.id
       OR debit.effect IS DISTINCT FROM 'debit' OR debit.user_id IS DISTINCT FROM o.user_id
       OR debit.actor_id IS DISTINCT FROM o.request_actor_id OR debit.delta_cents IS DISTINCT FROM -o.charge_cents
       OR debit.idempotency_key IS DISTINCT FROM o.request_idempotency_key
       OR debit.payload_hash IS DISTINCT FROM o.request_payload_hash OR debit.result_resource_id IS DISTINCT FROM o.order_id
       OR debit.after_cents IS DISTINCT FROM o.request_result_balance_cents
       OR NOT public.receipt_reference_matches(o.request_result_operation_reference, debit.id, debit.legacy_mongo_id) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ORDER_DEBIT_EVIDENCE_MISMATCH';
    END IF;
    IF o.status = 'cancelled' THEN
        SELECT * INTO refund FROM public.financial_operations WHERE id = o.refund_operation_id;
        IF NOT FOUND OR refund.operation_type IS DISTINCT FROM 'order_refund' OR refund.currency IS DISTINCT FROM 'USD'
           OR refund.source_type IS DISTINCT FROM 'order' OR refund.source_id IS DISTINCT FROM o.id
           OR refund.effect IS DISTINCT FROM 'refund' OR refund.user_id IS DISTINCT FROM o.user_id
           OR refund.actor_id IS DISTINCT FROM o.decision_actor_id OR refund.delta_cents IS DISTINCT FROM o.charge_cents
           OR refund.idempotency_key IS DISTINCT FROM o.decision_idempotency_key
           OR refund.payload_hash IS DISTINCT FROM o.decision_payload_hash OR refund.reason IS DISTINCT FROM o.decision_reason
           OR refund.result_resource_id IS DISTINCT FROM o.order_id
           OR refund.after_cents IS DISTINCT FROM o.decision_result_balance_cents
           OR NOT public.receipt_reference_matches(o.decision_result_operation_reference, refund.id, refund.legacy_mongo_id) THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ORDER_REFUND_EVIDENCE_MISMATCH';
        END IF;
    ELSIF EXISTS (SELECT 1 FROM public.financial_operations WHERE source_type = 'order' AND source_id = o.id AND effect = 'refund') THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'UNCANCELLED_ORDER_CANNOT_HAVE_REFUND';
    END IF;
    -- Branch BEFORE accessing operation_type: orders has no such NEW field.
    IF TG_TABLE_NAME = 'financial_operations' THEN
        IF NOT coalesce((NEW.operation_type = 'order_debit' AND NEW.id = debit.id) OR
            (NEW.operation_type = 'order_refund' AND o.status = 'cancelled' AND NEW.id = refund.id), FALSE) THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ORDER_JOURNAL_SOURCE_MISMATCH';
        END IF;
    END IF;
    RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER order_financial_evidence_guard AFTER INSERT OR UPDATE ON public.orders
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.order_journal_evidence_guard();
CREATE CONSTRAINT TRIGGER order_journal_source_guard AFTER INSERT ON public.financial_operations
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.order_journal_evidence_guard();

REVOKE ALL ON public.orders FROM PUBLIC;
REVOKE ALL ON FUNCTION public.order_immutable_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.order_journal_evidence_guard() FROM PUBLIC;
-- Completion is a manual admin fulfillment assertion, never provider delivery proof.
-- Full refund equals the stored original charge, not current catalog pricing.
-- Hidden targets/requests/decisions require explicit private projections, never SELECT *.
