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
 * The keyset cursor arrives as two query params. Both must come together
 * or neither — `.refine` enforces that instead of leaving it as an
 * implicit contract only the frontend knows about.
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
