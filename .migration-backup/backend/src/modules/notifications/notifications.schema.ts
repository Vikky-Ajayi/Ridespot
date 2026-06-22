import { z } from "zod";

export const listNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30)
});

export const notificationIdParamsSchema = z.object({
  id: z.string().uuid()
});
