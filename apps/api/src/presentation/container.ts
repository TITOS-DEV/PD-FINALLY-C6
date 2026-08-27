import { IDbClient } from "../domain/database/IDbClient";
import { JwtService } from "../infrastructure/auth/JwtService";
import { PasswordHasher } from "../infrastructure/auth/PasswordHasher";
import { createAIProvider } from "../infrastructure/ai/AIProviderFactory";

import { SupabaseUserRepository } from "../infrastructure/repositories/SupabaseUserRepository";
import { SupabaseChannelRepository } from "../infrastructure/repositories/SupabaseChannelRepository";
import { SupabaseMessageRepository } from "../infrastructure/repositories/SupabaseMessageRepository";
import { SupabaseMessageEmbeddingRepository } from "../infrastructure/repositories/SupabaseMessageEmbeddingRepository";
import { SupabaseRefreshTokenRepository } from "../infrastructure/repositories/SupabaseRefreshTokenRepository";

import { RegisterUser } from "../use-cases/auth/RegisterUser";
import { AuthenticateUser } from "../use-cases/auth/AuthenticateUser";
import { RefreshAccessToken } from "../use-cases/auth/RefreshAccessToken";
import { LogoutUser } from "../use-cases/auth/LogoutUser";
import { ListMyChannels } from "../use-cases/channels/ListMyChannels";
import { CreateChannel } from "../use-cases/channels/CreateChannel";
import { SendMessage } from "../use-cases/messages/SendMessage";
import { GetChannelMessages } from "../use-cases/messages/GetChannelMessages";
import { MarkMessagesAsRead } from "../use-cases/messages/MarkMessagesAsRead";
import { EditMessage } from "../use-cases/messages/EditMessage";
import { DeleteMessage } from "../use-cases/messages/DeleteMessage";
import { AskCopilot } from "../use-cases/copilot/AskCopilot";
import { IndexMessageEmbedding } from "../use-cases/copilot/IndexMessageEmbedding";

/**
 * Inyección de dependencias hecha a mano — nada de framework de DI, solo
 * funciones planas que arman el grafo de objetos. Son apenas un puñado de
 * casos de uso, así que un framework agregaría más ceremonia de la que ahorra.
 *
 * Dos sabores de container, calzando con los dos contextos de BD de
 * withRLSContext.ts:
 *   - `buildSystemContainer`: para endpoints sin usuario logueado todavía
 *     (registro/login) o que a propósito se saltan el RLS (escritura de embeddings).
 *   - `buildAuthenticatedContainer`: para todo lo que debe respetar los
 *     permisos por fila del usuario actual.
 * Los dos reciben el cliente `db` ya escopeado como su único argumento —
 * no tienen idea de CÓMO se hizo ese escopeo, solo lo usan.
 */

// Singletons sin estado: seguros de armar una sola vez y compartir entre todas las requests.
const jwtService = new JwtService();
const passwordHasher = new PasswordHasher();
const aiProvider = createAIProvider(); // elige OpenAI o Gemini según AI_PROVIDER, ver AIProviderFactory.ts

export function buildSystemContainer(db: IDbClient) {
  const userRepository = new SupabaseUserRepository(db);
  const refreshTokenRepository = new SupabaseRefreshTokenRepository(db);

  return {
    registerUser: new RegisterUser(userRepository, passwordHasher),
    authenticateUser: new AuthenticateUser(userRepository, refreshTokenRepository, passwordHasher, jwtService),
    refreshAccessToken: new RefreshAccessToken(refreshTokenRepository, userRepository, jwtService),
    logoutUser: new LogoutUser(refreshTokenRepository, jwtService),
  };
}

export function buildAuthenticatedContainer(db: IDbClient) {
  const channelRepository = new SupabaseChannelRepository(db);
  const messageRepository = new SupabaseMessageRepository(db);
  const embeddingRepository = new SupabaseMessageEmbeddingRepository(db);

  return {
    listMyChannels: new ListMyChannels(channelRepository),
    createChannel: new CreateChannel(channelRepository),
    sendMessage: new SendMessage(messageRepository, channelRepository),
    getChannelMessages: new GetChannelMessages(messageRepository, channelRepository),
    markMessagesAsRead: new MarkMessagesAsRead(messageRepository),
    editMessage: new EditMessage(messageRepository),
    deleteMessage: new DeleteMessage(messageRepository),
    askCopilot: new AskCopilot(aiProvider, aiProvider, embeddingRepository),
  };
}

/** Solo para el paso de indexado de embeddings en modo fire-and-forget, con contexto de sistema. */
export function buildEmbeddingIndexer(db: IDbClient): IndexMessageEmbedding {
  return new IndexMessageEmbedding(aiProvider, new SupabaseMessageEmbeddingRepository(db));
}
