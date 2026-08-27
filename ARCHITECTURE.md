# Arquitectura — Riwi Internal Messenger

Mapa rápido de cómo está armado `apps/api`. Para el *porqué* de cada decisión, ver [DECISIONS.md](./DECISIONS.md).

## Capas

```
┌─────────────────────────────────────────────────────────────┐
│ presentation/            Express, rutas, Zod, Socket.io      │
│   http/controllers  →   use-cases  →   domain (interfaces)   │
│   http/middlewares       ↑                                   │
│   websocket               │                                  │
└───────────────────────────┼──────────────────────────────────┘
                             │ implementa
┌────────────────────────────▼──────────────────────────────────┐
│ infrastructure/          pg, JWT, bcrypt, OpenAI/Gemini SDK    │
│   db/          repositories/          ai/          auth/      │
└─────────────────────────────────────────────────────────────┘
```

- **domain**: entidades (`User`, `Message`...) e interfaces (`IMessageRepository`, `ILLMProvider`...). No importa nada de `express`, `pg` ni SDKs externos.
- **use-cases**: una clase por funcionalidad (`SendMessage`, `AskCopilot`...). Reciben interfaces del dominio por constructor, nunca implementaciones concretas.
- **infrastructure**: implementa esas interfaces contra Postgres, JWT y proveedores de IA reales.
- **presentation**: la única capa que le habla a HTTP/WebSockets. Los controllers son pegamento — arman el contexto de BD, llaman al caso de uso, devuelven la respuesta.

## Flujo de una request autenticada (enviar mensaje)

```
POST /api/channels/:id/messages
  → correlationId          (le pone un X-Correlation-ID a la request)
  → authMiddleware          (verifica el JWT, llena req.user)
  → validateRequest(zod)    (valida el body)
  → MessageController.send
      → withRLSContext(userId, db => ...)   (activa RLS: SET LOCAL ROLE authenticated + request.jwt.claims)
          → buildAuthenticatedContainer(db)
              → SendMessage.execute(...)     (valida membresía, llama al repo)
                  → SupabaseMessageRepository.create(...)   (INSERT protegido por RLS)
      ← responde 201
      → (fire-and-forget) indexa el embedding para el copiloto
      → emite "message:new" por Socket.io a los miembros del canal
```

## Flujo del copiloto (RAG)

```
POST /api/copilot/ask
  → authMiddleware + withRLSContext(userId, ...)
  → AskCopilot.execute({ userId, question })
      1. embeddingProvider.embed(question)                         → vector
      2. embeddingRepository.findSimilarInUserChannels(userId, ...) → solo canales del usuario (RLS + join explícito)
      3. filtra por similarity >= 0.75
      4. llmProvider.generateAnswer(question, contexto)            → respuesta
  ← { answer, sources }
```

`embeddingProvider` y `llmProvider` son la misma instancia (`OpenAIProvider` o `GeminiProvider`, decidido por `AIProviderFactory` según `AI_PROVIDER`) — `AskCopilot` nunca sabe cuál de las dos es.
