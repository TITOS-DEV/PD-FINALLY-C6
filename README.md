# Riwi Internal Messenger

Real-time internal messaging platform featuring Row Level Security (RLS) in PostgreSQL/Supabase and an AI Copilot with RAG (searches within your own messages to answer queries).

This README is for setting up the **backend** (`apps/api`) and **frontend** (`apps/web`). The database lives in a real Supabase project — there is no local Postgres in this repo by design (see [DECISIONS.md](./DECISIONS.md) for details).

---

## 1. Prerequisites

- Node.js 20 or higher
- pnpm (`corepack enable` if not installed, or `npm i -g pnpm`)
- An account and project on [Supabase](https://supabase.com) (free plan is sufficient)
- Docker + Docker Compose (optional, if running in containers)
- An OpenAI API key (or Gemini API key) for the copilot

## 2. Project Structure

```
apps/api/                  → Backend (Node.js + TypeScript, Clean Architecture)
  src/domain/               → Entities, repository interfaces, and AI providers (no external dependencies)
  src/use-cases/             → Business logic (login, send message, ask copilot, etc.)
  src/infrastructure/        → Real implementations: Postgres (pg), JWT, AI adapters
  src/presentation/          → Express, routes, middlewares, WebSockets
  tests/unit/                 → Fast unit tests with test doubles (no DB connection needed)
  tests/e2e/                  → E2E tests running against your real Supabase instance
database/                  → DDL, RLS, triggers, views, seeds (reference schema & migration runner)
docker-compose.yml         → Container orchestrator for backend & frontend services
.env.example               → Environment variables template
```

## 3. Database Setup in Supabase

The easiest method — a single migration script that runs everything in proper order (tables, indexes, triggers, RLS, views, and seeds):

```bash
./database/migrate.sh
```

Reads `DATABASE_URL` from your `.env` file (or from environment variables), and populates 3 test users / 2 channels / 2 sample messages. Designed for a new project or rebuilding schema from scratch. Triggers and RLS policies in Postgres are non-idempotent, so re-running the script may output `ERROR: ... already exists` (tolerated gracefully by the script).

To execute each step manually (e.g. via Supabase SQL Editor), run in this exact order:

```bash
psql "$DATABASE_URL" -f database/ddl/tables.sql
psql "$DATABASE_URL" -f database/ddl/indexs.sql
psql "$DATABASE_URL" -f database/functions/triggers.sql
psql "$DATABASE_URL" -f database/rls/activate_rls.sql
psql "$DATABASE_URL" -f database/views/view_conversations.sql
psql "$DATABASE_URL" -f database/seeds/seed.sql
```

The seed creates 3 test users with password **`Password123!`**:

| User | Email | Role |
|---|---|---|
| Admin Riwi | admin@riwi.io | admin |
| Jhonatan Cadavid | jhonatan@riwi.io | user |
| Sofia Gomez | sofia@riwi.io | user |

And 2 channels: **General** (includes all 3 users) and **Desarrollo Cohorte 6** (includes Jhonatan and Sofia — useful for testing RLS block on admin).

## 4. Environment Variables

```bash
cp .env.example .env
```

Configure at least:

- `DATABASE_URL`: In Supabase, navigate to **Project Settings → Database → Connection string**. Use **"Session pooler"** mode (`aws-0-<region>.pooler.supabase.com:5432`), **not** "Direct connection" or "Transaction pooler":
  - **Direct connection** (`db.<ref>.supabase.co`) is IPv6-only unless paying for IPv4 add-on — IPv6 is often unreachable in local/Docker/CI environments.
  - **Session pooler** supports IPv4 and preserves session variables required by `BEGIN` / `SET LOCAL ROLE` / `COMMIT` RLS strategy (see DECISIONS.md).
  - **Transaction pooler** (port `6543`) conflicts with `pg` prepared statements.
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`: Random secret string (e.g., `openssl rand -hex 32`).
- `OPENAI_API_KEY`: For copilot features. If using Gemini, set `AI_PROVIDER=gemini` and `GEMINI_API_KEY`.

## 5. Running the Application

### Option A — Local Development (no Docker)

```bash
pnpm install
pnpm --filter @riwi/api dev
```

The API server runs on `http://localhost:4000`.

### Option B — Docker Compose

```bash
docker compose up --build
```

Builds and starts both the `api` and `web` services.

Verify health status:

```bash
curl http://localhost:4000/health
# {"status":"ok"}
```

## 6. Testing Key Endpoints

All REST routes live under `/api`. Each response includes an `X-Correlation-ID` header.

### Authentication (Login)

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"jhonatan@riwi.io","password":"Password123!"}'
```

Returns `accessToken` and `refreshToken`.

### List User Channels

```bash
curl http://localhost:4000/api/channels \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### Send Message

```bash
curl -X POST http://localhost:4000/api/channels/a1111111-1111-1111-1111-111111111111/messages \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"Hello team!"}'
```

### Read Messages (Keyset Pagination)

```bash
# First page
curl "http://localhost:4000/api/channels/a1111111-1111-1111-1111-111111111111/messages?limit=20" \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# Subsequent page using nextCursor
curl "http://localhost:4000/api/channels/a1111111-1111-1111-1111-111111111111/messages?limit=20&cursorCreatedAt=<createdAt>&cursorId=<id>" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### Ask Copilot (RAG)

```bash
curl -X POST http://localhost:4000/api/copilot/ask \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question":"What has been discussed regarding RLS?"}'
```

### Refresh Access Token

```bash
curl -X POST http://localhost:4000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"'$REFRESH_TOKEN'"}'
```

### WebSockets (Real-time Messaging)

```js
import { io } from "socket.io-client";

const socket = io("http://localhost:4000", { auth: { token: accessToken } });

socket.on("connect", () => {
  socket.emit("join:channel", "a1111111-1111-1111-1111-111111111111", (joined) => {
    console.log("Joined successfully?", joined);
  });
});

socket.on("message:new", (message) => console.log("New message:", message));
```

## 7. Running Tests

```bash
cd apps/api

# Unit tests: fast, uses mocks, no database required
pnpm test

# E2E tests: connects against real Supabase database
pnpm test:e2e

# All tests
pnpm test:all
```

## 8. Additional Documentation

- [DECISIONS.md](./DECISIONS.md) — Technical decision log and architecture rationale.
- [ARCHITECTURE.md](./ARCHITECTURE.md) — Architectural layer diagrams and request flows.
- [EVALUACION_REQUISITOS.md](./EVALUACION_REQUISITOS.md) — Requirements compliance evaluation.
- `database/MER.pdf` — Entity-Relationship Diagram.

---

# Frontend (apps/web)

Angular 21 (standalone components + Signals), Fluent/Microsoft 365 design system, and Tailwind CSS.

## 1. Development Setup

```bash
cd apps/web
pnpm install
pnpm start
```

App runs at `http://localhost:4200`. Requires backend running at `http://localhost:4000`.

## 2. Production Build

```bash
cd apps/web
pnpm run build
```

Build output is generated in `apps/web/dist/web/browser`.

## 3. Project Structure

```
src/app/
  core/               → Application services: auth, i18n, WebSockets
  features/
    auth/               → Authentication pages (login)
    chat/                 → Channels, message history, composer
    copilot/              → AI RAG panel
    profile/              → User profile & language picker
  shared/ui/          → Reusable UI components (Avatar, EmptyState, Toast, Skeleton)
public/i18n/          → Translation files (es.json, en.json)
```
Link to watch the video demo: https://youtu.be/J5kHbo64mOM