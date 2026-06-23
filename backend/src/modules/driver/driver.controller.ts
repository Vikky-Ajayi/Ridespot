import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../utils/http.js";
import { driverService } from "./driver.service.js";
import {
  fcmTokenSchema,
  feedbackSchema,
  notificationPreferencesSchema,
  updatePasswordSchema,
  updateProfileSchema
} from "./driver.schema.js";

export const driverController = {
  async getProfile(request: FastifyRequest, reply: FastifyReply) {
    const profile = await driverService.getProfile(request.user!.sub);
    return sendSuccess(reply, profile);
  },

  async updateProfile(request: FastifyRequest, reply: FastifyReply) {
    const body = updateProfileSchema.parse(request.body);
    const profile = await driverService.updateProfile(request.user!.sub, body);
    return sendSuccess(reply, profile, { message: "Profile updated successfully." });
  },

  async updatePassword(request: FastifyRequest, reply: FastifyReply) {
    const body = updatePasswordSchema.parse(request.body);
    await driverService.changePassword(request.user!.sub, body);
    return sendSuccess(reply, {}, { message: "Password updated successfully." });
  },

  async getNotificationPreferences(request: FastifyRequest, reply: FastifyReply) {
    const preferences = await driverService.getNotificationPreferences(request.user!.sub);
    return sendSuccess(reply, preferences);
  },

  async updateNotificationPreferences(request: FastifyRequest, reply: FastifyReply) {
    const body = notificationPreferencesSchema.parse(request.body);
    const preferences = await driverService.updateNotificationPreferences(request.user!.sub, body);
    return sendSuccess(reply, preferences, { message: "Notification preferences updated." });
  },

  async saveFcmToken(request: FastifyRequest, reply: FastifyReply) {
    const body = fcmTokenSchema.parse(request.body);
    await driverService.saveFcmToken(request.user!.sub, body.token);
    return sendSuccess(reply, {}, { message: "FCM token saved." });
  },

  async submitFeedback(request: FastifyRequest, reply: FastifyReply) {
    const body = feedbackSchema.parse(request.body);
    await driverService.submitFeedback(request.user!.sub, body);
    return sendSuccess(reply, {}, { message: "Feedback submitted." });
  }
};
