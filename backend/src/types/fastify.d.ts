import "fastify";
import type { AdminTokenPayload } from "../utils/adminJwt.js";
import type { AuthTokenPayload } from "../utils/jwt.js";

declare module "fastify" {
  interface FastifyInstance {
    signJwt: (payload: Omit<AuthTokenPayload, "iat" | "exp">) => string;
    verifyJwt: (token: string) => AuthTokenPayload;
  }

  interface FastifyRequest {
    user?: AuthTokenPayload;
    admin?: AdminTokenPayload;
  }
}
