import { FastifyServerOptions } from "fastify";

export interface ServerConfig {
    name: string;
    port: number;
    host: string;
    opsPort: number;
    logger?: FastifyServerOptions['logger'];
  }
  export interface ReleaseInfo {
    sha: string;
    branch: string;
    tag: string;
  }
  
  export interface UnderPressureOptions {
    message?: string;
    retryAfter?: number;
    exposeStatusRoute?: string;
    [key: string]: unknown;
  }
  
  export interface UnavailableOptions {
    ignores?: {
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }
  
  export interface AccessLoggingOptions {
    ignoreLoggingUrl?: (url: string) => boolean;
    [key: string]: unknown;
  }
  
  export interface MetricsOptions {
    [key: string]: unknown;
  }
  
  export interface CommonPluginOptions {
    accessLogging?: AccessLoggingOptions;
    metrics?: MetricsOptions;
    unavailable?: UnavailableOptions;
    underPressure?: UnderPressureOptions;
  }
