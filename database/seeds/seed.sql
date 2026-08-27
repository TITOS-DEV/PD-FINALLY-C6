-- Clean up previous data if exists
TRUNCATE TABLE rw_refresh_tokens, rw_message_read_status, rw_message_embeddings, rw_messages, rw_channel_members, rw_channels, rw_users CASCADE;

-- 1. INSERT USERS (Password: Password123!)
INSERT INTO rw_users (id, name, email, password_hash, role) VALUES
('11111111-1111-1111-1111-111111111111', 'Admin Riwi', 'admin@riwi.io', '$2a$10$p.XY0cizUtiXHr/TsN/pVek3fdP/A.ldDFnHC394fIm8c7x8AlBri', 'admin'),
('22222222-2222-2222-2222-222222222222', 'Jhonatan Cadavid', 'jhonatan@riwi.io', '$2a$10$p.XY0cizUtiXHr/TsN/pVek3fdP/A.ldDFnHC394fIm8c7x8AlBri', 'user'),
('33333333-3333-3333-3333-333333333333', 'Sofia Gomez', 'sofia@riwi.io', '$2a$10$p.XY0cizUtiXHr/TsN/pVek3fdP/A.ldDFnHC394fIm8c7x8AlBri', 'user');

-- 2. INSERT CHANNELS
INSERT INTO rw_channels (id, name, description, created_by) VALUES
('a1111111-1111-1111-1111-111111111111', 'General', 'Official Riwi announcements channel', '11111111-1111-1111-1111-111111111111'),
('b2222222-2222-2222-2222-222222222222', 'Development Cohort 6', 'Private channel for technical discussions', '22222222-2222-2222-2222-222222222222');

-- 3. INSERT CHANNEL MEMBERS
INSERT INTO rw_channel_members (channel_id, user_id) VALUES
('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111'),
('a1111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'),
('a1111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333'),
('b2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222'),
('b2222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');

-- 4. INSERT INITIAL MESSAGES
INSERT INTO rw_messages (id, channel_id, user_id, content, status) VALUES
('c1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Welcome to the official Riwi internal messaging platform.', 'sent'),
('c2222222-2222-2222-2222-222222222222', 'b2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'Hello team, we are implementing RLS in PostgreSQL to enforce data privacy.', 'sent');