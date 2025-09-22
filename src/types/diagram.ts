export interface DiagramData {
  id: string;
  title: string;
  author: string;
  content: string;
  timestamp: number;
  version: number;
  encrypted?: boolean; // Czy diagram jest zaszyfrowany
}

export interface DiagramMetadata {
  id: string;
  title: string;
  author: string;
  timestamp: number;
  version: number;
  entityKey?: string;
}

export interface ExportRequest {
  title: string;
  author: string;
  content: string;
  encrypted?: boolean; // Czy diagram jest zaszyfrowany
  encryptionPassword?: string; // Hasło do szyfrowania (tylko w request, nie zapisywane)
}

export interface ImportResponse {
  success: boolean;
  data?: DiagramData;
  error?: string;
}

export interface ExportResponse {
  success: boolean;
  diagramId?: string;
  entityKey?: string;
  error?: string;
}

export interface UserConfig {
  walletAddress: string;
  btlDays: number; // Block Time to Live w dniach (domyślnie 100)
  autoSave: boolean; // Automatyczne zapisywanie
  showBalance: boolean; // Czy pokazywać balance
  encryptionPassword?: string; // Hasło do szyfrowania diagramów
  encryptByDefault: boolean; // Czy domyślnie szyfrować nowe diagramy
  timestamp: number;
}

export interface ConfigRequest {
  btlDays?: number;
  autoSave?: boolean;
  showBalance?: boolean;
  encryptionPassword?: string;
  encryptByDefault?: boolean;
}

export interface ConfigResponse {
  success: boolean;
  config?: UserConfig;
  error?: string;
}

export interface ChunkData {
  chunkId: string;
  diagramId: string;
  title: string;
  author: string;
  chunkIndex: number;
  totalChunks: number;
  content: number[]; // Uint8Array as number array for JSON transport
  isLastChunk: boolean;
}

export interface ChunkExportRequest {
  chunkId: string;
  diagramId: string;
  title: string;
  author: string;
  chunkIndex: number;
  totalChunks: number;
  content: number[];
  isLastChunk: boolean;
}

export interface ChunkExportResponse {
  success: boolean;
  chunkId?: string;
  entityKey?: string;
  error?: string;
}

export enum UserTier {
  FREE = 'free',
  WALLET = 'wallet',
  CUSTODIAL = 'custodial'
}

export interface UserLimits {
  maxDiagrams: number;
  maxDiagramSizeKB: number;
  defaultBTLDays: number;
  maxBTLDays: number;
  canShare: boolean;
  canEncrypt: boolean;
}

export interface ShareToken {
  token: string;
  diagramId: string;
  createdBy: string;
  createdAt: number;
  expiresAt?: number;
  isPublic: boolean;
  accessCount: number;
}

export interface ShareTokenRequest {
  diagramId: string;
  isPublic: boolean;
  expiresInDays?: number;
}

export interface ShareTokenResponse {
  success: boolean;
  token?: string;
  shareUrl?: string;
  error?: string;
}

export interface SearchRequest {
  query?: string; // General text search
  title?: string; // Title-specific search
  author?: string; // Author search
  tags?: string[]; // Tag-based search
  dateFrom?: number; // Timestamp range start
  dateTo?: number; // Timestamp range end
  sizeMin?: number; // Minimum size in KB
  sizeMax?: number; // Maximum size in KB
  encrypted?: boolean; // Filter by encryption status
  sortBy?: 'timestamp' | 'title' | 'author' | 'size'; // Sort criteria
  sortOrder?: 'asc' | 'desc'; // Sort direction
  limit?: number; // Maximum results
  offset?: number; // Pagination offset
}

export interface SearchResult extends DiagramMetadata {
  score?: number; // Relevance score
  excerpt?: string; // Content excerpt
  tags?: string[]; // Extracted tags
}

export interface DirectDiagramResult {
  content: string | Uint8Array; // Content in requested format
  contentType: string; // MIME type
  title: string; // Diagram title
}

export interface DiagramThumbnailOptions {
  size: 'small' | 'medium' | 'large';
  width?: number;
  height?: number;
}