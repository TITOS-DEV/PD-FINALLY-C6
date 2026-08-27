# Requirements Evaluation — Riwi Internal Messenger

Legend: ✅ Compliant · ⚠️ Partial / Requires Review · ❌ Pending

---

## 1. Analysis, Normalization, and Data Modeling

- ✅ **Entity-Relationship Model** — `database/MER.pdf`. 7 entities, PK/FK constraints, cardinalities visible in diagram.
- ✅ **Primary Key Strategy Rationale** — All primary keys use `UUID` (`gen_random_uuid()`), documented in `DECISIONS.md` §1 (prevents collisions in concurrent multi-client inserts without exposing sequential row counts).
- ✅ **`seed.json`** — `database/seeds/seed.json`, containing `normalization_documentation` explaining 1NF/2NF/3NF rationale.
- ⚠️ `seed.json` documents normalization levels; business constraints are enforced via table DDL CHECK/FK rules.

## 2. PostgreSQL Database Implementation

- ⚠️ **Database Naming `bd_firstname_lastname_clan`** — Managed Supabase projects restrict default database renaming (`postgres`). Note: verify platform evaluator acceptance of Supabase project naming or local Postgres alternative.
- ✅ All tables and columns named in English using the `rw_` prefix — `database/ddl/tables.sql`.
- ✅ Complete DDL: PKs, FKs with explicit `ON DELETE` rules (`RESTRICT` on messages/channels to prevent accidental history loss; `CASCADE` on embeddings/read status/refresh tokens), `UNIQUE` constraints (`rw_users_email_unique`), partial unique index (`idx_rw_active_refresh_token_unique`), `NOT NULL` rules, `CHECK` constraints (`role`, `status`, non-empty `content`), and `timestamptz` on all timestamps.

## 3. Database Business Logic & Security

- ✅ **RLS Enabled** across all 7 tables, including channels and messages — `database/rls/activate_rls.sql`.
- ✅ Transactional security context via `BEGIN…COMMIT` block demoting connection to `authenticated` role (`withRLSContext.ts`).
- ✅ User identity bound per transaction via Supabase standards (`request.jwt.claims` + `auth.uid()`) — see `DECISIONS.md` §8.
- ✅ **Application Role Demotion** — Backend connects with pooler privileges but self-demotes to `authenticated` (`SET LOCAL ROLE authenticated`) per request before querying tables — `withRLSContext.ts`.
- ✅ **Conversations View** — `rw_user_conversations` in `database/views/view_conversations.sql`.
- ✅ **Stored Procedures** — `rw_sp_search_users` (user search) and `rw_sp_manage_user` (`UPDATE` / `SOFT_DELETE`) in `database/views/view_conversations.sql`.

## 4. Search, Context Retrieval, and Data Security

- ✅ Copilot searches exclusively in channels where the user is a member — enforced via dual check: explicit SQL JOIN with `rw_channel_members` (`SupabaseMessageEmbeddingRepository.findSimilarInUserChannels`) + RLS fallback policy on `rw_message_embeddings`. E2E tested.
- ✅ Vector DB support (`pgvector`, `vector(1536)` column + HNSW index) & pluggable embedding provider (OpenAI, Gemini) — `rw_message_embeddings`, `OpenAIProvider.ts`.
- ✅ No physical deletion of messages (`deleted_at`, zero `DELETE` operations).
- ✅ Parameterized SQL queries preventing SQL injection (`$1, $2...` via `pg`).
- ✅ Keyset pagination without `OFFSET` — `SupabaseMessageRepository.findByChannel`.

## 5. Backend & REST API Architecture

- ✅ Clean Architecture layers (`domain/use-cases/infrastructure/presentation`), domain strictly decoupled from external SDKs.
- ✅ Single-responsibility use cases (`SendMessage`, `EditMessage`, `AskCopilot`, etc.).
- ✅ SOLID principles & Strategy/Adapter pattern for LLMs (`AIProviderFactory.ts`, documented in `DECISIONS.md` §9).
- ✅ Standard HTTP status codes, uniform error pipeline (`AppError` + `errorHandler.ts`), `X-Correlation-ID` header tracing, keyset pagination.

## 6. Authentication & Authorization

- ✅ Secure authentication using bcrypt password hashing.
- ✅ Short-lived access tokens + refresh token rotation with hashed database storage (`token_hash`).
- ✅ Routes protected by `authMiddleware`; `userId` parsed securely from verified JWT payload (`req.user.sub`).
- ✅ Authenticated identity propagated to PostgreSQL RLS policies (`withRLSContext`).

## 7. Frontend Architecture

- ✅ Layout featuring conversation view, copilot assistant panel, and user profile (`ChatContainer`, `CopilotPanel`, `ProfileCard`/`ProfileModal`).
- ✅ Message status handling: pending / sent / failed with retry capability.
- ✅ Deferred pagination preserving scroll position (`ChatContainer.loadOlderMessages`), loading skeletons, empty states, and toast error handlers.
- ✅ Responsive drawer navigation for mobile, English/Spanish localization via `ngx-translate`, zero hardcoded template strings.

## 8. AI Copilot (RAG)

- ✅ RAG assistant scoped to authenticated user context (RLS + explicit join).
- ✅ Source attribution provided per answer (`sources` array with `messageId`, author name, and similarity score).
- ✅ Explicit negative fallback when insufficient context is retrieved (`copilot.noSources`).
- ✅ Swappable AI provider adapters (`ILLMProvider`/`IEmbeddingProvider`, implementing OpenAI and Gemini).

## 9. Testing & Evidence

- ✅ PostgreSQL integration tests in `tests/e2e/messages.e2e.test.ts` verifying channel access block enforcement via RLS rules.
