import type { FastifyReply } from "fastify";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

export function sendSuccess<T>(
  reply: FastifyReply,
  data: T,
  options?: { statusCode?: number; message?: string }
) {
  const payload = {
    success: true as const,
    data,
    ...(options?.message ? { message: options.message } : {})
  };

  return reply.code(options?.statusCode ?? 200).send(payload);
}

export function toErrorResponse(error: unknown) {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      payload: {
        success: false as const,
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {})
        }
      }
    };
  }

  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      payload: {
        success: false as const,
        error: {
          code: "VALIDATION_ERROR",
          message: "Validation failed",
          details: error.flatten()
        }
      }
    };
  }

  if (
    error &&
    typeof error === "object" &&
    "statusCode" in error &&
    (error as { statusCode?: unknown }).statusCode === 429
  ) {
    const message =
      "message" in error && typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "Too many requests";

    return {
      statusCode: 429,
      payload: {
        success: false as const,
        error: {
          code: "RATE_LIMITED",
          message
        }
      }
    };
  }

  return {
    statusCode: 500,
    payload: {
      success: false as const,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong"
      }
    }
  };
}
