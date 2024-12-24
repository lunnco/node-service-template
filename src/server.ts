import closeWithGrace from "close-with-grace";
import { Server } from "./infrastructure/server";

function getLoggerOptions() {
    const isDevelopment = process.env.NODE_ENV === 'development';
    if (isDevelopment && process.stdout.isTTY) {
        return {
            level: process.env.LOG_LEVEL ?? 'info',
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

async function bootstrap() {
    const server = new Server({
        port: parseInt(process.env.PORT || '3000'),
        host: process.env.HOST || '0.0.0.0',
        opsPort: parseInt(process.env.OPS_PORT || '9090'),
        logger: getLoggerOptions(),
        name: process.env.SERVICE_NAME || 'app'
    }, {
        underPressure: {
            message: 'Service is under pressure',
            retryAfter: 50,
            exposeStatusRoute: '/status'
        },
        metrics: {}, // Add any metrics configuration if needed
    });

    await server.initialize();
    await server.start();

    // Graceful shutdown handling
    closeWithGrace(
        { delay: process.env.FASTIFY_CLOSE_GRACE_DELAY ? parseInt(process.env.FASTIFY_CLOSE_GRACE_DELAY, 10) : 500 },
        async ({ err }: any) => {
            if (err != null) {
                server.app.log.error(err);
            }
            await Promise.all([server.app.close(), server.ops.close()]);
        }
    );
}

bootstrap().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
});