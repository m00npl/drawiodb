import { createClient, createROClient, Annotation, AccountData, Tagged, ArkivClient, ArkivROClient } from 'arkiv-sdk';
import { DiagramData, DiagramMetadata, UserConfig, ChunkExportRequest, ChunkData, UserTier, ShareToken, ShareTokenRequest, ShareTokenResponse, SearchRequest, SearchResult, DirectDiagramResult, DiagramThumbnailOptions } from '../types/diagram';
import { UserService } from './userService';
import { RetryQueue, RetryOperation } from './retryQueue';
import crypto from 'crypto';
import CryptoJS from 'crypto-js';

export class ArkivService {
  private writeClient: ArkivClient | null = null;
  private readClient: ArkivROClient | null = null;
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();
  private userService = new UserService();
  private retryQueue: RetryQueue;

  constructor(
    private chainId: string,
    private privateKey: string | undefined,
    private rpcUrl: string,
    private wsUrl: string
  ) {
    this.retryQueue = new RetryQueue();
    this.setupRetryQueueHandlers();
  }

  private setupRetryQueueHandlers() {
    // Override the executeOperation method in RetryQueue
    const originalExecuteOperation = (this.retryQueue as any).executeOperation.bind(this.retryQueue);
    (this.retryQueue as any).executeOperation = async (operation: RetryOperation) => {
      return await this.executeRetryOperation(operation);
    };

    // Listen to queue events
    this.retryQueue.on('operationSuccess', ({ operation, result }) => {
      console.log(`✅ Retry operation succeeded: ${operation.type} (${operation.id})`);
    });

    this.retryQueue.on('operationFailed', ({ operation, error }) => {
      console.log(`❌ Retry operation failed permanently: ${operation.type} (${operation.id}) - ${error.message}`);
    });

    this.retryQueue.on('operationRetry', ({ operation, error }) => {
      console.log(`🔄 Retry operation will be retried: ${operation.type} (${operation.id}) - attempt ${operation.currentRetry}/${operation.maxRetries}`);
    });
  }

  private async executeRetryOperation(operation: RetryOperation): Promise<any> {
    switch (operation.type) {
      case 'export':
        return await this.performExport(operation.payload);
      case 'import':
        return await this.performImport(operation.payload);
      case 'list':
        return await this.performList(operation.payload);
      case 'delete':
        return await this.performDelete(operation.payload);
      default:
        throw new Error(`Unknown operation type: ${operation.type}`);
    }
  }

  public getRetryQueueStatus() {
    return this.retryQueue.getQueueStatus();
  }

  private getQueryClient(): ArkivClient | ArkivROClient {
    if (this.writeClient) {
      return this.writeClient;
    }

    if (this.readClient) {
      return this.readClient;
    }

    throw new Error('Arkiv client is not initialized');
  }

  private ensureWriteClient(): ArkivClient {
    if (!this.writeClient) {
      throw new Error('Backend is running without a signing key. Use the Draw.io plugin with MetaMask to sign and pay for transactions.');
    }

    return this.writeClient;
  }

  hasWriteAccess(): boolean {
    return this.writeClient !== null;
  }

  async initialize(): Promise<void> {
    try {
      const numericChainId = parseInt(this.chainId, 10);
      if (Number.isNaN(numericChainId)) {
        throw new Error(`Invalid GOLEM_CHAIN_ID value: ${this.chainId}`);
      }
      this.readClient = createROClient(
        numericChainId,
        this.rpcUrl,
        this.wsUrl
      );
      console.log('Arkiv read-only client initialized successfully');

      if (this.privateKey) {
        const cleanPrivateKey = this.privateKey.startsWith('0x')
          ? this.privateKey.slice(2)
          : this.privateKey;

        const key: AccountData = new Tagged(
          'privatekey',
          Buffer.from(cleanPrivateKey, 'hex')
        );

        this.writeClient = await createClient(
          numericChainId,
          key,
          this.rpcUrl,
          this.wsUrl
        );
        console.log('Arkiv write client initialized successfully');
      } else {
        console.log('Arkiv write client not configured – operating in read-only mode');
      }
    } catch (error) {
      console.error('Failed to initialize Arkiv client:', error);
      throw new Error('Arkiv initialization failed');
    }
  }

  async exportDiagram(diagramData: DiagramData, walletAddress?: string, customBtl?: number, encryptionPassword?: string, custodialId?: string): Promise<string> {
    // First try immediate export, if it fails, add to retry queue
    try {
      return await this.performExport({
        diagramData,
        walletAddress,
        customBtl,
        encryptionPassword,
        custodialId
      });
    } catch (error) {
      if (this.isNetworkTimeoutError(error)) {
        console.log(`⚠️ Export failed due to network timeout, adding to retry queue`);
        return this.addExportToRetryQueue(diagramData, walletAddress, customBtl, encryptionPassword, custodialId);
      }
      throw error; // Re-throw non-timeout errors
    }
  }

  private isNetworkTimeoutError(error: any): boolean {
    const errorMessage = error?.message?.toLowerCase() || '';
    return errorMessage.includes('timeout') ||
           errorMessage.includes('request took too long') ||
           errorMessage.includes('connection refused') ||
           errorMessage.includes('network error');
  }

  private async addExportToRetryQueue(diagramData: DiagramData, walletAddress?: string, customBtl?: number, encryptionPassword?: string, custodialId?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const operationId = this.retryQueue.addOperation({
        type: 'export',
        payload: {
          diagramData,
          walletAddress,
          customBtl,
          encryptionPassword,
          custodialId
        },
        maxRetries: 5,
        exponentialBackoff: true,
        onSuccess: (result) => {
          console.log(`✅ Deferred export completed successfully: ${diagramData.id}`);
          resolve(result);
        },
        onFailure: (error) => {
          console.log(`❌ Deferred export failed permanently: ${diagramData.id}`);
          reject(error);
        }
      });

      // Return a "pending" indicator with operation ID
      setTimeout(() => {
        resolve(`RETRY_QUEUE:${operationId}`);
      }, 100);
    });
  }

  async performExport(payload: any): Promise<string> {
    const { diagramData, walletAddress, customBtl, encryptionPassword, custodialId } = payload;

    // Call the original export logic without retry
    return await this.performDirectExport(diagramData, walletAddress, customBtl, encryptionPassword, custodialId);
  }

  private async performDirectExport(diagramData: DiagramData, walletAddress?: string, customBtl?: number, encryptionPassword?: string, custodialId?: string): Promise<string> {

    try {
      console.log(`Starting diagram export for ID: ${diagramData.id}`);
      console.log(`Diagram data:`, diagramData);
      console.log(`Wallet address: ${walletAddress}`);
      console.log(`Custodial ID: ${custodialId}`);
      console.log(`Encryption requested: ${!!encryptionPassword}`);

      // Determine user tier and validate limits
      const userTier = this.userService.getUserTier(walletAddress, custodialId);
      console.log(`User tier: ${userTier}`);

      // Calculate diagram size
      const diagramSizeKB = this.userService.calculateDiagramSizeKB(diagramData.content);
      console.log(`Diagram size: ${Math.round(diagramSizeKB)}KB`);

      // Get current diagram count for this user (skip if network issues)
      let currentCount = 0;
      try {
        const currentDiagrams = await this.listDiagrams(diagramData.author, walletAddress, custodialId);
        currentCount = currentDiagrams.length;
        console.log(`Found ${currentCount} existing diagrams for user`);
      } catch (listError) {
        console.log(`⚠️ Could not get diagram count (network timeout), skipping limit validation:`, listError);
        // Continue without limit validation on network issues
      }

      // Validate against user limits (only if we could get the count)
      if (currentCount > 0) {
        const validation = await this.userService.validateDiagramSave(userTier, diagramSizeKB, currentCount);
        if (!validation.valid) {
          throw new Error(validation.reason);
        }
      } else {
        console.log(`⚠️ Skipping diagram limit validation due to network issues`);
      }

      // If no backend private key, return indication that frontend should handle the transaction
      if (!this.writeClient) {
        console.log('⚠️ Backend has no private key - frontend must handle transaction via MetaMask');
        return 'USE_FRONTEND'; // Plugin will detect this and use MetaMask
      }

      const client = this.writeClient;

      // Determine BTL based on user tier and limits
      const userLimits = this.userService.getUserLimits(userTier);
      let btlDays = customBtl || userLimits.defaultBTLDays;

      // Validate BTL against user tier limits
      btlDays = this.userService.validateBTL(userTier, btlDays);
      let btlBlocks = Math.floor(btlDays * 24 * 60 * 60 / 2); // days to blocks (2 sec/block)

      console.log(`User tier ${userTier}: BTL ${btlDays} days = ${btlBlocks} blocks`);

      // Handle encryption based on user tier and config
      let shouldEncrypt = !!encryptionPassword;
      let password = encryptionPassword;

      // Check if encryption is allowed for this tier
      if (shouldEncrypt && !userLimits.canEncrypt) {
        console.log(`Encryption not allowed for ${userTier} tier, proceeding without encryption`);
        shouldEncrypt = false;
        password = undefined;
      }

      // Load user config for wallet users
      if (walletAddress && userTier === UserTier.WALLET) {
        try {
          const userConfig = await this.getUserConfig(walletAddress);
          if (userConfig) {
            // Use config BTL if no custom BTL specified
            if (!customBtl) {
              const configBTLDays = this.userService.validateBTL(userTier, userConfig.btlDays);
              btlBlocks = Math.floor(configBTLDays * 24 * 60 * 60 / 2);
              console.log(`Using user config BTL: ${configBTLDays} days = ${btlBlocks} blocks`);
            }

            // Check if encryption should be used from user config
            if (!encryptionPassword && userConfig.encryptByDefault && userConfig.encryptionPassword) {
              shouldEncrypt = true;
              password = userConfig.encryptionPassword;
              console.log(`🔐 Using encryption from user config (encrypt by default: ${userConfig.encryptByDefault})`);
            }
          }
        } catch (configError) {
          console.log(`Could not load user config, using tier defaults:`, configError);
        }
      }

      // Prepare diagram data with encryption flag
      const diagramDataToStore = {
        ...diagramData,
        encrypted: shouldEncrypt
      };

      // Encrypt content if needed
      if (shouldEncrypt && password) {
        console.log(`🔐 Encrypting diagram content`);
        diagramDataToStore.content = this.encryptContent(diagramData.content, password);
      }

      const diagramJson = JSON.stringify(diagramDataToStore);
      console.log(`Serialized JSON length: ${diagramJson.length}`);
      console.log(`JSON preview: ${diagramJson.substring(0, 200)}...`);

      const encodedData = this.encoder.encode(diagramJson);
      console.log(`Encoded data length: ${encodedData.length}`);

      const creates = [{
        data: encodedData,
        btl: btlBlocks,
        stringAnnotations: [
          new Annotation('type', 'diagram'),
          new Annotation('id', diagramData.id),
          new Annotation('title', diagramData.title),
          new Annotation('author', diagramData.author),
          new Annotation('user_tier', userTier),
          ...(walletAddress ? [new Annotation('wallet', walletAddress)] : []),
          ...(custodialId ? [new Annotation('custodial_id', custodialId)] : []),
          ...(shouldEncrypt ? [new Annotation('encrypted', '1')] : [])
        ],
        numericAnnotations: [
          new Annotation('timestamp', diagramData.timestamp),
          new Annotation('version', Math.max(1, diagramData.version)),
          new Annotation('size_kb', Math.max(1, Math.round(diagramSizeKB))), // Ensure non-zero
          new Annotation('btl_days', Math.max(1, btlDays))
        ]
      }];

      console.log(`Creating entities in Arkiv with ${creates.length} entities`);
      console.log(`String annotations: ${creates[0].stringAnnotations?.length || 0}`);
      console.log(`Numeric annotations: ${creates[0].numericAnnotations?.length || 0}`);

      let createReceipt;
      try {
        createReceipt = await client.createEntities(creates);
      } catch (createError) {
        if (this.isNetworkTimeoutError(createError)) {
          console.log(`⚠️ CreateEntities timeout, adding to retry queue for later processing`);

          // Add to retry queue
          const operationId = this.retryQueue.addOperation({
            type: 'export',
            payload: {
              diagramData,
              walletAddress,
              customBtl,
              encryptionPassword,
              custodialId
            },
            maxRetries: 5,
            exponentialBackoff: true
          });

          // Return a retry queue indicator
          return `RETRY_QUEUE:${operationId}`;
        }
        throw createError; // Re-throw non-timeout errors
      }
      console.log(`Arkiv createEntities response:`, createReceipt);

      if (createReceipt && createReceipt.length > 0) {
        const entityKey = createReceipt[0].entityKey;
        console.log(`✅ Diagram exported successfully with entity key: ${entityKey}`);

        // Verify the data was saved correctly
        console.log(`🔍 Verifying saved data...`);
        try {
          const testImport = await this.importDiagram(diagramData.id, password);
          if (testImport) {
            console.log(`✅ Verification successful - data can be retrieved`);
          } else {
            console.log(`⚠️ Verification failed - data cannot be retrieved`);
          }
        } catch (verifyError) {
          console.log(`⚠️ Verification error:`, verifyError);
        }

        return entityKey;
      } else {
        throw new Error('Failed to create entity in Arkiv - no receipt returned');
      }
    } catch (error) {
      console.error('💥 Error exporting diagram to Arkiv:', error);
      throw new Error(`Export failed: ${(error as Error).message}`);
    }
  }

  async importDiagram(diagramId: string, decryptionPassword?: string): Promise<DiagramData | null> {
    try {
      // First try to import as a regular diagram
      const query = `type = "diagram" && id = "${diagramId}"`;
      console.log(`Executing import query: ${query}`);
      const client = this.getQueryClient();
      const queryResult = await client.queryEntities(query);

      console.log(`Import query result: ${queryResult?.length || 0} entities found`);

      if (queryResult && queryResult.length > 0) {
        const entity = queryResult[0];
        console.log(`🔍 Import entity structure:`, entity);

        try {
          // Use storageValue instead of entity.data
          const decodedData = this.decoder.decode(entity.storageValue);
          console.log(`🔍 Import decoded storageValue: ${decodedData}`);
          console.log(`🔍 Import decoded data length: ${decodedData.length}`);

          if (!decodedData || decodedData.trim().length === 0) {
            throw new Error('Decoded data is empty');
          }

          const diagramData: DiagramData = JSON.parse(decodedData);

          // Handle decryption if needed
          if (diagramData.encrypted) {
            console.log(`🔐 Diagram is encrypted, attempting to decrypt`);

            if (!decryptionPassword) {
              // Try to get password from user config if not provided
              const author = diagramData.author;
              if (author) {
                try {
                  const userConfig = await this.getUserConfig(author);
                  if (userConfig && userConfig.encryptionPassword) {
                    decryptionPassword = userConfig.encryptionPassword;
                    console.log(`🔐 Using encryption password from user config`);
                  }
                } catch (configError) {
                  console.log(`Could not load user config for decryption:`, configError);
                }
              }
            }

            if (!decryptionPassword) {
              throw new Error('Diagram is encrypted but no decryption password provided');
            }

            diagramData.content = this.decryptContent(diagramData.content, decryptionPassword);
            console.log(`🔓 Content decrypted successfully`);
          }

          console.log(`✅ Diagram imported successfully: ${diagramId}`);
          return diagramData;
        } catch (decodeError) {
          console.error('❌ Error decoding or parsing data:', decodeError);
          console.error('❌ Raw entity storageValue:', entity.storageValue);
          throw new Error(`Data decode/parse failed: ${(decodeError as Error).message}`);
        }
      } else {
        console.log(`❌ No single diagram found with ID: ${diagramId}`);

        // Check if this diagram might have existed but expired
        console.log(`🔍 Checking for expired diagram evidence...`);

        // Try to find any entities with this diagram_id (including chunks, renames, etc.)
        const evidenceQuery = `id = "${diagramId}" || diagram_id = "${diagramId}" || originalDiagramId = "${diagramId}"`;
        try {
          const evidenceResult = await client.queryEntities(evidenceQuery);

          if (evidenceResult && evidenceResult.length > 0) {
            console.log(`⏰ Found evidence of diagram ${diagramId} but main entity not accessible`);

            // Check if we can find any BTL/expiration information
            for (const evidence of evidenceResult) {
              try {
                const evidenceData = this.decoder.decode(evidence.storageValue);
                const parsed = JSON.parse(evidenceData);

                if (parsed.type === 'diagram' || parsed.type === 'btl_change') {
                  console.log(`⏰ Found BTL evidence for expired diagram ${diagramId}`);
                  throw new Error(`This diagram has expired and is no longer available on the blockchain. The diagram may have exceeded its Block Time to Live (BTL) period.`);
                }
              } catch (parseError) {
                // Continue checking other evidence
              }
            }

            // Generic expired message if we found evidence but can't determine exact cause
            throw new Error(`This diagram appears to have expired and is no longer available. Try contacting the diagram author if you need access.`);
          }
        } catch (evidenceError) {
          if ((evidenceError as Error).message.includes('expired')) {
            throw evidenceError; // Re-throw our custom expiration errors
          }
          console.log(`Could not check for expiration evidence:`, evidenceError);
        }

        // If no evidence found, try sharded import
        console.log(`🧩 Trying sharded diagram import...`);
        const shardedResult = await this.importShardedDiagram(diagramId, decryptionPassword);

        if (!shardedResult) {
          // Final check - provide helpful error message
          throw new Error(`Diagram '${diagramId}' not found. It may have been deleted, never existed, or expired from the blockchain.`);
        }

        return shardedResult;
      }
    } catch (error) {
      console.error('❌ Error importing diagram from Arkiv:', error);

      // Preserve our custom expiration error messages
      if ((error as Error).message.includes('expired') || (error as Error).message.includes('BTL')) {
        throw error;
      }

      throw new Error(`Import failed: ${(error as Error).message}`);
    }
  }

  async listDiagrams(author?: string, walletAddress?: string, custodialId?: string): Promise<DiagramMetadata[]> {
    try {
      // Query for both regular diagrams and sharded diagrams
      let regularQueryParts = ['type = "diagram"'];
      let chunksQueryParts = ['type = "diagram_chunk"'];

      if (author) {
        regularQueryParts.push(`author = "${author}"`);
        chunksQueryParts.push(`author = "${author}"`);
      }

      if (walletAddress) {
        regularQueryParts.push(`wallet = "${walletAddress}"`);
        chunksQueryParts.push(`wallet = "${walletAddress}"`);
      }

      if (custodialId) {
        regularQueryParts.push(`custodial_id = "${custodialId}"`);
        chunksQueryParts.push(`custodial_id = "${custodialId}"`);
      }

      const regularQuery = regularQueryParts.join(' && ');
      const chunksQuery = chunksQueryParts.join(' && ');

      console.log(`Executing regular query: ${regularQuery}`);
      console.log(`Executing chunks query: ${chunksQuery}`);

      const queryClient = this.getQueryClient();
      const [regularResult, chunksResult] = await Promise.all([
        queryClient.queryEntities(regularQuery),
        queryClient.queryEntities(chunksQuery)
      ]);

      console.log(`Regular diagrams found: ${regularResult ? regularResult.length : 0}`);
      console.log(`Chunks found: ${chunksResult ? chunksResult.length : 0}`);

      const diagrams: DiagramMetadata[] = [];

      // Process regular diagrams
      if (regularResult && regularResult.length > 0) {
        for (const entity of regularResult) {
          console.log('🔍 Regular diagram entity structure:', entity);

          try {
            const decodedData = this.decoder.decode(entity.storageValue);
            console.log('🔍 Regular diagram decoded storageValue:', decodedData);

            const diagramData = JSON.parse(decodedData);
            console.log('🔍 Regular diagram parsed data:', diagramData);

            diagrams.push({
              id: diagramData.id || 'unknown',
              title: diagramData.title || 'Untitled',
              author: diagramData.author || 'Unknown',
              timestamp: diagramData.timestamp || Date.now(),
              version: diagramData.version || 1,
              entityKey: entity.entityKey
            });
          } catch (error) {
            console.error('🔍 Error parsing regular diagram entity:', error);
            diagrams.push({
              id: 'unknown',
              title: 'Untitled',
              author: 'Unknown',
              timestamp: Date.now(),
              version: 1,
              entityKey: entity.entityKey
            });
          }
        }
      }

      // Process sharded diagrams (group chunks by diagram_id)
      if (chunksResult && chunksResult.length > 0) {
        const shardedDiagrams: { [diagramId: string]: ChunkData[] } = {};

        // Group chunks by diagram ID
        for (const entity of chunksResult) {
          try {
            const decodedData = this.decoder.decode(entity.storageValue);
            const chunkData: ChunkData = JSON.parse(decodedData);

            if (!shardedDiagrams[chunkData.diagramId]) {
              shardedDiagrams[chunkData.diagramId] = [];
            }
            shardedDiagrams[chunkData.diagramId].push(chunkData);
          } catch (error) {
            console.error('🔍 Error parsing chunk entity:', error);
          }
        }

        // Add sharded diagrams to the list (use first chunk for metadata)
        for (const [diagramId, chunks] of Object.entries(shardedDiagrams)) {
          chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
          const firstChunk = chunks[0];

          console.log(`🧩 Found sharded diagram: ${diagramId} with ${chunks.length} chunks`);

          diagrams.push({
            id: firstChunk.diagramId,
            title: firstChunk.title + ' (Sharded)',
            author: firstChunk.author,
            timestamp: Date.now(), // Use current timestamp for sharded diagrams
            version: 1,
            entityKey: `sharded:${diagramId}` // Special marker for sharded diagrams
          });
        }
      }

      console.log(`Found ${diagrams.length} diagrams`);
      return diagrams;
    } catch (error) {
      console.error('Error listing diagrams from Arkiv:', error);
      throw new Error(`List operation failed: ${(error as Error).message}`);
    }
  }

  // Enhanced search functionality
  async searchDiagrams(searchRequest: SearchRequest, walletAddress?: string, custodialId?: string): Promise<SearchResult[]> {
    try {
      console.log('Enhanced search request:', searchRequest);

      // Build base query for user's diagrams
      let queryParts = ['type = "diagram"'];

      // Add user authentication filters
      if (walletAddress) {
        queryParts.push(`wallet = "${walletAddress}"`);
      }
      if (custodialId) {
        queryParts.push(`custodial_id = "${custodialId}"`);
      }

      // Add search filters
      if (searchRequest.author) {
        queryParts.push(`author = "${searchRequest.author}"`);
      }

      // Date range filters
      if (searchRequest.dateFrom) {
        queryParts.push(`timestamp >= ${searchRequest.dateFrom}`);
      }
      if (searchRequest.dateTo) {
        queryParts.push(`timestamp <= ${searchRequest.dateTo}`);
      }

      // Size range filters
      if (searchRequest.sizeMin) {
        queryParts.push(`size_kb >= ${searchRequest.sizeMin}`);
      }
      if (searchRequest.sizeMax) {
        queryParts.push(`size_kb <= ${searchRequest.sizeMax}`);
      }

      // Encryption filter
      if (searchRequest.encrypted !== undefined) {
        if (searchRequest.encrypted) {
          queryParts.push(`encrypted = "1"`);
        } else {
          queryParts.push(`encrypted != "1"`);
        }
      }

      const query = queryParts.join(' && ');
      console.log(`Executing enhanced search query: ${query}`);

      const queryClient = this.getQueryClient();
      const results = await queryClient.queryEntities(query);

      if (!results || results.length === 0) {
        return [];
      }

      const searchResults: SearchResult[] = [];

      // Process each result
      for (const entity of results) {
        try {
          const decodedData = this.decoder.decode(entity.storageValue);
          let diagramData: DiagramData;

          try {
            diagramData = JSON.parse(decodedData);
          } catch (parseError) {
            // If parsing fails, it might be encrypted - skip for now
            console.log('Failed to parse diagram data, might be encrypted, skipping:', parseError);
            continue;
          }

          // Calculate relevance score
          let score = 1.0;
          let excerpt = '';
          let tags: string[] = [];

          // Title matching
          if (searchRequest.title && diagramData.title) {
            const titleMatch = this.calculateTextMatch(searchRequest.title, diagramData.title);
            if (titleMatch > 0) {
              score += titleMatch * 2; // Weight title matches higher
            } else if (searchRequest.title) {
              continue; // Skip if title specified but doesn't match
            }
          }

          // General text search in title and content
          if (searchRequest.query) {
            const titleMatch = this.calculateTextMatch(searchRequest.query, diagramData.title);
            const contentMatch = this.calculateTextMatch(searchRequest.query, diagramData.content);

            const totalMatch = titleMatch * 2 + contentMatch; // Weight title higher
            if (totalMatch > 0) {
              score += totalMatch;
              excerpt = this.extractExcerpt(diagramData.content, searchRequest.query);
            } else {
              continue; // Skip if general query doesn't match
            }
          }

          // Extract potential tags from content (simple implementation)
          tags = this.extractTags(diagramData.content);

          // Tag filtering
          if (searchRequest.tags && searchRequest.tags.length > 0) {
            const tagMatches = searchRequest.tags.filter(tag =>
              tags.some(extractedTag =>
                extractedTag.toLowerCase().includes(tag.toLowerCase())
              )
            );
            if (tagMatches.length === 0) {
              continue; // Skip if required tags not found
            }
            score += tagMatches.length * 0.5;
          }

          const searchResult: SearchResult = {
            id: diagramData.id,
            title: diagramData.title,
            author: diagramData.author,
            timestamp: diagramData.timestamp,
            version: diagramData.version,
            entityKey: entity.entityKey,
            score: score,
            excerpt: excerpt || diagramData.title,
            tags: tags.slice(0, 10) // Limit to first 10 tags
          };

          searchResults.push(searchResult);
        } catch (error) {
          console.warn('Failed to process search result:', error);
        }
      }

      // Sort results
      const sortBy = searchRequest.sortBy || 'score';
      const sortOrder = searchRequest.sortOrder || 'desc';

      searchResults.sort((a, b) => {
        let aValue, bValue;

        switch (sortBy) {
          case 'title':
            aValue = a.title.toLowerCase();
            bValue = b.title.toLowerCase();
            break;
          case 'author':
            aValue = a.author.toLowerCase();
            bValue = b.author.toLowerCase();
            break;
          case 'timestamp':
            aValue = a.timestamp;
            bValue = b.timestamp;
            break;
          case 'score':
          default:
            aValue = a.score || 0;
            bValue = b.score || 0;
            break;
        }

        if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });

      // Apply pagination
      const offset = searchRequest.offset || 0;
      const limit = searchRequest.limit || 50;

      return searchResults.slice(offset, offset + limit);

    } catch (error) {
      console.error('Enhanced search failed:', error);
      throw new Error(`Search failed: ${(error as Error).message}`);
    }
  }

  // Helper method to calculate text similarity
  private calculateTextMatch(query: string, text: string): number {
    if (!query || !text) return 0;

    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();

    // Exact match gets highest score
    if (textLower.includes(queryLower)) {
      return 1.0;
    }

    // Word-based matching
    const queryWords = queryLower.split(/\s+/);
    const textWords = textLower.split(/\s+/);

    let matches = 0;
    for (const queryWord of queryWords) {
      if (queryWord.length > 2) { // Skip very short words
        for (const textWord of textWords) {
          if (textWord.includes(queryWord) || queryWord.includes(textWord)) {
            matches++;
            break;
          }
        }
      }
    }

    return matches / queryWords.length;
  }

  // Helper method to extract text excerpt around search terms
  private extractExcerpt(content: string, query: string): string {
    if (!content || !query) return '';

    const queryLower = query.toLowerCase();
    const contentLower = content.toLowerCase();

    const index = contentLower.indexOf(queryLower);
    if (index === -1) return content.substring(0, 200);

    const start = Math.max(0, index - 100);
    const end = Math.min(content.length, index + query.length + 100);

    let excerpt = content.substring(start, end);
    if (start > 0) excerpt = '...' + excerpt;
    if (end < content.length) excerpt = excerpt + '...';

    return excerpt;
  }

  // Helper method to extract tags from diagram content
  private extractTags(content: string): string[] {
    const tags: string[] = [];

    try {
      // Look for common diagram elements that could serve as tags
      const tagPatterns = [
        /class="([^"]+)"/gi,           // CSS classes
        /data-type="([^"]+)"/gi,       // Data types
        /name="([^"]+)"/gi,            // Names
        /<text[^>]*>([^<]+)<\/text>/gi // Text content
      ];

      for (const pattern of tagPatterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const tag = match[1].trim();
          if (tag.length > 2 && tag.length < 50 && !tags.includes(tag)) {
            tags.push(tag);
          }
        }
      }

      // Also look for words in title/description that might be tags
      const words = content.match(/\b[A-Za-z]{3,20}\b/g) || [];
      for (const word of words.slice(0, 20)) { // Limit extraction
        if (word.length > 3 && !tags.includes(word)) {
          tags.push(word);
        }
      }

    } catch (error) {
      console.warn('Tag extraction failed:', error);
    }

    return tags.slice(0, 20); // Limit total tags
  }

  // Direct diagram access methods
  async getDiagramDirect(diagramId: string, format: string): Promise<DirectDiagramResult | null> {
    try {
      console.log(`Getting direct diagram access: ${diagramId}, format: ${format}`);

      // Load the diagram data
      const diagramData = await this.importDiagram(diagramId);
      if (!diagramData) {
        return null;
      }

      let content: string | Uint8Array;
      let contentType: string;

      switch (format.toLowerCase()) {
        case 'xml':
          content = diagramData.content;
          contentType = 'application/xml';
          break;

        case 'json':
          content = JSON.stringify(diagramData, null, 2);
          contentType = 'application/json';
          break;

        case 'svg':
          // Convert draw.io XML to SVG using DrawIO export API
          content = await this.convertToSVG(diagramData.content);
          contentType = 'image/svg+xml';
          break;

        case 'png':
          // Generate PNG from diagram using DrawIO export API
          content = await this.convertToPNG(diagramData.content);
          contentType = 'image/png';
          break;

        case 'html':
        default:
          // Generate HTML viewer for the diagram
          content = this.generateHTMLViewer(diagramData);
          contentType = 'text/html';
          break;
      }

      return {
        content,
        contentType,
        title: diagramData.title
      };
    } catch (error) {
      console.error('Direct diagram access failed:', error);
      return null;
    }
  }

  async getDiagramMetadata(diagramId: string): Promise<DiagramMetadata | null> {
    try {
      console.log(`Getting diagram metadata: ${diagramId}`);

      // First try to find the diagram by ID
      const queryClient = this.getQueryClient();
      const query = `type = "diagram" && id = "${diagramId}"`;

      const results = await queryClient.queryEntities(query);
      if (!results || results.length === 0) {
        return null;
      }

      const entity = results[0];
      const decodedData = this.decoder.decode(entity.storageValue);

      let diagramData: DiagramData;
      try {
        diagramData = JSON.parse(decodedData);
      } catch (parseError) {
        console.log('Failed to parse diagram metadata, might be encrypted');
        return null;
      }

      return {
        id: diagramData.id,
        title: diagramData.title,
        author: diagramData.author,
        timestamp: diagramData.timestamp,
        version: diagramData.version,
        entityKey: entity.entityKey
      };
    } catch (error) {
      console.error('Get diagram metadata failed:', error);
      return null;
    }
  }

  async getDiagramThumbnail(diagramId: string, size: string): Promise<Uint8Array | null> {
    try {
      console.log(`Getting diagram thumbnail: ${diagramId}, size: ${size}`);

      // Load the diagram data
      const diagramData = await this.importDiagram(diagramId);
      if (!diagramData) {
        return null;
      }

      // Convert diagram to thumbnail (basic implementation)
      return await this.generateThumbnail(diagramData.content, size);
    } catch (error) {
      console.error('Get diagram thumbnail failed:', error);
      return null;
    }
  }

  // Helper methods for format conversion
  private async convertToSVG(xmlContent: string): Promise<string> {
    // SVG export with embedded DrawIO viewer
    // Since there's no public DrawIO export API, we embed the diagram in an SVG with instructions
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 800 600">
  <style>
    .info-box {
      font-family: Arial, sans-serif;
      fill: #333;
    }
    .title {
      font-size: 20px;
      font-weight: bold;
    }
    .instruction {
      font-size: 14px;
      fill: #666;
    }
    .icon {
      font-size: 48px;
    }
  </style>

  <!-- Background -->
  <rect width="800" height="600" fill="#f8f9fa"/>

  <!-- Icon -->
  <text x="400" y="180" text-anchor="middle" class="info-box icon">📊</text>

  <!-- Title -->
  <text x="400" y="250" text-anchor="middle" class="info-box title">DrawIO Diagram - SVG Export</text>

  <!-- Instructions -->
  <text x="400" y="300" text-anchor="middle" class="info-box instruction">To export this diagram as SVG:</text>
  <text x="400" y="330" text-anchor="middle" class="info-box instruction">1. Open the diagram in the editor</text>
  <text x="400" y="355" text-anchor="middle" class="info-box instruction">2. Go to File → Export as → SVG</text>
  <text x="400" y="380" text-anchor="middle" class="info-box instruction">3. Adjust settings and download</text>

  <!-- Note -->
  <text x="400" y="430" text-anchor="middle" class="info-box instruction" fill="#999" font-size="12">
    Server-side SVG export requires DrawIO Desktop CLI
  </text>

  <!-- Embedded diagram data -->
  <metadata>
    <drawio-diagram>
      ${xmlContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
    </drawio-diagram>
  </metadata>
</svg>`;
  }

  private async convertToPNG(xmlContent: string): Promise<Uint8Array> {
    // PNG export placeholder with instructions
    // Return a simple PNG with message directing users to use the viewer
    // This is a 400x300 PNG with instructions
    const canvas = `
    <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
      <rect width="400" height="300" fill="#f8f9fa"/>
      <text x="200" y="100" text-anchor="middle" font-family="Arial" font-size="40">📊</text>
      <text x="200" y="150" text-anchor="middle" font-family="Arial" font-size="18" fill="#333">PNG Export Unavailable</text>
      <text x="200" y="180" text-anchor="middle" font-family="Arial" font-size="14" fill="#666">Please use the viewer format</text>
      <text x="200" y="205" text-anchor="middle" font-family="Arial" font-size="14" fill="#666">to open and export the diagram</text>
    </svg>`;

    // Since we can't easily convert SVG to PNG without a library, return a placeholder
    // This is a minimal 1x1 transparent PNG
    const base64PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    return Uint8Array.from(atob(base64PNG), c => c.charCodeAt(0));
  }

  private generateHTMLViewer(diagramData: DiagramData): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${diagramData.title}</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 20px;
            background: #f5f5f5;
        }
        .diagram-viewer {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            max-width: 1200px;
            margin: 0 auto;
        }
        .diagram-header {
            border-bottom: 1px solid #eee;
            padding-bottom: 10px;
            margin-bottom: 20px;
        }
        .diagram-title {
            margin: 0;
            color: #333;
        }
        .diagram-meta {
            color: #666;
            font-size: 14px;
            margin-top: 5px;
        }
        .diagram-content {
            border: 1px solid #ddd;
            min-height: 400px;
            background: white;
            border-radius: 4px;
            padding: 20px;
            text-align: center;
        }
        .no-viewer {
            color: #999;
            font-style: italic;
        }
    </style>
</head>
<body>
    <div class="diagram-viewer">
        <div class="diagram-header">
            <h1 class="diagram-title">${diagramData.title}</h1>
            <div class="diagram-meta">
                Author: ${diagramData.author} |
                Created: ${new Date(diagramData.timestamp).toLocaleString()} |
                Version: ${diagramData.version}
            </div>
        </div>
        <div class="diagram-content">
            <div class="no-viewer">
                <p>📊 Diagram Content</p>
                <p>Interactive viewing requires the full draw.io editor.</p>
                <p><a href="/?diagram=${diagramData.id}">Open in Editor</a></p>
            </div>
        </div>
    </div>
</body>
</html>`;
  }

  private async generateThumbnail(xmlContent: string, size: string): Promise<Uint8Array> {
    // Placeholder thumbnail (simple colored square based on size)
    // In a real implementation, you'd render the actual diagram
    let width = 200, height = 150;

    switch (size) {
      case 'small':
        width = 100; height = 75;
        break;
      case 'large':
        width = 400; height = 300;
        break;
      case 'medium':
      default:
        width = 200; height = 150;
        break;
    }

    // Generate a simple placeholder PNG (gray rectangle with size info)
    const base64PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    return Uint8Array.from(atob(base64PNG), c => c.charCodeAt(0));
  }

  async deleteDiagram(diagramId: string, walletAddress?: string, custodialId?: string): Promise<boolean> {
    try {
      // If no backend private key, return indication that frontend should handle the transaction
      if (!this.writeClient) {
        console.log('⚠️ Backend has no private key - frontend must handle deletion via MetaMask');
        return false; // Indicates frontend should handle
      }

      const client = this.writeClient;
      // First find the diagram to ensure it exists and belongs to the user
      let queryParts = ['type = "diagram"', `id = "${diagramId}"`];

      if (walletAddress) {
        queryParts.push(`wallet = "${walletAddress}"`);
      }

      if (custodialId) {
        queryParts.push(`custodial_id = "${custodialId}"`);
      }

      const query = queryParts.join(' && ');
      console.log(`🗑️ Executing delete query: ${query}`);

      const queryResult = await client.queryEntities(query);
      console.log(`🗑️ Delete query result: ${queryResult?.length || 0} entities found`);

      if (!queryResult || queryResult.length === 0) {
        console.log(`❌ No diagram found with ID: ${diagramId} for wallet: ${walletAddress}`);
        return false;
      }

      const entity = queryResult[0];
      console.log(`🗑️ Found entity to delete: ${entity.entityKey}`);

      // Delete the entity using Arkiv SDK
      const deletes = [entity.entityKey];
      console.log(`🗑️ Deleting entity with key: ${entity.entityKey}`);

      const deleteReceipt = await client.deleteEntities(deletes);
      console.log(`🗑️ Delete receipt:`, deleteReceipt);

      if (deleteReceipt && deleteReceipt.length > 0) {
        console.log(`✅ Successfully deleted diagram: ${diagramId}`);
        return true;
      } else {
        console.log(`❌ Failed to delete diagram: ${diagramId} - no receipt returned`);
        return false;
      }

    } catch (error) {
      console.error('❌ Error deleting diagram from Arkiv:', error);
      throw new Error(`Delete failed: ${(error as Error).message}`);
    }
  }

  async renameDiagram(diagramId: string, newTitle: string, walletAddress?: string, custodialId?: string): Promise<boolean> {
    try {
      // If no backend private key, return indication that frontend should handle the transaction
      if (!this.writeClient) {
        console.log('⚠️ Backend has no private key - frontend must handle rename via MetaMask');
        return false; // Indicates frontend should handle
      }

      const client = this.writeClient;
      console.log(`✏️ Renaming diagram ${diagramId} to "${newTitle}"`);

      // Find the original diagram
      let queryParts = ['type = "diagram"', `id = "${diagramId}"`];
      if (walletAddress) {
        queryParts.push(`wallet = "${walletAddress}"`);
      }

      const queryConditions = queryParts.join(' && ');
      const diagrams = await client.queryEntities(queryConditions);

      if (!diagrams || diagrams.length === 0) {
        throw new Error(`Diagram ${diagramId} not found`);
      }

      const entity = diagrams[0];
      const decodedData = this.decoder.decode(entity.storageValue);
      const originalDiagram: DiagramData = JSON.parse(decodedData);

      // Create a new entry with updated title
      const renameData = {
        type: 'rename',
        originalDiagramId: diagramId,
        oldTitle: originalDiagram.title,
        newTitle: newTitle,
        timestamp: Date.now(),
        wallet: walletAddress
      };

      const jsonData = JSON.stringify(renameData);
      const encodedData = this.encoder.encode(jsonData);

      const creates = [{
        data: encodedData,
        btl: 86400 * 100, // 100 days
        stringAnnotations: [
          new Annotation('type', 'rename'),
          new Annotation('originalDiagramId', diagramId),
          new Annotation('oldTitle', originalDiagram.title),
          new Annotation('newTitle', newTitle),
          ...(walletAddress ? [new Annotation('wallet', walletAddress)] : [])
        ],
        numericAnnotations: [
          new Annotation('timestamp', Date.now())
        ]
      }];

      const receipt = await client.createEntities(creates);

      if (receipt) {
        console.log(`✅ Diagram rename recorded: ${diagramId} -> "${newTitle}"`);
        return true;
      } else {
        console.log(`❌ Failed to record rename for diagram: ${diagramId}`);
        return false;
      }

    } catch (error) {
      console.error('❌ Error renaming diagram:', error);
      throw new Error(`Rename failed: ${(error as Error).message}`);
    }
  }

  async changeDiagramBTL(diagramId: string, newBTLDays: number, walletAddress?: string, custodialId?: string): Promise<boolean> {
    try {
      // If no backend private key, return indication that frontend should handle the transaction
      if (!this.writeClient) {
        console.log('⚠️ Backend has no private key - frontend must handle BTL change via MetaMask');
        return false; // Indicates frontend should handle
      }

      const client = this.writeClient;
      console.log(`⏰ Changing BTL for diagram ${diagramId} to ${newBTLDays} days`);

      // Find the original diagram
      let queryParts = ['type = "diagram"', `id = "${diagramId}"`];
      if (walletAddress) {
        queryParts.push(`wallet = "${walletAddress}"`);
      }

      const queryConditions = queryParts.join(' && ');
      const diagrams = await client.queryEntities(queryConditions);

      if (!diagrams || diagrams.length === 0) {
        throw new Error(`Diagram ${diagramId} not found`);
      }

      const entity = diagrams[0];
      const decodedData = this.decoder.decode(entity.storageValue);
      const originalDiagram: DiagramData = JSON.parse(decodedData);
      const newBTLBlocks = Math.floor(newBTLDays * 24 * 60 * 60 / 2); // Convert days to blocks (2 sec/block)

      // Create a new entry with updated BTL
      const btlData = {
        type: 'btl_change',
        originalDiagramId: diagramId,
        oldBTLDays: 100, // Default was 100 days
        newBTLDays: newBTLDays,
        newBTLBlocks: newBTLBlocks,
        timestamp: Date.now(),
        wallet: walletAddress
      };

      const jsonData = JSON.stringify(btlData);
      const encodedData = this.encoder.encode(jsonData);

      const creates = [{
        data: encodedData,
        btl: newBTLBlocks, // Use the new BTL
        stringAnnotations: [
          new Annotation('type', 'btl_change'),
          new Annotation('originalDiagramId', diagramId),
          new Annotation('newBTLDays', newBTLDays.toString()),
          ...(walletAddress ? [new Annotation('wallet', walletAddress)] : [])
        ],
        numericAnnotations: [
          new Annotation('timestamp', Date.now()),
          new Annotation('newBTLBlocks', newBTLBlocks),
          new Annotation('oldBTLDays', 100) // Default was 100 days
        ]
      }];

      const receipt = await client.createEntities(creates);

      if (receipt) {
        console.log(`✅ Diagram BTL change recorded: ${diagramId} -> ${newBTLDays} days`);
        return true;
      } else {
        console.log(`❌ Failed to record BTL change for diagram: ${diagramId}`);
        return false;
      }

    } catch (error) {
      console.error('❌ Error changing diagram BTL:', error);
      throw new Error(`BTL change failed: ${(error as Error).message}`);
    }
  }

  async protectDiagram(diagramId: string, walletAddress?: string, custodialId?: string): Promise<boolean> {
    try {
      // If no backend private key, return indication that frontend should handle the transaction
      if (!this.writeClient) {
        console.log('⚠️ Backend has no private key - frontend must handle protection via MetaMask');
        return false; // Indicates frontend should handle
      }

      const client = this.writeClient;
      console.log(`🛡️ Protecting diagram ${diagramId}`);

      // Find the original diagram
      let queryParts = ['type = "diagram"', `id = "${diagramId}"`];
      if (walletAddress) {
        queryParts.push(`wallet = "${walletAddress}"`);
      }

      const queryConditions = queryParts.join(' && ');
      const diagrams = await client.queryEntities(queryConditions);

      if (!diagrams || diagrams.length === 0) {
        throw new Error(`Diagram ${diagramId} not found`);
      }

      const entity = diagrams[0];
      const decodedData = this.decoder.decode(entity.storageValue);
      const originalDiagram: DiagramData = JSON.parse(decodedData);

      // Encode/protect the content
      const encodedContent = Buffer.from(originalDiagram.content).toString('base64');

      // Create a new entry with protected content
      const protectionData = {
        type: 'protection',
        originalDiagramId: diagramId,
        originalContent: originalDiagram.content,
        protectedContent: encodedContent,
        timestamp: Date.now(),
        wallet: walletAddress
      };

      const jsonData = JSON.stringify(protectionData);
      const encodedData = this.encoder.encode(jsonData);

      const creates = [{
        data: encodedData,
        btl: 86400 * 100, // 100 days
        stringAnnotations: [
          new Annotation('type', 'protection'),
          new Annotation('originalDiagramId', diagramId),
          new Annotation('protected', '1'),
          ...(walletAddress ? [new Annotation('wallet', walletAddress)] : [])
        ],
        numericAnnotations: [
          new Annotation('timestamp', Date.now())
        ]
      }];

      const receipt = await client.createEntities(creates);

      if (receipt) {
        console.log(`✅ Diagram protection recorded: ${diagramId}`);
        return true;
      } else {
        console.log(`❌ Failed to record protection for diagram: ${diagramId}`);
        return false;
      }

    } catch (error) {
      console.error('❌ Error protecting diagram:', error);
      throw new Error(`Protection failed: ${(error as Error).message}`);
    }
  }

  generateDiagramId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  generateCustodialId(): string {
    return this.userService.generateCustodialId();
  }

  // Sharing functionality
  async createShareToken(diagramId: string, shareRequest: ShareTokenRequest, walletAddress?: string, custodialId?: string): Promise<ShareTokenResponse> {
    try {
      // Get user tier and check if sharing is allowed
      const userTier = this.userService.getUserTier(walletAddress, custodialId);

      if (!this.userService.canCreateShareToken(userTier)) {
        throw new Error(`Sharing is not available for ${userTier} tier. Upgrade to access sharing features.`);
      }

      // Verify user owns the diagram
      const diagrams = await this.listDiagrams(undefined, walletAddress, custodialId);
      const diagram = diagrams.find(d => d.id === diagramId);

      if (!diagram) {
        throw new Error('Diagram not found or access denied');
      }

      // Create share token
      const createdBy = walletAddress || custodialId || 'anonymous';
      const shareTokenData = this.userService.createShareTokenData(shareRequest, createdBy);

      // Store share token in Arkiv
      const tokenValue = JSON.stringify(shareTokenData);
      const tokenData = new TextEncoder().encode(tokenValue);

      if (this.writeClient) {
        // Calculate BTL blocks
        const btlDays = shareTokenData.expiresAt ? Math.ceil((shareTokenData.expiresAt - Date.now()) / (1000 * 60 * 60 * 24)) : 365;
        const btlBlocks = Math.floor(btlDays * 24 * 60 * 60 / 2);

        const creates = [{
          data: tokenData,
          stringAnnotations: [
            new Annotation('type', 'share_token'),
            new Annotation('diagram_id', shareRequest.diagramId),
            new Annotation('created_by', createdBy),
            new Annotation('token', shareTokenData.token),
            new Annotation('is_public', shareRequest.isPublic ? 'true' : 'false')
          ],
          numericAnnotations: [
            new Annotation('created_at', shareTokenData.createdAt),
            ...(shareTokenData.expiresAt ? [new Annotation('expires_at', shareTokenData.expiresAt)] : []),
            new Annotation('access_count', 1) // Start with 1 instead of 0
          ],
          btl: btlBlocks
        }];

        const createReceipt = await this.writeClient.createEntities(creates);
        if (!createReceipt || createReceipt.length === 0) {
          throw new Error('Failed to create share token entity');
        }

        console.log(`Share token stored with entity key: ${createReceipt[0].entityKey}`);
      } else {
        throw new Error('Backend cannot create share tokens without signing key');
      }

      // Generate share URL
      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
      const shareUrl = `${baseUrl}/shared/${shareTokenData.token}`;

      return {
        success: true,
        token: shareTokenData.token,
        shareUrl
      };
    } catch (error) {
      console.error('Share token creation failed:', error);
      throw new Error(`Share token creation failed: ${(error as Error).message}`);
    }
  }

  async accessSharedDiagram(token: string): Promise<DiagramData | null> {
    try {
      // Search for share token by token annotation
      const queryClient = this.getQueryClient();
      const query = `type == "share_token" && token == "${token}"`;

      console.log(`Searching for share token: ${query}`);
      const results = await queryClient.queryEntities(query);

      if (!results || results.length === 0) {
        console.log(`Share token ${token} not found`);
        return null;
      }

      const tokenEntity = results[0];
      const shareTokenData: ShareToken = JSON.parse(new TextDecoder().decode(tokenEntity.storageValue));

      // Check if token is expired
      if (shareTokenData.expiresAt && Date.now() > shareTokenData.expiresAt) {
        console.log(`Share token ${token} has expired`);
        return null;
      }

      // Load the actual diagram
      const diagramData = await this.importDiagram(shareTokenData.diagramId);
      if (!diagramData) {
        console.log(`❌ Shared diagram ${shareTokenData.diagramId} not found or expired`);
        return null;
      }

      // Increment access count (if we can write)
      if (this.writeClient) {
        try {
          shareTokenData.accessCount++;
          const updatedTokenValue = JSON.stringify(shareTokenData);
          const tokenData = new TextEncoder().encode(updatedTokenValue);

          // Calculate remaining BTL
          const btlDays = shareTokenData.expiresAt ? Math.ceil((shareTokenData.expiresAt - Date.now()) / (1000 * 60 * 60 * 24)) : 365;
          const btlBlocks = Math.floor(btlDays * 24 * 60 * 60 / 2);

          const creates = [{
            data: tokenData,
            stringAnnotations: [
              new Annotation('type', 'share_token'),
              new Annotation('diagram_id', shareTokenData.diagramId),
              new Annotation('created_by', shareTokenData.createdBy),
              new Annotation('token', shareTokenData.token),
              new Annotation('is_public', shareTokenData.isPublic ? 'true' : 'false')
            ],
            numericAnnotations: [
              new Annotation('created_at', shareTokenData.createdAt),
              ...(shareTokenData.expiresAt ? [new Annotation('expires_at', shareTokenData.expiresAt)] : []),
              new Annotation('access_count', Math.max(1, shareTokenData.accessCount))
            ],
            btl: btlBlocks > 0 ? btlBlocks : 1
          }];

          await this.writeClient.createEntities(creates);
        } catch (updateError) {
          console.warn('Failed to update access count:', updateError);
          // Continue anyway, access count update is not critical
        }
      }

      return diagramData;
    } catch (error) {
      console.error('Shared diagram access failed:', error);
      return null;
    }
  }

  async listShareTokens(diagramId: string, walletAddress?: string, custodialId?: string): Promise<ShareToken[]> {
    try {
      // Verify user owns the diagram
      const diagrams = await this.listDiagrams(undefined, walletAddress, custodialId);
      const diagram = diagrams.find(d => d.id === diagramId);

      if (!diagram) {
        throw new Error('Diagram not found or access denied');
      }

      const queryClient = this.getQueryClient();

      // Search for share tokens for this diagram
      const createdBy = walletAddress || custodialId || 'anonymous';
      const query = `type == "share_token" && diagram_id == "${diagramId}" && created_by == "${createdBy}"`;

      console.log(`Searching for share tokens: ${query}`);
      const results = await queryClient.queryEntities(query);

      const shareTokens: ShareToken[] = [];
      for (const result of results) {
        try {
          const tokenData: ShareToken = JSON.parse(new TextDecoder().decode(result.storageValue));

          // Filter out expired tokens
          if (!tokenData.expiresAt || Date.now() <= tokenData.expiresAt) {
            shareTokens.push(tokenData);
          }
        } catch (error) {
          console.warn('Failed to parse share token:', error);
        }
      }

      return shareTokens;
    } catch (error) {
      console.error('List share tokens failed:', error);
      throw new Error(`List share tokens failed: ${(error as Error).message}`);
    }
  }

  async revokeShareToken(token: string, walletAddress?: string, custodialId?: string): Promise<boolean> {
    try {
      // Search for share token by token annotation
      const queryClient = this.getQueryClient();
      const query = `type == "share_token" && token == "${token}"`;

      console.log(`Searching for share token to revoke: ${query}`);
      const results = await queryClient.queryEntities(query);

      if (!results || results.length === 0) {
        console.log(`Share token ${token} not found`);
        return false;
      }

      const shareTokenData: ShareToken = JSON.parse(new TextDecoder().decode(results[0].storageValue));
      const currentUser = walletAddress || custodialId || 'anonymous';

      // Check if user is authorized to revoke this token
      if (shareTokenData.createdBy !== currentUser) {
        throw new Error('Unauthorized to revoke this share token');
      }

      // Mark token as revoked by creating a revocation entity with very short TTL
      if (this.writeClient) {
        const revokedData = new TextEncoder().encode('REVOKED');
        const creates = [{
          data: revokedData,
          stringAnnotations: [
            new Annotation('type', 'share_token_revoked'),
            new Annotation('diagram_id', shareTokenData.diagramId),
            new Annotation('created_by', currentUser),
            new Annotation('token', token),
            new Annotation('revoked_at', Date.now().toString())
          ],
          numericAnnotations: [
            new Annotation('timestamp', Date.now())
          ],
          btl: 1 // Very short TTL to effectively delete
        }];

        await this.writeClient.createEntities(creates);
        console.log(`Share token ${token} marked as revoked`);
        return true;
      } else {
        throw new Error('Backend cannot revoke share tokens without signing key');
      }
    } catch (error) {
      console.error('Revoke share token failed:', error);
      return false;
    }
  }

  async saveUserConfig(config: UserConfig): Promise<string> {
    try {
      console.log(`Saving user config for wallet: ${config.walletAddress}`);

      const client = this.ensureWriteClient();

      const configJson = JSON.stringify(config);
      const encodedData = this.encoder.encode(configJson);

      const creates = [{
        data: encodedData,
        btl: Math.floor(365 * 24 * 60 * 60 / 2), // ~365 dni dla konfiguracji (2 sekundy/blok)
        stringAnnotations: [
          new Annotation('type', 'user_config'),
          new Annotation('wallet', config.walletAddress)
        ],
        numericAnnotations: [
          new Annotation('timestamp', config.timestamp),
          new Annotation('btl_days', config.btlDays)
        ]
      }];

      const createReceipt = await client.createEntities(creates);
      console.log(`User config saved with entity key: ${createReceipt[0].entityKey}`);

      return createReceipt[0].entityKey;
    } catch (error) {
      console.error('Error saving user config:', error);
      throw new Error(`Config save failed: ${(error as Error).message}`);
    }
  }

  async getUserConfig(walletAddress: string): Promise<UserConfig | null> {
    try {
      const query = `type = "user_config" && wallet = "${walletAddress}"`;
      console.log(`Getting user config query: ${query}`);

      const client = this.getQueryClient();
      const queryResult = await client.queryEntities(query);
      console.log(`Config query result: ${queryResult?.length || 0} entities found`);

      if (queryResult && queryResult.length > 0) {
        // Bierz najnowszą konfigurację (ostatnia w liście)
        const entity = queryResult[queryResult.length - 1];

        try {
          const decodedData = this.decoder.decode(entity.storageValue);
          const config: UserConfig = JSON.parse(decodedData);
          console.log(`User config loaded:`, config);
          return config;
        } catch (decodeError) {
          console.error('Error decoding user config:', decodeError);
          return null;
        }
      }

      console.log(`No config found for wallet: ${walletAddress}, using defaults`);
      return null;
    } catch (error) {
      console.error('Error getting user config:', error);
      throw new Error(`Config load failed: ${(error as Error).message}`);
    }
  }

  getDefaultConfig(walletAddress: string): UserConfig {
    return {
      walletAddress,
      btlDays: 100,
      autoSave: false,
      showBalance: true,
      encryptByDefault: false,
      timestamp: Date.now()
    };
  }

  /**
   * Get user tier information and limits
   */
  getUserTierInfo(walletAddress?: string, custodialId?: string) {
    const tier = this.userService.getUserTier(walletAddress, custodialId);
    const limits = this.userService.getUserLimits(tier);
    const displayInfo = this.userService.getUserDisplayInfo(tier, walletAddress || custodialId);

    return {
      tier,
      limits,
      displayInfo
    };
  }

  // Encryption helper methods
  private encryptContent(content: string, password: string): string {
    try {
      const encrypted = CryptoJS.AES.encrypt(content, password).toString();
      console.log('🔐 Content encrypted successfully');
      return encrypted;
    } catch (error) {
      console.error('❌ Encryption failed:', error);
      throw new Error('Encryption failed');
    }
  }

  private decryptContent(encryptedContent: string, password: string): string {
    try {
      const decrypted = CryptoJS.AES.decrypt(encryptedContent, password);
      const plaintext = decrypted.toString(CryptoJS.enc.Utf8);

      if (!plaintext) {
        throw new Error('Decryption failed - invalid password or corrupted data');
      }

      console.log('🔓 Content decrypted successfully');
      return plaintext;
    } catch (error) {
      console.error('❌ Decryption failed:', error);
      throw new Error('Decryption failed - invalid password');
    }
  }

  async exportChunk(chunkRequest: ChunkExportRequest, walletAddress?: string): Promise<string> {
    try {
      console.log(`Starting chunk export for chunk: ${chunkRequest.chunkId}, diagram: ${chunkRequest.diagramId}`);

      const client = this.ensureWriteClient();

      // Get user configuration for BTL
      let btlBlocks = 4320000; // default ~100 days
      if (walletAddress) {
        try {
          const userConfig = await this.getUserConfig(walletAddress);
          if (userConfig) {
            btlBlocks = Math.floor(userConfig.btlDays * 24 * 60 * 60 / 2);
            console.log(`Using user config BTL: ${userConfig.btlDays} days = ${btlBlocks} blocks`);
          }
        } catch (configError) {
          console.log(`Could not load user config, using default BTL:`, configError);
        }
      }

      const chunkData: ChunkData = {
        chunkId: chunkRequest.chunkId,
        diagramId: chunkRequest.diagramId,
        title: chunkRequest.title,
        author: chunkRequest.author,
        chunkIndex: chunkRequest.chunkIndex,
        totalChunks: chunkRequest.totalChunks,
        content: chunkRequest.content,
        isLastChunk: chunkRequest.isLastChunk
      };

      const chunkJson = JSON.stringify(chunkData);
      const encodedData = this.encoder.encode(chunkJson);

      const creates = [{
        data: encodedData,
        btl: btlBlocks,
        stringAnnotations: [
          new Annotation('type', 'diagram_chunk'),
          new Annotation('chunk_id', chunkRequest.chunkId),
          new Annotation('diagram_id', chunkRequest.diagramId),
          new Annotation('title', chunkRequest.title),
          new Annotation('author', chunkRequest.author),
          ...(walletAddress ? [new Annotation('wallet', walletAddress)] : [])
        ],
        numericAnnotations: [
          new Annotation('chunk_index', chunkRequest.chunkIndex),
          new Annotation('total_chunks', chunkRequest.totalChunks),
          new Annotation('timestamp', Date.now())
        ]
      }];

      console.log(`Creating chunk entity in Arkiv: ${chunkRequest.chunkIndex + 1}/${chunkRequest.totalChunks}`);

      const createReceipt = await client.createEntities(creates);

      if (createReceipt && createReceipt.length > 0) {
        const entityKey = createReceipt[0].entityKey;
        console.log(`✅ Chunk ${chunkRequest.chunkIndex + 1}/${chunkRequest.totalChunks} exported successfully with entity key: ${entityKey}`);
        return entityKey;
      } else {
        throw new Error('Failed to create chunk entity in Arkiv - no receipt returned');
      }
    } catch (error) {
      console.error('💥 Error exporting chunk to Arkiv:', error);
      throw new Error(`Chunk export failed: ${(error as Error).message}`);
    }
  }

  async importShardedDiagram(diagramId: string, decryptionPassword?: string): Promise<DiagramData | null> {
    try {
      console.log(`🧩 Starting sharded diagram import for ID: ${diagramId}`);

      // Find all chunks for this diagram
      const query = `type = "diagram_chunk" && diagram_id = "${diagramId}"`;
      console.log(`Executing chunk query: ${query}`);
      const client = this.getQueryClient();
      const queryResult = await client.queryEntities(query);

      console.log(`Found ${queryResult?.length || 0} chunks for diagram ${diagramId}`);

      if (!queryResult || queryResult.length === 0) {
        console.log(`❌ No chunks found for diagram ID: ${diagramId}`);

        // Check if there's evidence of this sharded diagram having existed
        console.log(`🔍 Checking for expired sharded diagram evidence...`);
        try {
          // Look for any reference to this diagram ID in chunk metadata or other entities
          const evidenceQuery = `diagram_id = "${diagramId}"`;
          const evidenceResult = await client.queryEntities(evidenceQuery);

          if (evidenceResult && evidenceResult.length > 0) {
            console.log(`⏰ Found evidence of sharded diagram ${diagramId} but chunks not accessible`);
            throw new Error(`This sharded diagram has expired and is no longer available on the blockchain. The diagram chunks may have exceeded their Block Time to Live (BTL) period.`);
          }
        } catch (evidenceError) {
          if ((evidenceError as Error).message.includes('expired')) {
            throw evidenceError; // Re-throw our custom expiration errors
          }
          console.log(`Could not check for sharded diagram expiration evidence:`, evidenceError);
        }

        return null;
      }

      // Parse and sort chunks
      const chunks: ChunkData[] = [];
      for (const entity of queryResult) {
        try {
          const decodedData = this.decoder.decode(entity.storageValue);
          const chunkData: ChunkData = JSON.parse(decodedData);
          chunks.push(chunkData);
        } catch (error) {
          console.error('❌ Error parsing chunk data:', error);
          throw new Error('Failed to parse chunk data');
        }
      }

      // Sort chunks by index
      chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

      console.log(`🔧 Reconstructing document from ${chunks.length} chunks`);

      // Reconstruct the document
      const totalSize = chunks.reduce((sum, chunk) => sum + chunk.content.length, 0);
      const reconstructed = new Uint8Array(totalSize);
      let offset = 0;

      for (const chunk of chunks) {
        const chunkBytes = new Uint8Array(chunk.content);
        reconstructed.set(chunkBytes, offset);
        offset += chunkBytes.length;
      }

      // Decode the reconstructed XML
      let xmlString = this.decoder.decode(reconstructed);

      // Check if the content is encrypted (look for encryption marker or try to determine)
      let isEncrypted = false;
      try {
        // If content starts with encrypted AES pattern, it's likely encrypted
        if (xmlString.indexOf('mxGraphModel') === -1 && xmlString.length > 100) {
          isEncrypted = true;
          console.log(`🔐 Sharded diagram appears to be encrypted`);
        }
      } catch (e) {
        // Continue with assumption it might be encrypted
      }

      // Handle decryption if needed
      if (isEncrypted && decryptionPassword) {
        console.log(`🔓 Attempting to decrypt sharded diagram content`);
        try {
          xmlString = this.decryptContent(xmlString, decryptionPassword);
          console.log(`✅ Sharded diagram decrypted successfully`);
        } catch (decryptError) {
          console.error('❌ Failed to decrypt sharded diagram:', decryptError);
          throw new Error('Failed to decrypt sharded diagram content');
        }
      } else if (isEncrypted && !decryptionPassword) {
        // Try to get password from user config
        const firstChunk = chunks[0];
        try {
          const userConfig = await this.getUserConfig(firstChunk.author);
          if (userConfig && userConfig.encryptionPassword) {
            console.log(`🔐 Using encryption password from user config for sharded diagram`);
            xmlString = this.decryptContent(xmlString, userConfig.encryptionPassword);
            console.log(`✅ Sharded diagram decrypted with user config password`);
          } else {
            throw new Error('Sharded diagram is encrypted but no decryption password available');
          }
        } catch (configError) {
          throw new Error('Sharded diagram is encrypted but no decryption password available');
        }
      }

      // Create DiagramData from the first chunk metadata and reconstructed content
      const firstChunk = chunks[0];
      const diagramData: DiagramData = {
        id: firstChunk.diagramId,
        title: firstChunk.title,
        author: firstChunk.author,
        content: xmlString,
        timestamp: Date.now(), // Use current timestamp for reconstruction
        version: 1,
        encrypted: isEncrypted
      };

      console.log(`✅ Sharded diagram reconstructed successfully: ${diagramId}`);
      return diagramData;

    } catch (error) {
      console.error('❌ Error importing sharded diagram:', error);
      throw new Error(`Sharded import failed: ${(error as Error).message}`);
    }
  }

  // Retry queue operation implementations
  async performImport(payload: any): Promise<DiagramData | null> {
    const { diagramId, decryptionPassword } = payload;
    return await this.importDiagram(diagramId, decryptionPassword);
  }

  async performList(payload: any): Promise<DiagramMetadata[]> {
    const { author, walletAddress, custodialId } = payload;
    return await this.listDiagrams(author, walletAddress, custodialId);
  }

  async performDelete(payload: any): Promise<boolean> {
    const { diagramId, walletAddress, custodialId } = payload;
    return await this.deleteDiagram(diagramId, walletAddress, custodialId);
  }

  async getDiagramVersions(diagramId: string, walletAddress?: string, custodialId?: string): Promise<DiagramMetadata[]> {
    try {
      console.log(`Getting versions for diagram: ${diagramId}`);

      const client = this.getQueryClient();

      // Query for all diagrams with the same base ID (different versions have same ID but different entity keys)
      // First try to find by exact ID match
      const query = `type = "diagram" && id = "${diagramId}"`;
      console.log(`Executing versions query: ${query}`);

      const queryResult = await client.queryEntities(query);
      console.log(`Found ${queryResult.length} potential versions`);

      const versions: DiagramMetadata[] = [];

      for (const entity of queryResult) {
        try {
          // Decode the entity data to get metadata
          const entityData = new Uint8Array(entity.storageValue);
          const jsonStr = this.decoder.decode(entityData);
          const diagram: DiagramData = JSON.parse(jsonStr);

          // Only include if user has access (same author or shared)
          if (this.userService.hasAccessToDiagram(diagram, walletAddress, custodialId)) {
            versions.push({
              id: diagram.id,
              title: diagram.title,
              author: diagram.author,
              timestamp: diagram.timestamp,
              version: diagram.version || 1,
              entityKey: entity.entityKey
            });
          }
        } catch (decodeError) {
          console.log(`Could not decode entity ${entity.entityKey}:`, decodeError);
          continue;
        }
      }

      // Sort by version number and timestamp (newest first)
      versions.sort((a, b) => {
        if (a.version !== b.version) {
          return b.version - a.version; // Higher version first
        }
        return b.timestamp - a.timestamp; // Newer timestamp first
      });

      console.log(`Found ${versions.length} accessible versions for diagram ${diagramId}`);
      return versions;

    } catch (error) {
      console.error('Error getting diagram versions:', error);
      throw new Error(`Version lookup failed: ${(error as Error).message}`);
    }
  }

  public async shutdown() {
    console.log('🛑 Shutting down ArkivService...');
    await this.retryQueue.shutdown();
    console.log('✅ ArkivService shutdown complete');
  }
}
