import { DEFAULT_INSTANCE, InstanceConfig } from "../types/config";
import { generateId } from "../store/instanceStore";

/**
 * Create a new InstanceConfig. All paths derive from dataDir.
 * If dataDir not provided, generates a unique one under ~/.datacraft/nodes/.
 */
export function makeInstanceConfig(
  overrides: {
    name: string;
    url: string;
    autoStart: boolean;
    dataDir?: string;
  }
): InstanceConfig {
  const id = generateId();
  const shortId = id.slice(0, 8);
  const dataDir = overrides.dataDir ?? `~/.datacraft/nodes/${shortId}`;

  return {
    id,
    ...DEFAULT_INSTANCE,
    dataDir,
    keypairPath: `${dataDir}/identity.json`,
    storagePath: `${dataDir}/storage`,
    port: DEFAULT_INSTANCE.port,
    ...overrides,
  };
}
