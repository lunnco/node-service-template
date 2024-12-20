// @ts-check

import fastifyPlugin from 'fastify-plugin';
import {
  MeterProvider,
  View,
  ExplicitBucketHistogramAggregation
} from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import {
  SemanticResourceAttributes as SEMRESATTRS
} from '@opentelemetry/semantic-conventions';
import { strict as assert } from 'node:assert';
import {
  monitorEventLoopDelay,
  PerformanceObserver,
  constants as perfHookConstants
} from 'node:perf_hooks';
import { getActiveResourcesInfo } from 'node:process';
import { promClient } from './client';

/** @typedef {import('fastify').FastifyInstance} FastifyInstance */
/** @typedef {import('fastify').FastifyRequest} FastifyRequest */
/** @typedef {import('fastify').FastifyReply} FastifyReply */
/** @typedef {import('@opentelemetry/sdk-metrics').Meter} Meter */
/** @typedef {import('@opentelemetry/sdk-metrics').Counter} Counter */
/** @typedef {import('@opentelemetry/sdk-metrics').Histogram} Histogram */
/** @typedef {import('@opentelemetry/sdk-metrics').ObservableUpDownCounter} ObservableUpDownCounter */
/** @typedef {import('@opentelemetry/sdk-metrics').ObservableGauge} ObservableGauge */

/**
 * @typedef {Object} MetricsOptions
 * @property {string} name - The service name
 * @property {string[]} [ignoreRouterPaths] - Paths to ignore
 * @property {string} [ignoreRouteRegex] - Regex for paths to ignore
 * @property {boolean} [supressDefaultMetrics] - Whether to suppress default metrics
 * @property {boolean} [supressAdvancedMetrics] - Whether to suppress advanced metrics
 * @property {View[]} [addlViews] - Additional views to add
 */

/**
 * @typedef {Object} RequestAttributes
 * @property {string} method - HTTP method
 * @property {string} path - Request path
 * @property {number} statusCode - HTTP status code
 * @property {string} [operationName] - Optional operation name
 */

/** @type {string[]} */
const DEFAULT_IGNORE_ROUTER_PATHS = ['/favicon.ico', '/alivez', '/versionz', '/metrics'];

/** @type {number[]} */
const DEFAULT_BOUNDARIES = [25, 50, 100, 250, 500, 1000, 2000, 5000, 10000, 25000, 50000];

const EXP_GET_ACTIVE_RESOURCES_INFO_EXISTS = typeof getActiveResourcesInfo === 'function';
const NODE_PERFORMANCE_GC_PREFIX = 'NODE_PERFORMANCE_GC_';
const NODE_PERFORMANCE_GC_FLAGS_PREFIX = 'NODE_PERFORMANCE_GC_FLAGS_';

/** @type {{ kinds: Record<number, string>, flags: Record<number, string> }} */
const { kinds: GC_KINDS, flags: GC_FLAGS } = Object.entries(perfHookConstants).reduce(
  (acc: { kinds: Record<number, string>, flags: Record<number, string> }, [type, val]) => {
    const isFlag = type.startsWith(NODE_PERFORMANCE_GC_FLAGS_PREFIX);

    if (isFlag) {
      acc.flags[val as number] = type.replace(NODE_PERFORMANCE_GC_FLAGS_PREFIX, '');
    } else if (type.startsWith(NODE_PERFORMANCE_GC_PREFIX)) {
      acc.kinds[val as number] = type.replace(NODE_PERFORMANCE_GC_PREFIX, '');
    }
    return acc;
  },
  { kinds: {}, flags: {} }
);

/**
 * @param {number} num
 * @returns {number}
 */
function convertNanoToMilli(num: any) {
  return Math.round(num / 1e6);
}

/**
 * Metrics instrumentation plugin for Fastify
 * @param {FastifyInstance} server
 * @param {MetricsOptions} options
 */
async function metricsInstrumentation(server: any, options: any) {
  const {
    name,
    ignoreRouterPaths = DEFAULT_IGNORE_ROUTER_PATHS,
    ignoreRouteRegex,
    supressDefaultMetrics = false,
    supressAdvancedMetrics = false,
    addlViews = []
  } = options || {};

  assert(name, 'Name is required');
  assert(promClient, 'Prometheus client is required.');
  const { prometheusExporter } = promClient;
  assert(prometheusExporter, 'Prometheus exporter is required.');

  /** @type {RegExp | null} */
  let ignoreRouteMatcher = null;
  if (ignoreRouteRegex) {
    ignoreRouteMatcher = new RegExp(ignoreRouteRegex);
  }

  /**
   * @param {string} path
   * @returns {boolean}
   */
  const ignoreRoute = (path: string) => {
    const shouldIgnore = ignoreRouterPaths.includes(path);
    if (!shouldIgnore && ignoreRouteMatcher) {
      return ignoreRouteMatcher.test(path);
    }
    return shouldIgnore;
  };

  const resource = Resource.default().merge(
    new Resource({
      [SEMRESATTRS.SERVICE_NAME]: name,
      [SEMRESATTRS.SERVICE_NAMESPACE]: name,
      [SEMRESATTRS.SERVICE_VERSION]: process.env.RELEASE_VERSION || 'unset'
    })
  );

  const views = [];
  if (!supressDefaultMetrics) {
    views.push(
      new View({
        instrumentName: 'nodejs_request_duration_ms',
        aggregation: new ExplicitBucketHistogramAggregation(DEFAULT_BOUNDARIES)
      })
    );
  }
  views.push(...addlViews);

  const readers = [prometheusExporter];
  const meterProvider = new MeterProvider({ resource, views, readers });

  server.decorate('meterProvider', meterProvider);

  if (!supressDefaultMetrics) {
    /** @type {import('node:perf_hooks').IntervalHistogram | null} */
    let eventLoopDelayMonitor: any = null;
    /** @type {PerformanceObserver | null} */
    let gcPerformanceObserver: any = null;
    const nodejsCommonMeter = server.meterProvider.getMeter('zenbusiness-nodejs-common');

    const requestCounter = nodejsCommonMeter.createCounter('nodejs_request_count', {
      description: 'Count of requests'
    });

    const errorCounter = nodejsCommonMeter.createCounter('nodejs_error_count', {
      description: 'Count of errors'
    });

    const requestDuration = nodejsCommonMeter.createHistogram('nodejs_request_duration_ms', {
      description: 'Response duration in ms.',
      unit: 'ms'
    });

    /** @type {Histogram | null} */
    let gcDuration = null;
    /** @type {ObservableUpDownCounter | null} */
    let activeResoucesByTypeCount = null;
    /** @type {ObservableGauge | null} */
    let eventLoopDelayP50 = null;
    /** @type {ObservableGauge | null} */
    let eventLoopDelayP90 = null;
    /** @type {ObservableGauge | null} */
    let eventLoopDelayP99 = null;

    if (!supressAdvancedMetrics) {
      gcDuration = nodejsCommonMeter.createHistogram('nodejs_gc_duration_ms', {
        description: 'Garbage collection duration in ms.',
        unit: 'ms'
      });

      activeResoucesByTypeCount = nodejsCommonMeter.createObservableUpDownCounter(
        'nodejs_active_resources_by_type_count',
        {
          description: 'Node.js active resources by type count'
        }
      );

      eventLoopDelayP50 = nodejsCommonMeter.createObservableGauge(
        'nodejs_event_loop_delay_p50_ms',
        {
          description: 'Node.js event loop delay p50',
          unit: 'ms'
        }
      );

      eventLoopDelayP90 = nodejsCommonMeter.createObservableGauge(
        'nodejs_event_loop_delay_p90_ms',
        {
          description: 'Node.js event loop delay p90',
          unit: 'ms'
        }
      );

      eventLoopDelayP99 = nodejsCommonMeter.createObservableGauge(
        'nodejs_event_loop_delay_p99_ms',
        {
          description: 'Node.js event loop delay p99',
          unit: 'ms'
        }
      );
    }

    server.addHook('onReady', function onReadyInstrumentMetrics() {
      if (!supressAdvancedMetrics) {
        eventLoopDelayMonitor = monitorEventLoopDelay({ resolution: 10 });
        eventLoopDelayMonitor.enable();

        /** @type {number | null} */
        let eventLoopDelayP50Value = null;
        /** @type {number | null} */
        let eventLoopDelayP90Value: any = null;
        /** @type {number | null} */
        let eventLoopDelayP99Value: any = null;

        eventLoopDelayP50?.addCallback((gauge: any) => {
          if (!eventLoopDelayMonitor) return;
          
          eventLoopDelayP50Value = convertNanoToMilli(eventLoopDelayMonitor.percentile(50));
          eventLoopDelayP90Value = convertNanoToMilli(eventLoopDelayMonitor.percentile(90));
          eventLoopDelayP99Value = convertNanoToMilli(eventLoopDelayMonitor.percentile(99));

          gauge.observe(eventLoopDelayP50Value);
          eventLoopDelayMonitor.reset();
        });

        eventLoopDelayP90?.addCallback((gauge: any) => {
          if (eventLoopDelayP90Value !== null) {
            gauge.observe(eventLoopDelayP90Value);
          }
        });

        eventLoopDelayP99?.addCallback((gauge: any) => {
          if (eventLoopDelayP99Value !== null) {
            gauge.observe(eventLoopDelayP99Value);
          }
        });

        if (EXP_GET_ACTIVE_RESOURCES_INFO_EXISTS) {
          activeResoucesByTypeCount?.addCallback((counter: any) => {
            const activeResourcesInfo = getActiveResourcesInfo();
            if (activeResourcesInfo !== null) {
              /** @type {Record<string, number>} */
              const activeResourceByName = activeResourcesInfo.reduce((acc: any, type) => {
                acc[type] = (acc[type] || 0) + 1;
                return acc;
              }, {});

              for (const [type, count] of Object.entries(activeResourceByName)) {
                counter.observe(count, { type });
              }
            }
          });
        }

        gcPerformanceObserver = new PerformanceObserver((list: any) => {
          const entry = list.getEntries()[0];
          const kind = GC_KINDS[entry.detail.kind];
          const flag = GC_FLAGS[entry.detail.flags];
          
          gcDuration?.record(entry.duration, {
            kind,
            flag
          });
        });
        gcPerformanceObserver.observe({ entryTypes: ['gc'] });
      }
    });

    server.addHook('onError', 
      /**
       * @param {FastifyRequest} request
       * @param {FastifyReply} reply
       * @param {Error & { statusCode?: number }} error
       */
      async (request: any, reply: any, error: any) => {
        const routerPath = request.routeOptions.url || 'UNDEFINED';
        
        if (!ignoreRoute(routerPath)) {
          /** @type {RequestAttributes} */
          const attributes = {
            method: request.method,
            path: routerPath,
            statusCode: error?.statusCode || reply.statusCode,
            ...(request.body?.operationName && { operationName: request.body.operationName })
          };
          
          errorCounter.add(1, attributes);
        }
    });

    server.addHook('onResponse', 
      /**
       * @param {FastifyRequest} request
       * @param {FastifyReply} reply
       */
      async (request: any, reply: any) => {
        const routerPath = request.routeOptions.url || 'UNDEFINED';
        
        if (!ignoreRoute(routerPath)) {
          /** @type {RequestAttributes} */
          const attributes = {
            method: request.method,
            path: routerPath,
            statusCode: reply.statusCode,
            ...(request.body?.operationName && { operationName: request.body.operationName })
          };

          requestCounter.add(1, attributes);
          requestDuration.record(reply.elapsedTime, attributes);
        }
    });

    server.addHook('onClose', async () => {
      if (!supressAdvancedMetrics) {
        eventLoopDelayMonitor?.disable();
        gcPerformanceObserver?.disconnect();
      }
      await server.meterProvider.shutdown();
    });
  }
}

export default fastifyPlugin(metricsInstrumentation, {
  fastify: '5',
  name: 'metricsInstrumentation'
});

export { DEFAULT_IGNORE_ROUTER_PATHS, DEFAULT_BOUNDARIES };