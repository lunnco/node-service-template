import Fastify from 'fastify';
import closeWithGrace from 'close-with-grace';
import './infrastructure/framework/env';
import serviceApp from './app';
import { createOpServer } from './infrastructure/framework/createOpServer';

/**
 * Do not use NODE_ENV to determine what logger (or any env related feature) to use
 * @see {@link https://www.youtube.com/watch?v=HMM7GJC5E2o}
 */
function getLoggerOptions() {
  const isDevelopment = process.env.NODE_ENV === 'development';
  if (isDevelopment && process.stdout.isTTY) {
    return {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    };
  }

  return { level: process.env.LOG_LEVEL ?? 'silent' };
}

async function init() {
  const app = Fastify({
    logger: getLoggerOptions(),
    ajv: {
      customOptions: {
        coerceTypes: 'array',
        removeAdditional: 'all',
      },
    },
  });

  const opsServer = await createOpServer({ name: process.env.SERVICE_NAME || 'app' });

  // Register your application as a normal plugin.
  app.register(serviceApp, { 
    name: process.env.SERVICE_NAME || 'app',
    metrics: {}
   });

  // Graceful shutdown using closeWithGrace
  closeWithGrace(
    { delay: process.env.FASTIFY_CLOSE_GRACE_DELAY ? parseInt(process.env.FASTIFY_CLOSE_GRACE_DELAY, 10) : 500 },
    async ({ err }) => {
      if (err != null) {
        app.log.error(err);
      }
      await Promise.all([app.close(), opsServer.close()]);
    }
  );

  try {
    const appHost = process.env.NODE_HOST;
    const appPort = process.env.NODE_PORT ? parseInt(process.env.NODE_PORT, 10) : 3000;
    const opsHost = process.env.OPS_HOST || appHost;
    const opsPort = process.env.OPS_PORT ? parseInt(process.env.OPS_PORT, 10) : 3001;

    await app.listen({ host: appHost, port: appPort });
    app.log.info(`Application server listening on ${appHost}:${appPort}`);

    await opsServer.listen({ host: opsHost, port: opsPort });
    opsServer.log.info(`Operations server listening on ${opsHost}:${opsPort}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

init();
