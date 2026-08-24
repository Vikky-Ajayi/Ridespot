import { z } from "zod";

const isoDateSchema = z.string().datetime({ offset: true });

export const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const updateMarketConfigSchema = z.object({
  notificationRadiusMeters: z.number().int().min(50).max(1200),
  driverPerAttendeeRatio: z.number().int().min(1).max(100),
  minDriversPerZone: z.number().int().min(1).max(100),
  alertRadiusMeters: z.number().int().min(100).max(50000)
});

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100)
});

export const adminEventCreateSchema = z.object({
  name: z.string().min(2),
  venueName: z.string().min(1).optional().nullable(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().optional().nullable(),
  city: z.string().min(1),
  country: z.string().min(1),
  startTime: isoDateSchema,
  endTime: isoDateSchema.optional().nullable(),
  expectedAttendance: z.number().int().min(0).optional().nullable(),
  eventType: z.string().optional().nullable(),
  eventCategory: z.string().optional().nullable()
});

export const adminEventUpdateSchema = adminEventCreateSchema;

export const triggerJobSchema = z.object({
  job: z.enum([
    "event-ingestion",
    "hotspot-refresh",
    "restaurant-location-refresh",
    "restaurant-score-refresh",
    "sitemap-index-refresh",
    "sitemap-crawl-batch"
  ])
});

