# Riwi Internal Messenger

Plataforma de mensajería interna en tiempo real con seguridad a nivel de fila (RLS) en PostgreSQL/Supabase y un copiloto de IA con RAG (busca en tus propios mensajes y te responde con eso).

Este README es para levantar el **backend** (`apps/api`). La base de datos ya vive en un proyecto de Supabase real — no hay Postgres local en este repo (ver [DECISIONS.md](./DECISIONS.md) para el porqué).

---

## 1. Qué necesitas instalado

- Node.js 20 o superior
- pnpm (`corepack enable` si no lo tienes, o `npm i -g pnpm`)
- Una cuenta y un proyecto en [Supabase](https://supabase.com) (plan gratis alcanza)
- Docker + Docker Compose (opcional, solo si quieres correrlo en contenedor)
- Una API key de OpenAI (o de Gemini) para el copiloto

## 2. Estructura del proyecto

```
apps/api/                  → el backend (Node.js + TypeScript, Clean Architecture)
  src/domain/               → entidades, interfaces de repos y de IA (no depende de nada externo)
  src/use-cases/             → la lógica de cada funcionalidad (login, enviar mensaje, preguntar al copiloto...)
  src/infrastructure/        → implementación real: Postgres (pg), JWT, adaptadores de IA
  src/presentation/          → Express, rutas, middlewares, WebSockets
  tests/unit/                 → pruebas rápidas con dobles de prueba (no tocan la BD)
  tests/e2e/                  → pruebas contra tu Supabase real
database/                  → DDL, RLS, triggers, vistas, seed (ya aplicados en el Supabase real, quedan acá como referencia y para poder reconstruir la BD)
docker-compose.yml         → levanta el backend en contenedor
.env.example               → plantilla de variables de entorno
```

## 3. Preparar la base de datos en Supabase

Si tu proyecto de Supabase todavía no tiene las tablas `rw_*`, corre estos archivos **en este orden exacto** desde el SQL Editor de Supabase (o con `psql` usando el connection string de tu proyecto):

```bash
psql "$DATABASE_URL" -f database/ddl/tables.sql
psql "$DATABASE_URL" -f database/ddl/indexs.sql
psql "$DATABASE_URL" -f database/functions/triggers.sql
psql "$DATABASE_URL" -f database/rls/activate_rls.sql
psql "$DATABASE_URL" -f database/views/view_conversations.sql
psql "$DATABASE_URL" -f database/seeds/seed.sql
```

> `database/ddl/tables.sql` no incluye `rw_message_embeddings`, `rw_message_read_status` ni `rw_refresh_tokens` (esas quedaron documentadas en el MER, `database/MER.pdf`). Si tu proyecto de Supabase no las tiene todavía, créalas con esa misma forma antes de correr `activate_rls.sql`, que sí las referencia.

El seed deja 3 usuarios de prueba, todos con la contraseña **`Password123!`**:

| Usuario | Email | Rol |
|---|---|---|
| Admin Riwi | admin@riwi.io | admin |
| Jhonatan Cadavid | jhonatan@riwi.io | user |
| Sofia Gomez | sofia@riwi.io | user |

Y 2 canales: **General** (los 3 usuarios) y **Desarrollo Cohorte 6** (solo Jhonatan y Sofia — útil para probar que RLS bloquea al admin ahí).

## 4. Variables de entorno

```bash
cp .env.example .env
```

Completa al menos:

- `DATABASE_URL`: en Supabase, ve a **Project Settings → Database → Connection string**. Usa el modo **"Session pooler"** (host tipo `aws-0-<region>.pooler.supabase.com:5432`), **no** "Direct connection" ni "Transaction pooler":
  - La conexión **directa** (`db.<ref>.supabase.co`) solo tiene dirección **IPv6** salvo que pagues el add-on de IPv4 de Supabase — la mayoría de redes caseras, de CI o de Docker no tienen salida IPv6 y vas a ver un error `ENETUNREACH`.
  - El **Session pooler** sí es IPv4 y se comporta idéntico a la conexión directa (mantiene la sesión completa), así que nuestro truco de `BEGIN` / `SET LOCAL ROLE` / `COMMIT` para activar RLS (ver DECISIONS.md) sigue funcionando sin cambiar nada de código.
  - El **Transaction pooler** (mismo host, puerto `6543`) también es IPv4 pero rota la conexión física entre sentencias de una forma que choca con los prepared statements de `pg` — evítalo acá.
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`: cualquier string largo y random. Por ejemplo: `openssl rand -hex 32`.
- `OPENAI_API_KEY`: para que el copiloto funcione. Si prefieres Gemini, pon `AI_PROVIDER=gemini` y `GEMINI_API_KEY`.

## 5. Levantar el proyecto

### Opción A — local, sin Docker

```bash
pnpm install
pnpm --filter @riwi/api dev
```

El servidor queda escuchando en `http://localhost:4000`.

### Opción B — con Docker

```bash
docker compose up --build
```

Mismo resultado, en un contenedor. El `docker-compose.yml` solo levanta el servicio `api` (no hay Postgres local: la base de datos es tu proyecto real de Supabase).

Verifica que levantó bien:

```bash
curl http://localhost:4000/health
# {"status":"ok"}
```

## 6. Probar los endpoints principales

Todas las rutas viven bajo `/api`. Cada respuesta incluye un header `X-Correlation-ID` — mándalo tú mismo si quieres seguirle el rastro a una request en los logs, o deja que el servidor te genere uno.

### Login

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"jhonatan@riwi.io","password":"Password123!"}'
```

Guarda el `accessToken` y el `refreshToken` de la respuesta.

### Listar mis canales

```bash
curl http://localhost:4000/api/channels \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### Enviar un mensaje

```bash
curl -X POST http://localhost:4000/api/channels/a1111111-1111-1111-1111-111111111111/messages \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"Hola equipo!"}'
```

### Leer mensajes (paginación por keyset)

```bash
# primera página
curl "http://localhost:4000/api/channels/a1111111-1111-1111-1111-111111111111/messages?limit=20" \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# la respuesta trae "nextCursor": { "createdAt": "...", "id": "..." } — úsalo así:
curl "http://localhost:4000/api/channels/a1111111-1111-1111-1111-111111111111/messages?limit=20&cursorCreatedAt=<createdAt>&cursorId=<id>" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### Preguntarle al copiloto (RAG)

```bash
curl -X POST http://localhost:4000/api/copilot/ask \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question":"¿Qué se ha hablado sobre RLS?"}'
```

Solo va a encontrar contexto en mensajes de canales a los que ese usuario pertenece — pruébalo logueado como `admin@riwi.io` preguntando algo que solo se habló en "Desarrollo Cohorte 6" y compara la respuesta.

### Refrescar el access token

```bash
curl -X POST http://localhost:4000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"'$REFRESH_TOKEN'"}'
```

Te devuelve un par nuevo. El `refreshToken` que usaste queda revocado — si intentas usarlo otra vez, te va a rechazar (así se detecta un token robado que un atacante intenta reusar).

### WebSocket (mensajes en tiempo real)

```js
import { io } from "socket.io-client";

const socket = io("http://localhost:4000", { auth: { token: accessToken } });

socket.on("connect", () => {
  socket.emit("join:channel", "a1111111-1111-1111-1111-111111111111", (joined) => {
    console.log("¿me pude unir?", joined); // false si no eres miembro del canal
  });
});

socket.on("message:new", (message) => console.log("nuevo mensaje:", message));
```

## 7. Correr las pruebas

```bash
cd apps/api

# unitarias: rápidas, con dobles de prueba, no necesitan .env
pnpm test

# e2e: pegan contra tu Supabase real (necesitas el .env configurado y el seed aplicado)
pnpm test:e2e

# las dos juntas
pnpm test:all
```

## 8. Documentación adicional

- [DECISIONS.md](./DECISIONS.md) — por qué se tomó cada decisión técnica importante, explicado sin vueltas.
- `database/MER.pdf` — diagrama entidad-relación completo.
