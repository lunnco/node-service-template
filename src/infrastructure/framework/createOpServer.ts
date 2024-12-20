import fastify, { FastifyInstance } from 'fastify';
import metricsExporter from '../framework/metrics/exporter';

type CreateOpsServerOptions = {
  name: string;
};

/**
 * Factory to create a Fastify server for operations concerns.
 * E.g. hosting the Prometheus metrics endpoint
 *
 * @param options - Configuration options for the operations server
 * @returns A configured FastifyInstance
 */
export async function createOpServer({ name }: CreateOpsServerOptions): Promise<FastifyInstance> {
  if (!name) {
    throw new Error('The "name" option is required.');
  }

  const opsName = `${name}-ops`;
  // const logger = createLogger({ name: opsName });

  // Apply logging configuration
  //let config = { logger };
  //config = await applyLoggingConfig(config);
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
      : true
  });

  server.decorate('name', opsName);

  // Register plugins for graceful shutdown and metrics
  await server.register(metricsExporter);

  return server;
}
