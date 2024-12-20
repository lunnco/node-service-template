// src/shared/framework/shutdown/shutdown-manager.ts
import { FastifyInstance } from 'fastify';

export class ShutdownManager {
  async gracefulShutdown(server: FastifyInstance): Promise<void> {
    try {
      server.log.info('Starting graceful shutdown');
      await server.close();
      server.log.info('Server closed successfully');
      process.exit(0);
    } catch (error) {
      server.log.error('Error during shutdown:', error);
      process.exit(1);
    }
  }
}