import fastifyPlugin from 'fastify-plugin';
import { strict as assert } from 'node:assert';
import handleLoad from '@fastify/under-pressure';
import { FastifyInstance, FastifyRequest } from 'fastify';
import { CommonPluginOptions, ReleaseInfo } from '../server/interfaces';
import fastifyRateLimit from '@fastify/rate-limit';



/**
 * Set of plugins common to all Node.js Fastify applications
 */
async function registerCommonPlugins(
  server: FastifyInstance,
  options: CommonPluginOptions
): Promise<void> {
  assert(options, '\'options\' is required');

  const {
    underPressure = {
      message: 'Unavailable due to load',
      retryAfter: 10,
      exposeStatusRoute: '/alivez'
    }
  } = options;

  const RELEASE_INFO: ReleaseInfo = {
    sha: process.env.RELEASE_VERSION ?? 'unset',
    branch: process.env.RELEASE_BRANCH ?? 'unset',
    tag: process.env.RELEASE_TAG ?? 'unset'
  };


  await server.register(handleLoad, underPressure);
  await server.register(fastifyRateLimit, {
      max: 100,
      timeWindow: '1 minute'
    })

  server.setErrorHandler((err, request, reply) => {
    server.log.error(
      {
        err,
        request: {
          method: request.method,
          url: request.url,
          query: request.query,
          params: request.params
        }
      },
      'Unhandled error occurred'
    )

    reply.code(err.statusCode ?? 500)

    let message = 'Internal Server Error'
    if (err.statusCode && err.statusCode < 500) {
      message = err.message
    }

    return { message }
  })
  // An attacker could search for valid URLs if your 404 error handling is not rate limited.
  server.setNotFoundHandler(
    {
      preHandler: server.rateLimit({
        max: 3,
        timeWindow: 500
      })
    },
    (request, reply) => {
      request.log.warn(
        {
          request: {
            method: request.method,
            url: request.url,
            query: request.query,
            params: request.params
          }
        },
        'Resource not found'
      )

      reply.code(404)

      return { message: 'Not Found' }
    })

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

export default fastifyPlugin(registerCommonPlugins, {
  fastify: '5', // Removed v3 support to focus on latest version
  name: 'common'
});