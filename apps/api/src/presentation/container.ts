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
import { AskCopilot } from "../use-cases/copilot/AskCopilot";
import { IndexMessageEmbedding } from "../use-cases/copilot/IndexMessageEmbedding";

/**
 * Hand-rolled dependency injection — no DI framework, just plain functions
 * that build the object graph. There are only a handful of use cases, so a
 * framework would add more ceremony than it saves.
 *
 * Two flavors of container, matching the two DB contexts from
 * withRLSContext.ts:
 *   - `buildSystemContainer`: for endpoints with no logged-in user yet
 *     (register/login) or that intentionally bypass RLS (embedding writes).
 *   - `buildAuthenticatedContainer`: for everything that must respect the
 *     current user's row-level permissions.
 * Both take the already-scoped `db` client as their only argument — they
 * have no idea *how* that scoping happened, they just use it.
 */

// Stateless singletons: safe to build once and share across every request.
const jwtService = new JwtService();
const passwordHasher = new PasswordHasher();
const aiProvider = createAIProvider(); // picks OpenAI or Gemini based on AI_PROVIDER, see AIProviderFactory.ts

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
    askCopilot: new AskCopilot(aiProvider, aiProvider, embeddingRepository),
  };
}

/** Only for the fire-and-forget embedding indexing step, run with system context. */
export function buildEmbeddingIndexer(db: IDbClient): IndexMessageEmbedding {
  return new IndexMessageEmbedding(aiProvider, new SupabaseMessageEmbeddingRepository(db));
}
