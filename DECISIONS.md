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

---

## 7. Arquitectura del backend: por qué separé todo en 4 capas (Clean Architecture)

El backend (`apps/api`) lo dividí en `domain`, `use-cases`, `infrastructure` y `presentation`. La primera vez que uno ve esto piensa "uy, cuántas carpetas para algo tan simple", así que dejo la explicación de por qué vale la pena acá y no solo por seguir una moda.

* **La regla es simple: las flechas apuntan hacia adentro.** `domain` (mis entidades como `User` o `Message`, y las interfaces tipo `IMessageRepository`) no importa nada de Express, ni de `pg`, ni de OpenAI. `use-cases` (como `SendMessage.ts` o `AskCopilot.ts`) solo conoce esas interfaces del dominio, nunca la implementación real. Y `infrastructure` (donde sí vive `pg`, JWT, OpenAI) es la que implementa esas interfaces.
* **¿Por qué me importa esto y no es solo orden?** Porque si mañana me toca cambiar de Supabase a otro Postgres, o de OpenAI a Gemini, el cambio queda encerrado en `infrastructure` y en una línea del `.env`. Mi lógica de negocio (`SendMessage`, `AskCopilot`) ni se entera. Eso lo pueden ver literal en `AIProviderFactory.ts`: es un `switch` de una línea por proveedor, y el caso de uso `AskCopilot.ts` ni siquiera importa la palabra "OpenAI" en ningún lado.
* **También hace las pruebas más fáciles.** En `tests/unit/SendMessage.test.ts` pruebo la lógica de "no dejes mandar un mensaje vacío" o "no dejes mandar un mensaje a un canal donde no eres miembro" sin necesitar Postgres corriendo — le paso objetos falsos (mocks) que cumplen la interfaz `IMessageRepository`, y ya. Eso no seria posible si `SendMessage` tuviera código de `pg` mezclado adentro.
* **`presentation` es la capa más "sucia" a propósito.** Ahí sí vive Express, las rutas, Zod para validar el `body`, Socket.io. Es la única capa que le puede hablar directo al mundo exterior (HTTP, WebSockets). Un controller como `MessageController.ts` es puro pegamento: recibe el request, llama al caso de uso, devuelve la respuesta. No tiene lógica de negocio propia.

---

## 8. Cómo activo el RLS de Postgres usando MI PROPIO JWT (sin el Auth de Supabase)

Esta fue la parte más rara de entender al principio, así que la explico con calma porque es clave para que todo el punto 2 (RLS) funcione de verdad.

* **El problema:** `auth.uid()` (la función que usan TODAS mis políticas RLS) no es magia — es una función de SQL bien simple que lee una variable de sesión de Postgres llamada `request.jwt.claims`. Normalmente, quien pone esa variable en cada consulta es PostgREST, la pieza de Supabase que atiende las peticiones cuando usas su sistema de Auth (GoTrue). Como yo hice mi propio login con mis propios JWT (ver punto 6), nadie le está poniendo esa variable a Postgres por mí — si no hago nada, `auth.uid()` siempre me da `NULL` y todas las políticas fallan.
* **La solución (`withRLSContext.ts`):** Por cada request autenticado, abro una transacción de Postgres a mano y ejecuto exactamente lo mismo que haría PostgREST:
  ```sql
  BEGIN;
  SELECT set_config('request.jwt.claims', '{"sub":"<id-del-usuario>","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  -- acá corren las consultas del request
  COMMIT;
  ```
  El `true` al final de `set_config` significa "esto solo dura mientras dure la transacción" — apenas hago `COMMIT` o `ROLLBACK`, esa variable desaparece sola. Esto es importante porque uso un *pool* de conexiones que se reutilizan entre requests distintos: si esa variable se quedara "pegada", el siguiente request que agarre esa misma conexión podría heredar por accidente la identidad de otro usuario. Con transacción de por medio, eso no puede pasar.
* **¿Y por qué puedo hacer `SET ROLE authenticated` así como así?** Porque mi backend se conecta a Postgres con un usuario con privilegios (el que trae Supabase por defecto), y solo puedes cambiarte a un rol (`SET ROLE`) del que seas miembro. O sea: mi backend se conecta "fuerte" pero se **auto-degrada** a `authenticated` en cada request antes de tocar una sola tabla. Aunque yo mismo tenga un bug en mi código de Node, nunca voy a poder saltarme el RLS por accidente, porque literalmente estoy corriendo como el mismo rol limitado que usaría cualquier request normal de Supabase.
* **Por qué usé `pg` directo y no el cliente de `@supabase/supabase-js`:** ese cliente habla con la base de datos a través de PostgREST usando la `anon key` o la `service_role key`. La `service_role key` **se salta el RLS completo** (es literalmente para tareas de administrador), y la `anon key` espera JWT firmados por el Auth de Supabase, no los míos. Ninguna de las dos me sirve para lo que necesito acá, así que fui directo con una conexión de Postgres normal (`pg.Pool`) y armé yo mismo el mecanismo de arriba.

---

## 9. El "adaptador" de IA: para poder cambiar de OpenAI a Gemini sin tocar la lógica

El copiloto necesita dos cosas de un proveedor de IA: convertir texto en un vector (`embeddings`, para poder "buscar por significado") y generar una respuesta en lenguaje natural (`chat`). En vez de llamar a `openai.chat.completions.create(...)` directo desde mi caso de uso `AskCopilot.ts`, hice dos interfaces bien simples en el dominio: `ILLMProvider` (genera respuestas) e `IEmbeddingProvider` (genera vectores).

* **Por qué:** `AskCopilot.ts` recibe esas interfaces por el constructor y nunca sabe si detrás hay OpenAI, Gemini, o cualquier otra cosa que alguien conecte después. Quien sí decide cuál usar es `AIProviderFactory.ts`, que lee la variable `AI_PROVIDER` del `.env` y devuelve `new OpenAIProvider()` o `new GeminiProvider()`. Cambiar de proveedor es literalmente cambiar una línea del `.env`, nada de código.
* **La parte sincera que hay que aclarar:** cambiar el modelo de **chat** es gratis, no rompe nada. Pero cambiar el modelo de **embeddings** no es tan simple, y no quise esconder eso. La columna `rw_message_embeddings.embedding` está creada como `vector(1536)` (el tamaño que usa `text-embedding-3-small` de OpenAI), y el índice HNSW del punto 5 está armado sobre ese tamaño fijo. Si mañana alguien pone `AI_PROVIDER=gemini`, el modelo de embeddings de Gemini que usé de ejemplo genera vectores de 768 dimensiones, no 1536 — y eso simplemente no entra en la columna. Lo dejé comentado bien explícito en `GeminiProvider.ts` para que a nadie le agarre de sorpresa: la interfaz es intercambiable, pero cambiar de verdad el modelo de embeddings en producción implica además migrar la columna vectorial (o elegir un modelo de Gemini que sí dé 1536 dimensiones). Preferí ser honesto con esa limitación en vez de fingir que el adaptador resuelve absolutamente todo solo.

---

## 10. Manejo de errores: simple, pero centralizado

No quise complicarme con un sistema de errores gigante. La regla que seguí es una sola: **ninguna capa de negocio le habla directo a Express**. Ni `use-cases` ni `infrastructure` hacen `res.status(...)` — simplemente hacen `throw` de una clase de error.

* **`AppError`:** es la clase base (vive en `domain/errors/AppError.ts`), y tiene hijas bien concretas: `ValidationError` (400), `UnauthorizedError` (401), `ForbiddenError` (403), `NotFoundError` (404), `ConflictError` (409). Cada una ya sabe su propio código HTTP y un "code" en texto (como `"FORBIDDEN"`) para que el frontend pueda reaccionar sin tener que leer el mensaje en español/inglés.
* **`errorHandler.ts`:** es el único lugar de todo el proyecto que decide cómo se ve una respuesta de error. Si el error es un `AppError`, confía en su `statusCode` y lo devuelve tal cual. Si es cualquier otra cosa (un bug mío, un error crudo de Postgres, lo que sea), nunca se lo muestra al cliente tal cual — lo registra completo en el log del servidor (con su `X-Correlation-ID` para poder rastrearlo) y al cliente solo le devuelve un genérico `500 - Something went wrong`. Así nunca se filtra por accidente un mensaje de error de SQL o un stack trace a alguien de afuera.
* **`asyncHandler.ts`:** es un detalle chiquito pero importante — como uso `async/await` en todos los controllers, si algo revienta adentro de una función async, Express (en la versión que uso) no lo agarra solo y la petición se queda colgada. Este wrapper hace que cualquier error async llegue siempre al `errorHandler`.

---

## 11. Pruebas: unitarias con mentiras (mocks) y e2e contra el Supabase real

Dividí las pruebas en dos grupos bien distintos, cada uno con su propósito:

* **Unitarias (`tests/unit`, corren con `pnpm test`):** prueban un caso de uso solo, dándole objetos falsos en vez de repositorios reales (por ejemplo, en `SendMessage.test.ts` le doy un `IMessageRepository` de mentira que no toca ninguna base de datos). Son rapidísimas y no necesitan ni internet ni el `.env` configurado — sirven para probar la lógica pura, como "si el mensaje viene vacío, recházalo" o "si el usuario no es miembro del canal, no lo dejes escribir".
* **End-to-end (`tests/e2e`, corren con `pnpm test:e2e`):** estas sí levantan la app de Express completa (con `supertest`) y pegan contra mi proyecto real de Supabase, usando los usuarios que ya vienen en el seed. Decidí no montar un Postgres de mentira aparte porque quería probar el mecanismo completo — JWT propio, RLS activándose de verdad, políticas bloqueando lo que tienen que bloquear — y eso solo se puede confirmar contra una base de datos real con RLS habilitado, no con un doble de prueba.
* **Por qué elegí Vitest:** corre TypeScript directo sin configuración rara, es rápido, y la sintaxis (`describe`, `it`, `expect`) es casi idéntica a Jest, así que si alguien más lo lee no tiene curva de aprendizaje.
* **Un ejemplo concreto de por qué valía la pena tener e2e:** hay una prueba en `messages.e2e.test.ts` que loguea como el usuario `admin@riwi.io` (que en el seed NO es miembro del canal "Desarrollo Cohorte 6") e intenta leer los mensajes de ese canal. Si algún día rompo por accidente la política RLS de `rw_messages_select`, o el `isMember()` que valido antes en el caso de uso, esta prueba se cae inmediatamente — es la única forma real de confirmar que la seguridad de datos funciona de punta a punta y no solo "en la teoría".