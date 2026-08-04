import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export interface AuthRequest extends Request {
  userId?: string;
  userEmail?: string;
  planTier?: string;
  country?: string;
}

interface JwtPayload {
  sub: string;
  email: string;
  planTier?: string;
  country?: string;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing Authorization bearer token" } });
    return;
  }

  const token = header.slice("Bearer ".length).trim();

  try {
    const secret = process.env.JWT_SECRET ?? process.env.SESSION_SECRET ?? "ridespot-secret";
    const payload = jwt.verify(token, secret) as JwtPayload;
    req.userId = payload.sub;
    req.userEmail = payload.email;
    req.planTier = payload.planTier;
    req.country = payload.country;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Token has expired" } });
      return;
    }
    res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid token" } });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const secret = req.headers["x-admin-secret"];
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Admin access required" } });
    return;
  }
  next();
}
