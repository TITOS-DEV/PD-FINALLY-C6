import { IEmbeddingProvider, ILLMProvider } from "../../domain/providers/ILLMProvider";
import { env } from "../config/env";
import { OpenAIProvider } from "./OpenAIProvider";
import { GeminiProvider } from "./GeminiProvider";

/**
 * El patrón Strategy en su forma más simple: una función factory, una
 * variable de entorno (`AI_PROVIDER`), cero `if (provider === "openai")`
 * repartidos por todo el código. AskCopilot (y cualquier otra cosa que use
 * la IA) solo ve `ILLMProvider` / `IEmbeddingProvider` — no tiene idea de
 * qué clase concreta le tocó.
 *
 * Se arma una sola vez al arrancar y se reutiliza — ver container.ts.
 */
export function createAIProvider(): ILLMProvider & IEmbeddingProvider {
  switch (env.AI_PROVIDER) {
    case "openai":
      return new OpenAIProvider();
    case "gemini":
      return new GeminiProvider();
    default: {
      // Chequeo de exhaustividad: si algún día se agrega un proveedor nuevo
      // al schema de env sin un case acá, TypeScript lo marca en tiempo de compilación.
      const _exhaustive: never = env.AI_PROVIDER;
      throw new Error(`Unsupported AI provider: ${_exhaustive}`);
    }
  }
}
