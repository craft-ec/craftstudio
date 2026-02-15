import { create } from 'zustand';
import { CraftStudioConfig, DEFAULT_CONFIG } from '../types/config';
import { loadConfig, saveConfig } from '../services/config';

interface ConfigStore {
  config: CraftStudioConfig;
  loaded: boolean;
  saving: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<CraftStudioConfig>) => Promise<void>;
  updateSection: <K extends keyof CraftStudioConfig>(
    section: K,
    patch: Partial<CraftStudioConfig[K]>,
  ) => Promise<void>;
  reset: () => Promise<void>;
}

export const useConfigStore = create<ConfigStore>((set, get) => ({
  config: structuredClone(DEFAULT_CONFIG),
  loaded: false,
  saving: false,

  load: async () => {
    const config = await loadConfig();
    set({ config, loaded: true });
  },

  update: async (patch) => {
    const current = get().config;
    const next = { ...current, ...patch };
    set({ config: next, saving: true });
    await saveConfig(next);
    set({ saving: false });
  },

  updateSection: async (section, patch) => {
    const current = get().config;
    const next = {
      ...current,
      [section]: { ...current[section], ...patch },
    };
    set({ config: next, saving: true });
    await saveConfig(next);
    set({ saving: false });
  },

  reset: async () => {
    const defaults = structuredClone(DEFAULT_CONFIG);
    set({ config: defaults, saving: true });
    await saveConfig(defaults);
    set({ saving: false });
  },
}));
