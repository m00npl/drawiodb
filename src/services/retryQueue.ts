import { EventEmitter } from 'events';

export interface RetryOperation {
  id: string;
  type: 'export' | 'import' | 'list' | 'delete';
  payload: any;
  maxRetries: number;
  currentRetry: number;
  createdAt: number;
  lastAttempt?: number;
  exponentialBackoff: boolean;
  onSuccess?: (result: any) => void;
  onFailure?: (error: Error) => void;
}

export class RetryQueue extends EventEmitter {
  private queue: Map<string, RetryOperation> = new Map();
  private processing = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private readonly baseDelay = 5000; // 5 seconds base delay
  private readonly maxDelay = 300000; // 5 minutes max delay

  constructor() {
    super();
    this.startProcessing();
  }

  addOperation(operation: Omit<RetryOperation, 'id' | 'currentRetry' | 'createdAt'>): string {
    const id = this.generateId();
    const fullOperation: RetryOperation = {
      ...operation,
      id,
      currentRetry: 0,
      createdAt: Date.now()
    };

    this.queue.set(id, fullOperation);
    console.log(`📥 Added operation to retry queue: ${operation.type} (${id})`);

    this.emit('operationAdded', fullOperation);
    return id;
  }

  removeOperation(id: string): boolean {
    const removed = this.queue.delete(id);
    if (removed) {
      console.log(`🗑️ Removed operation from queue: ${id}`);
      this.emit('operationRemoved', id);
    }
    return removed;
  }

  getOperation(id: string): RetryOperation | undefined {
    return this.queue.get(id);
  }

  getQueueStatus() {
    const operations = Array.from(this.queue.values());
    return {
      total: operations.length,
      byType: operations.reduce((acc, op) => {
        acc[op.type] = (acc[op.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      processing: this.processing,
      oldestOperation: operations.length > 0 ? Math.min(...operations.map(op => op.createdAt)) : null
    };
  }

  private startProcessing() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }

    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, 2000); // Check every 2 seconds

    console.log('🔄 Retry queue processing started');
  }

  private async processQueue() {
    if (this.processing || this.queue.size === 0) {
      return;
    }

    this.processing = true;

    try {
      const operations = Array.from(this.queue.values())
        .filter(op => this.shouldRetry(op))
        .sort((a, b) => a.createdAt - b.createdAt); // FIFO

      if (operations.length === 0) {
        this.processing = false;
        return;
      }

      const operation = operations[0];
      console.log(`🔄 Processing retry operation: ${operation.type} (${operation.id}) - attempt ${operation.currentRetry + 1}/${operation.maxRetries}`);

      try {
        const result = await this.executeOperation(operation);

        // Success - remove from queue and notify
        this.removeOperation(operation.id);
        if (operation.onSuccess) {
          operation.onSuccess(result);
        }
        this.emit('operationSuccess', { operation, result });

      } catch (error) {
        operation.currentRetry++;
        operation.lastAttempt = Date.now();

        if (operation.currentRetry >= operation.maxRetries) {
          // Max retries reached - remove and notify failure
          this.removeOperation(operation.id);
          if (operation.onFailure) {
            operation.onFailure(error as Error);
          }
          this.emit('operationFailed', { operation, error });
          console.log(`❌ Operation failed after ${operation.maxRetries} attempts: ${operation.type} (${operation.id})`);
        } else {
          // Update operation for next retry
          this.queue.set(operation.id, operation);
          console.log(`⚠️ Operation failed, will retry: ${operation.type} (${operation.id}) - ${(error as Error).message}`);
          this.emit('operationRetry', { operation, error });
        }
      }
    } catch (error) {
      console.error('Error in retry queue processing:', error);
    } finally {
      this.processing = false;
    }
  }

  private shouldRetry(operation: RetryOperation): boolean {
    if (operation.currentRetry >= operation.maxRetries) {
      return false;
    }

    if (!operation.lastAttempt) {
      return true; // First attempt
    }

    const delay = this.calculateDelay(operation);
    const timeSinceLastAttempt = Date.now() - operation.lastAttempt;

    return timeSinceLastAttempt >= delay;
  }

  private calculateDelay(operation: RetryOperation): number {
    if (!operation.exponentialBackoff) {
      return this.baseDelay;
    }

    // Exponential backoff: base * 2^retry with jitter
    const exponentialDelay = this.baseDelay * Math.pow(2, operation.currentRetry);
    const jitter = Math.random() * 1000; // Add up to 1 second of jitter
    const totalDelay = Math.min(exponentialDelay + jitter, this.maxDelay);

    return totalDelay;
  }

  private async executeOperation(operation: RetryOperation): Promise<any> {
    // This will be implemented by the GolemService
    throw new Error(`Operation execution not implemented for type: ${operation.type}`);
  }

  private generateId(): string {
    return `retry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  public async shutdown() {
    console.log('🛑 Shutting down retry queue...');

    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    // Wait for current processing to finish
    while (this.processing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Notify about remaining operations
    if (this.queue.size > 0) {
      console.log(`⚠️ Shutdown with ${this.queue.size} operations still in queue`);
      for (const operation of this.queue.values()) {
        if (operation.onFailure) {
          operation.onFailure(new Error('Service shutdown'));
        }
      }
    }

    this.queue.clear();
    console.log('✅ Retry queue shutdown complete');
  }
}