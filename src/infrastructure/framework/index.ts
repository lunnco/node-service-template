// src/infrastructure/framework/fastify.ts
import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { registerRoutes } from '../../interfaces/http/routes';

async function buildFramework(): Promise<FastifyInstance> {
    const server = fastify({
        logger: process.env.NODE_ENV === 'development' 
          ? {
              transport: {
                target: 'pino-pretty',
                options: {
                  translateTime: 'HH:MM:ss Z',
                  ignore: 'pid,hostname'
                }
              }
            }
          : true  // Use standard pino in production
      });

  // Register core plugins
  await server.register(cors);
  await server.register(helmet);
  await registerRoutes(server);

  return server;
}

export { buildFramework };