-- ============================================
-- 1. VISTA DE CONVERSACIONES
-- ============================================
CREATE OR REPLACE VIEW rw_user_conversations AS
SELECT 
    c.id AS channel_id,
    c.name AS channel_name,
    c.description AS channel_description,
    cm.user_id AS member_user_id,
    m.id AS last_message_id,
    m.content AS last_message_content,
    m.created_at AS last_message_at,
    u.name AS last_message_author
FROM rw_channels c
JOIN rw_channel_members cm ON c.id = cm.channel_id
LEFT JOIN LATERAL (
    SELECT id, content, created_at, user_id
    FROM rw_messages
    WHERE channel_id = c.id AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
) m ON true
LEFT JOIN rw_users u ON m.user_id = u.id;

-- ============================================
-- 2. PROCEDIMIENTO 1: BÚSQUEDA DE USUARIOS
-- ============================================
CREATE OR REPLACE PROCEDURE rw_sp_search_users(
    IN p_search_term VARCHAR,
    INOUT p_result REFCURSOR DEFAULT 'rs_users'
)
LANGUAGE plpgsql
AS $$
BEGIN
    OPEN p_result FOR
    SELECT id, name, email, role, created_at
    FROM rw_users
    WHERE name ILIKE '%' || p_search_term || '%'
       OR email ILIKE '%' || p_search_term || '%'
    ORDER BY name ASC;
END;
$$;

-- ============================================
-- 3. PROCEDIMIENTO 2: GESTIÓN DE USUARIOS
-- ============================================
CREATE OR REPLACE PROCEDURE rw_sp_manage_user(
    IN p_user_id UUID,
    IN p_action VARCHAR, -- 'UPDATE' o 'SOFT_DELETE'
    IN p_name VARCHAR DEFAULT NULL,
    IN p_email VARCHAR DEFAULT NULL,
    IN p_role VARCHAR DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_action = 'UPDATE' THEN
        UPDATE rw_users
        SET name = COALESCE(p_name, name),
            email = COALESCE(p_email, email),
            role = COALESCE(p_role, role),
            updated_at = NOW()
        WHERE id = p_user_id;

    ELSIF p_action = 'SOFT_DELETE' THEN
        UPDATE rw_refresh_tokens
        SET revoked_at = NOW()
        WHERE user_id = p_user_id AND revoked_at IS NULL;
    ELSE
        RAISE EXCEPTION 'Acción inválida. Usa UPDATE o SOFT_DELETE';
    END IF;
END;
$$;