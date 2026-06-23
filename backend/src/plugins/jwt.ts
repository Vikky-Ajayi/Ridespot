import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { signAuthToken, verifyAuthToken } from "../utils/jwt.js";

async function jwtPlugin(app: FastifyInstance) {
  app.decorate("signJwt", signAuthToken);
  app.decorate("verifyJwt", verifyAuthToken);
}

export default fp(jwtPlugin, {
  name: "ridespot-jwt"
});
