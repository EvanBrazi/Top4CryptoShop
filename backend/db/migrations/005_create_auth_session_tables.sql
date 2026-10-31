-- Approved persistence foundation only. Requires migrations 001–004.
-- No automatic application or runtime-role grants.
CREATE TABLE public.express_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sid_digest TEXT COLLATE "C" NOT NULL UNIQUE
        CHECK (sid_digest ~ '^[a-f0-9]{64}$'),
    user_id UUID REFERENCES public.users(id) ON DELETE RESTRICT,
    session_data JSONB NOT NULL CHECK (jsonb_typeof(session_data) = 'object'),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    row_version BIGINT NOT NULL DEFAULT 0 CHECK (row_version BETWEEN 0 AND 9007199254740991),
    created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
    CONSTRAINT express_session_expiry CHECK (expires_at > created_at),
    CONSTRAINT express_session_revocation CHECK (
        revoked_at IS NULL OR (revoked_at >= created_at AND session_data = '{}'::JSONB)),
    CONSTRAINT express_session_identity_owner UNIQUE (id, user_id)
);
CREATE INDEX express_session_expiry ON public.express_sessions (expires_at, id);
CREATE INDEX express_session_owner ON public.express_sessions (user_id, id) WHERE user_id IS NOT NULL;

CREATE TABLE public.application_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_digest TEXT COLLATE "C" NOT NULL UNIQUE CHECK (session_digest ~ '^[a-f0-9]{64}$'),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    express_session_id UUID NOT NULL,
    token_digest TEXT COLLATE "C" NOT NULL UNIQUE CHECK (token_digest ~ '^[a-f0-9]{64}$'),
    token_version BIGINT NOT NULL CHECK (token_version BETWEEN 0 AND 9007199254740991),
    issued_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    revocation_reason TEXT CHECK (revocation_reason IN (
        'logout', 'password_change', 'account_status_change', 'identity_change',
        'two_fa_change', 'administrative_revocation', 'express_session_destroyed')),
    CONSTRAINT application_session_express_owner FOREIGN KEY (express_session_id, user_id)
        REFERENCES public.express_sessions(id, user_id) ON DELETE CASCADE,
    CONSTRAINT application_session_expiry CHECK (expires_at > issued_at),
    CONSTRAINT application_session_revocation CHECK (
        (revoked_at IS NULL AND revocation_reason IS NULL) OR
        (revoked_at IS NOT NULL AND revoked_at >= issued_at AND revocation_reason IS NOT NULL))
);
CREATE INDEX application_session_expiry ON public.application_sessions (expires_at, id);
CREATE INDEX application_session_active_owner ON public.application_sessions (user_id, id) WHERE revoked_at IS NULL;
CREATE INDEX application_session_express_parent ON public.application_sessions (express_session_id, id);

CREATE TABLE public.token_revocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_digest TEXT COLLATE "C" NOT NULL UNIQUE CHECK (token_digest ~ '^[a-f0-9]{64}$'),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    revoked_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
    expires_at TIMESTAMPTZ NOT NULL,
    reason TEXT NOT NULL CHECK (reason IN (
        'logout', 'password_change', 'account_status_change', 'identity_change',
        'two_fa_change', 'administrative_revocation')),
    CONSTRAINT token_revocation_expiry CHECK (expires_at > revoked_at)
);
CREATE INDEX token_revocation_expiry ON public.token_revocations (expires_at, id);
CREATE INDEX token_revocation_owner ON public.token_revocations (user_id, revoked_at DESC, id DESC);

CREATE FUNCTION public.express_session_guard() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.sid_digest IS DISTINCT FROM OLD.sid_digest
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR (OLD.user_id IS NOT NULL AND NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'EXPRESS_SESSION_IDENTITY_IMMUTABLE';
    END IF;
    IF OLD.revoked_at IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'EXPRESS_SESSION_REVOKED';
    END IF;
    IF OLD.expires_at <= statement_timestamp() AND NEW.revoked_at IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'EXPRESS_SESSION_EXPIRED';
    END IF;
    IF OLD.row_version >= 9007199254740991 THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'EXPRESS_SESSION_VERSION_EXHAUSTED';
    END IF;
    NEW.row_version := OLD.row_version + 1;
    NEW.updated_at := statement_timestamp();
    RETURN NEW;
END;
$$;
CREATE TRIGGER express_session_update_guard BEFORE UPDATE ON public.express_sessions
    FOR EACH ROW EXECUTE FUNCTION public.express_session_guard();

CREATE FUNCTION public.application_session_guard() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    IF OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL OR NEW.revocation_reason IS NULL
       OR (to_jsonb(NEW) - ARRAY['revoked_at', 'revocation_reason']) IS DISTINCT FROM
          (to_jsonb(OLD) - ARRAY['revoked_at', 'revocation_reason']) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'UNSAFE_APPLICATION_SESSION_UPDATE';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER application_session_update_guard BEFORE UPDATE ON public.application_sessions
    FOR EACH ROW EXECUTE FUNCTION public.application_session_guard();

CREATE FUNCTION public.token_revocation_guard() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.expires_at <= statement_timestamp() THEN RETURN OLD; END IF;
    END IF;
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TOKEN_REVOCATION_IMMUTABLE';
END;
$$;
CREATE TRIGGER token_revocation_row_guard BEFORE UPDATE OR DELETE ON public.token_revocations
    FOR EACH ROW EXECUTE FUNCTION public.token_revocation_guard();
CREATE TRIGGER token_revocation_no_truncate BEFORE TRUNCATE ON public.token_revocations
    FOR EACH STATEMENT EXECUTE FUNCTION public.token_revocation_guard();

REVOKE ALL ON public.express_sessions FROM PUBLIC;
REVOKE ALL ON public.application_sessions FROM PUBLIC;
REVOKE ALL ON public.token_revocations FROM PUBLIC;
REVOKE ALL ON FUNCTION public.express_session_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.application_session_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.token_revocation_guard() FROM PUBLIC;
