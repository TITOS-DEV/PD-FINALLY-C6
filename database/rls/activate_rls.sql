-- ============================================
-- 1. ENABLE RLS ON ALL TABLES
-- ============================================
ALTER TABLE
    rw_users ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    rw_channels ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    rw_channel_members ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    rw_messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    rw_message_embeddings ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    rw_message_read_status ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    rw_refresh_tokens ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 2. SECURITY HELPER FUNCTION (ADMIN)
-- ============================================
CREATE
OR REPLACE FUNCTION public.is_admin() RETURNS BOOLEAN AS $$
SELECT
    EXISTS (
        SELECT
            1
        FROM
            rw_users
        WHERE
            id = auth.uid()
            AND role = 'admin'
    );

$$ LANGUAGE sql SECURITY DEFINER
SET
    search_path = public;

-- ============================================
-- 2.1 HELPER FUNCTION: AM I A MEMBER OF THIS CHANNEL?
-- ============================================
-- Exists for the same reason as is_admin(): the policy
-- "rw_channel_members_select" needs to check if the user belongs to a
-- channel by querying the rw_channel_members table itself. If that query is
-- written as a direct subquery against rw_channel_members within its own policy,
-- Postgres has to re-evaluate that same policy to evaluate the subquery,
-- resulting in "infinite recursion detected in policy for relation rw_channel_members".
-- SECURITY DEFINER solves this: the function runs with the privileges of its creator,
-- allowing the internal query on rw_channel_members to bypass RLS without cycles.
CREATE
OR REPLACE FUNCTION public.is_channel_member(p_channel_id UUID) RETURNS BOOLEAN AS $$
SELECT
    EXISTS (
        SELECT
            1
        FROM
            rw_channel_members
        WHERE
            channel_id = p_channel_id
            AND user_id = auth.uid()
    );

$$ LANGUAGE sql SECURITY DEFINER
SET
    search_path = public;

-- ============================================
-- 3. RLS POLICIES PER TABLE
-- ============================================
-----------------------------------------------
-- TABLE: rw_users
-----------------------------------------------
-- View users: Any authenticated user can view other user profiles.
CREATE POLICY "rw_users_select" ON rw_users FOR
SELECT
    TO authenticated USING (true);

-- Insert/Update: Each user manages their own profile, or managed by an admin.
CREATE POLICY "rw_users_insert" ON rw_users FOR
INSERT
    TO authenticated WITH CHECK (
        id = auth.uid()
        OR is_admin()
    );

CREATE POLICY "rw_users_update" ON rw_users FOR
UPDATE
    TO authenticated USING (
        id = auth.uid()
        OR is_admin()
    ) WITH CHECK (
        id = auth.uid()
        OR is_admin()
    );

-----------------------------------------------
-- TABLE: rw_channels
-----------------------------------------------
-- View channels: A user can view a channel if they are a member or an admin.
CREATE POLICY "rw_channels_select" ON rw_channels FOR
SELECT
    TO authenticated USING (
        EXISTS (
            SELECT
                1
            FROM
                rw_channel_members cm
            WHERE
                cm.channel_id = rw_channels.id
                AND cm.user_id = auth.uid()
        )
        OR is_admin()
    );

-- Create channels: Any authenticated user assigning themselves as creator.
CREATE POLICY "rw_channels_insert" ON rw_channels FOR
INSERT
    TO authenticated WITH CHECK (created_by = auth.uid());

-- Update/Delete: Only the creator or an admin.
CREATE POLICY "rw_channels_update" ON rw_channels FOR
UPDATE
    TO authenticated USING (
        created_by = auth.uid()
        OR is_admin()
    ) WITH CHECK (
        created_by = auth.uid()
        OR is_admin()
    );

CREATE POLICY "rw_channels_delete" ON rw_channels FOR DELETE TO authenticated USING (
    created_by = auth.uid()
    OR is_admin()
);

-----------------------------------------------
-- TABLE: rw_channel_members
-----------------------------------------------
-- View members: If the user is a channel member or an admin.
-- Uses is_channel_member() instead of a direct subquery against this same table —
-- see helper function explanation (avoids "infinite recursion detected in policy").
CREATE POLICY "rw_channel_members_select" ON rw_channel_members FOR
SELECT
    TO authenticated USING (
        is_channel_member(channel_id)
        OR is_admin()
    );

-- Join or add members:
CREATE POLICY "rw_channel_members_insert" ON rw_channel_members FOR
INSERT
    TO authenticated WITH CHECK (
        user_id = auth.uid()
        OR EXISTS (
            SELECT
                1
            FROM
                rw_channels c
            WHERE
                c.id = channel_id
                AND c.created_by = auth.uid()
        )
        OR is_admin()
    );

-- Leave or remove from channel:
CREATE POLICY "rw_channel_members_delete" ON rw_channel_members FOR DELETE TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (
        SELECT
            1
        FROM
            rw_channels c
        WHERE
            c.id = channel_id
            AND c.created_by = auth.uid()
    )
    OR is_admin()
);

-----------------------------------------------
-- TABLE: rw_messages
-----------------------------------------------
-- Read messages: Only if member of the channel or admin.
CREATE POLICY "rw_messages_select" ON rw_messages FOR
SELECT
    TO authenticated USING (
        EXISTS (
            SELECT
                1
            FROM
                rw_channel_members cm
            WHERE
                cm.channel_id = rw_messages.channel_id
                AND cm.user_id = auth.uid()
        )
        OR is_admin()
    );

-- Send message: Must be a channel member and the author.
CREATE POLICY "rw_messages_insert" ON rw_messages FOR
INSERT
    TO authenticated WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
            SELECT
                1
            FROM
                rw_channel_members cm
            WHERE
                cm.channel_id = rw_messages.channel_id
                AND cm.user_id = auth.uid()
        )
    );

-- Edit or Soft Delete: Only the message author or an admin.
CREATE POLICY "rw_messages_update" ON rw_messages FOR
UPDATE
    TO authenticated USING (
        user_id = auth.uid()
        OR is_admin()
    ) WITH CHECK (
        user_id = auth.uid()
        OR is_admin()
    );

-----------------------------------------------
-- TABLE: rw_message_embeddings
-----------------------------------------------
-- Read: Inherits permission from the messages table.
CREATE POLICY "rw_message_embeddings_select" ON rw_message_embeddings FOR
SELECT
    TO authenticated USING (
        EXISTS (
            SELECT
                1
            FROM
                rw_messages m
                JOIN rw_channel_members cm ON cm.channel_id = m.channel_id
            WHERE
                m.id = rw_message_embeddings.message_id
                AND cm.user_id = auth.uid()
        )
        OR is_admin()
    );

-- Write: System/backend (service_role) or an admin only.
CREATE POLICY "rw_message_embeddings_insert" ON rw_message_embeddings FOR
INSERT
    TO service_role WITH CHECK (true);

-----------------------------------------------
-- TABLE: rw_message_read_status
-----------------------------------------------
-- Read status: Channel members.
CREATE POLICY "rw_message_read_status_select" ON rw_message_read_status FOR
SELECT
    TO authenticated USING (
        EXISTS (
            SELECT
                1
            FROM
                rw_messages m
                JOIN rw_channel_members cm ON cm.channel_id = m.channel_id
            WHERE
                m.id = rw_message_read_status.message_id
                AND cm.user_id = auth.uid()
        )
        OR is_admin()
    );

-- Register read receipt: Only for their own user ID.
CREATE POLICY "rw_message_read_status_insert" ON rw_message_read_status FOR
INSERT
    TO authenticated WITH CHECK (user_id = auth.uid());

-----------------------------------------------
-- TABLE: rw_refresh_tokens
-----------------------------------------------
-- Accessible only by the user owner or backend service_role.
CREATE POLICY "rw_refresh_tokens_owner" ON rw_refresh_tokens FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());