import { UserTier, UserLimits, ShareToken, ShareTokenRequest } from '../types/diagram';
import crypto from 'crypto';

export class UserService {
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();

  /**
   * Determine user tier based on authentication method
   */
  getUserTier(walletAddress?: string, custodialId?: string): UserTier {
    if (walletAddress && walletAddress.startsWith('0x') && walletAddress.length === 42) {
      return UserTier.WALLET;
    }
    if (custodialId) {
      return UserTier.CUSTODIAL;
    }
    return UserTier.FREE;
  }

  /**
   * Get user limits based on tier
   */
  getUserLimits(tier: UserTier): UserLimits {
    switch (tier) {
      case UserTier.FREE:
        return {
          maxDiagrams: 5,
          maxDiagramSizeKB: 100, // 100KB limit
          defaultBTLDays: 7,
          maxBTLDays: 7,
          canShare: false,
          canEncrypt: false
        };

      case UserTier.CUSTODIAL:
        return {
          maxDiagrams: 20,
          maxDiagramSizeKB: 500, // 500KB limit
          defaultBTLDays: 30,
          maxBTLDays: 30,
          canShare: true,
          canEncrypt: false
        };

      case UserTier.WALLET:
        return {
          maxDiagrams: -1, // Unlimited
          maxDiagramSizeKB: -1, // Unlimited
          defaultBTLDays: 100,
          maxBTLDays: 365, // 1 year max
          canShare: true,
          canEncrypt: true
        };

      default:
        return this.getUserLimits(UserTier.FREE);
    }
  }

  /**
   * Validate if user can save diagram based on limits
   */
  async validateDiagramSave(
    tier: UserTier,
    diagramSizeKB: number,
    currentDiagramCount: number
  ): Promise<{ valid: boolean; reason?: string }> {
    const limits = this.getUserLimits(tier);

    // Check diagram count limit
    if (limits.maxDiagrams > 0 && currentDiagramCount >= limits.maxDiagrams) {
      return {
        valid: false,
        reason: `${tier} tier is limited to ${limits.maxDiagrams} diagrams. Please upgrade or delete existing diagrams.`
      };
    }

    // Check diagram size limit
    if (limits.maxDiagramSizeKB > 0 && diagramSizeKB > limits.maxDiagramSizeKB) {
      return {
        valid: false,
        reason: `Diagram size (${Math.round(diagramSizeKB)}KB) exceeds ${tier} tier limit of ${limits.maxDiagramSizeKB}KB.`
      };
    }

    return { valid: true };
  }

  /**
   * Validate BTL (Block Time to Live) for user tier
   */
  validateBTL(tier: UserTier, requestedBTLDays: number): number {
    const limits = this.getUserLimits(tier);

    if (requestedBTLDays > limits.maxBTLDays) {
      console.log(`BTL ${requestedBTLDays} days exceeds ${tier} tier limit of ${limits.maxBTLDays} days, using limit`);
      return limits.maxBTLDays;
    }

    return requestedBTLDays;
  }

  /**
   * Generate custodial user ID
   */
  generateCustodialId(): string {
    return `custodial_${crypto.randomBytes(16).toString('hex')}`;
  }

  /**
   * Generate sharing token
   */
  generateShareToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Create share token data
   */
  createShareTokenData(request: ShareTokenRequest, createdBy: string): ShareToken {
    const now = Date.now();
    const expiresAt = request.expiresInDays
      ? now + (request.expiresInDays * 24 * 60 * 60 * 1000)
      : undefined;

    return {
      token: this.generateShareToken(),
      diagramId: request.diagramId,
      createdBy,
      createdAt: now,
      expiresAt,
      isPublic: request.isPublic,
      accessCount: 0
    };
  }

  /**
   * Check if user can create share tokens
   */
  canCreateShareToken(tier: UserTier): boolean {
    const limits = this.getUserLimits(tier);
    return limits.canShare;
  }

  /**
   * Get user display info
   */
  getUserDisplayInfo(tier: UserTier, identifier?: string): { displayName: string; tierName: string } {
    const limits = this.getUserLimits(tier);

    switch (tier) {
      case UserTier.FREE:
        return {
          displayName: 'Anonymous User',
          tierName: `Free (${limits.maxDiagrams} diagrams, ${limits.defaultBTLDays} days)`
        };

      case UserTier.CUSTODIAL:
        return {
          displayName: `Guest ${identifier?.substring(0, 8) || 'User'}`,
          tierName: `Guest (${limits.maxDiagrams} diagrams, ${limits.defaultBTLDays} days)`
        };

      case UserTier.WALLET:
        return {
          displayName: identifier ? `${identifier.substring(0, 6)}...${identifier.substring(38)}` : 'Wallet User',
          tierName: 'Wallet (unlimited)'
        };

      default:
        return { displayName: 'Unknown', tierName: 'Unknown' };
    }
  }

  /**
   * Calculate diagram size in KB
   */
  calculateDiagramSizeKB(content: string): number {
    return new Blob([content]).size / 1024;
  }

  /**
   * Check if user has access to a specific diagram
   */
  hasAccessToDiagram(diagram: any, walletAddress?: string, custodialId?: string): boolean {
    // Public diagrams are accessible to everyone
    if (diagram.isPublic) {
      return true;
    }

    // Check if user is the author
    if (walletAddress && diagram.author === walletAddress) {
      return true;
    }

    if (custodialId && diagram.author === custodialId) {
      return true;
    }

    // For now, assume all diagrams are accessible to their authors
    // In the future, could add more sophisticated access control
    return true;
  }
}