-- REVIEW ONLY: outside db/migrations, so --apply cannot execute this draft.
-- Modern verified evidence only. Legacy/unverified documents need a separately
-- reviewed read-only import/archive plan; never manufacture evidence or rehash it.
-- Runtime financial writes remain disabled until repositories, privileges and
-- atomic user-balance/journal procedures have also been reviewed and tested.

CREATE FUNCTION public.usd_cents_text(value BIGINT) RETURNS TEXT
LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE SET search_path = pg_catalog AS $$
    SELECT (value / 100)::TEXT || '.' || lpad((value % 100)::TEXT, 2, '0');
$$;

-- Receipt identifiers may retain their historical Mongo spelling while internal
-- FKs use UUIDs. This does not decide JWT subject acceptance at cut-over.
CREATE FUNCTION public.receipt_reference_matches(value TEXT, identity UUID, legacy TEXT)
RETURNS BOOLEAN LANGUAGE SQL IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
    SELECT coalesce(value = identity::TEXT OR (legacy IS NOT NULL AND value = legacy), FALSE);
$$;

CREATE TABLE public.financial_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_mongo_id VARCHAR(24) COLLATE "C" UNIQUE
        CHECK (legacy_mongo_id IS NULL OR legacy_mongo_id ~ '^[a-f0-9]{24}$'),
    actor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    operation_type TEXT NOT NULL CHECK (operation_type IN
        ('balance_adjustment', 'balance_migration', 'order_debit', 'order_refund', 'payment_credit')),
    currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
    idempotency_key VARCHAR(128) COLLATE "C" NOT NULL
        CHECK (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
    payload_hash TEXT COLLATE "C" NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
    before_cents BIGINT NOT NULL CHECK (before_cents BETWEEN 0 AND 9007199254740991),
    after_cents BIGINT NOT NULL CHECK (after_cents BETWEEN 0 AND 9007199254740991),
    delta_cents BIGINT GENERATED ALWAYS AS (after_cents - before_cents) STORED,
    source_type TEXT CHECK (source_type IN ('order', 'payment', 'adjustment', 'user')),
    source_id UUID,
    effect TEXT CHECK (effect IN ('debit', 'refund', 'credit', 'adjustment', 'migration')),
    source_user_id UUID GENERATED ALWAYS AS
        (CASE WHEN source_type = 'user' THEN source_id END) STORED
        REFERENCES public.users(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
    -- Circular source FKs are added by 003/004, after their tables exist.
    source_payment_id UUID GENERATED ALWAYS AS
        (CASE WHEN source_type = 'payment' THEN source_id END) STORED,
    source_order_id UUID GENERATED ALWAYS AS
        (CASE WHEN source_type = 'order' THEN source_id END) STORED,
    reason VARCHAR(500) CHECK (reason IS NULL OR
        (char_length(btrim(reason)) >= 1 AND reason = btrim(reason))),
    result_balance_cents BIGINT GENERATED ALWAYS AS (after_cents) STORED,
    result_balance TEXT GENERATED ALWAYS AS (public.usd_cents_text(after_cents)) STORED,
    result_resource_id VARCHAR(128) COLLATE "C"
        CHECK (result_resource_id IS NULL OR
            (char_length(result_resource_id) >= 1 AND result_resource_id !~ '[[:space:]]')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT financial_actor_operation_idempotency
        UNIQUE (actor_id, operation_type, idempotency_key),
    CONSTRAINT financial_delta_direction CHECK (
        (operation_type = 'order_debit' AND delta_cents < 0) OR
        (operation_type IN ('order_refund', 'payment_credit') AND delta_cents > 0) OR
        (operation_type = 'balance_migration' AND delta_cents = 0) OR
        operation_type = 'balance_adjustment'),
    CONSTRAINT financial_source_contract CHECK (coalesce(
        (operation_type = 'balance_adjustment' AND reason IS NOT NULL AND (
            (source_type IS NULL AND source_id IS NULL AND effect IS NULL) OR
            (source_type = 'adjustment' AND source_id IS NOT NULL AND effect = 'adjustment'))) OR
        (operation_type = 'balance_migration' AND source_type = 'user'
            AND source_id = user_id AND effect = 'migration') OR
        (operation_type = 'order_debit' AND source_type = 'order'
            AND source_id IS NOT NULL AND effect = 'debit' AND actor_id = user_id
            AND result_resource_id IS NOT NULL) OR
        (operation_type = 'order_refund' AND source_type = 'order'
            AND source_id IS NOT NULL AND effect = 'refund' AND result_resource_id IS NOT NULL) OR
        (operation_type = 'payment_credit' AND source_type = 'payment'
            AND source_id IS NOT NULL AND effect = 'credit' AND result_resource_id IS NOT NULL), FALSE))
);

CREATE UNIQUE INDEX financial_source_effect_once ON public.financial_operations
    (source_type, source_id, effect)
    WHERE source_type IS NOT NULL AND source_id IS NOT NULL AND effect IS NOT NULL;
CREATE INDEX financial_user_history ON public.financial_operations
    (user_id, created_at DESC, id DESC);

CREATE FUNCTION public.financial_append_only_guard() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'FINANCIAL_JOURNAL_APPEND_ONLY';
END;
$$;
CREATE TRIGGER financial_no_update_delete BEFORE UPDATE OR DELETE
    ON public.financial_operations FOR EACH ROW
    EXECUTE FUNCTION public.financial_append_only_guard();
CREATE TRIGGER financial_no_truncate BEFORE TRUNCATE
    ON public.financial_operations FOR EACH STATEMENT
    EXECUTE FUNCTION public.financial_append_only_guard();

REVOKE ALL ON public.financial_operations FROM PUBLIC;
REVOKE ALL ON FUNCTION public.financial_append_only_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.usd_cents_text(BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.receipt_reference_matches(TEXT, UUID, TEXT) FROM PUBLIC;
-- Pure helpers above need explicit grants only when restricted runtime roles are
-- designed. No application grants or SECURITY DEFINER write functions are added.
-- A privileged owner can disable triggers: it must NOT be the runtime role.
