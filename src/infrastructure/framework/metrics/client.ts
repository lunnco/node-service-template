import { 
    PrometheusExporter, 
    PrometheusSerializer,
    ExporterConfig
  } from '@opentelemetry/exporter-prometheus';
  
  /**
   * PrometheusClient provides Prometheus exporter and serializer for metrics.
   * @see {@link https://www.npmjs.com/package/@opentelemetry/exporter-prometheus}
   */
  class PrometheusClient {
    private readonly _prometheusExporter: PrometheusExporter;
    private readonly _prometheusSerializer: PrometheusSerializer;
  
    constructor() {
      this._prometheusExporter = new PrometheusExporter({ 
        preventServerStart: true 
      } as ExporterConfig);
  
      const {
        prefix,
        appendTimestamp
      } = PrometheusExporter.DEFAULT_OPTIONS;
  
      this._prometheusSerializer = new PrometheusSerializer(
        prefix, 
        appendTimestamp
      );
    }
  
    get prometheusExporter(): PrometheusExporter {
      return this._prometheusExporter;
    }
  
    get prometheusSerializer(): PrometheusSerializer {
      return this._prometheusSerializer;
    }
  }
  
  const promClient = new PrometheusClient();
  
  export type { PrometheusClient };
  export { promClient };