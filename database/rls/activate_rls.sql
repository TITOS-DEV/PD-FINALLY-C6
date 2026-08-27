-- ============================================
-- 1. HABILITAR RLS EN TODAS LAS TABLAS
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
-- 2. FUNCIÓN AUXILIAR DE SEGURIDAD (ADMIN)
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
-- 2.1 FUNCIÓN AUXILIAR: ¿SOY MIEMBRO DE ESTE CANAL?
-- ============================================
-- Existe por la misma razón que is_admin(): la política
-- "rw_channel_members_select" necesita saber si el usuario pertenece a un
-- canal consultando la propia tabla rw_channel_members. Si esa consulta se
-- escribe como una subconsulta directa contra rw_channel_members dentro de
-- su propia política, Postgres tiene que volver a aplicar esa misma
-- política para evaluar la subconsulta, que a su vez la vuelve a evaluar...
-- y termina en "infinite recursion detected in policy for relation
-- rw_channel_members". SECURITY DEFINER es la salida: la función corre con
-- los privilegios de quien la creó, así que la consulta interna a
-- rw_channel_members se salta el RLS por completo, sin ciclos.
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
-- 3. POLÍTICAS RLS POR TABLA
-- ============================================
-----------------------------------------------
-- TABLA: rw_users
-----------------------------------------------
-- Ver usuarios: Cualquier usuario autenticado puede ver el perfil de otros.
CREATE POLICY "rw_users_select" ON rw_users FOR
SELECT
    TO authenticated USING (true);

-- Insertar/Editar: Cada usuario maneja su propio perfil o lo gestiona un admin.
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
-- TABLA: rw_channels
-----------------------------------------------
-- Ver canales: Un usuario ve el canal si es miembro o si es admin.
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

-- Crear canales: Cualquier usuario autenticado asignándose como creador.
CREATE POLICY "rw_channels_insert" ON rw_channels FOR
INSERT
    TO authenticated WITH CHECK (created_by = auth.uid());

-- Actualizar/Eliminar: Solo el creador o un admin.
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
-- TABLA: rw_channel_members
-----------------------------------------------
-- Ver miembros: Si el usuario forma parte del canal o es admin.
-- Usa is_channel_member() en vez de una subconsulta directa contra esta
-- misma tabla — ver el comentario junto a esa función para el porqué
-- (si no, esto causa "infinite recursion detected in policy").
CREATE POLICY "rw_channel_members_select" ON rw_channel_members FOR
SELECT
    TO authenticated USING (
        is_channel_member(channel_id)
        OR is_admin()
    );

-- Unirse o agregar miembros:
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

-- Salir o remover del canal:
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
-- TABLA: rw_messages
-----------------------------------------------
-- Leer mensajes: Solo si pertenece al canal.
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

-- Enviar mensaje: Debe ser miembro del canal y ser el autor.
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

-- Editar o Soft Delete: Solo el autor del mensaje o un admin.
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
-- TABLA: rw_message_embeddings
-----------------------------------------------
-- Lectura: Hereda el permiso de la tabla de mensajes.
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

-- Escritura: Únicamente el sistema/backend (service_role) o un admin.
CREATE POLICY "rw_message_embeddings_insert" ON rw_message_embeddings FOR
INSERT
    TO service_role WITH CHECK (true);

-----------------------------------------------
-- TABLA: rw_message_read_status
-----------------------------------------------
-- Leer estados de lectura: Miembros del canal.
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

-- Registrar confirmación de lectura: Únicamente para su propio usuario.
CREATE POLICY "rw_message_read_status_insert" ON rw_message_read_status FOR
INSERT
    TO authenticated WITH CHECK (user_id = auth.uid());

-----------------------------------------------
-- TABLA: rw_refresh_tokens
-----------------------------------------------
-- Solo accesible por el propio usuario o por el backend service_role.
CREATE POLICY "rw_refresh_tokens_owner" ON rw_refresh_tokens FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());