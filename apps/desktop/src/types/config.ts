/** CraftStudio configuration schema — persisted to ~/.craftstudio/config.json */

/** Current CraftStudio config schema version */
export const CONFIG_SCHEMA_VERSION = 1;

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
  /** Schema version for migration */
  schema_version?: number;

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
  schema_version: CONFIG_SCHEMA_VERSION,
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

/** Daemon runtime config — stored in {data_dir}/config.json.
 * CraftStudio writes this; daemon reads it on startup.
 * Also exposed via get-config/set-config WS commands at runtime.
 */
export interface DaemonConfig {
  schema_version: number;
  capabilities: string[];
  listen_port: number;
  ws_port: number;
  socket_path: string | null;
  capability_announce_interval_secs: number;
  reannounce_interval_secs: number;
  reannounce_threshold_secs: number;
  challenger_interval_secs?: number | null;
  max_storage_bytes: number;
  /** Any unknown fields — preserved for forward compat */
  [key: string]: unknown;
}

/** Default daemon config */
export const DEFAULT_DAEMON_CONFIG: DaemonConfig = {
  schema_version: 2,
  capabilities: ['client', 'storage'],
  listen_port: 0,
  ws_port: 9091,
  socket_path: null,
  capability_announce_interval_secs: 300,
  reannounce_interval_secs: 600,
  reannounce_threshold_secs: 1200,
  challenger_interval_secs: null,
  max_storage_bytes: 0,
};

/** Fields that require daemon restart when changed */
export const RESTART_REQUIRED_FIELDS: (keyof DaemonConfig)[] = [
  'capabilities', 'listen_port', 'ws_port', 'socket_path',
];

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

/** Convert InstanceConfig capabilities to daemon config capabilities array */
export function capabilitiesToArray(caps: InstanceConfig['capabilities']): string[] {
  const result: string[] = [];
  if (caps.client) result.push('client');
  if (caps.storage) result.push('storage');
  if (caps.aggregator) result.push('aggregator');
  return result.length > 0 ? result : ['client'];
}
