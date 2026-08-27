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

---

## 12. Frontend: por qué Angular con Signals y Standalone (y una aclaración de versión)

Para `apps/web` usé Angular en su forma más moderna: **componentes standalone** (nada de `NgModule`), **Signals** para el estado local, y `@angular/build:application` (el builder nuevo basado en esbuild/Vite).

* **Por qué Angular y no otra cosa:** ya venía siendo el framework que pedía la prueba técnica, pero además tiene sentido para este proyecto puntual: trae Router, HttpClient, formularios e inyección de dependencias todo integrado, sin tener que salir a elegir/armar cada pieza por separado como tocaría con una librería más chica.
* **Aclaración honesta de versión:** el enunciado pedía "la última versión estable". Al momento de armar el proyecto, la última estable de Angular (v22) exige Node ≥22.22.3, ≥24.15.0 o ≥26 — y el entorno donde armé y probé todo esto tiene Node 24.3.0, que queda justo por debajo de ese corte. En vez de generar algo que no podía ni compilar ni correr acá, usé **Angular 21.2** (la versión estable inmediatamente anterior, con soporte activo), que sí corre con Node ≥24.0.0 sin restricción de parche. Si tu máquina tiene Node 24.15+ o 26+, actualizar es un solo comando: `ng update @angular/core@22 @angular/cli@22`.
* **Standalone en vez de NgModules:** cada componente declara sus propios `imports` (ver cualquier `*.ts` de `src/app`) en vez de depender de un módulo central. Para un proyecto de este tamaño, los NgModules solo agregarían un nivel más de indirección sin aportar nada — cada componente ya deja clarísimo de qué depende con solo mirar su decorador.

---

## 13. Cuándo usé Signals y cuándo RxJS (no elegí uno solo para todo)

Podría haber intentado hacer *todo* con uno de los dos, pero terminé usando cada uno para lo que mejor le queda:

* **Signals para el estado que vive en memoria:** `ChatStore` (los mensajes del canal activo, si está cargando, el cursor de paginación), `AuthService` (la sesión actual), `I18nService` (el idioma activo). Todo esto es "un valor que cambia con el tiempo y que la UI necesita leer reactivamente" — exactamente para lo que Signals están hechos, y sin necesitar `| async` en cada template ni preocuparme por desuscribirme en `ngOnDestroy`.
* **RxJS para todo lo que es un flujo async con más de un evento en el tiempo:** las llamadas HTTP (`HttpClient` sigue devolviendo `Observable`), el interceptor de auth (necesita `catchError`, `switchMap`, `filter`, cosas que Signals no resuelven bien), y los mensajes que llegan por WebSocket (`SocketService.onNewMessage()` es un stream que nunca "termina", ideal para Observable).
* **La regla práctica que seguí:** un servicio arma sus llamadas HTTP con RxJS, pero en el momento en que el dato "aterriza", lo guardo en un signal (`.subscribe(res => this.messages.set(...))`). Así el resto de la app (los componentes) solo lee signals — no tiene que saber si algo vino de un Observable, de un WebSocket o de otro lado.

---

## 14. Cómo no perder la posición del scroll al cargar mensajes viejos (keyset del lado del frontend)

El backend pagina por keyset (ver punto 3) — pero eso solo resuelve la mitad del problema. Del lado del navegador, si simplemente insertás mensajes viejos AL PRINCIPIO de la lista mientras la persona está leyendo, el navegador agranda el contenido por arriba y la pantalla "salta", perdiendo la referencia visual de lo que se estaba leyendo. La solución completa está en `ChatContainerComponent` (`loadOlderMessages()`):

1. Antes de pedir la página vieja, guardo `scrollHeight` y `scrollTop` del contenedor tal como están en ese momento.
2. Le pido a `ChatStore` la página anterior (`loadMoreMessages()`), que la pega al principio del array.
3. Uso `afterNextRender()` — la forma correcta en Angular moderno de decir "corré esto recién cuando el DOM YA se actualizó de verdad", en vez de un `setTimeout` a ciegas cruzando los dedos.
4. Ya con el DOM actualizado, mido cuánto creció el contenido (`scrollHeight` nuevo menos el viejo) y se lo sumo al `scrollTop` que tenía guardado.

El resultado: la persona sigue viendo exactamente el mismo mensaje en la misma posición de la pantalla, como si los mensajes viejos ya hubieran estado ahí desde siempre.

---

## 15. Separación modular de la UI, estilo Fluent

Organicé `src/app` en carpetas por función, no por tipo de archivo:

```
core/         → servicios "de toda la app": auth, i18n, WebSocket (nada de esto es visual)
features/     → una carpeta por funcionalidad (chat, copilot, profile, auth), cada una con sus propios components/services/models
shared/ui/    → piezas visuales chicas y sin opinión de negocio (Avatar, EmptyState, MessageSkeleton, Toast) que cualquier feature puede usar
```

* **Por qué así y no todo en una carpeta `components/`:** porque así, para tocar todo lo relacionado al copiloto, solo entro a `features/copilot/` — no tengo que ir a buscar sus piezas desperdigadas entre las de chat o las de perfil.
* **El estilo Fluent (Teams/Outlook) quedó centralizado en un solo lugar:** todos los colores, radios de borde y la tipografía viven como tokens de Tailwind v4 en `src/styles.css` (`--color-brand-500`, `--radius-fluent`, etc.), no repetidos como códigos de color sueltos en cada componente. Si mañana cambia la paleta de marca, se edita un archivo, no cuarenta.
* **`shared/ui` nunca importa de `features/`:** las piezas compartidas no saben nada de mensajes ni de canales — reciben todo por `input()`. Eso es lo que las hace reutilizables de verdad, y evita que un cambio en el chat rompa por accidente el panel del copiloto.

---

## 16. Interceptor de auth con refresh automático (y por qué es una sola función, no una clase)

`authInterceptor` es un interceptor **funcional** (`HttpInterceptorFn`), no una clase con `@Injectable`. Angular dejó ese estilo como el recomendado desde hace un tiempo porque es menos código para lo mismo — pero eso trae una particularidad: una función no tiene "propiedades de instancia" donde guardar estado. La solución fue declarar `isRefreshing` y `refreshedToken$` como variables a nivel de MÓDULO (fuera de la función), que cumplen exactamente ese rol porque el archivo se carga una sola vez en toda la vida de la app.

* **Por qué hace falta ese estado compartido:** si 5 llamadas HTTP fallan con 401 al mismo tiempo (el access token expiró y justo hay varias requests en vuelo), sin coordinación las 5 dispararían su propio refresh en paralelo. Eso no solo es ineficiente — **rompería la rotación de tokens del backend**, que solo permite un refresh token activo a la vez (ver punto 6). Con el flag `isRefreshing`, la primera request hace el refresh; las otras 4 esperan el resultado en `refreshedToken$` y reintentan con el token nuevo apenas llega.
* **Qué pasa si el refresh también falla:** significa que el refresh token ya venció o fue revocado (por ejemplo, alguien inició sesión desde otro dispositivo). Ahí no hay nada que recuperar — se cierra la sesión local y se manda a la persona de vuelta a `/login`.

---

## 17. Cero texto hardcodeado: ngx-translate en vez del i18n nativo de Angular

El enunciado prohibía texto incrustado en los componentes, y había dos caminos: el i18n nativo de Angular (`@angular/localize`) o `ngx-translate`. Elegí **ngx-translate**.

* **La razón principal:** el i18n nativo de Angular resuelve el idioma en **tiempo de build** — necesitarías compilar la app una vez por idioma y sevir bundles distintos según la URL o el dominio. Eso es genial para SEO multi-idioma, pero acá lo que se pide es un selector de idioma que cambie la UI **al toque, sin recargar la página** (ver el switch ES/EN en `ProfileCard`) — eso es exactamente lo que ngx-translate resuelve, cargando el diccionario correspondiente en tiempo de ejecución.
* **`I18nService` es la única puerta de entrada:** ningún componente importa `TranslateService` directo ni decide un string en español/inglés por su cuenta. Todo el texto sale de `public/i18n/es.json` / `en.json` a través del pipe `translate`, y `I18nService` es quien decide (y persiste en `localStorage`) cuál de los dos diccionarios está activo.
* **`provideAppInitializer` evita el parpadeo:** cargar un diccionario es una llamada HTTP, o sea que es asíncrona. Sin esperar a que termine antes de pintar la app, la persona vería por una fracción de segundo las claves crudas (`chat.empty.title`) en vez del texto real. `app.config.ts` espera ese primer `initialize()` antes de terminar de arrancar.

---

## 18. Manejo de errores en el frontend: Toasts en vez de silencio (o alerts feos)

Del lado del backend, cada error ya llega con un `code` y un `statusCode` consistentes (ver punto 10). Del lado del frontend, decidí no dejar esos errores morir en la consola ni usar `alert()` — hice un `ToastService` chiquito, basado en un signal con una cola de notificaciones, que cualquier servicio puede llamar (`toastService.error('chat.errors.sendFailed')`) sin acoplarse a ningún componente visual.

* **Por qué una cola y no un solo mensaje:** si fallan dos cosas casi al mismo tiempo (por ejemplo, mandar un mensaje Y preguntarle al copiloto), las dos notificaciones tienen que poder convivir en pantalla en vez de que la segunda tape a la primera.
* **Se autodestruyen solas a los 5 segundos** (`dismiss()` con `setTimeout`), pero también se pueden cerrar a mano — no hay que forzar a nadie a esperar a que desaparezcan.
* **Los mensajes de error de un mensaje fallido no solo van a un toast:** el mensaje en sí se queda visible en el chat marcado como `failed`, con un botón de "Reintentar" al lado (ver `ChatContainerComponent`). El toast avisa que algo pasó; el estado del mensaje deja claro *cuál* mensaje fue y da una forma inmediata de arreglarlo.