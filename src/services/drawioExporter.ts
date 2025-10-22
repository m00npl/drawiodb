/**
 * DrawIO Exporter Service
 * Uses tomkludy/drawio-renderer HTTP REST API for rendering diagrams
 */
export class DrawIOExporterService {
  private exporterUrl: string;

  constructor(exporterUrl: string = 'http://drawio-exporter:5000') {
    this.exporterUrl = exporterUrl;
  }

  /**
   * Export DrawIO XML to SVG format
   */
  async exportToSVG(xmlContent: string): Promise<string> {
    try {
      const response = await fetch(`${this.exporterUrl}/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/xml',
          'Accept': 'image/svg+xml'
        },
        body: xmlContent
      });

      if (!response.ok) {
        throw new Error(`DrawIO renderer returned ${response.status}: ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      console.error('DrawIO SVG export failed:', error);
      throw new Error(`Failed to export diagram to SVG: ${(error as Error).message}`);
    }
  }

  /**
   * Export DrawIO XML to PNG format
   */
  async exportToPNG(xmlContent: string, scale: number = 2): Promise<Uint8Array> {
    try {
      // tomkludy/drawio-renderer uses query parameters for format
      const response = await fetch(`${this.exporterUrl}/?format=png&scale=${scale}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/xml',
          'Accept': 'image/png'
        },
        body: xmlContent
      });

      if (!response.ok) {
        throw new Error(`DrawIO renderer returned ${response.status}: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    } catch (error) {
      console.error('DrawIO PNG export failed:', error);
      throw new Error(`Failed to export diagram to PNG: ${(error as Error).message}`);
    }
  }

  /**
   * Check if DrawIO exporter service is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.exporterUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000)
      });
      return response.ok;
    } catch {
      // Try the root endpoint as fallback
      try {
        const response = await fetch(this.exporterUrl, {
          method: 'GET',
          signal: AbortSignal.timeout(2000)
        });
        return response.status === 405 || response.ok; // 405 = Method Not Allowed is OK (means service is up)
      } catch {
        return false;
      }
    }
  }
}
