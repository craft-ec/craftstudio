import { InstanceConfig, DEFAULT_INSTANCE_CONFIG } from "../types/config";
import { generateId } from "../store/instanceStore";

/**
 * Create a new InstanceConfig. All paths derive from dataDir.
 * This is the SINGLE config file written to {dataDir}/config.json.
 */
export function makeInstanceConfig(
  overrides: {
    name: string;
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

  return {
    ...structuredClone(DEFAULT_INSTANCE_CONFIG),
    id,
    name: overrides.name,
    dataDir,
    autoStart: overrides.autoStart,
    capabilities: overrides.capabilities ?? ['client'],
    listen_port: overrides.listen_port ?? DEFAULT_INSTANCE_CONFIG.listen_port,
    ws_port: overrides.ws_port ?? DEFAULT_INSTANCE_CONFIG.ws_port,
    storage_path: `${dataDir}/storage`,
    keypair_path: `${dataDir}/identity.json`,
  };
}
