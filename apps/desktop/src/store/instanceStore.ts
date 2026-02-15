import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { createClient, getClient, destroyClient } from "../services/daemon";
import type { DaemonClient } from "../services/daemon";
import type { InstanceConfig, InstanceRef } from "../types/config";
import { RESTART_REQUIRED_FIELDS } from "../types/config";
import { readInstanceConfig, writeInstanceConfig } from "../services/config";
import { useConfigStore } from "./configStore";

function formatBytes(b: number): string {
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`;
  if (b >= 1e3) return `${(b / 1e3).toFixed(1)} KB`;
  return `${b} B`;
}

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
  apiKeys: Record<string, string>;

  addInstance: (instance: InstanceConfig, opts?: { apiKey?: string }) => void;
  logActivity: (id: string, message: string, level?: ActivityEvent["level"]) => void;
  removeInstance: (id: string) => void;
  setActive: (id: string | null) => void;
  updateInstance: (id: string, patch: Partial<InstanceConfig>) => void;
  restartInstance: (id: string) => Promise<void>;
  initClient: (id: string) => void;
  getActiveClient: () => DaemonClient | undefined;
  loadFromConfig: () => Promise<void>;
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

    // Write instance config to {dataDir}/config.json
    if (instance.dataDir) {
      writeInstanceConfig(instance.dataDir, instance).catch((e) =>
        console.error("[instanceStore] Failed to write instance config:", e)
      );
    }

    // Create and init client
    get().initClient(instance.id);
    // Persist global config (just the ref)
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
    const needsRestart = RESTART_REQUIRED_FIELDS.some((f) => f in patch);

    set((s) => ({
      instances: s.instances.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    }));

    // Write full updated config to {dataDir}/config.json
    const instance = get().instances.find((i) => i.id === id);
    if (instance?.dataDir) {
      writeInstanceConfig(instance.dataDir, instance).catch((e) =>
        console.error("[instanceStore] Failed to write instance config:", e)
      );

      // Push via WS if connected and hot-reloadable
      if (!needsRestart) {
        const client = getClient(id);
        if (client?.connected) {
          client.setDaemonConfig(patch).catch(console.error);
        }
      }
    }

    // Restart daemon if required fields changed
    if (needsRestart) {
      get().restartInstance(id);
    }

    // NO writes to global config for instance settings
  },

  restartInstance: async (id) => {
    const { logActivity } = get();
    const instance = get().instances.find((i) => i.id === id);
    if (!instance) return;

    logActivity(id, "Restarting daemon...", "info");

    // Destroy the WS client first
    destroyClient(id);

    // Config is already on disk — daemon will read it on start
    try {
      const running = await invoke<Array<{ pid: number; ws_port: number }>>("list_datacraft_daemons");
      const match = running.find((d) => d.ws_port === instance.ws_port);
      if (match) {
        await invoke("stop_datacraft_daemon", { pid: match.pid });
        logActivity(id, "Daemon stopped", "info");
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (e) {
      logActivity(id, `Stop failed: ${e}`, "warn");
    }

    try {
      await invoke("start_datacraft_daemon", {
        config: {
          data_dir: instance.dataDir,
          socket_path: instance.socket_path,
          ws_port: instance.ws_port,
          listen_addr: null,
          binary_path: null,
          capabilities: instance.capabilities,
        },
      });
      logActivity(id, "Daemon restarted", "success");
    } catch (e) {
      logActivity(id, `Restart failed: ${e}`, "error");
    }

    // Reconnect WS client
    get().initClient(id);
  },

  initClient: (id) => {
    const instance = get().instances.find((i) => i.id === id);
    if (!instance) return;

    const { logActivity } = get();
    const wsUrl = `ws://127.0.0.1:${instance.ws_port}/ws`;
    const apiKey = get().apiKeys[id];

    logActivity(id, `Connecting to daemon at ws://127.0.0.1:${instance.ws_port}...`);

    set((s) => ({
      connectionStatus: { ...s.connectionStatus, [id]: "connecting" },
    }));

    const client = createClient(id, wsUrl);
    client.onConnection((connected) => {
      if (connected) {
        logActivity(id, "WebSocket connected — daemon online", "success");
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

    client.start(instance.dataDir, apiKey);
  },

  getActiveClient: () => {
    const { activeId } = get();
    if (!activeId) return undefined;
    return getClient(activeId);
  },

  /** Load instances from persisted config */
  loadFromConfig: async () => {
    const config = useConfigStore.getState().config;
    const refs: InstanceRef[] = config.instances;

    if (refs.length === 0) return;

    // Read each instance's config from its own {dataDir}/config.json
    const loaded: InstanceConfig[] = [];
    for (const ref of refs) {
      try {
        const instanceCfg = await readInstanceConfig(ref.dataDir);
        // Ensure id and dataDir match the ref
        instanceCfg.id = ref.id;
        instanceCfg.dataDir = ref.dataDir;
        loaded.push(instanceCfg);
      } catch {
        // Skip instances whose config can't be read
        console.warn(`[instanceStore] Failed to load instance ${ref.id} from ${ref.dataDir}`);
      }
    }

    set({
      instances: loaded,
      activeId: config.activeInstanceId ?? loaded[0]?.id ?? null,
    });

    // Start daemons and connect
    for (const inst of loaded) {
      if (inst.autoStart && inst.dataDir) {
        invoke<{ pid: number; ws_port: number; data_dir: string }>("start_datacraft_daemon", {
          config: {
            data_dir: inst.dataDir,
            socket_path: inst.socket_path,
            ws_port: inst.ws_port,
            listen_addr: null,
            binary_path: null,
            capabilities: inst.capabilities,
          },
        }).then(() => {
          get().logActivity(inst.id, "Daemon auto-started", "success");
        }).catch((e) => {
          const msg = String(e);
          if (!msg.includes("already running") && !msg.includes("already in use")) {
            get().logActivity(inst.id, `Auto-start failed: ${msg}`, "warn");
          }
        }).finally(() => {
          get().initClient(inst.id);
        });
      } else {
        get().initClient(inst.id);
      }
    }
  },

  /** Persist global config — only instance refs, not full configs */
  persistToConfig: () => {
    const { instances, activeId } = get();
    const refs: InstanceRef[] = instances.map((i) => ({ id: i.id, dataDir: i.dataDir }));
    useConfigStore.getState().update({
      instances: refs,
      activeInstanceId: activeId,
    });
  },
}));
