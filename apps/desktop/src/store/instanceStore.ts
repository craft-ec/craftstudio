import { create } from "zustand";
import { createClient, getClient, destroyClient } from "../services/daemon";
import type { DaemonClient } from "../services/daemon";
import type { InstanceConfig } from "../types/config";
import { useConfigStore } from "./configStore";

interface InstanceState {
  instances: InstanceConfig[];
  activeId: string | null;
  connectionStatus: Record<string, "connected" | "disconnected" | "connecting">;

  addInstance: (instance: InstanceConfig) => void;
  removeInstance: (id: string) => void;
  setActive: (id: string | null) => void;
  updateInstance: (id: string, patch: Partial<InstanceConfig>) => void;
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

  addInstance: (instance) => {
    set((s) => ({
      instances: [...s.instances, instance],
      activeId: instance.id,
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
      return {
        instances,
        activeId: s.activeId === id ? (instances[0]?.id ?? null) : s.activeId,
        connectionStatus: status,
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

  initClient: (id) => {
    const instance = get().instances.find((i) => i.id === id);
    if (!instance) return;

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
    client.start();
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
