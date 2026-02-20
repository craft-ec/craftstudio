/** CraftStudio configuration schema — persisted to ~/.craftstudio/config.json
 *
 * This is the GLOBAL app config only. It does NOT store instance settings.
 * Each instance persists its own config in {dataDir}/config.json.
 */

export const CONFIG_SCHEMA_VERSION = 2;

/** Instance reference — just enough for CraftStudio to know what exists.
 * All actual settings live in {dataDir}/config.json. */
export interface InstanceRef {
  id: string;
  dataDir: string;
}

export interface CraftStudioConfig {
  schema_version?: number;

  /** Solana settings */
  solana: {
    cluster: 'devnet' | 'mainnet-beta' | 'custom';
    customRpcUrl?: string;
    usdcMintOverride?: string;
  };

  /** References to instances (settings live in each instance's dataDir) */
  instances: InstanceRef[];
  activeInstanceId: string | null;

  /** UI preferences */
  ui: {
    theme: 'dark' | 'light' | 'system';
    notifications: boolean;
    startMinimized: boolean;
    launchOnStartup: boolean;
  };
}

export const DEFAULT_CONFIG: CraftStudioConfig = {
  schema_version: CONFIG_SCHEMA_VERSION,
  solana: { cluster: 'devnet' },
  instances: [],
  activeInstanceId: null,
  ui: {
    theme: 'dark',
    notifications: true,
    startMinimized: false,
    launchOnStartup: false,
  },
};

/** Instance config — the SINGLE source of truth for each instance.
 * Stored at {dataDir}/config.json. Read/written by both CraftStudio and the daemon. */
export interface InstanceConfig {
  schema_version: number;

  // CraftStudio metadata (ignored by daemon)
  id: string;
  name: string;
  dataDir: string;
  autoStart: boolean;

  // Node settings
  capabilities: string[];
  listen_port: number;
  ws_port: number;
  socket_path: string | null;

  // Storage
  storage_path: string;
  max_storage_bytes: number;

  // Identity
  keypair_path: string;

  // Timing
  capability_announce_interval_secs: number;
  reannounce_interval_secs: number;
  reannounce_threshold_secs: number;
  challenger_interval_secs?: number | null;

  // Bandwidth
  bandwidth_limit_mbps?: number | null;

  // Bootstrap peers (multiaddrs of other running instances)
  boot_peers?: string[];

  /** Preserve unknown fields */
  [key: string]: unknown;
}

export const DEFAULT_INSTANCE_CONFIG: InstanceConfig = {
  schema_version: 2,
  id: '',
  name: 'New Node',
  dataDir: '',
  autoStart: true,
  capabilities: ['client'],
  listen_port: 4001,
  ws_port: 9091,
  socket_path: null,
  storage_path: '',
  max_storage_bytes: 10_737_418_240, // 10 GB default
  keypair_path: '',
  capability_announce_interval_secs: 300,
  reannounce_interval_secs: 600,
  reannounce_threshold_secs: 1200,
  challenger_interval_secs: null,
  bandwidth_limit_mbps: null,
};

/** Fields that require daemon restart when changed */
export const RESTART_REQUIRED_FIELDS: (keyof InstanceConfig)[] = [
  'capabilities', 'listen_port', 'ws_port', 'socket_path',
];
