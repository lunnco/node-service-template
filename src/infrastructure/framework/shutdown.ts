// shared/framework/shutdown/shutdown-manager.ts
import { FastifyInstance } from 'fastify';

export class ShutdownManager {
  async gracefulShutdown(app: FastifyInstance) {
    app.log.info('Starting graceful shutdown...');

    try {
      await app.close();
      app.log.info('Server closed successfully');
      process.exit(0);
    } catch (error) {
      app.log.error('Error during shutdown:', error);
      process.exit(1);
    }
  }
}