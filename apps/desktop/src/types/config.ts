/** CraftStudio configuration schema — persisted to ~/.craftstudio/config.json */

export interface CraftStudioConfig {
  solana: {
    cluster: 'devnet' | 'mainnet-beta' | 'custom';
    customRpcUrl?: string;
    usdcMintOverride?: string;
  };

  identity: {
    keypairPath: string;
  };

  daemons: {
    datacraft: { url: string; autoConnect: boolean };
    tunnelcraft: { url: string; autoConnect: boolean };
  };

  node: {
    capabilities: {
      storage: boolean;
      relay: boolean;
      aggregator: boolean;
    };
    storagePath: string;
    maxStorageGB: number;
    bandwidthLimitMbps?: number;
    port: number;
  };

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
  identity: {
    keypairPath: '~/.craftstudio/identity.json',
  },
  daemons: {
    datacraft: { url: 'ws://127.0.0.1:9091', autoConnect: true },
    tunnelcraft: { url: 'ws://127.0.0.1:9092', autoConnect: false },
  },
  node: {
    capabilities: { storage: false, relay: false, aggregator: false },
    storagePath: '~/.craftstudio/storage',
    maxStorageGB: 50,
    port: 4001,
  },
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
