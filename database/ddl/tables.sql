-- ============================================
-- RIWI INTERNAL MESSENGER
-- PostgreSQL DDL
-- ============================================

-- pgvector: extension required before creating rw_message_embeddings, which uses the
-- `vector` type. Usually enabled in Supabase, but must be explicitly declared for fresh databases.
CREATE EXTENSION IF NOT EXISTS vector;

-- USERS
CREATE TABLE IF NOT EXISTS rw_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(100) NOT NULL,

    email VARCHAR(255) NOT NULL,

    password_hash VARCHAR(255) NOT NULL,

    role VARCHAR(50) NOT NULL DEFAULT 'user',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT rw_users_email_unique
        UNIQUE (email),

    CONSTRAINT rw_users_role_check
        CHECK (role IN ('user', 'admin'))
);


-- CHANNELS
CREATE TABLE IF NOT EXISTS rw_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(100) NOT NULL,

    description VARCHAR(500),

    created_by UUID NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT rw_channels_created_by_fk
        FOREIGN KEY (created_by)
        REFERENCES rw_users(id)
        ON DELETE RESTRICT
);


-- CHANNEL MEMBERS
CREATE TABLE IF NOT EXISTS rw_channel_members (
    channel_id UUID NOT NULL,

    user_id UUID NOT NULL,

    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT rw_channel_members_pk
        PRIMARY KEY (channel_id, user_id),

    CONSTRAINT rw_channel_members_channel_fk
        FOREIGN KEY (channel_id)
        REFERENCES rw_channels(id)
        ON DELETE CASCADE,

    CONSTRAINT rw_channel_members_user_fk
        FOREIGN KEY (user_id)
        REFERENCES rw_users(id)
        ON DELETE CASCADE
);


-- MESSAGES
CREATE TABLE IF NOT EXISTS rw_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    channel_id UUID NOT NULL,

    user_id UUID NOT NULL,

    content TEXT NOT NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'sent',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    deleted_at TIMESTAMPTZ,

    CONSTRAINT rw_messages_channel_fk
        FOREIGN KEY (channel_id)
        REFERENCES rw_channels(id)
        ON DELETE RESTRICT,

    CONSTRAINT rw_messages_user_fk
        FOREIGN KEY (user_id)
        REFERENCES rw_users(id)
        ON DELETE RESTRICT,

    CONSTRAINT rw_messages_status_check
        CHECK (status IN ('pending', 'sent', 'failed', 'deleted')),

    CONSTRAINT rw_messages_content_check
        CHECK (length(trim(content)) > 0)
);


-- MESSAGE EMBEDDINGS (for RAG copilot — see database/MER.pdf)
CREATE TABLE IF NOT EXISTS rw_message_embeddings (
    message_id UUID PRIMARY KEY,

    embedding VECTOR(1536) NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT rw_message_embeddings_message_fk
        FOREIGN KEY (message_id)
        REFERENCES rw_messages(id)
        ON DELETE CASCADE
);


-- MESSAGE READ STATUS (read receipts, one row per message+user)
CREATE TABLE IF NOT EXISTS rw_message_read_status (
    message_id UUID NOT NULL,

    user_id UUID NOT NULL,

    read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT rw_message_read_status_pk
        PRIMARY KEY (message_id, user_id),

    CONSTRAINT rw_message_read_status_message_fk
        FOREIGN KEY (message_id)
        REFERENCES rw_messages(id)
        ON DELETE CASCADE,

    CONSTRAINT rw_message_read_status_user_fk
        FOREIGN KEY (user_id)
        REFERENCES rw_users(id)
        ON DELETE CASCADE
);


-- REFRESH TOKENS (sessions — see DECISIONS.md, token rotation section)
CREATE TABLE IF NOT EXISTS rw_refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL,

    token_hash VARCHAR(255) NOT NULL,

    expires_at TIMESTAMPTZ NOT NULL,

    revoked_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT rw_refresh_tokens_user_fk
        FOREIGN KEY (user_id)
        REFERENCES rw_users(id)
        ON DELETE CASCADE
);
