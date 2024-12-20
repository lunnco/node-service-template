import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import { strict as assert } from 'node:assert';
import { promClient, PrometheusClient } from './client';

async function metricsExporter(
  server: FastifyInstance
): Promise<void> {
  assert(promClient, 'Prometheus client is required.');
  const { prometheusExporter, prometheusSerializer } = promClient as PrometheusClient;
  assert(prometheusExporter, 'Prometheus exporter is required.');
  assert(prometheusSerializer, 'Prometheus serializer is required.');

  server.route({
    method: 'GET',
    url: '/metrics', // Changed from 'path' to 'url' as per Fastify v4 conventions
    handler: async (request) => {
      const collectionResult = await prometheusExporter.collect();
      const { resourceMetrics, errors } = collectionResult;

      if (errors.length) {
        request.log.error({
          message: 'PrometheusExporter: metrics collection errors',
          errors
        });
      }

      let result = prometheusSerializer.serialize(resourceMetrics);
      if (result === '') {
        result = '# no registered metrics';
      }

      return result;
    }
  });
}

export default fastifyPlugin<FastifyPluginAsync>(metricsExporter, {
  fastify: '5',
  name: 'metricsExporter'
}) as FastifyPluginAsync;