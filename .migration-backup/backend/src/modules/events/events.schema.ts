import { z } from "zod";

export const manualIngestionSchema = z.object({
  cities: z.array(z.string()).optional()
});

export const nearbyEventsQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().int().min(1000).max(50000).default(15000),
  days: z.coerce.number().int().min(1).max(3).default(3),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});
