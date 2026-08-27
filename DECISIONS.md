# DECISIONS.md - Justificación de Decisiones Técnicas

**Proyecto:** Riwi Internal Messenger  
**Autor:** Jhonatan Cadavid Betancur (17 años)  
**Rol:** Fullstack Developer en formación  

---

## 1. Arquitectura de Datos y Normalización hasta 3FN

Decidí estructurar las tablas separando de forma atómica los usuarios, los canales, las membresías y los mensajes. 

* **Por qué 3FN:** Para evitar redundancias. La información del usuario (nombre, email, rol) existe únicamente en `rw_users`. Si un usuario cambia su nombre, no hay que actualizar decenas de registros en la tabla de mensajes.
* **Prefijo `rw_`:** Todas las tablas y restricciones llevan el prefijo para mantener consistencia y evitar colisiones de nombres dentro de Esquemas compartidos en PostgreSQL.

---

## 2. Seguridad a Nivel de Datos (RLS en PostgreSQL vs Backend)

En lugar de confiarle toda la seguridad a la capa de aplicación (Node.js), decidí activar **Row Level Security (RLS)** directamente en PostgreSQL.

* **Razones:** Si por alguna razón el backend llega a tener un bug en un filtro SQL, la base de datos se encarga de rechazar la consulta si el usuario no pertenece al canal.
* **Optimización con `is_admin()`:** Para evitar que la consulta de RLS haga llamadas recursivas infinitas sobre la tabla `rw_users` al verificar roles, cree la función `SECURITY DEFINER SET search_path = public`. Esto valida si un usuario es administrador en una sola ejecución aislada de forma súper rápida.

---

## 3. Paginación Keyset vs Paginación OFFSET

Para la lectura del historial de mensajes (`Consulta 1`), decidí implementar **Paginación por Keyset** usando `(created_at, id) < (cursor_date, cursor_id)` en lugar del clásico `OFFSET / LIMIT`.

* **Razones:** El `OFFSET` se vuelve extremadamente lento cuando la tabla crece (Postgres tiene que leer y descartar miles de filas antes de entregar las solicitadas). Con Keyset, la consulta aprovecha directamente el índice B-Tree `idx_rw_messages_channel_created`, haciendo que la paginación sea instantánea $O(1)$ sin importar qué tan atrás en el historial esté el usuario.

---

## 4. Estrategia de Soft Delete en Mensajes

El borrado físico (`DELETE FROM rw_messages`) está prohibido en los requerimientos del proyecto.

* **Implementación:** Utilicé una columna `deleted_at TIMESTAMPTZ`. Cuando un usuario elimina un mensaje, simplemente marcamos la fecha actual. 
* **Ventaja:** Preservamos la integridad referencial para auditorías, el historial del chat no rompe secuencias y los índices vectoriales de la IA se pueden filtrar fácilmente excluyendo registros donde `deleted_at IS NOT NULL`.

---

## 5. Índice Vectorial HNSW para el Copiloto (RAG)

Para la tabla `rw_message_embeddings`, creé un índice vectorial utilizando el algoritmo **HNSW (Hierarchical Navigable Small World)** con la distancia coseno (`vector_cosine_ops`).

* **Razones:** HNSW ofrece un rendimiento de búsqueda por similitud de vectores muy superior a IVFFlat en tablas dinámicas que reciben inserciones constantes, ya que no requiere re-entrenar el índice periódicamente para mantener la precisión de búsqueda en las respuestas de la IA.

---

## 6. Autenticación y Refresh Tokens con Rotación

En lugar de usar tokens de sesión eternos, implementé un par de tokens: **Access Token (JWT)** de corta duración y **Refresh Token** persistido en BD.

* **Índice Único Parcial:** Implementé el índice `idx_rw_active_refresh_token_unique` sobre `rw_refresh_tokens (user_id) WHERE revoked_at IS NULL`. Esto garantiza a nivel de base de datos que un usuario solo puede tener **un único refresh token activo a la vez**, invalidando sesiones antiguas automáticamente cuando solicita un nuevo token y previniendo ataques de reutilización.