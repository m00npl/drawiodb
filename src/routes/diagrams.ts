import { Hono } from 'hono';
import type { Context } from 'hono';
import { ArkivService } from '../services/arkivService';
import { DiagramData, ExportRequest, ImportResponse, ExportResponse, ConfigRequest, ConfigResponse, UserConfig, ChunkExportRequest, ChunkExportResponse } from '../types/diagram';

export function createDiagramRoutes(arkivService: ArkivService): Hono {
  const router = new Hono();

  router.post('/export', async (c: Context) => {
    try {
      const exportRequest: ExportRequest = await c.req.json();
      const walletAddress = c.req.header('x-wallet-address');

      if (!exportRequest.title || !exportRequest.author || !exportRequest.content) {
        return c.json({
          success: false,
          error: 'Missing required fields: title, author, content'
        } as ExportResponse, 400);
      }

      if (!arkivService.hasWriteAccess()) {
        return c.json({
          success: false,
          error: 'Backend is running in read-only mode. Please use the Draw.io plugin with MetaMask so the user can sign and pay for the transaction.'
        } as ExportResponse, 503);
      }

      const diagramId = arkivService.generateDiagramId();
      const diagramData: DiagramData = {
        id: diagramId,
        title: exportRequest.title,
        author: exportRequest.author,
        content: exportRequest.content,
        timestamp: Date.now(),
        version: 1
      };

      const entityKey = await arkivService.exportDiagram(diagramData, walletAddress, undefined, exportRequest.encryptionPassword);

      return c.json({
        success: true,
        diagramId,
        entityKey
      } as ExportResponse);

    } catch (error) {
      console.error('Export error:', error);
      return c.json({
        success: false,
        error: (error as Error).message || 'Export failed'
      } as ExportResponse, 500);
    }
  });

  router.get('/import/:id', async (c: Context) => {
    try {
      const diagramId = c.req.param('id');

      if (!diagramId) {
        return c.json({
          success: false,
          error: 'Diagram ID is required'
        } as ImportResponse, 400);
      }

      const diagramData = await arkivService.importDiagram(diagramId);

      if (!diagramData) {
        return c.json({
          success: false,
          error: 'Diagram not found'
        } as ImportResponse, 404);
      }

      return c.json({
        success: true,
        data: diagramData
      } as ImportResponse);

    } catch (error) {
      console.error('Import error:', error);
      return c.json({
        success: false,
        error: (error as Error).message || 'Import failed'
      } as ImportResponse, 500);
    }
  });

  router.get('/list', async (c: Context) => {
    try {
      const author = c.req.query('author');
      const walletAddress = c.req.header('x-wallet-address');

      console.log(`Listing diagrams for wallet: ${walletAddress}`);

      const diagrams = await arkivService.listDiagrams(author, walletAddress);

      return c.json({
        success: true,
        data: diagrams,
        count: diagrams.length
      });

    } catch (error) {
      console.error('List error:', error);
      return c.json({
        success: false,
        error: (error as Error).message || 'List operation failed'
      }, 500);
    }
  });

  // TODO: Convert additional routes to Hono later

  return router;
}
