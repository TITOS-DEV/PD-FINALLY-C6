/**
 * Reindexa embeddings faltantes en rw_message_embeddings.
 *
 * ¿Por qué hace falta esto? El flujo normal (SendMessage → IndexMessageEmbedding,
 * ver MessageController) solo indexa un mensaje cuando pasa por la API. Un
 * mensaje insertado directo con SQL (como los del seed) o uno cuyo embedding
 * falló en su momento (el proveedor de IA caído, rate limit, etc. — ver el
 * comentario de "fire-and-forget" en IndexMessageEmbedding) nunca llega a
 * tener su fila en rw_message_embeddings, y el copiloto jamás lo va a poder
 * citar como fuente por más relevante que sea.
 *
 * Uso:
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
