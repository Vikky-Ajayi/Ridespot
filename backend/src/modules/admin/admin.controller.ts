import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../utils/http.js";
import { signAdminToken } from "../../utils/adminJwt.js";
import { adminEventCreateSchema, adminEventUpdateSchema, adminLoginSchema, listQuerySchema, updateMarketConfigSchema } from "./admin.schema.js";
import { adminService } from "./admin.service.js";

export const adminController = {
  async login(request: FastifyRequest, reply: FastifyReply) {
    const body = adminLoginSchema.parse(request.body);
    const admin = await adminService.login(body);
    const token = signAdminToken({
      sub: admin.id,
      email: admin.email,
      role: "admin",
      adminRole: admin.adminRole
    });

    return sendSuccess(reply, { token, admin });
  },

  async getMarketConfigs(_request: FastifyRequest, reply: FastifyReply) {
    const configs = await adminService.getMarketConfigs();
    return sendSuccess(reply, configs);
  },

  async updateMarketConfig(request: FastifyRequest<{ Params: { city: string } }>, reply: FastifyReply) {
    const body = updateMarketConfigSchema.parse(request.body);
    const config = await adminService.updateMarketConfig(
      request.params.city,
      body,
      request.admin!.sub
    );
    return sendSuccess(reply, config);
  },

  async getOnlineDrivers(_request: FastifyRequest, reply: FastifyReply) {
    return sendSuccess(reply, await adminService.getOnlineDrivers());
  },

  async getActiveHotspots(_request: FastifyRequest, reply: FastifyReply) {
    return sendSuccess(reply, await adminService.getActiveHotspots());
  },

  async getNotificationLogs(request: FastifyRequest, reply: FastifyReply) {
    const query = listQuerySchema.parse(request.query);
    return sendSuccess(reply, await adminService.getNotificationLogs(query.limit));
  },

  async getMlStatus(_request: FastifyRequest, reply: FastifyReply) {
    return sendSuccess(reply, await adminService.getMlStatus());
  },

  async triggerMlRetrain(_request: FastifyRequest, reply: FastifyReply) {
    return sendSuccess(reply, await adminService.triggerMlRetrain());
  },

  async listEvents(request: FastifyRequest, reply: FastifyReply) {
    const query = listQuerySchema.parse(request.query);
    return sendSuccess(reply, await adminService.listEvents(query.limit));
  },

  async createEvent(request: FastifyRequest, reply: FastifyReply) {
    const body = adminEventCreateSchema.parse(request.body);
    const event = await adminService.createEvent(body);
    return sendSuccess(reply, event, { statusCode: 201 });
  },

  async updateEvent(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const body = adminEventUpdateSchema.parse(request.body);
    const event = await adminService.updateEvent(request.params.id, body);
    return sendSuccess(reply, event);
  },

  async deleteEvent(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    return sendSuccess(reply, await adminService.deleteEvent(request.params.id));
  }
};

