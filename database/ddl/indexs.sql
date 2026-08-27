-- Search and keyset pagination
CREATE INDEX IF NOT EXISTS idx_rw_messages_channel_created
ON rw_messages (channel_id, created_at DESC, id DESC);


-- Search by author
CREATE INDEX IF NOT EXISTS idx_rw_messages_user
ON rw_messages (user_id);


-- Channel membership lookup
CREATE INDEX IF NOT EXISTS idx_rw_channel_members_user
ON rw_channel_members (user_id, channel_id);


-- Refresh token lookup
CREATE INDEX IF NOT EXISTS idx_rw_refresh_tokens_user
ON rw_refresh_tokens (user_id);


-- Required UNIQUE PARTIAL INDEX
CREATE UNIQUE INDEX IF NOT EXISTS idx_rw_active_refresh_token_unique
ON rw_refresh_tokens (user_id)
WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rw_message_embeddings_vector
ON rw_message_embeddings
USING hnsw (embedding vector_cosine_ops);