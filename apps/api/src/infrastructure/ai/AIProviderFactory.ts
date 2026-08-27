import { IEmbeddingProvider, ILLMProvider } from "../../domain/providers/ILLMProvider";
import { env } from "../config/env";
import { OpenAIProvider } from "./OpenAIProvider";
import { GeminiProvider } from "./GeminiProvider";

/**
 * Strategy pattern in its simplest form: one factory function, one env var
 * (`AI_PROVIDER`), zero `if (provider === "openai")` checks scattered around
 * the codebase. AskCopilot (and anything else using the AI) only ever sees
 * `ILLMProvider` / `IEmbeddingProvider` — it has no idea which concrete
 * class it got.
 *
 * Built once at startup and reused — see container.ts.
 */
export function createAIProvider(): ILLMProvider & IEmbeddingProvider {
  switch (env.AI_PROVIDER) {
    case "openai":
      return new OpenAIProvider();
    case "gemini":
      return new GeminiProvider();
    default: {
      // Exhaustiveness check: if a new provider is ever added to the env
      // schema without a case here, TypeScript flags it at compile time.
      const _exhaustive: never = env.AI_PROVIDER;
      throw new Error(`Unsupported AI provider: ${_exhaustive}`);
    }
  }
}
