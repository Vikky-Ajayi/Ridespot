import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../utils/http.js";
import { authService } from "./auth.service.js";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendOtpSchema,
  resetPasswordSchema,
  verifyEmailSchema
} from "./auth.schema.js";

export const authController = {
  async register(request: FastifyRequest, reply: FastifyReply) {
    const body = registerSchema.parse(request.body);
    const result = await authService.register({
      fullName: body.fullName,
      email: body.email,
      phone: body.phone ?? null,
      country: body.country,
      password: body.password
    });

    return sendSuccess(reply, result, {
      statusCode: 201,
      message: "Account created. Check your email for verification code."
    });
  },

  async verifyEmail(request: FastifyRequest, reply: FastifyReply) {
    const body = verifyEmailSchema.parse(request.body);
    const driver = await authService.verifyEmail(body);
    const token = request.server.signJwt({
      sub: driver.id,
      email: driver.email,
      planTier: driver.planTier,
      country: driver.country
    });

    return sendSuccess(reply, { token, driver });
  },

  async login(request: FastifyRequest, reply: FastifyReply) {
    const body = loginSchema.parse(request.body);
    const driver = await authService.login(body);
    const token = request.server.signJwt({
      sub: driver.id,
      email: driver.email,
      planTier: driver.planTier,
      country: driver.country
    });

    return sendSuccess(reply, { token, driver });
  },

  async resendOtp(request: FastifyRequest, reply: FastifyReply) {
    const body = resendOtpSchema.parse(request.body);
    const result = await authService.resendOtp(body);
    return sendSuccess(reply, result, { message: "OTP sent if the account exists." });
  },

  async forgotPassword(request: FastifyRequest, reply: FastifyReply) {
    const body = forgotPasswordSchema.parse(request.body);
    const result = await authService.forgotPassword(body);
    return sendSuccess(reply, result, {
      message: "If an account exists for that email, a reset code has been sent."
    });
  },

  async resetPassword(request: FastifyRequest, reply: FastifyReply) {
    const body = resetPasswordSchema.parse(request.body);
    await authService.resetPassword(body);
    return sendSuccess(reply, {}, { message: "Password reset successful." });
  },

  async logout(_request: FastifyRequest, reply: FastifyReply) {
    return sendSuccess(reply, {}, { message: "Logged out successfully." });
  },

  async me(request: FastifyRequest, reply: FastifyReply) {
    const profile = await authService.getMe(request.user!.sub);
    return sendSuccess(reply, profile);
  }
};
