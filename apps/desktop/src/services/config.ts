/**
 * Config persistence service.
 * Uses Tauri commands to read/write config files via the Rust backend.
 * Falls back to in-memory defaults if Tauri is unavailable (e.g. browser dev mode).
 */

import { invoke } from '@tauri-apps/api/core';
import { CraftStudioConfig, DEFAULT_CONFIG, InstanceConfig, DEFAULT_INSTANCE_CONFIG, CONFIG_SCHEMA_VERSION } from '../types/config';

let cached: CraftStudioConfig | null = null;

/** Load CraftStudio config from disk (or return defaults). */
export async function loadConfig(): Promise<CraftStudioConfig> {
  try {
    const raw = await invoke<string>('get_config');
    const parsed = JSON.parse(raw) as Partial<CraftStudioConfig>;
    // Merge with defaults so new fields are filled (backward compat)
    cached = deepMerge(structuredClone(DEFAULT_CONFIG), parsed) as CraftStudioConfig;
    // Run schema migration
    cached = migrateConfig(cached);
    return cached;
  } catch {
    console.warn('[config] Failed to load from backend, using defaults');
    cached = structuredClone(DEFAULT_CONFIG);
    return cached;
  }
}

/** Migrate config from older schema versions */
function migrateConfig(config: CraftStudioConfig): CraftStudioConfig {
  const version = config.schema_version ?? 0;
  if (version < CONFIG_SCHEMA_VERSION) {
    // v0 → v1: add schema_version
    config.schema_version = CONFIG_SCHEMA_VERSION;
    console.log(`[config] Migrated CraftStudio config from v${version} to v${CONFIG_SCHEMA_VERSION}`);
  }
  return config;
}

/** Save config to disk. */
export async function saveConfig(config: CraftStudioConfig): Promise<void> {
  cached = config;
  try {
    await invoke('save_config', { config: JSON.stringify(config) });
  } catch (err) {
    console.error('[config] Failed to save:', err);
  }
}

/** Get cached config (call loadConfig first). */
export function getConfig(): CraftStudioConfig {
  return cached ?? structuredClone(DEFAULT_CONFIG);
}

/** Get default config */
export async function getDefaultConfig(): Promise<CraftStudioConfig> {
  try {
    const raw = await invoke<string>('get_default_config');
    return JSON.parse(raw) as CraftStudioConfig;
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
}

// ── Daemon Config (per data dir) ────────────────────────────

/** Read instance config from a data directory via Tauri backend. */
export async function readInstanceConfig(dataDir: string): Promise<InstanceConfig> {
  try {
    const raw = await invoke<string>('read_daemon_config', { dataDir });
    const parsed = JSON.parse(raw) as Partial<InstanceConfig>;
    return { ...structuredClone(DEFAULT_INSTANCE_CONFIG), ...parsed };
  } catch (err) {
    console.warn('[config] Failed to read instance config from', dataDir, err);
    return structuredClone(DEFAULT_INSTANCE_CONFIG);
  }
}

/** Write instance config to a data directory via Tauri backend. */
export async function writeInstanceConfig(dataDir: string, config: InstanceConfig): Promise<void> {
  try {
    await invoke('write_daemon_config', { dataDir, config: JSON.stringify(config) });
  } catch (err) {
    console.error('[config] Failed to write instance config to', dataDir, err);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepMerge(target: any, source: any): any {
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object'
    ) {
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}
