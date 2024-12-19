// src/interfaces/http/routes/index.ts
import { FastifyInstance } from 'fastify';
import { healthRoutes } from './health';

export async function registerRoutes(app: FastifyInstance) {
  await app.register(healthRoutes);
}