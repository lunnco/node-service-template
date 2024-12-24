import { FastifyInstance } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import { strict as assert } from 'node:assert';
import { MetricsOptions } from '../server/interfaces';

import fastifyMetrics from 'fastify-metrics';


/**
 * Set of plugins common to all Node.js Fastify applications
 */
async function registerMetricsPlugins(
  server: FastifyInstance,
  options: MetricsOptions
): Promise<void> {
    await server.register(fastifyMetrics, {
        endpoint: '/metrics'
      });
    
      server.get('/health', async () => {
        return { status: 'ok' };
      });
}

export default fastifyPlugin(registerMetricsPlugins, {
  fastify: '5', // Removed v3 support to focus on latest version
  name: 'common'
});