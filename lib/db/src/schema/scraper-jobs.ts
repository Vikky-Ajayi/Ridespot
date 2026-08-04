import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const scraperJobsTable = pgTable("scraper_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: varchar("source", { length: 50 }).notNull(),
  status: varchar("status", { length: 20 }).default("idle"),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  eventsScraped: integer("events_scraped").default(0),
  totalEventsInDb: integer("total_events_in_db").default(0),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
