import { z } from "zod";

export const navigationSessionBodySchema = z.object({
  hotspotId: z.string().uuid(),
  origin: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180)
  })
});

export const navigationSessionIdSchema = z.object({
  id: z.string().uuid()
});
