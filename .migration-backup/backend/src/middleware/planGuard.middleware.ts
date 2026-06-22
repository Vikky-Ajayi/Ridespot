import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../utils/http.js";
import type { PlanTier } from "../utils/jwt.js";

const PLAN_RANK: Record<PlanTier, number> = {
  free: 0,
  pro: 1,
  fleet: 2
};

export function planGuard(minimumTier: PlanTier) {
  return async function guard(request: FastifyRequest, _reply: FastifyReply) {
    if (!request.user) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }

    if (PLAN_RANK[request.user.planTier] < PLAN_RANK[minimumTier]) {
      throw new AppError(403, "FORBIDDEN", "Your plan does not allow this action");
    }
  };
}
