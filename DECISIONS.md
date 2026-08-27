# DECISIONS.md - Technical Decision Log & Rationale

**Project:** Riwi Internal Messenger  
**Author:** Jhonatan Cadavid Betancur  
**Role:** Fullstack Developer in Training  

---

## 1. Data Architecture and Normalization up to 3NF

I structured the database tables by atomically separating users, channels, channel memberships, and messages.

* **Why 3NF:** To eliminate data redundancy. User information (name, email, role) exists solely in `rw_users`. If a user updates their name, we do not need to update dozens of records across message tables.
* **`rw_` Prefix:** All tables, constraints, and custom functions use the `rw_` prefix to maintain consistency and prevent naming collisions within shared PostgreSQL schemas.

---

## 2. Data-Level Security (PostgreSQL RLS vs Backend Enforcement)

Rather than placing full security enforcement responsibility on the application layer (Node.js), I activated **Row Level Security (RLS)** directly in PostgreSQL.

* **Rationale:** If the backend ever encounters a bug in a SQL filter or route check, the database engine independently rejects any unauthorized query if the user does not belong to the requested channel.
* **Optimization via `is_admin()`:** To prevent infinite recursive calls on `rw_users` when validating roles during RLS policy execution, I implemented a custom security definer function (`SECURITY DEFINER SET search_path = public`). This performs admin check execution in a fast, isolated query.

---

## 3. Keyset Pagination vs OFFSET Pagination

For message history retrieval (`Query 1`), I implemented **Keyset Pagination** using `(created_at, id) < (cursor_date, cursor_id)` instead of traditional `OFFSET / LIMIT`.

* **Rationale:** `OFFSET` degrades rapidly as datasets scale because Postgres must scan and discard thousands of rows before returning requested results. Keyset pagination leverages the B-Tree index `idx_rw_messages_channel_created` directly, delivering instant $O(1)$ page fetches regardless of how deep into chat history a user scrolls.

---

## 4. Soft Delete Strategy for Messages

Physical hard deletion (`DELETE FROM rw_messages`) is strictly prohibited by project requirements.

* **Implementation:** Uses a `deleted_at TIMESTAMPTZ` column. When a user deletes a message, we mark the timestamp.
* **Advantage:** Preserves referential integrity for auditability, avoids breaking conversation flow sequences, and allows vector search indexes for AI copilot queries to easily filter out deleted content (`deleted_at IS NULL`).

---

## 5. HNSW Vector Index for Copilot (RAG)

For the `rw_message_embeddings` table, I created a vector index using the **HNSW (Hierarchical Navigable Small World)** algorithm with cosine distance (`vector_cosine_ops`).

* **Rationale:** HNSW offers superior vector similarity search performance compared to IVFFlat on dynamic tables experiencing ongoing inserts, as it does not require periodic index re-clustering/re-training to maintain high search recall.

---

## 6. Authentication and Refresh Tokens with Rotation

Rather than using long-lived stateless tokens or simple session IDs, I implemented token pairs: short-lived **Access Tokens (JWT)** and database-persisted **Refresh Tokens**.

* **Partial Unique Index:** Implemented `idx_rw_active_refresh_token_unique` on `rw_refresh_tokens (user_id) WHERE revoked_at IS NULL`. This guarantees at the database engine level that a user can only hold **one active refresh token at any given time**, automatically revoking older sessions when a new token is issued and neutralizing token reuse attacks.

---

## 7. Backend Architecture: Clean Architecture Rationale

The backend (`apps/api`) is structured into `domain`, `use-cases`, `infrastructure`, and `presentation`. Below is the practical reasoning behind this multi-layered separation:

* **Inward Dependency Rule:** `domain` (entities like `User` or `Message`, repository interfaces like `IMessageRepository`) contains zero dependencies on Express, `pg`, or OpenAI. `use-cases` (such as `SendMessage.ts` or `AskCopilot.ts`) depend strictly on domain abstractions. `infrastructure` contains concrete implementations (`pg`, JWT, OpenAI SDK).
* **Maintainability & Decoupling:** If we switch from OpenAI to Gemini or migrate database drivers, changes remain isolated inside `infrastructure` and a single configuration line. Business logic (`SendMessage`, `AskCopilot`) remains completely untouched. See `AIProviderFactory.ts`: a single-line switch per provider without importing vendor SDKs inside use cases.
* **Fast Unit Testing:** In `tests/unit/SendMessage.test.ts`, business validation (e.g., rejecting empty messages or non-member posting) runs in milliseconds using mock implementations of `IMessageRepository` without requiring a running database.
* **Encapsulated Presentation Layer:** `presentation` handles Express, route definitions, Zod validation, and Socket.io events. Controllers such as `MessageController.ts` parse requests, invoke use cases, and format HTTP responses without embedding domain business rules.

---

## 8. Custom JWT Integration with PostgreSQL RLS

This details how custom application JWTs integrate directly with PostgreSQL Row Level Security without relying on Supabase Auth (GoTrue):

* **Mechanism:** `auth.uid()` (used across RLS policies) reads the Postgres session variable `request.jwt.claims`. Usually PostgREST sets this variable. Since we generate custom JWTs (Section 6), `withRLSContext.ts` sets this session context explicitly.
* **Transaction Isolation (`withRLSContext.ts`):** For each authenticated request, a database transaction is opened to set session config:
  ```sql
  BEGIN;
  SELECT set_config('request.jwt.claims', '{"sub":"<user-id>","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  -- Request queries run here
  COMMIT;
  ```
  The third parameter (`is_local = true`) scopes `set_config` strictly to the transaction lifecycle. Upon `COMMIT` or `ROLLBACK`, session variables reset automatically. This prevents connection pool state leakage between distinct HTTP requests.
* **Role Demotion (`SET ROLE authenticated`):** The backend connects using elevated privileges but **self-demotes** to `authenticated` within each transaction before touching user data tables. Even in the event of an application-level bug, queries cannot bypass RLS policy boundaries.
* **Direct `pg` Connection:** We connect via `pg.Pool` directly rather than `@supabase/supabase-js` to retain control over session variables and transaction-level RLS context switching.

---

## 9. AI Adapter Pattern: Decoupling LLM & Vector Providers

The copilot requires two capabilities: text-to-vector embedding generation and natural language chat completion. Instead of hardcoding vendor SDK calls inside `AskCopilot.ts`, domain ports `ILLMProvider` and `IEmbeddingProvider` define these contracts.

* **Flexibility:** `AskCopilot.ts` depends solely on domain contracts. `AIProviderFactory.ts` checks `AI_PROVIDER` from environment variables to instantiate `OpenAIProvider` or `GeminiProvider`.
* **Embedding Model Nuances:** While chat completion models can be swapped seamlessly, changing embedding dimensions requires schema alignment. `rw_message_embeddings.embedding` is typed as `vector(1536)` (matching OpenAI `text-embedding-3-small`). Swapping to a 768-dimension provider requires modifying column dimensions or using a compatible 1536-dimension embedding model.

---

## 10. Error Handling Strategy

Errors are handled via a centralized, predictable pipeline:

* **`AppError` Hierarchy:** Base class `AppError` (`domain/errors/AppError.ts`) is inherited by specialized errors: `ValidationError` (400), `UnauthorizedError` (401), `ForbiddenError` (403), `NotFoundError` (404), and `ConflictError` (409). Each error includes an HTTP status code and a machine-readable error `code`.
* **Centralized `errorHandler.ts`:** Inspects caught errors. Known `AppError` instances return structured JSON payloads with their designated status codes. Unhandled native errors return a sanitized `500 - Something went wrong` response while logging full stack traces with the request `X-Correlation-ID`.
* **`asyncHandler.ts` Wrapper:** Wraps asynchronous controller route handlers to forward unhandled promise rejections directly to Express error handling middleware.

---

## 11. Testing Architecture: Mocks vs Real E2E

Testing is divided into two distinct scopes:

* **Unit Tests (`tests/unit`, `pnpm test`):** Test isolated use cases using mock repositories. They execute in memory without network or database dependencies.
* **End-to-End Tests (`tests/e2e`, `pnpm test:e2e`):** Instantiates the full Express app via `supertest` against a real database instance to validate JWT verification, transaction context propagation, and database RLS enforcement.
* **Vitest Runner:** Vitest executes TypeScript natively with fast performance and Jest-compatible assertion syntax.
* **Security Validation:** E2E tests specifically verify that non-member access attempts (e.g. `admin@riwi.io` accessing private channels) are blocked by database RLS rules.

---

## 12. Frontend Framework: Angular Standalone & Signals

`apps/web` uses Angular with standalone components, Signals state management, and `@angular/build:application` (esbuild/Vite).

* **Framework Selection:** Provides integrated routing, HTTP handling, form validation, and dependency injection out of the box.
* **Angular Version Note:** Built with Angular 21.2 to ensure compatibility across Node.js 20+ and 24+ environments. Upgradable to v22 via `ng update @angular/core@22 @angular/cli@22`.
* **Standalone Architecture:** Eliminates `NgModule` boilerplate, declaring explicit component dependencies within `@Component` decorators.

---

## 13. State Management: Signals & RxJS

State management uses a hybrid strategy combining Signals and RxJS based on use case:

* **Signals for Synchronous Reactive State:** `ChatStore` (active messages, loading states, pagination cursors), `AuthService` (current session), and `I18nService` (active locale) use Signals for simple UI bindings without subscription management overhead.
* **RxJS for Asynchronous Data Streams:** Used for HTTP requests, authentication interceptors (`catchError`, `switchMap`), and WebSocket event streams (`SocketService.onNewMessage()`).
* **Integration Pattern:** HTTP and WebSocket streams resolve data via RxJS and update Signals (`.subscribe(data => signal.set(data))`), keeping component templates cleanly bound to Signals.

---

## 14. Scroll Position Preservation in Keyset Pagination

When loading historical messages, inserting items at the top of a scroll container can cause UI scroll jumping. `ChatContainerComponent` (`loadOlderMessages()`) handles scroll adjustments:

1. Captures pre-fetch container `scrollHeight` and `scrollTop`.
2. Triggers `ChatStore.loadMoreMessages()` to prepend historical items.
3. Invokes `afterNextRender()` to execute post-DOM render logic.
4. Calculates height delta (`newScrollHeight - oldScrollHeight`) and updates `scrollTop` accordingly.

This retains visual scroll positioning seamlessly during pagination.

---

## 15. Modular UI Architecture

`src/app` is organized by feature modules:

```
core/         → Global services (auth, i18n, WebSocket)
features/     → Feature domains (chat, copilot, profile, auth) containing local components/services
shared/ui/    → Presentational components (Avatar, EmptyState, Skeleton, Toast)
```

* **Fluent Design Tokens:** Design tokens (colors, border radii, typography) are defined in `src/styles.css` using CSS custom properties (`--color-brand-500`, `--radius-fluent`).
* **Decoupled Presentational Components:** `shared/ui` components accept data via inputs without direct dependencies on feature services.

---

## 16. Authentication Interceptor with Token Refresh

`authInterceptor` is a functional interceptor (`HttpInterceptorFn`) managing silent token refresh:

* **Concurrency Management:** Uses module-scoped state (`isRefreshing`, `refreshedToken$`) to serialize concurrent 401 HTTP failures. The first failing request triggers token refresh; concurrent requests queue and retry upon new access token issuance.
* **Session Termination:** If token refresh fails (expired or revoked refresh token), local session state is cleared and user is redirected to `/login`.

---

## 17. Internationalization (i18n)

Internationalization is powered by `ngx-translate`:

* **Dynamic Runtime Switching:** Enables instant language switching without page reloads or multi-bundle deployment requirements.
* **`I18nService` Abstraction:** Encapsulates translation loading, locale switching, and `localStorage` persistence. UI components access translations via the `translate` pipe.
* **App Initializer:** `provideAppInitializer` waits for initial translation dictionary load before app rendering, preventing un-translated key flicker.

---

## 18. Frontend Error Handling

API errors are communicated visually via `ToastService`:

* **Notification Queue:** Uses a Signal-backed notification queue to display multiple concurrent toast messages without overwriting active alerts.
* **Auto-Dismissal:** Toast alerts auto-dismiss after 5 seconds or allow manual dismissal.
* **Message Retry:** Failed message send attempts update local message state to `failed` with an inline retry action in addition to toast notification.