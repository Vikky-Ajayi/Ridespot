import {
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const restaurantClustersTable = pgTable("restaurant_clusters", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  radius: integer("radius").notNull().default(600),
  restaurantCount: integer("restaurant_count").default(0),
  densityScore: integer("density_score").default(0),
  city: varchar("city", { length: 100 }).notNull(),
  country: varchar("country", { length: 10 }).notNull(),
  topRestaurants: jsonb("top_restaurants")
    .default([])
    .$type<Array<{ name: string; rating?: number; cuisine?: string }>>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
