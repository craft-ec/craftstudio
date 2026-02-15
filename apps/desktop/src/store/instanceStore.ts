import { create } from "zustand";
import { createClient, getClient, destroyClient } from "../services/daemon";
import type { DaemonClient } from "../services/daemon";

export interface DaemonInstance {
  id: string;
  name: string;
  url: string;
  autoStart: boolean;
  capabilities: { client: boolean; storage: boolean; aggregator: boolean };
}

interface InstanceState {
  instances: DaemonInstance[];
  activeId: string | null;
  connectionStatus: Record<string, "connected" | "disconnected" | "connecting">;

  addInstance: (instance: DaemonInstance) => void;
  removeInstance: (id: string) => void;
  setActive: (id: string | null) => void;
  updateInstance: (id: string, patch: Partial<DaemonInstance>) => void;
  initClient: (id: string) => void;
  getActiveClient: () => DaemonClient | undefined;
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
  },

  setActive: (id) => set({ activeId: id }),

  updateInstance: (id, patch) => {
    set((s) => ({
      instances: s.instances.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    }));
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
}));
