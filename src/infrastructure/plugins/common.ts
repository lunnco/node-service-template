import fastifyPlugin from 'fastify-plugin';
import { strict as assert } from 'node:assert';
import handleLoad from '@fastify/under-pressure';
// import handleAccessLogging from '@zenbusiness/fastify-access-logging-plugin';
// import handleUnavailable from '@zenbusiness/fastify-unavailable-plugin';
import metricsInstrumentation from '../framework/metrics/instrumentation';
import { FastifyInstance, FastifyRequest } from 'fastify';

interface ReleaseInfo {
  sha: string;
  branch: string;
  tag: string;
}

interface UnderPressureOptions {
  message?: string;
  retryAfter?: number;
  exposeStatusRoute?: string;
  [key: string]: unknown;
}

interface UnavailableOptions {
  ignores?: {
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface AccessLoggingOptions {
  ignoreLoggingUrl?: (url: string) => boolean;
  [key: string]: unknown;
}

interface MetricsOptions {
  [key: string]: unknown;
}

interface CommonPluginOptions {
  name: string;
  accessLogging?: AccessLoggingOptions;
  metrics?: MetricsOptions;
  unavailable?: UnavailableOptions;
  underPressure?: UnderPressureOptions;
}

/**
 * Set of plugins common to all Node.js Fastify applications
 */
async function commonPlugins(
  server: FastifyInstance,
  options: CommonPluginOptions
): Promise<void> {
  assert(options, '\'options\' is required');

  const {
    name,
    accessLogging,
    metrics,
    unavailable,
    underPressure = {
      message: 'Unavailable due to load',
      retryAfter: 10,
      exposeStatusRoute: '/alivez'
    }
  } = options;

  assert(name, '\'name\' is required');

  const RELEASE_INFO: ReleaseInfo = {
    sha: process.env.RELEASE_VERSION ?? 'unset',
    branch: process.env.RELEASE_BRANCH ?? 'unset',
    tag: process.env.RELEASE_TAG ?? 'unset'
  };

  // Expose service name for dependencies/plugins
  server.decorate('name', name);

  // Handle unavailable response for maintenance downtime
  //await server.register(handleUnavailable, unavailable);

  // Handle access logging
  //await server.register(handleAccessLogging, accessLogging);

  // Register health monitoring with status report route
  await server.register(handleLoad, underPressure);

  // Register handler to expose openTelemetry metrics for monitoring
  await server.register(metricsInstrumentation, {
    name,
    ...metrics
  });

  // Register version monitoring report route
  server.route({
    method: 'GET',
    url: '/versionz',
    handler: async function versionzHandler() {
      return RELEASE_INFO;
    }
  });

  server.route({
    method: 'GET',
    url: '/boomz',
    handler: async function boomzHandler(request: FastifyRequest) {
      // @ts-expect-error intentionally causing an error for testing
      return request.does.not.exit;
    }
  });

  // Register favicon route, to quiet the developer experience
  server.route({
    method: 'GET',
    url: '/favicon.ico',
    handler: async function faviconHandler() {
      return 'OK';
    }
  });
}

export default fastifyPlugin(commonPlugins, {
  fastify: '5', // Removed v3 support to focus on latest version
  name: 'common'
});