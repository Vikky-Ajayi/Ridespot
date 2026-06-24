import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../utils/http.js";
import { notificationsService } from "./notifications.service.js";
import {
  listNotificationsQuerySchema,
  notificationIdParamsSchema
} from "./notifications.schema.js";

export const notificationsController = {
  async health(_request: FastifyRequest, reply: FastifyReply) {
    return sendSuccess(reply, { status: "ok" });
  },

  async list(request: FastifyRequest, reply: FastifyReply) {
    const query = listNotificationsQuerySchema.parse(request.query);
    const payload = await notificationsService.listDriverNotifications(
      request.user!.sub,
      query.limit
    );
    return sendSuccess(reply, payload);
  },

  async unreadCount(request: FastifyRequest, reply: FastifyReply) {
    const payload = await notificationsService.getUnreadCount(request.user!.sub);
    return sendSuccess(reply, payload);
  },

  async markRead(request: FastifyRequest, reply: FastifyReply) {
    const params = notificationIdParamsSchema.parse(request.params);
    const notification = await notificationsService.markRead(request.user!.sub, params.id);
    return sendSuccess(reply, notification);
  },

  async markAllRead(request: FastifyRequest, reply: FastifyReply) {
    const payload = await notificationsService.markAllRead(request.user!.sub);
    return sendSuccess(reply, payload);
  },

  async test(request: FastifyRequest, reply: FastifyReply) {
    const notification = await notificationsService.createTestNotification(request.user!.sub);
    return sendSuccess(reply, notification, { statusCode: 201 });
  }
};
