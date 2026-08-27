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

---

# Frontend (apps/web)

Angular 21 (standalone + Signals), con estética Fluent/Microsoft 365 y Tailwind CSS.

> **Nota de versión:** el enunciado pedía "la última versión estable" de Angular. Al armar el proyecto, la v22 (la más nueva) exige Node ≥22.22.3 / ≥24.15.0 / ≥26, una versión más nueva que la disponible en el entorno de desarrollo. Por eso el proyecto quedó en **Angular 21.2** (la estable anterior, totalmente soportada). Si tu máquina tiene Node 24.15+ o 26+, podés subir con `ng update @angular/core@22 @angular/cli@22`. Ver DECISIONS.md, sección 12.

## 1. Qué necesitas instalado

- Node.js 20.19+, 22.12+ o 24+ (ver la nota de arriba)
- pnpm (el monorepo completo usa pnpm workspaces)
- El backend de `apps/api` corriendo (ver la sección de arriba) — el frontend no funciona solo, necesita la API para todo: login, canales, mensajes, copiloto.

## 2. Variables de entorno

A diferencia del backend, Angular no lee un `.env` en tiempo de ejecución — todo se resuelve en **tiempo de build**, en los archivos de `src/environments/`:

- `environment.development.ts`: el que se usa con `ng serve` / `npm start`. Ya viene apuntando a `http://localhost:4000` (el backend local).
- `environment.ts`: el que se usa en `ng build` (producción). Trae rutas relativas (`/api`) asumiendo que el frontend se sirve detrás del mismo dominio/reverse proxy que la API.

Si tu backend corre en otro puerto o dominio, edita el archivo que corresponda antes de compilar.

## 3. Levantar el frontend en desarrollo

```bash
cd apps/web
pnpm install   # si no lo hiciste ya desde la raíz del monorepo
pnpm start     # alias de `ng serve`
```

Queda en `http://localhost:4200`. Necesita el backend corriendo en paralelo (`http://localhost:4000` por defecto) para que el login y todo lo demás funcionen.

## 4. Compilar para producción

```bash
cd apps/web
pnpm run build
```

El resultado queda en `apps/web/dist/web/browser` — listo para servir con cualquier servidor de archivos estáticos (Nginx, Caddy, etc.) detrás del mismo dominio que la API, o configurando CORS si quedan en dominios distintos (ver `CORS_ORIGIN` en el `.env` del backend).

## 5. Estructura del proyecto

```
src/app/
  core/               → servicios de toda la app: auth (login/refresh/logout), i18n, WebSocket
  features/
    auth/               → pantalla de login/registro
    chat/                 → canales, historial de mensajes, el composer
    copilot/              → el panel de IA con RAG
    profile/              → tarjeta de usuario + selector de idioma
  shared/ui/          → piezas visuales reutilizables sin lógica de negocio (Avatar, EmptyState, Toast...)
public/i18n/          → diccionarios de traducción (es.json, en.json)
```

## 6. Probarlo

1. Levanta el backend (ver arriba) y aplica el seed si todavía no lo hiciste.
2. Levanta el frontend (`pnpm start`) y entra a `http://localhost:4200`.
3. Inicia sesión con `jhonatan@riwi.io` / `Password123!` (ver la tabla de usuarios sembrados más arriba).
4. Deberías ver tus canales a la izquierda, el chat en el centro y el copiloto a la derecha (en mobile, los dos primeros son drawers que se abren con los botones de la barra superior).
5. Envía un mensaje — debería aparecer al toque como "Enviando…" y pasar a confirmado apenas el backend responde.
6. Pregúntale algo al copiloto sobre lo que se habló en tus canales — la respuesta debería venir con las fuentes citadas debajo.
