import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

function formatBytes(b: number): string {
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`;
  if (b >= 1e3) return `${(b / 1e3).toFixed(1)} KB`;
  return `${b} B`;
}
import { createClient, getClient, destroyClient } from "../services/daemon";
import type { DaemonClient } from "../services/daemon";
import type { InstanceConfig } from "../types/config";
import { useConfigStore } from "./configStore";

export interface ActivityEvent {
  time: number;
  message: string;
  level: "info" | "success" | "error" | "warn";
}

interface InstanceState {
  instances: InstanceConfig[];
  activeId: string | null;
  connectionStatus: Record<string, "connected" | "disconnected" | "connecting">;
  activityLog: Record<string, ActivityEvent[]>;
  dataDirs: Record<string, string>;
  apiKeys: Record<string, string>;

  addInstance: (instance: InstanceConfig, opts?: { apiKey?: string }) => void;
  logActivity: (id: string, message: string, level?: ActivityEvent["level"]) => void;
  removeInstance: (id: string) => void;
  setActive: (id: string | null) => void;
  updateInstance: (id: string, patch: Partial<InstanceConfig>) => void;
  restartInstance: (id: string) => Promise<void>;
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
  activityLog: {},
  dataDirs: {},
  apiKeys: {},

  logActivity: (id, message, level = "info") => {
    set((s) => ({
      activityLog: {
        ...s.activityLog,
        [id]: [...(s.activityLog[id] || []), { time: Date.now(), message, level }].slice(-50),
      },
    }));
  },

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
    const hadCapabilityChange = patch.capabilities !== undefined;
    set((s) => ({
      instances: s.instances.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    }));
    get().persistToConfig();
    // Restart daemon if capabilities changed (daemon reads them only at startup)
    if (hadCapabilityChange) {
      get().restartInstance(id);
    }
  },

  restartInstance: async (id) => {
    const { logActivity } = get();
    // Find running daemon by listing all and matching ws_port
    const instance = get().instances.find((i) => i.id === id);
    if (!instance) return;

    logActivity(id, "Restarting daemon for capability change...", "info");

    // Destroy the WS client first
    destroyClient(id);

    // List running daemons, find the one on this instance's port
    try {
      const running = await invoke<Array<{ pid: number; ws_port: number }>>("list_datacraft_daemons");
      const port = parseInt(instance.url.match(/:(\d+)/)?.[1] ?? "9091");
      const match = running.find((d) => d.ws_port === port);
      if (match) {
        await invoke("stop_datacraft_daemon", { pid: match.pid });
        logActivity(id, "Daemon stopped", "info");
        // Small delay to let port free up
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (e) {
      logActivity(id, `Stop failed: ${e}`, "warn");
    }

    // Re-start with updated capabilities
    const caps = [];
    if (instance.capabilities?.client) caps.push("client");
    if (instance.capabilities?.storage) caps.push("storage");
    if (instance.capabilities?.aggregator) caps.push("aggregator");
    const port = instance.url.match(/:(\d+)/)?.[1];

    try {
      await invoke("start_datacraft_daemon", {
        config: {
          data_dir: instance.dataDir,
          socket_path: null,
          ws_port: port ? parseInt(port) : null,
          listen_addr: null,
          binary_path: null,
          capabilities: caps.length > 0 ? caps : ["client"],
        },
      });
      logActivity(id, "Daemon restarted with new capabilities", "success");
    } catch (e) {
      logActivity(id, `Restart failed: ${e}`, "error");
    }

    // Reconnect WS client
    get().initClient(id);
  },

  setDataDir: (id, dataDir) => {
    set((s) => ({
      dataDirs: { ...s.dataDirs, [id]: dataDir },
    }));
  },

  initClient: (id) => {
    const instance = get().instances.find((i) => i.id === id);
    if (!instance) return;

    const { logActivity } = get();
    const dataDir = instance.dataDir || get().dataDirs[id];
    const apiKey = get().apiKeys[id];

    logActivity(id, `Connecting to daemon at ${instance.url}...`);

    set((s) => ({
      connectionStatus: { ...s.connectionStatus, [id]: "connecting" },
    }));

    const client = createClient(id, `${instance.url}/ws`);
    client.onConnection((connected) => {
      if (connected) {
        logActivity(id, "WebSocket connected — daemon online", "success");
        // Try to fetch status for more info
        client.status().then((s) => {
          if (s) {
            logActivity(id, `Node has ${s.content_count} content items, ${s.shard_count} shards (${formatBytes(s.stored_bytes)})`, "info");
          }
        }).catch(() => {});
        client.listPeers().then((peers) => {
          if (peers) {
            const count = Object.keys(peers).length;
            const storage = Object.values(peers).filter(p => p.capabilities.includes("Storage")).length;
            if (count > 0) {
              logActivity(id, `Connected to ${count} peers (${storage} storage nodes)`, "success");
            } else {
              logActivity(id, "No peers found yet — DHT discovery in progress", "warn");
            }
          }
        }).catch(() => {});
        // Log daemon capabilities (informational only — config is the source of truth)
        client.call<{ capabilities?: string[] }>("node.capabilities").then((res) => {
          if (res?.capabilities) {
            logActivity(id, `Daemon capabilities: ${res.capabilities.join(", ")}`, "info");
          }
        }).catch(() => {});
      } else {
        logActivity(id, "Disconnected from daemon", "error");
      }
      set((s) => ({
        connectionStatus: {
          ...s.connectionStatus,
          [id]: connected ? "connected" : "disconnected",
        },
      }));
    });

    if (dataDir) {
      logActivity(id, `Loading API key from ${dataDir}`);
    }
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
      // Auto-start daemons and init clients for all instances
      for (const inst of config.instances) {
        if (inst.autoStart && inst.dataDir) {
          // Try to start the daemon process; if already running, this is a no-op
          const caps = [];
          if (inst.capabilities?.client) caps.push("client");
          if (inst.capabilities?.storage) caps.push("storage");
          if (inst.capabilities?.aggregator) caps.push("aggregator");
          const port = inst.url.match(/:(\d+)/)?.[1];
          invoke<{ pid: number; ws_port: number; data_dir: string }>("start_datacraft_daemon", {
            config: {
              data_dir: inst.dataDir,
              socket_path: null,
              ws_port: port ? parseInt(port) : null,
              listen_addr: null,
              binary_path: null,
              capabilities: caps.length > 0 ? caps : ["client"],
            },
          }).then(() => {
            get().logActivity(inst.id, "Daemon auto-started", "success");
          }).catch((e) => {
            // Already running or binary not found — either way, try connecting
            const msg = String(e);
            if (!msg.includes("already running")) {
              get().logActivity(inst.id, `Auto-start failed: ${msg}`, "warn");
            }
          }).finally(() => {
            get().initClient(inst.id);
          });
        } else {
          get().initClient(inst.id);
        }
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
