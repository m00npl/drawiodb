import { Context, Next } from 'hono';

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  message?: string;
  headers?: boolean;
}

interface ClientInfo {
  count: number;
  resetTime: number;
}

// In-memory store (use Redis in production)
const clients = new Map<string, ClientInfo>();

export function rateLimiter(options: RateLimitConfig) {
  const {
    windowMs,
    maxRequests,
    message = 'Too many requests, please try again later',
    headers = true
  } = options;

  return async (c: Context, next: Next) => {
    const clientIP = c.req.header('cf-connecting-ip') ||
                     c.req.header('x-forwarded-for') ||
                     c.req.header('x-real-ip') ||
                     'unknown';

    const now = Date.now();
    const client = clients.get(clientIP);

    if (!client || now > client.resetTime) {
      // New window or expired window
      clients.set(clientIP, {
        count: 1,
        resetTime: now + windowMs
      });

      if (headers) {
        c.header('X-RateLimit-Limit', maxRequests.toString());
        c.header('X-RateLimit-Remaining', (maxRequests - 1).toString());
        c.header('X-RateLimit-Reset', new Date(now + windowMs).toISOString());
      }

      await next();
      return;
    }

    if (client.count >= maxRequests) {
      // Rate limit exceeded
      if (headers) {
        c.header('X-RateLimit-Limit', maxRequests.toString());
        c.header('X-RateLimit-Remaining', '0');
        c.header('X-RateLimit-Reset', new Date(client.resetTime).toISOString());
        c.header('Retry-After', Math.ceil((client.resetTime - now) / 1000).toString());
      }

      return c.json({ error: message }, 429);
    }

    // Increment count
    client.count++;

    if (headers) {
      c.header('X-RateLimit-Limit', maxRequests.toString());
      c.header('X-RateLimit-Remaining', (maxRequests - client.count).toString());
      c.header('X-RateLimit-Reset', new Date(client.resetTime).toISOString());
    }

    await next();
  };
}

// Cleanup expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, client] of clients.entries()) {
    if (now > client.resetTime) {
      clients.delete(ip);
    }
  }
}, 60000); // Cleanup every minute