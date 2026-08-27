import { z } from "zod";

export const sendMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
});

export const channelParamsSchema = z.object({
  channelId: z.string().uuid(),
});

export const messageParamsSchema = z.object({
  messageId: z.string().uuid(),
});

export const editMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
});

/**
 * El cursor de keyset llega como dos query params. Los dos tienen que venir
 * juntos o ninguno — `.refine` obliga eso en vez de dejarlo como un
 * contrato implícito que solo conoce el frontend.
 */
export const getMessagesQuerySchema = z
  .object({
    cursorCreatedAt: z.string().datetime().optional(),
    cursorId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .refine((data) => Boolean(data.cursorCreatedAt) === Boolean(data.cursorId), {
    message: "cursorCreatedAt and cursorId must be provided together",
  });

export const markAsReadSchema = z.object({
  messageIds: z.array(z.string().uuid()).min(1).max(200),
});

export const createChannelSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional(),
});
