import { IEmbeddingProvider, ILLMProvider } from "../../domain/providers/ILLMProvider";
import { IMessageEmbeddingRepository } from "../../domain/repositories/IMessageEmbeddingRepository";
import { ValidationError } from "../../domain/errors/AppError";

export interface AskCopilotInput {
  userId: string;
  question: string;
}

export interface CopilotSource {
  messageId: string;
  channelId: string;
  authorName: string;
  excerpt: string;
  similarity: number;
}

export interface AskCopilotOutput {
  answer: string;
  sources: CopilotSource[];
}

/**
 * Cuántos mensajes como máximo le pasamos al LLM de contexto. Lo subimos de
 * 8 a 16: con solo 8, preguntas amplias ("¿de qué se ha hablado en mis
 * canales?") se quedaban cortas porque el corte de arriba descartaba
 * mensajes relevantes que sí cabían en la ventana de contexto del modelo
 * sin problema — 16 mensajes cortos de chat es nada para un modelo como
 * gpt-4o-mini, así que no hay razón real para ser tan tacaños acá.
 */
const MAX_RETRIEVED_MESSAGES = 16;
/**
 * Por debajo de esto, una coincidencia probablemente es ruido, no una
 * respuesta de verdad. El valor está calibrado con datos reales, no
 * adivinado: con `text-embedding-3-small` (textos cortos, en español, tipo
 * chat informal), un mensaje genuinamente relacionado con la pregunta pero
 * con palabras distintas típicamente cae entre 0.4 y 0.6 de similitud
 * coseno — NO cerca de 1, eso solo pasa con texto casi idéntico. Un umbral
 * de 0.75 (lo que había acá antes) descartaba respuestas correctas todo el
 * tiempo: en una prueba real, la pregunta "¿qué se dijo sobre RLS?" contra
 * el mensaje real sobre RLS dio 0.496 de similitud — muy por encima de los
 * mensajes sin relación (0.15–0.29 en la misma prueba) pero por debajo de
 * 0.75, así que el copiloto contestaba "no tengo información" incluso
 * teniendo la respuesta correcta indexada. Si cambias de modelo de
 * embeddings, conviene volver a calibrar este número con datos reales en
 * vez de copiar este mismo valor a ciegas.
 */
const MIN_SIMILARITY = 0.4;
/**
 * Cuántos candidatos usamos como "mejor esfuerzo" cuando NINGUNO llega al
 * umbral — ver el comentario grande más abajo, en el paso 2, para el
 * porqué hace falta esto.
 */
const FALLBACK_MATCH_COUNT = 5;

/**
 * El flujo RAG (Retrieval-Augmented Generation) del copiloto, en tres pasos:
 *
 *   1. RECUPERAR — convertimos la pregunta en un vector, y después
 *      buscamos en `rw_message_embeddings` los mensajes pasados más
 *      parecidos. Esta es la "R" de RAG: en vez de pedirle al LLM que
 *      responda de la nada, le pasamos fragmentos reales del historial de
 *      la conversación.
 *
 *   2. ANCLAR — nos quedamos solo con las coincidencias por encima de
 *      MIN_SIMILARITY. Esta es la parte crítica de seguridad de todo el
 *      caso de uso: `findSimilarInUserChannels` está escrita para buscar
 *      SIEMPRE solo dentro de los canales a los que pertenece `userId`
 *      (join con rw_channel_members), respaldado ADEMÁS por la política
 *      RLS de rw_message_embeddings. Un usuario literalmente no puede
 *      recibir una respuesta apoyada en un mensaje de un canal en el que no
 *      está — la búsqueda vectorial nunca lo llega a ver.
 *
 *   3. GENERAR — le mandamos al LLM la pregunta más los fragmentos
 *      recuperados y devolvemos su respuesta, junto con las fuentes para
 *      que el frontend pueda mostrar "esto salió de estos mensajes" en vez
 *      de una caja negra.
 *
 * Fíjense que esta clase nunca importa OpenAI ni Gemini directo — solo
 * conoce ILLMProvider / IEmbeddingProvider. Quien arma todo esto
 * (container.ts) decide qué adaptador concreto inyectar, según
 * AI_PROVIDER — eso es lo que hace que el LLM sea intercambiable sin tocar este archivo para nada.
 */
export class AskCopilot {
  constructor(
    private readonly embeddingProvider: IEmbeddingProvider,
    private readonly llmProvider: ILLMProvider,
    private readonly embeddingRepository: IMessageEmbeddingRepository
  ) {}

  async execute(input: AskCopilotInput): Promise<AskCopilotOutput> {
    const question = input.question.trim();
    if (question.length === 0) throw new ValidationError("Question can't be empty");

    // 1. RECUPERAR
    const questionEmbedding = await this.embeddingProvider.embed(question);
    const matches = await this.embeddingRepository.findSimilarInUserChannels({
      userId: input.userId,
      queryEmbedding: questionEmbedding,
      limit: MAX_RETRIEVED_MESSAGES,
    });

    // 2. ANCLAR
    let relevantMatches = matches.filter((match) => match.similarity >= MIN_SIMILARITY);

    // Las preguntas AMPLIAS ("resume todo lo que se ha hablado", "¿de qué
    // van mis canales?") son un caso especial: la pregunta en sí no trata
    // sobre un tema puntual, así que su embedding no se parece mucho a
    // NINGÚN mensaje individual — en una prueba real, "resume todo lo que
    // se ha hablado" le dio 0.34 de similitud a su mejor candidato (con 14
    // mensajes reales disponibles para resumir), por debajo del umbral. Acá
    // el problema no es falta de contenido, es que la similitud coseno
    // simplemente no está pensada para medir "qué tan bien resume esto TODO
    // el canal". En vez de devolver "no tengo información" cuando sí hay
    // mensajes de sobra, usamos los mejores candidatos disponibles como
    // mejor esfuerzo — ya vienen ordenados por similitud, así que siguen
    // siendo la aproximación más razonable con la que contamos.
    if (relevantMatches.length === 0 && matches.length > 0) {
      relevantMatches = matches.slice(0, FALLBACK_MATCH_COUNT);
    }

    // 3. GENERAR — incluso con cero coincidencias igual le preguntamos al
    // LLM, pero el system prompt le dice que admita que no sabe en vez de
    // inventar. Un array `sources` vacío es la señal para el frontend de
    // que la respuesta no está anclada en nada real.
    const answer = await this.llmProvider.generateAnswer(
      question,
      relevantMatches.map((match) => match.content)
    );

    return {
      answer,
      sources: relevantMatches.map((match) => ({
        messageId: match.messageId,
        channelId: match.channelId,
        authorName: match.authorName,
        excerpt: match.content,
        similarity: match.similarity,
      })),
    };
  }
}
