import { z } from "zod";

export const hotspotQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().int().positive().max(50000).default(15000),
  limit: z.coerce.number().int().positive().max(20).default(10),
  category: z.enum(["taxi", "delivery"]).optional()
});

export const hotspotIdSchema = z.object({
  id: z.string().uuid()
});
