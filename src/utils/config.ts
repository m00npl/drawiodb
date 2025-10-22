interface ArkivConfig {
  chainId: string;
  privateKey?: string;
  rpcUrl: string;
  wsUrl: string;
}

interface AppConfig {
  port: number | string;
  arkiv: ArkivConfig;
}

export const config: AppConfig = {
  port: process.env.PORT || 3000,
  arkiv: {
    chainId: process.env.ARKIV_CHAIN_ID || process.env.GOLEM_CHAIN_ID || '60138453025',
    privateKey: process.env.ARKIV_PRIVATE_KEY || process.env.GOLEM_PRIVATE_KEY,
    rpcUrl: process.env.ARKIV_RPC_URL || process.env.GOLEM_RPC_URL || 'https://kaolin.hoodi.arkiv.network/rpc',
    wsUrl: process.env.ARKIV_WS_URL || process.env.GOLEM_WS_URL || 'wss://kaolin.hoodi.arkiv.network/rpc/ws'
  }
};

export function validateConfig(): void {
  if (!config.arkiv.rpcUrl) {
    throw new Error('ARKIV_RPC_URL (or GOLEM_RPC_URL) environment variable is required');
  }

  if (!config.arkiv.wsUrl) {
    throw new Error('ARKIV_WS_URL (or GOLEM_WS_URL) environment variable is required');
  }

  if (!config.arkiv.privateKey) {
    console.warn('[config] ARKIV_PRIVATE_KEY is not set – backend will run in read-only mode. Users must sign transactions with MetaMask.');
  }
}
