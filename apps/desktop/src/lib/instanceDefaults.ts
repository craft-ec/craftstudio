import { InstanceConfig, DEFAULT_INSTANCE_CONFIG } from "../types/config";
import { generateId } from "../store/instanceStore";

/**
 * Create a new InstanceConfig. All paths derive from dataDir.
 * This is the SINGLE config file written to {dataDir}/config.json.
 */
/**
 * Derive a human-friendly name from a data directory path.
 * "/tmp/datacraft-node-12" → "datacraft-node-12"
 * "/Users/me/.datacraft" → ".datacraft"
 */
function nameFromDir(dir: string): string {
  const parts = dir.replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || dir;
}

export function makeInstanceConfig(
  overrides: {
    name?: string;
    autoStart: boolean;
    dataDir?: string;
    ws_port?: number;
    listen_port?: number;
    capabilities?: string[];
  }
): InstanceConfig {
  const id = generateId();
  const shortId = id.slice(0, 8);
  const dataDir = overrides.dataDir ?? `~/.datacraft/nodes/${shortId}`;
  // Name: use explicit name, or derive from directory, or fallback to short id
  const name = overrides.name || nameFromDir(dataDir);

  return {
    ...structuredClone(DEFAULT_INSTANCE_CONFIG),
    id,
    name,
    dataDir,
    autoStart: overrides.autoStart,
    capabilities: overrides.capabilities ?? ['client'],
    listen_port: overrides.listen_port ?? DEFAULT_INSTANCE_CONFIG.listen_port,
    ws_port: overrides.ws_port ?? DEFAULT_INSTANCE_CONFIG.ws_port,
    socket_path: `${dataDir}/daemon.sock`,
    storage_path: `${dataDir}/storage`,
    keypair_path: `${dataDir}/identity.json`,
  };
}
