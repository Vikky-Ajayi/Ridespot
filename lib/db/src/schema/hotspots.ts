import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const hotspotsTable = pgTable(
  "hotspots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    radius: integer("radius").notNull().default(800),
    intensityScore: integer("intensity_score").notNull().default(0),
    category: varchar("category", { length: 20 }).notNull(),
    city: varchar("city", { length: 100 }).notNull(),
    country: varchar("country", { length: 10 }).notNull(),
    driverSaturation: varchar("driver_saturation", { length: 10 }).default("LOW"),
    demandRequests: varchar("demand_requests", { length: 10 }).default("HIGH"),
    demandLabel: text("demand_label"),
    driveTimeMinutes: integer("drive_time_minutes").default(10),
    distanceKm: doublePrecision("distance_km").default(5),
    timeStart: varchar("time_start", { length: 20 }),
    timeEnd: varchar("time_end", { length: 20 }),
    activeEvents: jsonb("active_events").default([]).$type<
      Array<{ id: string; title: string; startTime: string | Date }>
    >(),
    expiryTimestamp: timestamp("expiry_timestamp", { withTimezone: true }),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    categoryIdx: index("hotspots_category_idx").on(t.category),
    activeIdx: index("hotspots_active_idx").on(t.isActive),
    latLngIdx: index("hotspots_latlng_idx").on(t.lat, t.lng),
  }),
);
