-- REVIEW ONLY. Requires 002; never applies automatically from this directory.
-- Snapshot/receipt fields are normalized immutable columns. Future API mapping
-- reconstructs the existing nested receipt/decision/result contract and omits
-- monetary fields on rejection (it must not serialize SQL NULLs as new claims).
CREATE TABLE public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_mongo_id VARCHAR(24) COLLATE "C" UNIQUE
        CHECK (legacy_mongo_id IS NULL OR legacy_mongo_id ~ '^[a-f0-9]{24}$'),
    payment_id VARCHAR(128) COLLATE "C" NOT NULL UNIQUE
        CHECK (payment_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    submission_version SMALLINT NOT NULL CHECK (submission_version = 1), -- No legacy default.
    -- Two-decimal CLAIMED source-currency amount, never a verified USD quote.
    claimed_amount_minor BIGINT NOT NULL CHECK (claimed_amount_minor BETWEEN 1 AND 9007199254740991),
    amount NUMERIC(16,2) GENERATED ALWAYS AS (claimed_amount_minor::NUMERIC / 100) STORED,
    currency TEXT NOT NULL CHECK (currency IN ('USD', 'SYP', 'USDT')),
    amount_cents BIGINT CHECK (amount_cents BETWEEN 1 AND 9007199254740991),
    amount_in_usd NUMERIC(16,2) GENERATED ALWAYS AS (coalesce(amount_cents, 0)::NUMERIC / 100) STORED,
    method TEXT NOT NULL CHECK (method IN
        ('visa', 'shamcashdol', 'shamcash', 'syriatel', 'mtn', 'bank', 'webmoney', 'usdt')),
    note VARCHAR(500) CHECK (note IS NULL OR note = btrim(note)),
    receipt_public_id TEXT NOT NULL CHECK (receipt_public_id ~
        '^private_payment_receipts/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'),
    receipt_format TEXT NOT NULL CHECK (receipt_format = 'jpg'),
    receipt_delivery_type TEXT NOT NULL CHECK (receipt_delivery_type = 'authenticated'),
    status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'cancelled')),
    decision_actor_id UUID REFERENCES public.users(id) ON DELETE RESTRICT,
    decision_type TEXT CHECK (decision_type IN ('approve', 'reject')),
    decision_idempotency_key VARCHAR(128) COLLATE "C"
        CHECK (decision_idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
    decision_payload_hash TEXT COLLATE "C" CHECK (decision_payload_hash ~ '^[a-f0-9]{64}$'),
    decision_reason VARCHAR(500) CHECK (decision_reason IS NULL OR
        (char_length(btrim(decision_reason)) >= 1 AND decision_reason = btrim(decision_reason))),
    decided_at TIMESTAMPTZ,
    decision_operation_id UUID UNIQUE REFERENCES public.financial_operations(id)
        ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
    decision_result_user_reference VARCHAR(36) COLLATE "C",
    decision_result_operation_reference VARCHAR(36) COLLATE "C",
    decision_result_balance_cents BIGINT CHECK (decision_result_balance_cents BETWEEN 0 AND 9007199254740991),
    decision_result_balance TEXT GENERATED ALWAYS AS
        (public.usd_cents_text(decision_result_balance_cents)) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Matches current config/paymentMethods.js; a policy change needs a reviewed
    -- versioned SQL change, not retroactive mutation of submitted claims.
    CONSTRAINT payment_claim_policy CHECK (
        (method = 'visa' AND currency = 'USD' AND claimed_amount_minor BETWEEN 1000 AND 10000) OR
        (method = 'shamcashdol' AND currency = 'USD' AND claimed_amount_minor BETWEEN 1000 AND 20000000) OR
        (method = 'shamcash' AND currency = 'SYP' AND claimed_amount_minor BETWEEN 1000000 AND 20000000000) OR
        (method IN ('syriatel', 'mtn') AND currency = 'SYP' AND claimed_amount_minor BETWEEN 500000 AND 55000000) OR
        (method = 'bank' AND currency = 'USD' AND claimed_amount_minor BETWEEN 5000 AND 100000) OR
        (method = 'webmoney' AND currency = 'USD' AND claimed_amount_minor BETWEEN 2000 AND 20000000) OR
        (method = 'usdt' AND currency = 'USDT' AND claimed_amount_minor BETWEEN 1000 AND 20000000000)),
    CONSTRAINT payment_state_evidence CHECK (coalesce(
        (status = 'pending' AND amount_cents IS NULL AND decision_actor_id IS NULL
            AND decision_type IS NULL AND decision_idempotency_key IS NULL AND decision_payload_hash IS NULL
            AND decision_reason IS NULL AND decided_at IS NULL AND decision_operation_id IS NULL
            AND decision_result_user_reference IS NULL AND decision_result_operation_reference IS NULL
            AND decision_result_balance_cents IS NULL) OR
        (status IN ('completed', 'cancelled') AND decision_actor_id IS NOT NULL
            AND decision_idempotency_key IS NOT NULL AND decision_payload_hash IS NOT NULL
            AND decision_reason IS NOT NULL AND decided_at IS NOT NULL AND decision_result_user_reference IS NOT NULL
            AND ((status = 'completed' AND decision_type = 'approve' AND amount_cents IS NOT NULL
                AND decision_operation_id IS NOT NULL AND decision_result_operation_reference IS NOT NULL
                AND decision_result_balance_cents IS NOT NULL) OR
                (status = 'cancelled' AND decision_type = 'reject' AND amount_cents IS NULL
                AND decision_operation_id IS NULL AND decision_result_operation_reference IS NULL
                AND decision_result_balance_cents IS NULL))), FALSE))
);

CREATE UNIQUE INDEX payment_actor_decision_idempotency ON public.payments
    (decision_actor_id, decision_type, decision_idempotency_key) WHERE decision_actor_id IS NOT NULL;
CREATE INDEX payment_owner_history ON public.payments (user_id, created_at DESC, id DESC);
CREATE INDEX payment_pending_queue ON public.payments (status, created_at DESC, id DESC);
ALTER TABLE public.financial_operations ADD CONSTRAINT financial_payment_source_fk
    FOREIGN KEY (source_payment_id) REFERENCES public.payments(id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION public.payment_immutable_guard() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status IS DISTINCT FROM 'pending' THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PAYMENT_CREATION_MUST_BE_PENDING';
        END IF;
        RETURN NEW;
    END IF;
    IF TG_OP <> 'UPDATE' THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PAYMENT_DELETE_OR_TRUNCATE_DISABLED';
    END IF;
    IF OLD.status IS DISTINCT FROM 'pending' OR NEW.status NOT IN ('completed', 'cancelled') OR
       (to_jsonb(NEW) - ARRAY['status','amount_cents','decision_actor_id','decision_type',
        'decision_idempotency_key','decision_payload_hash','decision_reason','decided_at',
        'decision_operation_id','decision_result_user_reference','decision_result_operation_reference',
        'decision_result_balance_cents','amount','amount_in_usd','decision_result_balance']) IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status','amount_cents','decision_actor_id','decision_type',
        'decision_idempotency_key','decision_payload_hash','decision_reason','decided_at',
        'decision_operation_id','decision_result_user_reference','decision_result_operation_reference',
        'decision_result_balance_cents','amount','amount_in_usd','decision_result_balance']) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'UNSAFE_PAYMENT_UPDATE';
    END IF;
    -- Generated fields are excluded: their NEW values are computed after BEFORE triggers.
    RETURN NEW;
END;
$$;
CREATE TRIGGER payment_immutable_rows BEFORE INSERT OR UPDATE OR DELETE ON public.payments
    FOR EACH ROW EXECUTE FUNCTION public.payment_immutable_guard();
CREATE TRIGGER payment_no_truncate BEFORE TRUNCATE ON public.payments
    FOR EACH STATEMENT EXECUTE FUNCTION public.payment_immutable_guard();

-- Check FINAL transaction state, not the stale NEW image of an earlier pending
-- INSERT. Both sides are checked, so orphan credits and mismatched decisions fail.
CREATE FUNCTION public.payment_journal_evidence_guard() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
    p public.payments%ROWTYPE;
    j public.financial_operations%ROWTYPE;
    owner_legacy TEXT;
BEGIN
    IF TG_TABLE_NAME = 'financial_operations' THEN
        IF NEW.source_type IS DISTINCT FROM 'payment' THEN RETURN NULL; END IF;
        SELECT * INTO p FROM public.payments WHERE id = NEW.source_id;
    ELSE
        SELECT * INTO p FROM public.payments WHERE id = NEW.id;
    END IF;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PAYMENT_SOURCE_MISSING';
    END IF;
    IF p.status <> 'pending' THEN
        SELECT legacy_mongo_id INTO owner_legacy FROM public.users WHERE id = p.user_id;
        IF NOT public.receipt_reference_matches(p.decision_result_user_reference, p.user_id, owner_legacy) THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PAYMENT_RECEIPT_OWNER_MISMATCH';
        END IF;
    END IF;
    IF p.status <> 'completed' THEN
        IF EXISTS (SELECT 1 FROM public.financial_operations WHERE source_type = 'payment' AND source_id = p.id) THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'UNAPPROVED_PAYMENT_CANNOT_HAVE_CREDIT';
        END IF;
        RETURN NULL;
    END IF;
    SELECT * INTO j FROM public.financial_operations WHERE id = p.decision_operation_id;
    IF NOT FOUND OR j.operation_type IS DISTINCT FROM 'payment_credit' OR j.currency IS DISTINCT FROM 'USD'
       OR j.source_type IS DISTINCT FROM 'payment' OR j.source_id IS DISTINCT FROM p.id
       OR j.effect IS DISTINCT FROM 'credit' OR j.user_id IS DISTINCT FROM p.user_id
       OR j.actor_id IS DISTINCT FROM p.decision_actor_id OR j.delta_cents IS DISTINCT FROM p.amount_cents
       OR j.idempotency_key IS DISTINCT FROM p.decision_idempotency_key
       OR j.payload_hash IS DISTINCT FROM p.decision_payload_hash OR j.reason IS DISTINCT FROM p.decision_reason
       OR j.result_resource_id IS DISTINCT FROM p.payment_id
       OR j.after_cents IS DISTINCT FROM p.decision_result_balance_cents
       OR NOT public.receipt_reference_matches(p.decision_result_operation_reference, j.id, j.legacy_mongo_id)
       OR (TG_TABLE_NAME = 'financial_operations' AND NEW.id IS DISTINCT FROM j.id) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PAYMENT_JOURNAL_EVIDENCE_MISMATCH';
    END IF;
    RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER payment_decision_journal_guard AFTER INSERT OR UPDATE ON public.payments
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.payment_journal_evidence_guard();
CREATE CONSTRAINT TRIGGER payment_credit_source_guard AFTER INSERT ON public.financial_operations
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.payment_journal_evidence_guard();

REVOKE ALL ON public.payments FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payment_immutable_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payment_journal_evidence_guard() FROM PUBLIC;
-- No private receipt metadata or decision history may appear in public SELECT *.
-- Approval remains a manual administrator assertion, never automatic FX/provider proof.
