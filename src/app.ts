/**
 * If you would like to turn your application into a standalone executable, look at server.js file
 */

import path from 'node:path'
import fp from 'fastify-plugin';
import fastifyAutoload from '@fastify/autoload'
import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import rateLimit from '@fastify/rate-limit';
import commonPlugin from './infrastructure/plugins/common'
import { registerRoutes } from './interfaces/routes'
export const options = {
  ajv: {
    customOptions: {
      coerceTypes: 'array',
      removeAdditional: 'all'
    }
  }
}

export default async function app (
  fastify: FastifyInstance,
  opts: FastifyPluginOptions
) {
  delete opts.skipOverride // This option only serves testing purpose
  // Register rate-limit plugin
  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute'
  })

  fastify.register(fp(commonPlugin), {
    name: process.env.SERVICE_NAME || 'app',
    underPressure: {
      message: 'Service is under pressure',
      retryAfter: 50,
      exposeStatusRoute: '/status'
    },
    metrics: {}, // Add any metrics configuration if needed
  });
  await registerRoutes(fastify);

  // This loads all plugins defined in routes
  // define your routes in one of these
 

  fastify.setErrorHandler((err, request, reply) => {
    fastify.log.error(
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
  fastify.setNotFoundHandler(
    {
      preHandler: fastify.rateLimit({
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
}
