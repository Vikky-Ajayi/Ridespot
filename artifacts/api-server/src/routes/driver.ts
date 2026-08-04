import { Router } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";

const router = Router();

function buildProfile(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone ?? null,
    country: user.country ?? null,
    avatarUrl: user.avatarUrl ?? null,
    planTier: user.subscriptionPlan ?? user.planTier ?? "free",
    isEmailVerified: user.isEmailVerified ?? false,
    notificationPreferences: user.notificationPreferences ?? {
      mailNotifications: true,
      demandNotifications: true,
      nightModeAlerts: false,
    },
  };
}

// GET /api/driver/profile
router.get("/profile", requireAuth, async (req: AuthRequest, res) => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
    if (!user) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "User not found" } });
      return;
    }
    res.json({ success: true, data: buildProfile(user) });
  } catch (err) {
    req.log.error({ err }, "GET /driver/profile failed");
    res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: "Failed" } });
  }
});

// PUT /api/driver/profile
router.put("/profile", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { fullName, phone, country } = req.body as { fullName?: string; phone?: string | null; country?: string };
    const [user] = await db
      .update(usersTable)
      .set({ fullName, phone: phone ?? null, country, updatedAt: new Date() })
      .where(eq(usersTable.id, req.userId!))
      .returning();

    if (!user) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "User not found" } });
      return;
    }
    res.json({ success: true, data: buildProfile(user) });
  } catch (err) {
    req.log.error({ err }, "PUT /driver/profile failed");
    res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: "Failed to update profile" } });
  }
});

// PUT /api/driver/password
router.put("/password", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { currentPassword, newPassword, confirmNewPassword } = req.body as {
      currentPassword: string;
      newPassword: string;
      confirmNewPassword: string;
    };

    if (newPassword !== confirmNewPassword) {
      res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Passwords do not match" } });
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
    if (!user) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "User not found" } });
      return;
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Current password is incorrect" } });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.update(usersTable).set({ passwordHash, updatedAt: new Date() }).where(eq(usersTable.id, user.id));

    res.json({ success: true, data: { message: "Password changed successfully." } });
  } catch (err) {
    req.log.error({ err }, "PUT /driver/password failed");
    res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: "Failed to change password" } });
  }
});

// GET /api/driver/notifications/preferences
router.get("/notifications/preferences", requireAuth, async (req: AuthRequest, res) => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
    if (!user) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "User not found" } });
      return;
    }
    res.json({ success: true, data: user.notificationPreferences ?? { mailNotifications: true, demandNotifications: true, nightModeAlerts: false } });
  } catch (err) {
    req.log.error({ err }, "GET /driver/notifications/preferences failed");
    res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: "Failed" } });
  }
});

// PUT /api/driver/notifications/preferences
router.put("/notifications/preferences", requireAuth, async (req: AuthRequest, res) => {
  try {
    const prefs = req.body as { mailNotifications: boolean; demandNotifications: boolean; nightModeAlerts: boolean };
    const [user] = await db
      .update(usersTable)
      .set({ notificationPreferences: prefs, updatedAt: new Date() })
      .where(eq(usersTable.id, req.userId!))
      .returning();

    res.json({ success: true, data: user.notificationPreferences });
  } catch (err) {
    req.log.error({ err }, "PUT /driver/notifications/preferences failed");
    res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: "Failed" } });
  }
});

export default router;
