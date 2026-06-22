import type { FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { verifyAdminToken } from "../utils/adminJwt.js";
import { AppError } from "../utils/http.js";

export async function adminMiddleware(request: FastifyRequest, _reply: FastifyReply) {
  const header = request.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    throw new AppError(401, "UNAUTHORIZED", "Missing Authorization bearer token");
  }

  const token = header.slice("Bearer ".length).trim();

  try {
    request.admin = verifyAdminToken(token);
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError(403, "FORBIDDEN", "Token has expired");
    }

    throw new AppError(401, "UNAUTHORIZED", "Invalid token");
  }

  if (request.admin?.role !== "admin") {
    throw new AppError(403, "FORBIDDEN", "Admin access required");
  }
}
