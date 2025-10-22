import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from 'hono/bun';
import path from 'path';
import { ArkivService } from './services/arkivService';
import { createDiagramRoutes } from './routes/diagrams';
import { config, validateConfig } from './utils/config';
import { rateLimiter } from './middleware/rateLimiter';
import { errorHandler, getRecentErrorLogs } from './middleware/errorHandler';
import { metricsMiddleware, getMetrics, recordRateLimitHit } from './middleware/metrics';

async function startServer() {
  try {
    validateConfig();

    const app = new Hono();

    // Global error handler (must be first)
    app.use('*', errorHandler());

    // Metrics collection (should be early)
    app.use('*', metricsMiddleware());

    // Rate limiting - different limits for different endpoints
    app.use('/api/diagrams/export', rateLimiter({
      windowMs: 5 * 60 * 1000, // 5 minutes
      maxRequests: 1000, // Max 1000 exports per 5 min (very permissive for development)
      message: 'Too many diagram exports. Please wait a few minutes before trying again.'
    }));

    app.use('/api/diagrams/*', rateLimiter({
      windowMs: 1 * 60 * 1000, // 1 minute
      maxRequests: 1000, // Max 1000 API calls per minute
      message: 'Too many API requests. Please wait a minute before trying again.'
    }));

    app.use('*', rateLimiter({
      windowMs: 1 * 60 * 1000, // 1 minute
      maxRequests: 2000, // Max 2000 requests per minute for all other endpoints
      message: 'Too many requests. Please slow down.'
    }));

    app.use('*', cors({
      origin: [
        'https://drawiodb.online',
        'https://app.diagrams.net',
        'https://draw.io'
      ],
      credentials: true
    }));

    // Add security headers
    app.use('*', async (c, next) => {
      await next();

      // Enhanced Content Security Policy
      const cspPolicy = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://cdn.ethers.io https://storage.googleapis.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com https://fonts.googleapis.com",
        "img-src 'self' data: https: blob:",
        "media-src 'self' data: blob:",
        "connect-src 'self' https://kaolin.hoodi.arkiv.network wss://kaolin.hoodi.arkiv.network https:",
        "frame-src 'self' https://app.diagrams.net https://draw.io",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'self' https://app.diagrams.net https://draw.io",
        "upgrade-insecure-requests"
      ].join('; ');

      c.header('Content-Security-Policy', cspPolicy);

      // Additional security headers
      c.header('X-Content-Type-Options', 'nosniff');
      c.header('X-Frame-Options', 'SAMEORIGIN');
      c.header('X-XSS-Protection', '1; mode=block');
      c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
      c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

      // HSTS (only for HTTPS)
      if (c.req.header('x-forwarded-proto') === 'https') {
        c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
      }
    });

    // In-memory storage for share tokens (in production, use a database)
    const shareTokens = new Map<string, {
      token: string;
      diagramId: string;
      createdBy: string;
      createdAt: number;
      expiresAt?: number;
      isPublic: boolean;
      accessCount: number;
    }>();

    const arkivService = new ArkivService(
      config.arkiv.chainId,
      config.arkiv.privateKey,
      config.arkiv.rpcUrl,
      config.arkiv.wsUrl
    );

    console.log('Initializing Arkiv connection...');
    await arkivService.initialize();
    if (!arkivService.hasWriteAccess()) {
      console.log('⚠️  Arkiv backend running without signing key – write endpoints will return read-only responses.');
    }

    // API routes FIRST - before static files
    // Add diagram routes directly to main app
    app.post('/api/diagrams/export', async (c) => {
      try {
        const exportRequest = await c.req.json();
        const walletAddress = c.req.header('x-wallet-address');
        const custodialId = c.req.header('x-custodial-id');

        if (!exportRequest.title || !exportRequest.author || !exportRequest.content) {
          return c.json({
            success: false,
            error: 'Missing required fields: title, author, content'
          }, 400);
        }

        // Allow export even without backend private key - user can sign with MetaMask

        const diagramId = arkivService.generateDiagramId();
        const diagramData = {
          id: diagramId,
          title: exportRequest.title,
          author: exportRequest.author,
          content: exportRequest.content,
          timestamp: Date.now(),
          version: 1
        };

        const entityKey = await arkivService.exportDiagram(diagramData, walletAddress, undefined, exportRequest.encryptionPassword, custodialId);

        // Check if backend indicated frontend should handle transaction
        if (entityKey === 'USE_FRONTEND') {
          return c.json({
            success: false,
            requiresFrontendTransaction: true,
            diagramData,
            message: 'Backend has no signing key. Please use the plugin with MetaMask to sign the transaction.'
          });
        }

        return c.json({
          success: true,
          diagramId,
          entityKey
        });

      } catch (error) {
        console.error('Export error:', error);
        return c.json({
          success: false,
          error: (error as Error).message || 'Export failed'
        }, 500);
      }
    });

    app.get('/api/diagrams/import/:id', async (c) => {
      try {
        const diagramId = c.req.param('id');

        if (!diagramId) {
          return c.json({
            success: false,
            error: 'Diagram ID is required'
          }, 400);
        }

        const diagramData = await arkivService.importDiagram(diagramId);

        if (!diagramData) {
          return c.json({
            success: false,
            error: 'Diagram not found'
          }, 404);
        }

        return c.json({
          success: true,
          data: diagramData
        });

      } catch (error) {
        console.error('Import error:', error);

        const errorMessage = (error as Error).message || 'Import failed';

        // Determine appropriate HTTP status code based on error type
        let statusCode = 500;
        if (errorMessage.includes('expired') || errorMessage.includes('BTL')) {
          statusCode = 410; // Gone - resource existed but is no longer available
        } else if (errorMessage.includes('not found') || errorMessage.includes('never existed')) {
          statusCode = 404; // Not Found
        } else if (errorMessage.includes('encrypted') && errorMessage.includes('password')) {
          statusCode = 401; // Unauthorized - missing decryption password
        }

        return c.json({
          success: false,
          error: errorMessage
        }, statusCode as any);
      }
    });

    app.get('/api/diagrams/list', async (c) => {
      try {
        const author = c.req.query('author');
        const walletAddress = c.req.header('x-wallet-address');
        const custodialId = c.req.header('x-custodial-id');

        // Parse pagination parameters
        const limitParam = c.req.query('limit');
        const offsetParam = c.req.query('offset');
        const limit = limitParam ? parseInt(limitParam, 10) : 50; // Default 50, MVP requires 20+
        const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

        console.log(`Listing diagrams for wallet: ${walletAddress}, custodial: ${custodialId}, limit: ${limit}, offset: ${offset}`);

        const allDiagrams = await arkivService.listDiagrams(author, walletAddress, custodialId);

        // Sort by timestamp (newest first) and apply pagination
        const sortedDiagrams = allDiagrams.sort((a, b) => b.timestamp - a.timestamp);
        const paginatedDiagrams = sortedDiagrams.slice(offset, offset + limit);

        return c.json({
          success: true,
          data: paginatedDiagrams,
          count: paginatedDiagrams.length,
          total: allDiagrams.length,
          offset: offset,
          limit: limit,
          hasMore: (offset + limit) < allDiagrams.length
        });
      } catch (error) {
        console.error('List error:', error);
        return c.json({
          success: false,
          error: (error as Error).message || 'List operation failed'
        }, 500);
      }
    });

    // Enhanced search endpoint
    app.get('/api/diagrams/search', async (c) => {
      try {
        const walletAddress = c.req.header('x-wallet-address');
        const custodialId = c.req.header('x-custodial-id');

        // Get search parameters
        const query = c.req.query('query'); // General text search
        const title = c.req.query('title'); // Title-specific search
        const author = c.req.query('author'); // Author search
        const dateFrom = c.req.query('dateFrom'); // Timestamp range start
        const dateTo = c.req.query('dateTo'); // Timestamp range end
        const sortBy = c.req.query('sortBy') || 'timestamp'; // Sort criteria
        const sortOrder = c.req.query('sortOrder') || 'desc'; // Sort direction
        const limit = parseInt(c.req.query('limit') || '20'); // Maximum results
        const offset = parseInt(c.req.query('offset') || '0'); // Pagination offset

        console.log(`Searching diagrams: query="${query}", title="${title}", author="${author}"`);

        // Get all diagrams for the user
        const allDiagrams = await arkivService.listDiagrams(author, walletAddress, custodialId);

        // Filter diagrams based on search criteria
        let filteredDiagrams = allDiagrams.filter(diagram => {
          // Title search
          if (title && !diagram.title.toLowerCase().includes(title.toLowerCase())) {
            return false;
          }

          // Author search
          if (author && !diagram.author.toLowerCase().includes(author.toLowerCase())) {
            return false;
          }

          // Date range filter
          if (dateFrom && diagram.timestamp < parseInt(dateFrom)) {
            return false;
          }
          if (dateTo && diagram.timestamp > parseInt(dateTo)) {
            return false;
          }

          // General query search (search in title, author, and content if available)
          if (query) {
            const searchTerm = query.toLowerCase();
            const titleMatch = diagram.title.toLowerCase().includes(searchTerm);
            const authorMatch = diagram.author.toLowerCase().includes(searchTerm);

            // For content search, we need to fetch the diagram content
            // This is expensive, so we'll do title/author search first
            if (!titleMatch && !authorMatch) {
              return false;
            }
          }

          return true;
        });

        // Sort results
        filteredDiagrams.sort((a, b) => {
          let aVal, bVal;

          switch (sortBy) {
            case 'title':
              aVal = a.title.toLowerCase();
              bVal = b.title.toLowerCase();
              break;
            case 'author':
              aVal = a.author.toLowerCase();
              bVal = b.author.toLowerCase();
              break;
            case 'timestamp':
            default:
              aVal = a.timestamp;
              bVal = b.timestamp;
              break;
          }

          if (sortOrder === 'asc') {
            return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
          } else {
            return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
          }
        });

        // Apply pagination
        const paginatedResults = filteredDiagrams.slice(offset, offset + limit);

        // For content search, fetch content for remaining diagrams if needed
        if (query) {
          const searchTerm = query.toLowerCase();
          const contentSearchResults = [];

          for (const diagram of paginatedResults) {
            try {
              // Check if already matched title/author
              const titleMatch = diagram.title.toLowerCase().includes(searchTerm);
              const authorMatch = diagram.author.toLowerCase().includes(searchTerm);

              if (titleMatch || authorMatch) {
                contentSearchResults.push({
                  ...diagram,
                  score: titleMatch ? 1.0 : 0.8, // Higher score for title matches
                  excerpt: titleMatch ? diagram.title : diagram.author
                });
              } else {
                // Fetch content for deep search
                const diagramData = await arkivService.importDiagram(diagram.id);
                if (diagramData && diagramData.content.toLowerCase().includes(searchTerm)) {
                  // Extract excerpt around the match
                  const content = diagramData.content.toLowerCase();
                  const matchIndex = content.indexOf(searchTerm);
                  const start = Math.max(0, matchIndex - 50);
                  const end = Math.min(content.length, matchIndex + searchTerm.length + 50);
                  const excerpt = diagramData.content.substring(start, end);

                  contentSearchResults.push({
                    ...diagram,
                    score: 0.6, // Lower score for content matches
                    excerpt: '...' + excerpt + '...'
                  });
                }
              }
            } catch (error) {
              console.warn(`Error searching content for diagram ${diagram.id}:`, error);
              // Include diagram without content search
              contentSearchResults.push({
                ...diagram,
                score: 0.5,
                excerpt: diagram.title
              });
            }
          }

          // Sort by relevance score
          contentSearchResults.sort((a, b) => (b.score || 0) - (a.score || 0));

          return c.json({
            success: true,
            data: contentSearchResults,
            count: contentSearchResults.length,
            total: filteredDiagrams.length,
            query: {
              query,
              title,
              author,
              dateFrom,
              dateTo,
              sortBy,
              sortOrder,
              limit,
              offset
            }
          });
        }

        return c.json({
          success: true,
          data: paginatedResults,
          count: paginatedResults.length,
          total: filteredDiagrams.length,
          query: {
            query,
            title,
            author,
            dateFrom,
            dateTo,
            sortBy,
            sortOrder,
            limit,
            offset
          }
        });

      } catch (error) {
        console.error('Search error:', error);
        return c.json({
          success: false,
          error: (error as Error).message || 'Search operation failed'
        }, 500);
      }
    });

    app.delete('/api/diagrams/:id', async (c) => {
      try {
        const diagramId = c.req.param('id');
        const walletAddress = c.req.header('x-wallet-address');
        const custodialId = c.req.header('x-custodial-id');

        if (!diagramId) {
          return c.json({
            success: false,
            error: 'Diagram ID is required'
          }, 400);
        }

        console.log(`Deleting diagram ${diagramId} for wallet: ${walletAddress}, custodial: ${custodialId}`);

        const result = await arkivService.deleteDiagram(diagramId, walletAddress, custodialId);

        // Check if backend indicated frontend should handle deletion
        if (result === false) {
          return c.json({
            success: false,
            requiresFrontendTransaction: true,
            diagramId,
            message: 'Backend has no signing key. Please use the plugin with MetaMask to sign the deletion transaction.'
          });
        }

        return c.json({
          success: true,
          message: 'Diagram marked for deletion',
          deletionResult: result
        });

      } catch (error) {
        console.error('Delete error:', error);
        return c.json({
          success: false,
          error: (error as Error).message || 'Delete operation failed'
        }, 500);
      }
    });

    app.put('/api/diagrams/:id/rename', async (c) => {
      try {
        const diagramId = c.req.param('id');
        const walletAddress = c.req.header('x-wallet-address');
        const custodialId = c.req.header('x-custodial-id');
        const { newTitle } = await c.req.json();

        if (!diagramId || !newTitle) {
          return c.json({
            success: false,
            error: 'Diagram ID and new title are required'
          }, 400);
        }

        console.log(`Renaming diagram ${diagramId} to "${newTitle}" for wallet: ${walletAddress}, custodial: ${custodialId}`);

        const result = await arkivService.renameDiagram(diagramId, newTitle, walletAddress, custodialId);

        // Check if backend indicated frontend should handle rename
        if (result === false) {
          return c.json({
            success: false,
            requiresFrontendTransaction: true,
            diagramId,
            newTitle,
            message: 'Backend has no signing key. Please use the plugin with MetaMask to sign the rename transaction.'
          });
        }

        return c.json({
          success: true,
          message: 'Diagram renamed successfully',
          renameResult: result
        });

      } catch (error) {
        console.error('Rename error:', error);
        return c.json({
          success: false,
          error: (error as Error).message || 'Rename operation failed'
        }, 500);
      }
    });

    app.put('/api/diagrams/:id/btl', async (c) => {
      try {
        const diagramId = c.req.param('id');
        const walletAddress = c.req.header('x-wallet-address');
        const custodialId = c.req.header('x-custodial-id');
        const { newBTLDays } = await c.req.json();

        if (!diagramId || !newBTLDays || isNaN(newBTLDays)) {
          return c.json({
            success: false,
            error: 'Diagram ID and valid BTL days are required'
          }, 400);
        }

        console.log(`Changing BTL for diagram ${diagramId} to ${newBTLDays} days for wallet: ${walletAddress}, custodial: ${custodialId}`);

        const result = await arkivService.changeDiagramBTL(diagramId, newBTLDays, walletAddress, custodialId);

        // Check if backend indicated frontend should handle BTL change
        if (result === false) {
          return c.json({
            success: false,
            requiresFrontendTransaction: true,
            diagramId,
            newBTLDays,
            message: 'Backend has no signing key. Please use the plugin with MetaMask to sign the BTL change transaction.'
          });
        }

        return c.json({
          success: true,
          message: 'Diagram BTL updated successfully',
          btlResult: result
        });

      } catch (error) {
        console.error('BTL change error:', error);
        return c.json({
          success: false,
          error: (error as Error).message || 'BTL change operation failed'
        }, 500);
      }
    });

    app.put('/api/diagrams/:id/protect', async (c) => {
      try {
        const diagramId = c.req.param('id');
        const walletAddress = c.req.header('x-wallet-address');
        const custodialId = c.req.header('x-custodial-id');

        if (!diagramId) {
          return c.json({
            success: false,
            error: 'Diagram ID is required'
          }, 400);
        }

        console.log(`Protecting diagram ${diagramId} for wallet: ${walletAddress}, custodial: ${custodialId}`);

        const result = await arkivService.protectDiagram(diagramId, walletAddress, custodialId);

        // Check if backend indicated frontend should handle protection
        if (result === false) {
          return c.json({
            success: false,
            requiresFrontendTransaction: true,
            diagramId,
            message: 'Backend has no signing key. Please use the plugin with MetaMask to sign the protection transaction.'
          });
        }

        return c.json({
          success: true,
          message: 'Diagram protected successfully',
          protectionResult: result
        });

      } catch (error) {
        console.error('Protect error:', error);
        return c.json({
          success: false,
          error: (error as Error).message || 'Protect operation failed'
        }, 500);
      }
    });

    // Generate share token endpoint
    app.post('/api/diagrams/:id/share', async (c) => {
      try {
        const diagramId = c.req.param('id');
        const walletAddress = c.req.header('x-wallet-address');
        const custodialId = c.req.header('x-custodial-id');
        const { isPublic, expiresInDays } = await c.req.json();

        if (!diagramId) {
          return c.json({
            success: false,
            error: 'Diagram ID is required'
          }, 400);
        }

        console.log(`Creating share token for diagram ${diagramId}, public: ${isPublic}, expires: ${expiresInDays} days`);

        // Generate unique share token
        const token = crypto.randomUUID().replace(/-/g, '');
        const shareUrl = `${c.req.header('host') || 'localhost'}/shared/${token}`;

        // Calculate expiration
        const expiresAt = expiresInDays ?
          Date.now() + (expiresInDays * 24 * 60 * 60 * 1000) :
          undefined;

        // Store share token in memory (in production, this would go to a database)
        const shareData = {
          token,
          diagramId,
          createdBy: walletAddress || custodialId || 'anonymous',
          createdAt: Date.now(),
          expiresAt,
          isPublic,
          accessCount: 0
        };

        shareTokens.set(token, shareData);
        console.log('Share token created:', shareData);

        return c.json({
          success: true,
          token,
          shareUrl
        });

      } catch (error) {
        console.error('Share token error:', error);
        return c.json({
          success: false,
          error: (error as Error).message || 'Failed to create share token'
        }, 500);
      }
    });

    // Access shared diagram endpoint
    app.get('/shared/:token', async (c) => {
      try {
        const token = c.req.param('token');
        const format = c.req.query('format') || 'viewer'; // viewer (default), xml, json, svg, png, html

        if (!token) {
          return c.text('Invalid share link', 400);
        }

        // Retrieve share token data from storage
        const shareData = shareTokens.get(token);
        if (!shareData) {
          return c.html(`
            <html>
              <head>
                <title>Share Link Not Found</title>
                <meta charset="utf-8">
              </head>
              <body>
                <h1>❌ Share Link Not Found</h1>
                <p>This share link is invalid or has been removed.</p>
                <a href="/">Return to Draw.io</a>
              </body>
            </html>
          `, 404);
        }

        // Check if token has expired
        if (shareData.expiresAt && Date.now() > shareData.expiresAt) {
          return c.html(`
            <html>
              <head>
                <title>Share Link Expired</title>
                <meta charset="utf-8">
              </head>
              <body>
                <h1>⏰ Share Link Expired</h1>
                <p>This share link has expired and is no longer accessible.</p>
                <a href="/">Return to Draw.io</a>
              </body>
            </html>
          `, 410);
        }

        // Check if private link requires authentication
        if (!shareData.isPublic) {
          const walletAddress = c.req.header('x-wallet-address');
          const custodialId = c.req.header('x-custodial-id');

          // For private links, user must be authenticated
          if (!walletAddress && !custodialId) {
            return c.html(`
              <html>
                <head>
                  <title>Authentication Required</title>
                  <meta charset="utf-8">
                </head>
                <body>
                  <h1>🔒 Authentication Required</h1>
                  <p>This is a private diagram. Please log in to view it.</p>
                  <button onclick="window.location.href='/?auth=required'">Log in with Draw.io</button>
                </body>
              </html>
            `, 401);
          }
        }

        // Increment access count
        shareData.accessCount++;
        shareTokens.set(token, shareData);

        // Fetch the actual diagram data
        let diagramData;
        try {
          diagramData = await arkivService.importDiagram(shareData.diagramId);

          if (!diagramData) {
            return c.html(`
              <html>
                <head>
                  <title>Diagram Not Found</title>
                  <meta charset="utf-8">
                </head>
                <body>
                  <h1>📄 Diagram Not Found</h1>
                  <p>The shared diagram could not be found or has been removed.</p>
                  <a href="/">Return to Draw.io</a>
                </body>
              </html>
            `, 404);
          }
        } catch (diagramError) {
          console.error('Shared diagram access error:', diagramError);

          const errorMessage = (diagramError as Error).message;

          // Check if the error indicates an expired diagram
          if (errorMessage.includes('expired') || errorMessage.includes('BTL')) {
            return c.html(`
              <html>
                <head>
                  <title>Diagram Expired</title>
                  <meta charset="utf-8">
                </head>
                <body>
                  <h1>⏰ Diagram Expired</h1>
                  <p>This shared diagram has expired and is no longer available on the blockchain.</p>
                  <p>The diagram may have exceeded its Block Time to Live (BTL) period.</p>
                  <a href="/">Return to Draw.io</a>
                </body>
              </html>
            `, 410);
          }

          // Generic error for other import failures
          return c.html(`
            <html>
              <head>
                <title>Diagram Access Error</title>
                <meta charset="utf-8">
              </head>
              <body>
                <h1>❌ Diagram Access Error</h1>
                <p>The shared diagram could not be loaded: ${errorMessage}</p>
                <a href="/">Return to Draw.io</a>
              </body>
            </html>
          `, 500);
        }

        // Handle different format requests
        if (format === 'viewer') {
          // Default viewer format - return HTML page with draw.io integration
          const drawioUrl = `/?lightbox=1&edit=_blank&title=${encodeURIComponent(diagramData.title)}&xml=${encodeURIComponent(diagramData.content)}`;

          return c.html(`
            <!DOCTYPE html>
            <html lang="en">
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
                <meta name="description" content="Shared diagram: ${diagramData.title}">
                <meta name="author" content="${shareData.createdBy}">
                <title>📊 ${diagramData.title} - Shared Diagram</title>

                <!-- Open Graph tags -->
                <meta property="og:title" content="${diagramData.title}">
                <meta property="og:description" content="Shared diagram from Arkiv">
                <meta property="og:type" content="website">
                <meta property="og:url" content="${c.req.url.split('?')[0]}">

                <!-- Favicon -->
                <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📊</text></svg>">

                <style>
                  :root {
                    --primary: #667eea;
                    --primary-dark: #5a6fd8;
                    --secondary: #764ba2;
                    --success: #28a745;
                    --danger: #dc3545;
                    --warning: #ffc107;
                    --info: #17a2b8;
                    --light: #f8f9fa;
                    --dark: #343a40;
                    --border: #dee2e6;
                    --shadow: rgba(0, 0, 0, 0.1);
                    --shadow-lg: rgba(0, 0, 0, 0.15);
                    --border-radius: 12px;
                    --transition: all 0.2s ease;
                  }

                  * {
                    box-sizing: border-box;
                  }

                  body {
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                    margin: 0;
                    padding: 0;
                    background: linear-gradient(135deg, var(--light) 0%, #e9ecef 100%);
                    min-height: 100vh;
                    line-height: 1.6;
                    color: var(--dark);
                  }

                  .container {
                    max-width: 800px;
                    margin: 0 auto;
                    padding: 20px;
                  }

                  .header {
                    background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
                    color: white;
                    padding: 30px;
                    border-radius: var(--border-radius);
                    margin-bottom: 24px;
                    box-shadow: 0 8px 32px var(--shadow-lg);
                    text-align: center;
                    position: relative;
                    overflow: hidden;
                  }

                  .header::before {
                    content: '';
                    position: absolute;
                    top: -50%;
                    right: -50%;
                    width: 100%;
                    height: 100%;
                    background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
                    transform: rotate(45deg);
                  }

                  .header h1 {
                    margin: 0 0 12px 0;
                    font-size: 2.2rem;
                    font-weight: 700;
                    text-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    position: relative;
                    z-index: 1;
                  }

                  .header .subtitle {
                    font-size: 1.1rem;
                    opacity: 0.9;
                    margin: 0;
                    position: relative;
                    z-index: 1;
                  }

                  .stats {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                    gap: 16px;
                    margin-bottom: 24px;
                  }

                  .stat-card {
                    background: white;
                    padding: 20px;
                    border-radius: var(--border-radius);
                    box-shadow: 0 4px 16px var(--shadow);
                    text-align: center;
                    transition: var(--transition);
                    border: 1px solid var(--border);
                  }

                  .stat-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 24px var(--shadow-lg);
                  }

                  .stat-icon {
                    font-size: 2rem;
                    margin-bottom: 8px;
                    display: block;
                  }

                  .stat-value {
                    font-size: 1.1rem;
                    font-weight: 600;
                    color: var(--primary);
                    margin-bottom: 4px;
                  }

                  .stat-label {
                    font-size: 0.9rem;
                    color: #6c757d;
                  }

                  .action-card {
                    background: white;
                    border-radius: var(--border-radius);
                    box-shadow: 0 4px 16px var(--shadow);
                    margin-bottom: 24px;
                    border: 1px solid var(--border);
                    overflow: hidden;
                  }

                  .action-card-header {
                    background: var(--light);
                    padding: 20px;
                    border-bottom: 1px solid var(--border);
                  }

                  .action-card-header h3 {
                    margin: 0;
                    font-size: 1.2rem;
                    color: var(--dark);
                    display: flex;
                    align-items: center;
                    gap: 8px;
                  }

                  .action-card-body {
                    padding: 20px;
                  }

                  .primary-button {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
                    color: white;
                    text-decoration: none;
                    padding: 16px 24px;
                    border-radius: var(--border-radius);
                    font-weight: 600;
                    font-size: 1.1rem;
                    transition: var(--transition);
                    border: none;
                    cursor: pointer;
                    box-shadow: 0 4px 16px rgba(102, 126, 234, 0.3);
                    width: 100%;
                    justify-content: center;
                    text-align: center;
                  }

                  .primary-button:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 24px rgba(102, 126, 234, 0.4);
                  }

                  .format-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
                    gap: 12px;
                  }

                  .format-link {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 8px;
                    padding: 16px 12px;
                    background: var(--light);
                    border: 2px solid var(--border);
                    border-radius: var(--border-radius);
                    text-decoration: none;
                    color: var(--dark);
                    transition: var(--transition);
                    font-size: 0.9rem;
                    font-weight: 500;
                  }

                  .format-link:hover {
                    border-color: var(--primary);
                    background: white;
                    transform: translateY(-2px);
                    box-shadow: 0 4px 16px var(--shadow);
                  }

                  .format-icon {
                    font-size: 1.5rem;
                  }

                  .share-url {
                    background: white;
                    border: 2px solid var(--border);
                    border-radius: var(--border-radius);
                    padding: 16px;
                    font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
                    font-size: 0.9rem;
                    word-break: break-all;
                    position: relative;
                    cursor: pointer;
                    transition: var(--transition);
                  }

                  .share-url:hover {
                    border-color: var(--primary);
                    background: var(--light);
                  }

                  .copy-button {
                    position: absolute;
                    top: 8px;
                    right: 8px;
                    background: var(--primary);
                    color: white;
                    border: none;
                    border-radius: 6px;
                    padding: 6px 10px;
                    font-size: 0.8rem;
                    cursor: pointer;
                    transition: var(--transition);
                  }

                  .copy-button:hover {
                    background: var(--primary-dark);
                  }

                  .copy-success {
                    background: var(--success) !important;
                  }

                  .powered-by {
                    text-align: center;
                    margin-top: 40px;
                    padding: 20px;
                    color: #6c757d;
                    font-size: 0.9rem;
                  }

                  .powered-by a {
                    color: var(--primary);
                    text-decoration: none;
                    font-weight: 600;
                  }

                  .powered-by a:hover {
                    text-decoration: underline;
                  }

                  /* Mobile responsive */
                  @media (max-width: 768px) {
                    .container {
                      padding: 16px;
                    }

                    .header {
                      padding: 24px 20px;
                    }

                    .header h1 {
                      font-size: 1.8rem;
                    }

                    .stats {
                      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
                      gap: 12px;
                    }

                    .stat-card {
                      padding: 16px;
                    }

                    .action-card-header,
                    .action-card-body {
                      padding: 16px;
                    }

                    .format-grid {
                      grid-template-columns: repeat(2, 1fr);
                    }
                  }

                  @media (max-width: 480px) {
                    .header h1 {
                      font-size: 1.5rem;
                    }

                    .stats {
                      grid-template-columns: 1fr;
                    }

                    .format-grid {
                      grid-template-columns: 1fr;
                    }
                  }

                  /* Dark mode support */
                  @media (prefers-color-scheme: dark) {
                    :root {
                      --light: #1a1a1a;
                      --dark: #ffffff;
                      --border: #333333;
                      --shadow: rgba(255, 255, 255, 0.1);
                      --shadow-lg: rgba(255, 255, 255, 0.15);
                    }

                    body {
                      background: linear-gradient(135deg, #1a1a1a 0%, #2d3748 100%);
                    }

                    .action-card,
                    .stat-card {
                      background: #2d3748;
                      border-color: #4a5568;
                    }

                    .action-card-header {
                      background: #1a202c;
                      border-color: #4a5568;
                    }

                    .format-link {
                      background: #2d3748;
                      border-color: #4a5568;
                    }

                    .format-link:hover {
                      background: #4a5568;
                    }

                    .share-url {
                      background: #2d3748;
                      border-color: #4a5568;
                      color: #e2e8f0;
                    }

                    .share-url:hover {
                      background: #4a5568;
                    }
                  }

                  /* Print styles */
                  @media print {
                    .action-card,
                    .powered-by {
                      display: none;
                    }

                    body {
                      background: white;
                    }

                    .header {
                      background: #f8f9fa;
                      color: black;
                    }
                  }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="header">
                    <h1>📊 ${diagramData.title}</h1>
                    <p class="subtitle">Shared diagram from Arkiv</p>
                  </div>

                  <div class="stats">
                    <div class="stat-card">
                      <span class="stat-icon">👤</span>
                      <div class="stat-value">${shareData.createdBy}</div>
                      <div class="stat-label">Shared by</div>
                    </div>
                    <div class="stat-card">
                      <span class="stat-icon">📅</span>
                      <div class="stat-value">${new Date(shareData.createdAt).toLocaleDateString()}</div>
                      <div class="stat-label">Created</div>
                    </div>
                    <div class="stat-card">
                      <span class="stat-icon">👁️</span>
                      <div class="stat-value">${shareData.accessCount}</div>
                      <div class="stat-label">Views</div>
                    </div>
                  </div>

                  <div class="action-card">
                    <div class="action-card-header">
                      <h3><span>🖼️</span> Open & Edit</h3>
                    </div>
                    <div class="action-card-body">
                      <p style="margin: 0 0 16px 0; color: #6c757d;">Open this diagram in the full editor to view and make changes.</p>
                      <a href="${drawioUrl}" target="_blank" class="primary-button">
                        <span>🖼️</span> Open in drawiodb.online
                      </a>
                    </div>
                  </div>

                  <div class="action-card">
                    <div class="action-card-header">
                      <h3><span>💾</span> Download Options</h3>
                    </div>
                    <div class="action-card-body">
                      <p style="margin: 0 0 16px 0; color: #6c757d;">Download this diagram in various formats for offline use or integration.</p>
                      <div class="format-grid">
                        <a href="?format=xml" class="format-link">
                          <span class="format-icon">📄</span>
                          <span>XML</span>
                        </a>
                        <a href="?format=json" class="format-link">
                          <span class="format-icon">📊</span>
                          <span>JSON</span>
                        </a>
                        <a href="?format=svg" class="format-link">
                          <span class="format-icon">🖼️</span>
                          <span>SVG</span>
                        </a>
                        <a href="?format=png" class="format-link">
                          <span class="format-icon">🖼️</span>
                          <span>PNG</span>
                        </a>
                        <a href="?format=html" class="format-link">
                          <span class="format-icon">🌐</span>
                          <span>HTML</span>
                        </a>
                      </div>
                    </div>
                  </div>

                  <div class="action-card">
                    <div class="action-card-header">
                      <h3><span>🔗</span> Share This Link</h3>
                    </div>
                    <div class="action-card-body">
                      <p style="margin: 0 0 16px 0; color: #6c757d;">Copy this link to share the diagram with others.</p>
                      <div class="share-url" onclick="copyShareUrl(this)">
                        <button class="copy-button" id="copyBtn">Copy</button>
                        ${c.req.url.split('?')[0]}
                      </div>
                    </div>
                  </div>

                  <div class="powered-by">
                    Powered by <a href="https://arkiv.network" target="_blank">Arkiv</a> •
                    Built with <a href="https://draw.io" target="_blank">draw.io</a>
                  </div>
                </div>

                <script>
                  function copyShareUrl(element) {
                    const text = element.textContent.replace('Copy', '').trim();
                    const btn = element.querySelector('#copyBtn');

                    navigator.clipboard.writeText(text).then(() => {
                      btn.textContent = '✓ Copied!';
                      btn.classList.add('copy-success');

                      setTimeout(() => {
                        btn.textContent = 'Copy';
                        btn.classList.remove('copy-success');
                      }, 2000);
                    }).catch(() => {
                      // Fallback for older browsers
                      const textArea = document.createElement('textarea');
                      textArea.value = text;
                      document.body.appendChild(textArea);
                      textArea.select();
                      document.execCommand('copy');
                      document.body.removeChild(textArea);

                      btn.textContent = '✓ Copied!';
                      btn.classList.add('copy-success');

                      setTimeout(() => {
                        btn.textContent = 'Copy';
                        btn.classList.remove('copy-success');
                      }, 2000);
                    });
                  }

                  // Add loading states to download links
                  document.querySelectorAll('.format-link').forEach(link => {
                    link.addEventListener('click', function() {
                      const icon = this.querySelector('.format-icon');
                      const originalIcon = icon.textContent;
                      icon.textContent = '⏳';

                      setTimeout(() => {
                        icon.textContent = originalIcon;
                      }, 2000);
                    });
                  });

                  // Add ripple effect to primary button
                  document.querySelector('.primary-button').addEventListener('click', function(e) {
                    const ripple = document.createElement('span');
                    const rect = this.getBoundingClientRect();
                    const size = Math.max(rect.width, rect.height);
                    const x = e.clientX - rect.left - size / 2;
                    const y = e.clientY - rect.top - size / 2;

                    ripple.style.cssText = \`
                      position: absolute;
                      width: \${size}px;
                      height: \${size}px;
                      left: \${x}px;
                      top: \${y}px;
                      background: rgba(255, 255, 255, 0.3);
                      border-radius: 50%;
                      transform: scale(0);
                      animation: ripple 0.6s ease-out;
                      pointer-events: none;
                    \`;

                    if (!document.querySelector('#ripple-style')) {
                      const style = document.createElement('style');
                      style.id = 'ripple-style';
                      style.textContent = \`
                        @keyframes ripple {
                          to {
                            transform: scale(2);
                            opacity: 0;
                          }
                        }
                      \`;
                      document.head.appendChild(style);
                    }

                    this.style.position = 'relative';
                    this.style.overflow = 'hidden';
                    this.appendChild(ripple);

                    setTimeout(() => {
                      ripple.remove();
                    }, 600);
                  });
                </script>
              </body>
            </html>
          `);
        } else {
          // Direct format access - use the diagram direct access functionality
          try {
            const directResult = await arkivService.getDiagramDirect(shareData.diagramId, format);

            if (!directResult) {
              return c.json({
                success: false,
                error: 'Could not generate requested format'
              }, 500);
            }

            // Set appropriate content type and headers
            c.header('Content-Type', directResult.contentType);
            c.header('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
            c.header('Content-Disposition', `inline; filename="${encodeURIComponent(directResult.title)}.${format}"`);

            if (typeof directResult.content === 'string') {
              return c.text(directResult.content);
            } else {
              return new Response(directResult.content, {
                headers: {
                  'Content-Type': directResult.contentType,
                  'Cache-Control': 'public, max-age=3600',
                  'Content-Disposition': `inline; filename="${encodeURIComponent(directResult.title)}.${format}"`
                }
              });
            }
          } catch (formatError) {
            console.error('Format conversion error:', formatError);
            return c.json({
              success: false,
              error: `Failed to convert diagram to ${format} format: ${(formatError as Error).message}`
            }, 500);
          }
        }

      } catch (error) {
        console.error('Shared access error:', error);
        return c.text('Error accessing shared diagram', 500);
      }
    });

    // Config endpoint with user tier information
    app.get('/api/diagrams/config', async (c) => {
      try {
        const walletAddress = c.req.header('x-wallet-address');
        const custodialId = c.req.header('x-custodial-id');

        // Get user tier information
        const userTierInfo = arkivService.getUserTierInfo(walletAddress, custodialId);

        // Return default user config with tier information
        const defaultConfig = {
          btlDays: userTierInfo.limits.defaultBTLDays,
          encryption: userTierInfo.limits.canEncrypt,
          autoSave: false,
          theme: 'light'
        };

        return c.json({
          success: true,
          config: defaultConfig,
          readOnlyMode: !config.arkiv.privateKey, // Indicate if backend can handle transactions
          userTier: userTierInfo.tier,
          limits: userTierInfo.limits,
          displayInfo: userTierInfo.displayInfo
        });
      } catch (error) {
        console.error('Config endpoint error:', error);
        return c.json({
          success: false,
          error: (error as Error).message || 'Failed to load config'
        }, 500);
      }
    });

    // Save user configuration endpoint
    app.post('/api/diagrams/config', async (c) => {
      try {
        const walletAddress = c.req.header('x-wallet-address');
        const custodialId = c.req.header('x-custodial-id');

        if (!walletAddress && !custodialId) {
          return c.json({
            success: false,
            error: 'Authentication required'
          }, 401);
        }

        const configData = await c.req.json();

        // Validate configuration data
        if (!configData || typeof configData !== 'object') {
          return c.json({
            success: false,
            error: 'Invalid configuration data'
          }, 400);
        }

        // Validate BTL range
        if (configData.btlDays && (configData.btlDays < 1 || configData.btlDays > 365)) {
          return c.json({
            success: false,
            error: 'BTL days must be between 1 and 365'
          }, 400);
        }

        // Check if backend has write access
        if (!arkivService.hasWriteAccess()) {
          // Backend is in read-only mode - config should be saved client-side
          return c.json({
            success: true,
            message: 'Configuration stored locally (backend in read-only mode)',
            config: configData,
            readOnlyMode: true
          });
        }

        // Add wallet address to config for storage
        const configToSave = {
          ...configData,
          walletAddress: walletAddress || custodialId,
          updatedAt: new Date().toISOString()
        };

        // Save configuration using ArkivService
        const savedConfigId = await arkivService.saveUserConfig(configToSave);

        return c.json({
          success: true,
          message: 'Configuration saved successfully',
          config: configToSave,
          configId: savedConfigId
        });

      } catch (error) {
        console.error('Save config error:', error);
        return c.json({
          success: false,
          error: (error as Error).message || 'Failed to save configuration'
        }, 500);
      }
    });

    // User dashboard endpoint with usage statistics
    app.get('/api/diagrams/dashboard', async (c) => {
      try {
        const walletAddress = c.req.header('x-wallet-address');
        const custodialId = c.req.header('x-custodial-id');

        if (!walletAddress && !custodialId) {
          return c.json({
            success: false,
            error: 'Authentication required'
          }, 401);
        }

        // Get user tier information
        const userTierInfo = arkivService.getUserTierInfo(walletAddress, custodialId);

        // Get user's diagrams to calculate usage
        const diagrams = await arkivService.listDiagrams(walletAddress || custodialId!, walletAddress, custodialId);

        // Calculate storage usage (estimate from metadata)
        const totalDiagrams = diagrams.length;
        // Estimate 50KB average per diagram for storage calculation
        const estimatedTotalSizeKB = totalDiagrams * 50;

        // Calculate usage percentages
        const diagramUsagePercent = Math.round((totalDiagrams / userTierInfo.limits.maxDiagrams) * 100);
        const storageUsagePercent = Math.round((estimatedTotalSizeKB / (userTierInfo.limits.maxDiagramSizeKB * userTierInfo.limits.maxDiagrams)) * 100);

        // Get tier-based visual indicators
        const tierBadge = {
          free: { color: '#6c757d', icon: '🆓', label: 'Free Tier', bgColor: '#f8f9fa' },
          custodial: { color: '#28a745', icon: '👤', label: 'Custodial', bgColor: '#d4edda' },
          wallet: { color: '#007bff', icon: '💎', label: 'Wallet Connected', bgColor: '#d1ecf1' }
        }[userTierInfo.tier] || { color: '#6c757d', icon: '🔒', label: 'Unknown', bgColor: '#f8f9fa' };

        const usageStats = {
          diagrams: {
            current: totalDiagrams,
            limit: userTierInfo.limits.maxDiagrams,
            percentage: diagramUsagePercent,
            status: diagramUsagePercent >= 90 ? 'danger' : diagramUsagePercent >= 70 ? 'warning' : 'success'
          },
          storage: {
            currentKB: estimatedTotalSizeKB,
            limitKB: userTierInfo.limits.maxDiagramSizeKB * userTierInfo.limits.maxDiagrams,
            percentage: storageUsagePercent,
            status: storageUsagePercent >= 90 ? 'danger' : storageUsagePercent >= 70 ? 'warning' : 'success'
          },
          btl: {
            current: userTierInfo.limits.defaultBTLDays,
            max: userTierInfo.limits.maxBTLDays,
            canIncrease: userTierInfo.tier !== 'free'
          }
        };

        return c.json({
          success: true,
          userTier: userTierInfo.tier,
          tierBadge,
          limits: userTierInfo.limits,
          usage: usageStats,
          features: {
            canShare: userTierInfo.limits.canShare,
            canEncrypt: userTierInfo.limits.canEncrypt,
            canExtendBTL: userTierInfo.tier !== 'free'
          },
          upgradePrompts: userTierInfo.tier === 'free' ? {
            title: 'Upgrade to Unlock More Features',
            benefits: [
              'Connect your wallet for longer diagram storage',
              'Extended BTL (Block Time to Live) options',
              'Priority support and features'
            ],
            ctaText: 'Connect Wallet',
            ctaAction: 'connect_wallet'
          } : null
        });
      } catch (error) {
        console.error('Dashboard error:', error);
        return c.json({
          success: false,
          error: (error as Error).message || 'Failed to load dashboard'
        }, 500);
      }
    });

    // Enhanced search endpoint
    app.post('/api/diagrams/search', async (c) => {
      try {
        const walletAddress = c.req.header('x-wallet-address');
        const custodialId = c.req.header('x-custodial-id');
        const searchRequest = await c.req.json();

        console.log(`Enhanced search by wallet: ${walletAddress}, custodial: ${custodialId}`, searchRequest);

        const results = await arkivService.searchDiagrams(searchRequest, walletAddress, custodialId);

        return c.json({
          success: true,
          data: results,
          count: results.length
        });
      } catch (error) {
        console.error('Enhanced search error:', error);
        return c.json({
          success: false,
          error: (error as Error).message || 'Search operation failed'
        }, 500);
      }
    });

    // Create share token
    app.post('/api/diagrams/:id/share', async (c) => {
      try {
        const diagramId = c.req.param('id');
        const walletAddress = c.req.header('x-wallet-address');
        const custodialId = c.req.header('x-custodial-id');
        const shareRequest = await c.req.json();

        if (!diagramId) {
          return c.json({
            success: false,
            error: 'Diagram ID is required'
          }, 400);
        }

        console.log(`Creating share token for diagram ${diagramId} by wallet: ${walletAddress}, custodial: ${custodialId}`);

        const result = await arkivService.createShareToken(diagramId, shareRequest, walletAddress, custodialId);

        return c.json(result);
      } catch (error) {
        console.error('Share token creation error:', error);
        return c.json({
          success: false,
          error: (error as Error).message || 'Failed to create share token'
        }, 500);
      }
    });

    // Access shared diagram
    app.get('/api/diagrams/shared/:token', async (c) => {
      try {
        const token = c.req.param('token');
        const format = c.req.query('format') || 'json'; // json (default), xml, svg, png, html

        if (!token) {
          return c.json({
            success: false,
            error: 'Share token is required'
          }, 400);
        }

        console.log(`Accessing shared diagram with token: ${token}, format: ${format}`);

        // Get the shared diagram data
        const result = await arkivService.accessSharedDiagram(token);

        if (!result) {
          return c.json({
            success: false,
            error: 'Shared diagram not found or token expired'
          }, 404);
        }

        // If requesting JSON (default), return the diagram data as is
        if (format === 'json') {
          return c.json({
            success: true,
            data: result
          });
        }

        // For other formats, use direct diagram conversion
        try {
          const directResult = await arkivService.getDiagramDirect(result.id, format);

          if (!directResult) {
            return c.json({
              success: false,
              error: `Could not convert diagram to ${format} format`
            }, 500);
          }

          // Set appropriate content type and headers
          c.header('Content-Type', directResult.contentType);
          c.header('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

          if (typeof directResult.content === 'string') {
            return c.text(directResult.content);
          } else {
            return new Response(directResult.content, {
              headers: {
                'Content-Type': directResult.contentType,
                'Cache-Control': 'public, max-age=3600'
              }
            });
          }
        } catch (formatError) {
          console.error('Shared diagram format conversion error:', formatError);
          return c.json({
            success: false,
            error: `Failed to convert shared diagram to ${format} format: ${(formatError as Error).message}`
          }, 500);
        }
      } catch (error) {
        console.error('Shared diagram access error:', error);
        return c.json({
          success: false,
          error: (error as Error).message || 'Failed to access shared diagram'
        }, 500);
      }
    });

    // List share tokens for a diagram
    app.get('/api/diagrams/:id/shares', async (c) => {
      try {
        const diagramId = c.req.param('id');
        const walletAddress = c.req.header('x-wallet-address');
        const custodialId = c.req.header('x-custodial-id');

        if (!diagramId) {
          return c.json({
            success: false,
            error: 'Diagram ID is required'
          }, 400);
        }

        console.log(`Listing share tokens for diagram ${diagramId} by wallet: ${walletAddress}, custodial: ${custodialId}`);

        const shares = await arkivService.listShareTokens(diagramId, walletAddress, custodialId);

        return c.json({
          success: true,
          data: shares
        });
      } catch (error) {
        console.error('List share tokens error:', error);
        return c.json({
          success: false,
          error: (error as Error).message || 'Failed to list share tokens'
        }, 500);
      }
    });

    // Revoke share token
    app.delete('/api/diagrams/shared/:token', async (c) => {
      try {
        const token = c.req.param('token');
        const walletAddress = c.req.header('x-wallet-address');
        const custodialId = c.req.header('x-custodial-id');

        if (!token) {
          return c.json({
            success: false,
            error: 'Share token is required'
          }, 400);
        }

        console.log(`Revoking share token ${token} by wallet: ${walletAddress}, custodial: ${custodialId}`);

        const result = await arkivService.revokeShareToken(token, walletAddress, custodialId);

        if (!result) {
          return c.json({
            success: false,
            error: 'Share token not found or unauthorized'
          }, 404);
        }

        return c.json({
          success: true,
          message: 'Share token revoked successfully'
        });
      } catch (error) {
        console.error('Revoke share token error:', error);
        return c.json({
          success: false,
          error: (error as Error).message || 'Failed to revoke share token'
        }, 500);
      }
    });

    // Direct diagram access endpoints
    app.get('/diagram/:id', async (c) => {
      try {
        const diagramId = c.req.param('id');
        const format = c.req.query('format') || 'html'; // html, xml, json, svg, png

        if (!diagramId) {
          return c.json({
            success: false,
            error: 'Diagram ID is required'
          }, 400);
        }

        console.log(`Direct diagram access: ${diagramId}, format: ${format}`);

        // Check authentication headers for potential ownership verification
        const walletAddress = c.req.header('x-wallet-address');
        const custodialId = c.req.header('x-custodial-id');

        let result;
        try {
          result = await arkivService.getDiagramDirect(diagramId, format);

          if (!result) {
            return c.json({
              success: false,
              error: 'Diagram not found'
            }, 404);
          }
        } catch (diagramError) {
          console.error('Direct diagram access error:', diagramError);

          const errorMessage = (diagramError as Error).message;

          // Handle expired diagram errors with proper status codes
          if (errorMessage.includes('expired') || errorMessage.includes('BTL')) {
            if (format === 'html') {
              return c.html(`
                <html>
                  <head>
                    <title>Diagram Expired</title>
                    <meta charset="utf-8">
                  </head>
                  <body>
                    <h1>⏰ Diagram Expired</h1>
                    <p>This diagram has expired and is no longer available on the blockchain.</p>
                    <p>The diagram may have exceeded its Block Time to Live (BTL) period.</p>
                    <a href="/">Return to Draw.io</a>
                  </body>
                </html>
              `, 410);
            } else {
              return c.json({
                success: false,
                error: errorMessage
              }, 410);
            }
          }

          // Handle other errors
          let statusCode = 500;
          if (errorMessage.includes('not found') || errorMessage.includes('never existed')) {
            statusCode = 404;
          } else if (errorMessage.includes('encrypted') && errorMessage.includes('password')) {
            statusCode = 401;
          }

          if (format === 'html') {
            return c.html(`
              <html>
                <head>
                  <title>Diagram Error</title>
                  <meta charset="utf-8">
                </head>
                <body>
                  <h1>❌ Diagram Access Error</h1>
                  <p>${errorMessage}</p>
                  <a href="/">Return to Draw.io</a>
                </body>
              </html>
            `, statusCode as any);
          } else {
            return c.json({
              success: false,
              error: errorMessage
            }, statusCode as any);
          }
        }

        // Set appropriate content type based on format
        let contentType = 'text/html';
        switch (format.toLowerCase()) {
          case 'xml':
            contentType = 'application/xml';
            break;
          case 'json':
            contentType = 'application/json';
            break;
          case 'svg':
            contentType = 'image/svg+xml';
            break;
          case 'png':
            contentType = 'image/png';
            break;
          case 'html':
          default:
            contentType = 'text/html';
            break;
        }

        // For HTML format, enhance the viewer with additional features
        if (format === 'html' && typeof result.content === 'string') {
          // Get diagram metadata to provide additional context
          let diagramMeta;
          try {
            diagramMeta = await arkivService.getDiagramMetadata(diagramId);
          } catch (metaError) {
            console.log('Could not load diagram metadata:', metaError);
          }

          // Check if user can access sharing features
          const userTier = arkivService.getUserTierInfo(walletAddress, custodialId);

          // Enhanced HTML viewer with sharing options and metadata
          const enhancedContent = result.content
            .replace('</body>', `
              <div style="position: fixed; top: 20px; right: 20px; background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 300px;">
                <h3 style="margin: 0 0 10px 0; font-size: 16px;">📊 ${result.title}</h3>
                ${diagramMeta ? `
                  <p style="margin: 5px 0; font-size: 12px; color: #666;">
                    Author: ${diagramMeta.author}<br>
                    Created: ${new Date(diagramMeta.timestamp).toLocaleDateString()}<br>
                    Version: ${diagramMeta.version}
                  </p>
                ` : ''}

                <div style="margin: 15px 0 10px 0;">
                  <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: bold;">Download as:</p>
                  <div style="display: flex; flex-wrap: wrap; gap: 5px;">
                    <a href="?format=xml" style="padding: 4px 8px; background: #f0f0f0; color: #333; text-decoration: none; border-radius: 3px; font-size: 11px;">XML</a>
                    <a href="?format=json" style="padding: 4px 8px; background: #f0f0f0; color: #333; text-decoration: none; border-radius: 3px; font-size: 11px;">JSON</a>
                    <a href="?format=svg" style="padding: 4px 8px; background: #f0f0f0; color: #333; text-decoration: none; border-radius: 3px; font-size: 11px;">SVG</a>
                    <a href="?format=png" style="padding: 4px 8px; background: #f0f0f0; color: #333; text-decoration: none; border-radius: 3px; font-size: 11px;">PNG</a>
                  </div>
                </div>

                ${userTier.limits.canShare && (walletAddress || custodialId) ? `
                  <div style="margin: 10px 0;">
                    <button onclick="createShareLink()" style="width: 100%; padding: 8px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                      🔗 Create Share Link
                    </button>
                  </div>
                ` : ''}

                <div style="margin-top: 10px;">
                  <a href="/?lightbox=1&edit=_blank&title=${encodeURIComponent(result.title)}&xml=${encodeURIComponent(result.content)}" target="_blank" style="display: block; width: 100%; text-align: center; padding: 8px; background: #667eea; color: white; text-decoration: none; border-radius: 4px; font-size: 12px;">
                    🖼️ Edit in drawiodb.online
                  </a>
                </div>
              </div>

              ${userTier.limits.canShare && (walletAddress || custodialId) ? `
                <script>
                  async function createShareLink() {
                    try {
                      const response = await fetch('/api/diagrams/${diagramId}/share', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          ${walletAddress ? `'x-wallet-address': '${walletAddress}',` : ''}
                          ${custodialId ? `'x-custodial-id': '${custodialId}',` : ''}
                        },
                        body: JSON.stringify({
                          diagramId: '${diagramId}',
                          isPublic: true,
                          expiresInDays: 30
                        })
                      });

                      const result = await response.json();
                      if (result.success) {
                        const shareUrl = result.shareUrl;
                        navigator.clipboard.writeText(shareUrl);
                        alert('Share link copied to clipboard!\\n\\n' + shareUrl);
                      } else {
                        alert('Failed to create share link: ' + result.error);
                      }
                    } catch (error) {
                      alert('Error creating share link: ' + error.message);
                    }
                  }
                </script>
              ` : ''}
            </body>`);

          c.header('Content-Type', 'text/html');
          c.header('Cache-Control', 'public, max-age=3600');
          return c.html(enhancedContent);
        }

        // For other formats, return content as-is
        c.header('Content-Type', contentType);
        c.header('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

        if (typeof result.content === 'string') {
          return c.text(result.content);
        } else {
          return new Response(result.content, {
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=3600'
            }
          });
        }
      } catch (error) {
        console.error('Direct diagram access error:', error);
        return c.json({
          success: false,
          error: (error as Error).message || 'Failed to access diagram'
        }, 500);
      }
    });

    // Diagram metadata endpoint
    app.get('/diagram/:id/meta', async (c) => {
      try {
        const diagramId = c.req.param('id');

        if (!diagramId) {
          return c.json({
            success: false,
            error: 'Diagram ID is required'
          }, 400);
        }

        console.log(`Diagram metadata access: ${diagramId}`);

        const metadata = await arkivService.getDiagramMetadata(diagramId);

        if (!metadata) {
          return c.json({
            success: false,
            error: 'Diagram not found'
          }, 404);
        }

        return c.json({
          success: true,
          data: metadata
        });
      } catch (error) {
        console.error('Diagram metadata access error:', error);
        return c.json({
          success: false,
          error: (error as Error).message || 'Failed to access diagram metadata'
        }, 500);
      }
    });

    // Diagram thumbnail endpoint
    app.get('/diagram/:id/thumbnail', async (c) => {
      try {
        const diagramId = c.req.param('id');
        const size = c.req.query('size') || 'medium'; // small, medium, large

        if (!diagramId) {
          return c.json({
            success: false,
            error: 'Diagram ID is required'
          }, 400);
        }

        console.log(`Diagram thumbnail access: ${diagramId}, size: ${size}`);

        const thumbnail = await arkivService.getDiagramThumbnail(diagramId, size);

        if (!thumbnail) {
          return c.json({
            success: false,
            error: 'Diagram thumbnail not found'
          }, 404);
        }

        return new Response(thumbnail, {
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=86400'
          }
        });
      } catch (error) {
        console.error('Diagram thumbnail access error:', error);
        return c.json({
          success: false,
          error: (error as Error).message || 'Failed to access diagram thumbnail'
        }, 500);
      }
    });

    // Create custodial session
    app.post('/api/auth/custodial', async (c) => {
      try {
        const custodialId = arkivService.generateCustodialId();
        console.log(`Created custodial session: ${custodialId}`);

        const userInfo = await arkivService.getUserTierInfo(undefined, custodialId);

        return c.json({
          success: true,
          custodialId,
          userTier: userInfo
        });
      } catch (error) {
        console.error('Custodial session creation error:', error);
        return c.json({
          success: false,
          error: (error as Error).message || 'Failed to create custodial session'
        }, 500);
      }
    });

    // Get user tier information
    app.get('/api/user/info', async (c) => {
      try {
        const walletAddress = c.req.header('x-wallet-address');
        const custodialId = c.req.header('x-custodial-id');

        const userInfo = await arkivService.getUserTierInfo(walletAddress, custodialId);

        return c.json({
          success: true,
          ...userInfo
        });
      } catch (error) {
        console.error('User info error:', error);
        return c.json({
          success: false,
          error: (error as Error).message || 'Failed to get user info'
        }, 500);
      }
    });

    // Health endpoint
    // Get diagram versions/history
    app.get('/api/diagrams/:id/versions', async (c) => {
      try {
        const diagramId = c.req.param('id');
        const walletAddress = c.req.header('x-wallet-address');
        const custodialId = c.req.header('x-custodial-id');

        if (!diagramId) {
          return c.json({
            success: false,
            error: 'Diagram ID is required'
          }, 400);
        }

        console.log(`Getting versions for diagram: ${diagramId}`);

        // Get all versions of this diagram
        const versions = await arkivService.getDiagramVersions(diagramId, walletAddress, custodialId);

        return c.json({
          success: true,
          data: versions,
          count: versions.length
        });

      } catch (error) {
        console.error('Versions error:', error);
        return c.json({
          success: false,
          error: (error as Error).message || 'Failed to get diagram versions'
        }, 500);
      }
    });

    // Retry queue status endpoint
    app.get('/api/retry-queue/status', (c) => {
      try {
        const queueStatus = arkivService.getRetryQueueStatus();
        return c.json({
          success: true,
          data: queueStatus
        });
      } catch (error) {
        return c.json({
          success: false,
          error: (error as Error).message
        }, 500);
      }
    });

    app.get('/health', (c) => {
      return c.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'drawio-arkiv-backend'
      });
    });

    // Health endpoint under API path for tests
    app.get('/api/health', (c) => {
      return c.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'drawio-arkiv-backend'
      });
    });

    // Diagrams health endpoint for tests
    app.get('/api/diagrams/health', (c) => {
      return c.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'drawio-arkiv-backend',
        component: 'diagrams'
      });
    });

    // Serve Draw.io config
    app.get('/drawio-config.js', async (c) => {
      const filePath = path.join(__dirname, '../drawio-config.js');
      return new Response(Bun.file(filePath));
    });

    // Serve test page
    app.get('/test-plugin.html', async (c) => {
      const filePath = path.join(__dirname, '../public/test-plugin.html');
      return new Response(Bun.file(filePath));
    });

    // Static files - only for specific patterns to avoid catching API routes
    app.use('/plugin/*', serveStatic({ root: path.join(__dirname, '../drawio-custom') }));
    app.use('/js/*', serveStatic({ root: path.join(__dirname, '../public') }));
    app.use('/css/*', serveStatic({ root: path.join(__dirname, '../public') }));
    app.use('/styles/*', serveStatic({ root: path.join(__dirname, '../public') }));
    app.use('/mxgraph/*', serveStatic({ root: path.join(__dirname, '../public') }));
    app.use('/resources/*', serveStatic({ root: path.join(__dirname, '../public') }));
    app.use('/math/*', serveStatic({ root: path.join(__dirname, '../public') }));
    app.use('/images/*', serveStatic({ root: path.join(__dirname, '../public') }));
    app.use('/favicon.ico', serveStatic({ root: path.join(__dirname, '../public') }));

    // Metrics endpoint for Prometheus
    app.get('/metrics', async (c) => {
      const metrics = await getMetrics();
      c.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      return c.text(metrics);
    });

    // Monitoring endpoints
    app.get('/health', async (c) => {
      try {
        const health = {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          version: process.version,
          environment: process.env.NODE_ENV || 'development'
        };
        return c.json(health);
      } catch (error) {
        return c.json({
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 500);
      }
    });

    app.get('/api/monitoring/errors', async (c) => {
      const limit = parseInt(c.req.query('limit') || '50');
      const errors = getRecentErrorLogs(limit);
      return c.json({
        total: errors.length,
        errors: errors
      });
    });

    // Root path for Draw.io HTML
    app.get('/', async (c) => {
      const filePath = path.join(__dirname, '../public/index.html');
      const file = Bun.file(filePath);
      c.header('Content-Type', 'text/html; charset=utf-8');
      return c.body(await file.text());
    });

    // 404 handler
    app.notFound((c) => {
      return c.json({
        error: 'Endpoint not found',
        path: c.req.path,
        method: c.req.method
      }, 404);
    });

    // Error handler
    app.onError((error, c) => {
      console.error('Unhandled error:', error);
      return c.json({
        error: 'Internal server error',
        message: error.message
      }, 500);
    });

    console.log(`🚀 DrawIO Golem Backend starting on port ${config.port}`);
    console.log(`📊 Health check: http://localhost:${config.port}/health`);
    console.log(`📁 API endpoints:`);
    console.log(`   POST /api/diagrams/export - Export diagram to Arkiv`);
    console.log(`   GET  /api/diagrams/import/:id - Import diagram from Arkiv`);
    console.log(`   GET  /api/diagrams/list - List all diagrams`);

    Bun.serve({
      fetch: app.fetch,
      port: config.port,
    });

    console.log(`✅ DrawIO Golem Backend running on port ${config.port}`);

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
