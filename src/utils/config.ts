interface GolemConfig {
  chainId: string;
  privateKey?: string;
  rpcUrl: string;
  wsUrl: string;
}

interface AppConfig {
  port: number | string;
  golem: GolemConfig;
}

export const config: AppConfig = {
  port: process.env.PORT || 3000,
  golem: {
    chainId: process.env.GOLEM_CHAIN_ID || '60138453025',
    privateKey: process.env.GOLEM_PRIVATE_KEY,
    rpcUrl: process.env.GOLEM_RPC_URL || 'https://kaolin.holesky.golemdb.io/rpc',
    wsUrl: process.env.GOLEM_WS_URL || 'wss://kaolin.holesky.golemdb.io/rpc/ws'
  }
};

export function validateConfig(): void {
  if (!config.golem.rpcUrl) {
    throw new Error('GOLEM_RPC_URL environment variable is required');
  }

  if (!config.golem.wsUrl) {
    throw new Error('GOLEM_WS_URL environment variable is required');
  }

  if (!config.golem.privateKey) {
    console.warn('[config] GOLEM_PRIVATE_KEY is not set – backend will run in read-only mode. Users must sign transactions with MetaMask.');
  }
}
