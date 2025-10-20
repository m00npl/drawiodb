import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';

interface ErrorLog {
  timestamp: string;
  error: string;
  path: string;
  method: string;
  ip: string;
  userAgent: string;
}

// Simple in-memory error logging (use proper logging service in production)
const errorLogs: ErrorLog[] = [];

export function errorHandler() {
  return async (c: Context, next: Next) => {
    try {
      await next();
    } catch (error) {
      console.error('Application Error:', error);

      // Log error details
      const errorLog: ErrorLog = {
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
        path: c.req.path,
        method: c.req.method,
        ip: c.req.header('cf-connecting-ip') ||
            c.req.header('x-forwarded-for') ||
            c.req.header('x-real-ip') ||
            'unknown',
        userAgent: c.req.header('user-agent') || 'unknown'
      };

      errorLogs.push(errorLog);

      // Keep only last 1000 error logs in memory
      if (errorLogs.length > 1000) {
        errorLogs.splice(0, errorLogs.length - 1000);
      }

      // Handle different types of errors
      if (error instanceof HTTPException) {
        return c.json({
          error: error.message,
          status: error.status
        }, error.status);
      }

      if (error instanceof Error) {
        // Don't expose internal error details in production
        if (process.env.NODE_ENV === 'production') {
          return c.json({
            error: 'Internal server error',
            message: 'Something went wrong. Please try again later.'
          }, 500);
        } else {
          return c.json({
            error: error.message,
            stack: error.stack
          }, 500);
        }
      }

      // Fallback for unknown error types
      return c.json({
        error: 'Internal server error',
        message: 'An unexpected error occurred'
      }, 500);
    }
  };
}

// Function to get recent error logs (for monitoring)
export function getRecentErrorLogs(limit: number = 50): ErrorLog[] {
  return errorLogs.slice(-limit);
}

// Function to clear old error logs
export function clearOldErrorLogs(): void {
  const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
  const cutoffTime = new Date(oneDayAgo).toISOString();

  for (let i = errorLogs.length - 1; i >= 0; i--) {
    if (errorLogs[i].timestamp < cutoffTime) {
      errorLogs.splice(i, 1);
    }
  }
}

// Cleanup old logs every hour
setInterval(clearOldErrorLogs, 60 * 60 * 1000);