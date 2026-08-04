import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";

const router = Router();

function getJwtSecret(): string {
  return process.env.JWT_SECRET ?? process.env.SESSION_SECRET ?? "ridespot-secret";
}

function signToken(payload: { sub: string; email: string; planTier?: string | null; country?: string | null }): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "7d" });
}

function buildDriverSummary(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone ?? null,
    country: user.country ?? null,
    avatarUrl: user.avatarUrl ?? null,
    planTier: user.subscriptionPlan ?? user.planTier ?? "free",
    isEmailVerified: user.isEmailVerified ?? false,
  };
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { fullName, email, phone, country, password } = req.body as {
      fullName: string;
      email: string;
      phone?: string;
      country?: string;
      password: string;
    };

    if (!fullName || !email || !password) {
      res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "fullName, email, and password are required" } });
      return;
    }

    const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
    if (existing) {
      res.status(409).json({ success: false, error: { code: "CONFLICT", message: "Email already registered" } });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationExpiry = new Date(Date.now() + 30 * 60_000); // 30 min

    const [user] = await db.insert(usersTable).values({
      fullName,
      email: email.toLowerCase(),
      phone: phone ?? null,
      country: country ?? null,
      passwordHash,
      emailVerificationCode: verificationCode,
      emailVerificationExpiresAt: verificationExpiry,
    }).returning();

    const isDev = process.env.NODE_ENV !== "production";
    res.status(201).json({
      success: true,
      data: {
        message: "Account created. Check your email for verification code.",
        ...(isDev ? { devOtp: verificationCode } : {}),
      },
    });
  } catch (err) {
    req.log.error({ err }, "POST /auth/register failed");
    res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: "Registration failed" } });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body as { email: string; password: string };

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
    if (!user) {
      res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid email or password" } });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid email or password" } });
      return;
    }

    const token = signToken({ sub: user.id, email: user.email, planTier: user.planTier, country: user.country });
    res.json({ success: true, data: { token, driver: buildDriverSummary(user) } });
  } catch (err) {
    req.log.error({ err }, "POST /auth/login failed");
    res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: "Login failed" } });
  }
});

// POST /api/auth/verify-email
router.post("/verify-email", async (req, res) => {
  try {
    const { email, code } = req.body as { email: string; code: string };

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
    if (!user || user.emailVerificationCode !== code) {
      res.status(400).json({ success: false, error: { code: "INVALID_CODE", message: "Invalid or expired verification code" } });
      return;
    }

    if (user.emailVerificationExpiresAt && user.emailVerificationExpiresAt < new Date()) {
      res.status(400).json({ success: false, error: { code: "EXPIRED_CODE", message: "Verification code has expired" } });
      return;
    }

    const [updated] = await db.update(usersTable)
      .set({ isEmailVerified: true, emailVerificationCode: null, updatedAt: new Date() })
      .where(eq(usersTable.id, user.id))
      .returning();

    const token = signToken({ sub: updated.id, email: updated.email, planTier: updated.planTier, country: updated.country });
    res.json({ success: true, data: { token, driver: buildDriverSummary(updated) } });
  } catch (err) {
    req.log.error({ err }, "POST /auth/verify-email failed");
    res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: "Verification failed" } });
  }
});

// POST /api/auth/resend-otp
router.post("/resend-otp", async (req, res) => {
  try {
    const { email } = req.body as { email: string; type?: string };

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
    if (!user) {
      res.json({ success: true, data: { message: "OTP sent if the account exists." } });
      return;
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 30 * 60_000);

    await db.update(usersTable).set({
      emailVerificationCode: code,
      emailVerificationExpiresAt: expiry,
      updatedAt: new Date(),
    }).where(eq(usersTable.id, user.id));

    const isDev = process.env.NODE_ENV !== "production";
    res.json({ success: true, data: { message: "OTP sent if the account exists.", ...(isDev ? { devOtp: code } : {}) } });
  } catch (err) {
    req.log.error({ err }, "POST /auth/resend-otp failed");
    res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: "Failed to resend OTP" } });
  }
});

// POST /api/auth/forgot-password
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body as { email: string };
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 30 * 60_000);

    if (user) {
      await db.update(usersTable).set({
        passwordResetCode: code,
        passwordResetExpiresAt: expiry,
        updatedAt: new Date(),
      }).where(eq(usersTable.id, user.id));
    }

    const isDev = process.env.NODE_ENV !== "production";
    res.json({
      success: true,
      data: {
        message: "If an account exists for that email, a reset code has been sent.",
        ...(isDev && user ? { devOtp: code } : {}),
      },
    });
  } catch (err) {
    req.log.error({ err }, "POST /auth/forgot-password failed");
    res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: "Failed" } });
  }
});

// POST /api/auth/reset-password
router.post("/reset-password", async (req, res) => {
  try {
    const { email, code, newPassword } = req.body as { email: string; code: string; newPassword: string };

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
    if (!user || user.passwordResetCode !== code) {
      res.status(400).json({ success: false, error: { code: "INVALID_CODE", message: "Invalid or expired reset code" } });
      return;
    }

    if (user.passwordResetExpiresAt && user.passwordResetExpiresAt < new Date()) {
      res.status(400).json({ success: false, error: { code: "EXPIRED_CODE", message: "Reset code has expired" } });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.update(usersTable).set({
      passwordHash,
      passwordResetCode: null,
      passwordResetExpiresAt: null,
      updatedAt: new Date(),
    }).where(eq(usersTable.id, user.id));

    res.json({ success: true, data: { message: "Password reset successful." } });
  } catch (err) {
    req.log.error({ err }, "POST /auth/reset-password failed");
    res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: "Reset failed" } });
  }
});

// GET /api/auth/me
router.get("/me", requireAuth, async (req: AuthRequest, res) => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
    if (!user) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "User not found" } });
      return;
    }
    res.json({ success: true, data: buildDriverSummary(user) });
  } catch (err) {
    req.log.error({ err }, "GET /auth/me failed");
    res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: "Failed" } });
  }
});

// POST /api/auth/logout
router.post("/logout", requireAuth, (_req, res) => {
  res.json({ success: true, data: { message: "Logged out successfully." } });
});

export default router;
