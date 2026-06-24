import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";

export type AdminRole = "ops" | "super";

export interface AdminTokenPayload {
  sub: string;
  email: string;
  role: "admin";
  adminRole: AdminRole;
  iat?: number;
  exp?: number;
}

export function signAdminToken(payload: Omit<AdminTokenPayload, "iat" | "exp">) {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"]
  });
}

export function verifyAdminToken(token: string) {
  return jwt.verify(token, env.JWT_SECRET) as AdminTokenPayload;
}

