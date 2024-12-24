import fastify, { FastifyInstance, FastifyServerOptions } from "fastify";
import './env';
import { CommonPluginOptions, ServerConfig } from "./interfaces";
import registerCommonPlugins from '../plugins/common';
import registerMetricsPlugins from '../plugins/metrics';



export class Server {
    public readonly app: FastifyInstance;
    public readonly ops: FastifyInstance;

    constructor(
        private readonly config: ServerConfig,
        private readonly pluginOptions: CommonPluginOptions
    ) {
        // Main application server
        this.app = fastify({
            logger: config.logger || {
                level: process.env.LOG_LEVEL || 'info'
            }
        });
        this.app.decorate('name', config.name);

        // Operations server for metrics, health checks
        this.ops = fastify({
            logger: config.logger || {
                level: process.env.LOG_LEVEL || 'info'
            }
        });
        this.ops.decorate('name', `${config.name}-ops`);
    }

    async initialize(): Promise<void> {
        try {
            await registerCommonPlugins(this.app, this.pluginOptions);
            await registerMetricsPlugins(this.ops, {});
        } catch (err) {
            this.app.log.error(err);
            throw err;
        }
    }

    async start(): Promise<void> {
        try {
            await this.app.listen({
                port: this.config.port,
                host: this.config.host
            });

            await this.ops.listen({
                port: this.config.opsPort,
                host: this.config.host
            });
        } catch (err) {
            this.app.log.error(err);
            throw err;
        }
    }

    async stop(): Promise<void> {
        this.app.log.info('gracefully shutting down application server');
        await this.app.close();

        this.app.log.info('gracefully shutting down ops server');
        await this.ops.close();

        this.app.log.info('cleanup completed');
    }
}