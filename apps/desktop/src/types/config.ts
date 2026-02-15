/** CraftStudio configuration schema — persisted to ~/.craftstudio/config.json */

/** Per-instance configuration — each daemon tab has its own identity, storage, network settings */
export interface InstanceConfig {
  id: string;
  name: string;
  url: string;             // WebSocket URL for daemon connection
  autoStart: boolean;      // Auto-start daemon when tab opens

  // Daemon data directory (where api_key, chunks, manifests live)
  dataDir: string;

  // Identity — each instance has its own keypair
  keypairPath: string;

  // Node settings
  capabilities: {
    client: boolean;
    storage: boolean;
    aggregator: boolean;
  };
  storagePath: string;
  maxStorageGB: number;
  bandwidthLimitMbps?: number;
  port: number;            // libp2p listen port

}

/** Default values for a new instance — used when creating instances */
export const DEFAULT_INSTANCE: Omit<InstanceConfig, 'id' | 'name'> = {
  url: 'ws://127.0.0.1:9091',
  autoStart: true,
  dataDir: '~/.datacraft',
  keypairPath: '~/.craftstudio/identity.json',
  capabilities: { client: true, storage: false, aggregator: false },
  storagePath: '~/.craftstudio/storage',
  maxStorageGB: 50,
  port: 4001,
};

export interface CraftStudioConfig {
  /** Global Solana settings — shared across all instances */
  solana: {
    cluster: 'devnet' | 'mainnet-beta' | 'custom';
    customRpcUrl?: string;
    usdcMintOverride?: string;
  };

  /** Per-instance configs */
  instances: InstanceConfig[];
  activeInstanceId: string | null;

  /** UI preferences — global */
  ui: {
    theme: 'dark' | 'light' | 'system';
    notifications: boolean;
    startMinimized: boolean;
    launchOnStartup: boolean;
  };
}

export const DEFAULT_CONFIG: CraftStudioConfig = {
  solana: {
    cluster: 'devnet',
  },
  instances: [],
  activeInstanceId: null,
  ui: {
    theme: 'dark',
    notifications: true,
    startMinimized: false,
    launchOnStartup: false,
  },
};

/** Deep merge b into a (b wins) */
export function mergeConfig(
  base: CraftStudioConfig,
  partial: Partial<CraftStudioConfig>,
): CraftStudioConfig {
  const result = structuredClone(base);
  for (const key of Object.keys(partial) as (keyof CraftStudioConfig)[]) {
    const val = partial[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (result as any)[key] = {
        ...(result[key] as Record<string, unknown>),
        ...(val as Record<string, unknown>),
      };
    } else if (val !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (result as any)[key] = val;
    }
  }
  return result;
}
