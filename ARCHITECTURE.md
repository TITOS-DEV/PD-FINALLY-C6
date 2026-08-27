# Architecture — Riwi Internal Messenger

Quick architectural overview of `apps/api`. For full rationale behind key technical choices, see [DECISIONS.md](./DECISIONS.md).

## Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ presentation/            Express, routes, Zod, Socket.io     │
│   http/controllers  →   use-cases  →   domain (interfaces)   │
│   http/middlewares       ↑                                   │
│   websocket               │                                  │
└───────────────────────────┼──────────────────────────────────┘
                             │ implements
┌────────────────────────────▼──────────────────────────────────┐
│ infrastructure/          pg, JWT, bcrypt, OpenAI/Gemini SDK    │
│   db/          repositories/          ai/          auth/      │
└─────────────────────────────────────────────────────────────┘
```

- **domain**: Entities (`User`, `Message`...) and ports/interfaces (`IMessageRepository`, `ILLMProvider`...). It has zero dependencies on `express`, `pg`, or third-party SDKs.
- **use-cases**: Single-responsibility classes for business actions (`SendMessage`, `AskCopilot`...). They depend strictly on domain interfaces passed via constructors.
- **infrastructure**: Implements domain interfaces against real Postgres, JWT, and AI provider SDKs.
- **presentation**: The HTTP/WebSocket interface. Controllers act as glue: binding database context, invoking use cases, and returning responses.

## Authenticated Request Flow (Send Message)

```
POST /api/channels/:id/messages
  → correlationId          (attaches X-Correlation-ID header)
  → authMiddleware          (verifies JWT, populates req.user)
  → validateRequest(zod)    (validates payload schema)
  → MessageController.send
      → withRLSContext(userId, db => ...)   (activates RLS: SET LOCAL ROLE authenticated + request.jwt.claims)
          → buildAuthenticatedContainer(db)
              → SendMessage.execute(...)     (verifies membership, calls repository)
                  → SupabaseMessageRepository.create(...)   (INSERT guarded by database RLS)
      ← responds 201 Created
      → (fire-and-forget) indexes embedding for copilot
      → emits "message:new" via Socket.io to channel members
```

## Copilot Flow (RAG)

```
POST /api/copilot/ask
  → authMiddleware + withRLSContext(userId, ...)
  → AskCopilot.execute({ userId, question })
      1. embeddingProvider.embed(question)                         → vector
      2. embeddingRepository.findSimilarInUserChannels(userId, ...) → user channels only (RLS + explicit join)
      3. filter by similarity >= 0.75
      4. llmProvider.generateAnswer(question, context)             → response
  ← { answer, sources }
```

`embeddingProvider` and `llmProvider` share the adapter instance (`OpenAIProvider` or `GeminiProvider`, resolved by `AIProviderFactory` based on `AI_PROVIDER`). `AskCopilot` remains vendor-agnostic.
