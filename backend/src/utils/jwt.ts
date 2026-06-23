import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";

export type PlanTier = "free" | "pro" | "fleet";

export interface AuthTokenPayload {
  sub: string;
  email: string;
  planTier: PlanTier;
  country?: string | null;
  iat?: number;
  exp?: number;
}

export function signAuthToken(payload: Omit<AuthTokenPayload, "iat" | "exp">) {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"]
  });
}

export function verifyAuthToken(token: string) {
  return jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
}
