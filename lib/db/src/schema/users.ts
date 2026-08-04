import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const usersTable = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: text("full_name").notNull(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    phone: varchar("phone", { length: 30 }),
    country: varchar("country", { length: 10 }),
    passwordHash: text("password_hash").notNull(),
    avatarUrl: text("avatar_url"),
    planTier: varchar("plan_tier", { length: 20 }).default("free"),
    subscriptionPlan: varchar("subscription_plan", { length: 20 }).default("free"),
    subscriptionExpiresAt: timestamp("subscription_expires_at", { withTimezone: true }),
    isEmailVerified: boolean("is_email_verified").default(false),
    emailVerificationCode: varchar("email_verification_code", { length: 10 }),
    emailVerificationExpiresAt: timestamp("email_verification_expires_at", { withTimezone: true }),
    passwordResetCode: varchar("password_reset_code", { length: 10 }),
    passwordResetExpiresAt: timestamp("password_reset_expires_at", { withTimezone: true }),
    notificationPreferences: jsonb("notification_preferences")
      .default({ mailNotifications: true, demandNotifications: true, nightModeAlerts: false })
      .$type<{
        mailNotifications: boolean;
        demandNotifications: boolean;
        nightModeAlerts: boolean;
      }>(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    emailIdx: index("users_email_idx").on(t.email),
  }),
);
