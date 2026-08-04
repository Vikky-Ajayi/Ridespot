import {
  doublePrecision,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const paymentTransactionsTable = pgTable("payment_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  driverId: uuid("driver_id")
    .notNull()
    .references(() => usersTable.id),
  flwReference: varchar("flw_reference", { length: 255 }).notNull().unique(),
  txRef: varchar("tx_ref", { length: 255 }).notNull().unique(),
  plan: varchar("plan", { length: 20 }).notNull(),
  amount: doublePrecision("amount").notNull(),
  currency: varchar("currency", { length: 5 }).default("NGN"),
  status: varchar("status", { length: 20 }).default("pending"),
  webhookPayload: jsonb("webhook_payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
