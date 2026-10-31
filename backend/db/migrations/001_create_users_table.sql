-- REVIEW DRAFT ONLY. Apply only after approval, through db/migrate.js.
-- Neon/PostgreSQL 13+ provides gen_random_uuid() without installing an extension.
-- This is the ONLY application table in this migration. Financial writes are
-- NOT ready: journal coupling and restricted runtime roles belong to later work.
CREATE TABLE public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Keep the import mapping until all references have been mapped to UUIDs.
    -- JWT legacy-subject compatibility versus forced re-login is a cut-over
    -- decision; keeping this column does not choose either authentication policy.
    legacy_mongo_id VARCHAR(24) COLLATE "C" UNIQUE
        CHECK (legacy_mongo_id IS NULL OR legacy_mongo_id ~ '^[a-f0-9]{24}$'),

    username VARCHAR(30) COLLATE "C" NOT NULL UNIQUE
        CHECK (username ~ '^[a-zA-Z0-9_]{3,30}$'),
    password_hash TEXT,
    email TEXT NOT NULL UNIQUE
        CHECK (char_length(email) BETWEEN 3 AND 254 AND email = lower(btrim(email))),
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    -- Preserve exact-string sparse uniqueness. Country-aware validator stays
    -- in the future application layer; existing valid phones may be formatted.
    phone TEXT UNIQUE CHECK (phone IS NULL OR phone LIKE '+%'),
    google_id TEXT UNIQUE,
    provider TEXT NOT NULL DEFAULT 'local' CHECK (provider IN ('local', 'google')),

    theme SMALLINT NOT NULL DEFAULT 0 CHECK (theme IN (0, 1)),
    balance_cents BIGINT NOT NULL DEFAULT 0
        CHECK (balance_cents BETWEEN 0 AND 9007199254740991),
    -- Exact decimal compatibility mirror, never independently writable.
    -- pg returns BIGINT and NUMERIC as strings. Future boundary mapping must
    -- also enforce the existing JavaScript numeric-mirror round-trip check.
    balance NUMERIC(16,2) GENERATED ALWAYS AS (balance_cents::NUMERIC / 100) STORED,
    avatar TEXT NOT NULL DEFAULT '',

    login_attempts SMALLINT NOT NULL DEFAULT 0 CHECK (login_attempts BETWEEN 0 AND 5),
    last_login TIMESTAMPTZ,
    activated_at TIMESTAMPTZ,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'moderator')),
    account_status TEXT NOT NULL DEFAULT 'active'
        CHECK (account_status IN ('active', 'suspended', 'deactivated')),

    two_fa_secret TEXT,
    two_fa_status TEXT NOT NULL DEFAULT 'disabled'
        CHECK (two_fa_status IN ('disabled', 'pending', 'enabled')),
    two_fa_activated_at TIMESTAMPTZ,
    token_version BIGINT NOT NULL DEFAULT 0
        CHECK (token_version BETWEEN 0 AND 9007199254740991),
    two_fa_method TEXT CHECK (two_fa_method IS NULL OR two_fa_method IN ('qr', 'email')),
    two_fa_attempts INTEGER NOT NULL DEFAULT 0 CHECK (two_fa_attempts >= 0),
    -- Preserve embedded device IDs/dates (including legacy subdocument _id).
    -- Per-device validation and public projection stay in the future mapper.
    trusted_devices JSONB NOT NULL DEFAULT '[]'::JSONB
        CHECK (jsonb_typeof(trusted_devices) = 'array'),
    reset_password_token TEXT
        CHECK (reset_password_token IS NULL OR reset_password_token ~ '^[a-f0-9]{64}$'),
    reset_password_expires TIMESTAMPTZ,

    row_version BIGINT NOT NULL DEFAULT 0
        CHECK (row_version BETWEEN 0 AND 9007199254740991),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT users_local_password_required CHECK (provider <> 'local' OR password_hash IS NOT NULL),
    CONSTRAINT users_bcrypt_hash CHECK (password_hash IS NULL OR
        password_hash ~ '^\$2[aby]\$(0[4-9]|[12][0-9]|3[01])\$[./A-Za-z0-9]{53}$')
);

-- Keep current case-sensitive username uniqueness. This is deliberately NOT a
-- unique lower(username) index: that would silently change existing policy.
-- Import must flag Foo/foo collisions; future login must fail closed on ambiguity.
CREATE INDEX users_username_login_idx ON public.users (lower(username));
CREATE INDEX users_role_idx ON public.users (role);
CREATE INDEX users_account_status_idx ON public.users (account_status);
CREATE INDEX users_two_fa_status_idx ON public.users (two_fa_status);
CREATE INDEX users_username_email_idx ON public.users (username, email);

-- Preserve automatic timestamps/versioning and strengthen token revocation.
-- Future writes must use WHERE row_version = $expected for optimistic locking;
-- this trigger alone cannot detect a stale client update.
CREATE FUNCTION public.users_metadata_guard() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.legacy_mongo_id IS DISTINCT FROM OLD.legacy_mongo_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'User identity and creation time are immutable';
    END IF;
    IF NEW.token_version < OLD.token_version THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Token version cannot decrease';
    END IF;
    IF NEW.password_hash IS DISTINCT FROM OLD.password_hash THEN
        IF OLD.token_version >= 9007199254740991 THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Token version exhausted';
        END IF;
        -- Avoid doubling a future application's explicit token_version + 1.
        NEW.token_version := greatest(NEW.token_version, OLD.token_version + 1);
    END IF;
    IF OLD.row_version >= 9007199254740991 THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Row version exhausted';
    END IF;
    NEW.row_version := OLD.row_version + 1;
    NEW.updated_at := statement_timestamp();
    RETURN NEW;
END;
$$;

CREATE TRIGGER users_metadata_guard BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.users_metadata_guard();
REVOKE ALL ON public.users FROM PUBLIC;
REVOKE ALL ON FUNCTION public.users_metadata_guard() FROM PUBLIC;
-- No runtime-role grants yet. API secrets must never use SELECT * in future
-- repositories: SQL does not implement Mongoose select:false / toJSON hiding.
-- No plaintext passwords, imports, nonzero balance seeds or other domain tables.
