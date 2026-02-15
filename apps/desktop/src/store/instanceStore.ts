import { create } from "zustand";
import { createClient, getClient, destroyClient } from "../services/daemon";
import type { DaemonClient } from "../services/daemon";
import type { InstanceConfig } from "../types/config";
import { useConfigStore } from "./configStore";

interface InstanceState {
  instances: InstanceConfig[];
  activeId: string | null;
  connectionStatus: Record<string, "connected" | "disconnected" | "connecting">;
  dataDirs: Record<string, string>;
  apiKeys: Record<string, string>;

  addInstance: (instance: InstanceConfig, opts?: { apiKey?: string }) => void;
  removeInstance: (id: string) => void;
  setActive: (id: string | null) => void;
  updateInstance: (id: string, patch: Partial<InstanceConfig>) => void;
  setDataDir: (id: string, dataDir: string) => void;
  initClient: (id: string) => void;
  getActiveClient: () => DaemonClient | undefined;
  loadFromConfig: () => void;
  persistToConfig: () => void;
}

function generateId(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10);
}

export { generateId };

export const useInstanceStore = create<InstanceState>((set, get) => ({
  instances: [],
  activeId: null,
  connectionStatus: {},
  dataDirs: {},
  apiKeys: {},

  addInstance: (instance, opts?) => {
    const { apiKey } = opts ?? {};
    set((s) => ({
      instances: [...s.instances, instance],
      activeId: instance.id,
      ...(apiKey ? { apiKeys: { ...s.apiKeys, [instance.id]: apiKey } } : {}),
    }));
    // Create and init client
    get().initClient(instance.id);
    // Persist to config
    get().persistToConfig();
  },

  removeInstance: (id) => {
    destroyClient(id);
    set((s) => {
      const instances = s.instances.filter((i) => i.id !== id);
      const status = { ...s.connectionStatus };
      delete status[id];
      const dirs = { ...s.dataDirs };
      delete dirs[id];
      return {
        instances,
        activeId: s.activeId === id ? (instances[0]?.id ?? null) : s.activeId,
        connectionStatus: status,
        dataDirs: dirs,
      };
    });
    get().persistToConfig();
  },

  setActive: (id) => {
    set({ activeId: id });
    get().persistToConfig();
  },

  updateInstance: (id, patch) => {
    set((s) => ({
      instances: s.instances.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    }));
    get().persistToConfig();
  },

  setDataDir: (id, dataDir) => {
    set((s) => ({
      dataDirs: { ...s.dataDirs, [id]: dataDir },
    }));
  },

  initClient: (id) => {
    const instance = get().instances.find((i) => i.id === id);
    if (!instance) return;

    // dataDir from persisted config (primary) or runtime override
    const dataDir = instance.dataDir || get().dataDirs[id];
    const apiKey = get().apiKeys[id];

    set((s) => ({
      connectionStatus: { ...s.connectionStatus, [id]: "connecting" },
    }));

    const client = createClient(id, `${instance.url}/ws`);
    client.onConnection((connected) => {
      set((s) => ({
        connectionStatus: {
          ...s.connectionStatus,
          [id]: connected ? "connected" : "disconnected",
        },
      }));
    });
    client.start(dataDir, apiKey);
  },

  getActiveClient: () => {
    const { activeId } = get();
    if (!activeId) return undefined;
    return getClient(activeId);
  },

  /** Load instances from persisted config */
  loadFromConfig: () => {
    const config = useConfigStore.getState().config;
    if (config.instances.length > 0) {
      set({
        instances: config.instances,
        activeId: config.activeInstanceId ?? config.instances[0]?.id ?? null,
      });
      // Init clients for all instances
      for (const inst of config.instances) {
        get().initClient(inst.id);
      }
    }
  },

  /** Persist current instances to config file */
  persistToConfig: () => {
    const { instances, activeId } = get();
    useConfigStore.getState().update({
      instances,
      activeInstanceId: activeId,
    });
  },
}));
