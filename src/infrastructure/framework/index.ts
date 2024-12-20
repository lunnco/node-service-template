// src/infrastructure/framework/fastify.ts
import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { registerRoutes } from '../../interfaces/http/routes';
import { ShutdownManager } from './shutdown';
import { TelemetryService } from './metrics';
import './env';
export interface ServerPorts {
  app: number;
  ops: number;
 }
 interface Servers {
  appServer: FastifyInstance;
 } 

 async function buildFramework(): Promise<Servers> {
  // App Server
  const appServer = fastify({
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
 
  // Initialize telemetry
  const telemetry = new TelemetryService(process.env.SERVICE_NAME || 'app-service');
  
  // Setup metrics collection on app server
  telemetry.setupMetrics(appServer);
 
  // Register core plugins for app server
  await appServer.register(cors);
  await appServer.register(helmet);
  await registerRoutes(appServer);
 
  // Setup shutdown manager
  const shutdownManager = new ShutdownManager();
 
  // Handle process signals
  ['SIGTERM', 'SIGINT'].forEach((signal) => {
    process.on(signal, async () => {
      appServer.log.info(`${signal} received`);
      await Promise.all([
        shutdownManager.gracefulShutdown(appServer),
        telemetry.shutdown()
      ]);
    });
  });
 
  return { appServer };
 }

export { buildFramework };