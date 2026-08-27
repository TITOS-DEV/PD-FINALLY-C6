-- Limpiar datos previos si existen
TRUNCATE TABLE rw_refresh_tokens, rw_message_read_status, rw_message_embeddings, rw_messages, rw_channel_members, rw_channels, rw_users CASCADE;

-- 1. INSERTAR USUARIOS (Password: Password123!)
INSERT INTO rw_users (id, name, email, password_hash, role) VALUES
('11111111-1111-1111-1111-111111111111', 'Admin Riwi', 'admin@riwi.io', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQOEg6Lruj3vjPGga31lW', 'admin'),
('22222222-2222-2222-2222-222222222222', 'Jhonatan Cadavid', 'jhonatan@riwi.io', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQOEg6Lruj3vjPGga31lW', 'user'),
('33333333-3333-3333-3333-333333333333', 'Sofia Gomez', 'sofia@riwi.io', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQOEg6Lruj3vjPGga31lW', 'user');

-- 2. INSERTAR CANALES
INSERT INTO rw_channels (id, name, description, created_by) VALUES
('a1111111-1111-1111-1111-111111111111', 'General', 'Canal oficial de anuncios de Riwi', '11111111-1111-1111-1111-111111111111'),
('b2222222-2222-2222-2222-222222222222', 'Desarrollo Cohorte 6', 'Canal privado para discusiones técnicas', '22222222-2222-2222-2222-222222222222');

-- 3. INSERTAR MIEMBROS DE CANALES
INSERT INTO rw_channel_members (channel_id, user_id) VALUES
('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111'),
('a1111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'),
('a1111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333'),
('b2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222'),
('b2222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');

-- 4. INSERTAR MENSAJES INICIALES
INSERT INTO rw_messages (id, channel_id, user_id, content, status) VALUES
('m1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Bienvenidos a la plataforma oficial de mensajería interna de Riwi.', 'sent'),
('m2222222-2222-2222-2222-222222222222', 'b2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'Hola equipo, estamos implementando el RLS en PostgreSQL para asegurar la privacidad.', 'sent');