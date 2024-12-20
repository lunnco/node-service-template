// src/infrastructure/telemetry/metrics.ts
import { FastifyInstance } from 'fastify';
import { MeterProvider, ExplicitBucketHistogramAggregation, View } from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { monitorEventLoopDelay, PerformanceObserver } from 'node:perf_hooks';
import { Counter, Histogram, ObservableGauge } from '@opentelemetry/api';

const DEFAULT_BOUNDARIES = [25, 50, 100, 250, 500, 1000, 2000, 5000, 10000, 25000, 50000];
const DEFAULT_IGNORE_PATHS = ['/favicon.ico', '/metrics', '/health'];

export class TelemetryService {
  private readonly meterProvider: MeterProvider;
  private readonly meter;
  private eventLoopDelayMonitor: any;
  private gcPerformanceObserver: PerformanceObserver | null = null;

  // Metrics with proper types
  private httpRequestDuration: Histogram;
  private httpRequestCount: Counter;
  private httpErrorCount: Counter;
  private eventLoopDelayP50: ObservableGauge;
  private eventLoopDelayP90: ObservableGauge;
  private eventLoopDelayP99: ObservableGauge;
  private gcDuration: Histogram<{ kind: string }>;
  constructor(serviceName: string, ignorePaths: string[] = DEFAULT_IGNORE_PATHS) {
    const prometheusExporter = new PrometheusExporter({
      port: Number(process.env.OPS_PORT) || 9464,
      host: '0.0.0.0'
    });
    

    // Configure histogram views
    const views = [
      new View({
        instrumentName: 'http.request.duration',
        aggregation: new ExplicitBucketHistogramAggregation(DEFAULT_BOUNDARIES)
      })
    ];

    this.meterProvider = new MeterProvider({
      resource: new Resource({
        'service.name': serviceName,
        'service.version': process.env.SERVICE_VERSION || '1.0.0',
        'deployment.environment': process.env.NODE_ENV || 'development'
      }),
      views
    });

    this.meterProvider = new MeterProvider({
      resource: new Resource({
        'service.name': serviceName,
        'service.version': process.env.SERVICE_VERSION || '1.0.0',
        'deployment.environment': process.env.NODE_ENV || 'development'
      }),
      views,
      readers: [prometheusExporter] // Add readers here instead of addMetricReader
    });
    this.meter = this.meterProvider.getMeter(serviceName);
    this.httpRequestDuration = this.meter.createHistogram('http.request.duration', {
      description: 'Duration of HTTP requests in ms',
      unit: 'milliseconds',
    });

    this.httpRequestCount = this.meter.createCounter('http.request.count', {
      description: 'Count of HTTP requests',
    });

    this.httpErrorCount = this.meter.createCounter('http.error.count', {
      description: 'Count of HTTP errors',
    });

    // Event loop delay metrics
    this.eventLoopDelayP50 = this.meter.createObservableGauge('nodejs.eventloop.delay.p50', {
      description: 'Event loop delay p50',
      unit: 'milliseconds',
    });

    this.eventLoopDelayP90 = this.meter.createObservableGauge('nodejs.eventloop.delay.p90', {
      description: 'Event loop delay p90',
      unit: 'milliseconds',
    });

    this.eventLoopDelayP99 = this.meter.createObservableGauge('nodejs.eventloop.delay.p99', {
      description: 'Event loop delay p99',
      unit: 'milliseconds',
    });

    // GC metrics
    this.gcDuration = this.meter.createHistogram('nodejs.gc.duration', {
      description: 'Garbage collection duration',
      unit: 'milliseconds',
    });
  }


  setupMetrics(app: FastifyInstance): void {
    // Setup event loop monitoring
    this.eventLoopDelayMonitor = monitorEventLoopDelay({ resolution: 10 });
    this.eventLoopDelayMonitor.enable();

    // Setup event loop metrics collection
    let p50Value = 0, p90Value = 0, p99Value = 0;

    this.eventLoopDelayP50.addCallback((gauge) => {
      if (this.eventLoopDelayMonitor) {
        p50Value = this.eventLoopDelayMonitor.percentile(50) / 1e6; // Convert to ms
        p90Value = this.eventLoopDelayMonitor.percentile(90) / 1e6;
        p99Value = this.eventLoopDelayMonitor.percentile(99) / 1e6;
        gauge.observe(p50Value);
        this.eventLoopDelayMonitor.reset();
      }
    });

    this.eventLoopDelayP90.addCallback((gauge) => {
      gauge.observe(p90Value);
    });

    this.eventLoopDelayP99.addCallback((gauge) => {
      gauge.observe(p99Value);
    });

    // Setup GC metrics collection
    this.gcPerformanceObserver = new PerformanceObserver((list) => {
      const entry = list.getEntries()[0];
      const gcEntry = entry as PerformanceEntry & { kind: string };
      this.gcDuration.record(gcEntry.duration, {
        kind: gcEntry.kind
      });
    });

    this.gcPerformanceObserver.observe({ entryTypes: ['gc'] });

    // HTTP metrics collection
    app.addHook('onResponse', async (request, reply) => {
      const routePath = request.routeOptions?.url || request.url;
      
      if (!DEFAULT_IGNORE_PATHS.includes(routePath)) {
        const attributes = {
          method: request.method,
          route: routePath,
          status_code: reply.statusCode,
        };

        this.httpRequestCount.add(1, attributes);
        this.httpRequestDuration.record(reply.elapsedTime, attributes);

        if (reply.statusCode >= 400) {
          this.httpErrorCount.add(1, {
            ...attributes,
            error_type: reply.statusCode >= 500 ? 'server_error' : 'client_error'
          });
        }
      }
    });
  }

  async shutdown(): Promise<void> {
    this.eventLoopDelayMonitor?.disable();
    this.gcPerformanceObserver?.disconnect();
    await this.meterProvider.shutdown();
  }
}