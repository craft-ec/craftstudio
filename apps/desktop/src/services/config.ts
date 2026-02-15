/**
 * Config persistence service.
 * Uses Tauri commands to read/write ~/.craftstudio/config.json via the Rust backend.
 * Falls back to in-memory defaults if Tauri is unavailable (e.g. browser dev mode).
 */

import { invoke } from '@tauri-apps/api/core';
import { CraftStudioConfig, DEFAULT_CONFIG } from '../types/config';

let cached: CraftStudioConfig | null = null;

/** Load config from disk (or return defaults). */
export async function loadConfig(): Promise<CraftStudioConfig> {
  try {
    const raw = await invoke<string>('get_config');
    const parsed = JSON.parse(raw) as Partial<CraftStudioConfig>;
    // Merge with defaults so new fields are filled
    cached = deepMerge(structuredClone(DEFAULT_CONFIG), parsed) as CraftStudioConfig;
    return cached;
  } catch {
    console.warn('[config] Failed to load from backend, using defaults');
    cached = structuredClone(DEFAULT_CONFIG);
    return cached;
  }
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
