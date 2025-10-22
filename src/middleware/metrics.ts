import { Context, Next } from 'hono';
import promClient from 'prom-client';

// Create a Registry which registers the metrics
const register = new promClient.Registry();

// Add a default label which is added to all metrics
register.setDefaultLabels({
  app: 'drawio-db'
});

// Enable the collection of default metrics
promClient.collectDefaultMetrics({ register });

// Create custom metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
});

const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

const activeConnections = new promClient.Gauge({
  name: 'http_active_connections',
  help: 'Number of active HTTP connections'
});

const arkivDbOperations = new promClient.Counter({
  name: 'arkiv_db_operations_total',
  help: 'Total number of Arkiv operations',
  labelNames: ['operation', 'status']
});

const arkivDbOperationDuration = new promClient.Histogram({
  name: 'arkiv_db_operation_duration_seconds',
  help: 'Duration of Arkiv operations in seconds',
  labelNames: ['operation'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30]
});

const rateLimitHits = new promClient.Counter({
  name: 'rate_limit_hits_total',
  help: 'Total number of rate limit hits',
  labelNames: ['endpoint']
});

// Register metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestsTotal);
register.registerMetric(activeConnections);
register.registerMetric(arkivDbOperations);
register.registerMetric(arkivDbOperationDuration);
register.registerMetric(rateLimitHits);

// Middleware to collect HTTP metrics
export function metricsMiddleware() {
  return async (c: Context, next: Next) => {
    const start = Date.now();
    activeConnections.inc();

    try {
      await next();
    } finally {
      const duration = (Date.now() - start) / 1000;
      const method = c.req.method;
      const route = c.req.path;
      const statusCode = c.res.status.toString();

      httpRequestDuration
        .labels(method, route, statusCode)
        .observe(duration);

      httpRequestsTotal
        .labels(method, route, statusCode)
        .inc();

      activeConnections.dec();
    }
  };
}

// Function to record Arkiv operations
export function recordArkivDbOperation(operation: string, duration: number, success: boolean) {
  arkivDbOperations
    .labels(operation, success ? 'success' : 'error')
    .inc();

  arkivDbOperationDuration
    .labels(operation)
    .observe(duration);
}

// Function to record rate limit hits
export function recordRateLimitHit(endpoint: string) {
  rateLimitHits
    .labels(endpoint)
    .inc();
}

// Export metrics endpoint handler
export function getMetrics() {
  return register.metrics();
}

export { register };