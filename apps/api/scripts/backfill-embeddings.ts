/**
 * Reindexes missing embeddings in rw_message_embeddings.
 *
 * Why is this needed? The normal flow (SendMessage → IndexMessageEmbedding,
 * see MessageController) only indexes a message when it goes through the
 * API. A message inserted directly with SQL (like the ones in the seed) or
 * one whose embedding failed at the time (AI provider down, rate limit,
 * etc. — see the "fire-and-forget" comment in IndexMessageEmbedding) never
 * gets its row in rw_message_embeddings, and the copilot can never cite it
 * as a source no matter how relevant it is.
 *
 * Usage:
 *   cd apps/api
 *   npx tsx scripts/backfill-embeddings.ts
 */
import { pool, closePool } from "../src/infrastructure/db/pool";
import { withSystemContext } from "../src/infrastructure/db/withRLSContext";
import { buildEmbeddingIndexer } from "../src/presentation/container";
import { logger } from "../src/infrastructure/logging/logger";

interface PendingMessage {
  id: string;
  content: string;
}

async function main(): Promise<void> {
  const { rows: pending } = await pool.query<PendingMessage>(
    `SELECT m.id, m.content
     FROM rw_messages m
     LEFT JOIN rw_message_embeddings e ON e.message_id = m.id
     WHERE e.message_id IS NULL AND m.deleted_at IS NULL`
  );

  if (pending.length === 0) {
    logger.info("Nothing to backfill — every message already has an embedding.");
    return;
  }

  logger.info(`Backfilling embeddings for ${pending.length} message(s)...`);

  for (const message of pending) {
    try {
      await withSystemContext((db) =>
        buildEmbeddingIndexer(db).execute({ messageId: message.id, content: message.content })
      );
      logger.info(`  ✓ ${message.id}`);
    } catch (error) {
      logger.error({ err: error, messageId: message.id }, `  ✗ ${message.id} failed`);
    }
  }
}

main()
  .catch((error) => {
    logger.error({ err: error }, "Backfill failed");
    process.exitCode = 1;
  })
  .finally(() => closePool());
