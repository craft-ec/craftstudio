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
import type { InstanceConfig, DaemonConfig } from "../types/config";
import { DEFAULT_DAEMON_CONFIG, capabilitiesToArray } from "../types/config";
import { writeDaemonConfig, readDaemonConfig } from "../services/config";
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

/** Build a DaemonConfig from an InstanceConfig */
function buildDaemonConfig(instance: InstanceConfig, existing?: Partial<DaemonConfig>): DaemonConfig {
  const caps = capabilitiesToArray(instance.capabilities);
  const port = parseInt(instance.url.match(/:(\d+)/)?.[1] ?? "9091");
  return {
    ...structuredClone(DEFAULT_DAEMON_CONFIG),
    // Preserve existing timing settings if available
    ...(existing ?? {}),
    // Always override these from CraftStudio (source of truth for user intent)
    capabilities: caps,
    ws_port: port,
    listen_port: instance.port,
    max_storage_bytes: instance.maxStorageGB * 1e9,
    schema_version: 2,
  };
}

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

    // Write daemon config to the instance's data dir
    if (instance.dataDir) {
      const daemonCfg = buildDaemonConfig(instance);
      writeDaemonConfig(instance.dataDir, daemonCfg).catch((e) =>
        console.error("[instanceStore] Failed to write daemon config:", e)
      );
    }

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
    const hadRestartField = hadCapabilityChange || patch.port !== undefined || patch.url !== undefined;

    set((s) => ({
      instances: s.instances.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    }));
    get().persistToConfig();

    // Update daemon config file
    const instance = get().instances.find((i) => i.id === id);
    if (instance?.dataDir) {
      // Read existing daemon config, merge our changes, write back
      readDaemonConfig(instance.dataDir).then((existing) => {
        const updated = buildDaemonConfig(instance, existing);
        return writeDaemonConfig(instance.dataDir, updated);
      }).catch((e) => console.error("[instanceStore] Failed to update daemon config:", e));

      // If daemon is running and it's a hot-reloadable change, push via WS
      const client = getClient(id);
      if (client?.connected && !hadRestartField) {
        // Hot-reload timing changes etc. via set-config
        const daemonPatch: Record<string, unknown> = {};
        if (patch.maxStorageGB !== undefined) daemonPatch.max_storage_bytes = patch.maxStorageGB * 1e9;
        if (Object.keys(daemonPatch).length > 0) {
          client.setDaemonConfig(daemonPatch as Partial<DaemonConfig>).catch(console.error);
        }
      }
    }

    // Restart daemon if capabilities or network settings changed
    if (hadRestartField) {
      get().restartInstance(id);
    }
  },

  restartInstance: async (id) => {
    const { logActivity } = get();
    const instance = get().instances.find((i) => i.id === id);
    if (!instance) return;

    logActivity(id, "Restarting daemon...", "info");

    // Destroy the WS client first
    destroyClient(id);

    // Reload daemon config from disk before restarting
    let daemonCfg: DaemonConfig | undefined;
    if (instance.dataDir) {
      try {
        const existing = await readDaemonConfig(instance.dataDir);
        daemonCfg = buildDaemonConfig(instance, existing);
        await writeDaemonConfig(instance.dataDir, daemonCfg);
      } catch (e) {
        logActivity(id, `Config reload failed: ${e}`, "warn");
      }
    }

    // List running daemons, find the one on this instance's port
    const port = parseInt(instance.url.match(/:(\d+)/)?.[1] ?? "9091");
    try {
      const running = await invoke<Array<{ pid: number; ws_port: number }>>("list_datacraft_daemons");
      const match = running.find((d) => d.ws_port === port);
      if (match) {
        await invoke("stop_datacraft_daemon", { pid: match.pid });
        logActivity(id, "Daemon stopped", "info");
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (e) {
      logActivity(id, `Stop failed: ${e}`, "warn");
    }

    // Re-start — capabilities are in the daemon config file now, no env var needed
    const caps = capabilitiesToArray(instance.capabilities);
    try {
      await invoke("start_datacraft_daemon", {
        config: {
          data_dir: instance.dataDir,
          socket_path: null,
          ws_port: port,
          listen_addr: null,
          binary_path: null,
          capabilities: caps,
        },
      });
      logActivity(id, "Daemon restarted", "success");
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
          const caps = capabilitiesToArray(inst.capabilities);
          const port = inst.url.match(/:(\d+)/)?.[1];
          invoke<{ pid: number; ws_port: number; data_dir: string }>("start_datacraft_daemon", {
            config: {
              data_dir: inst.dataDir,
              socket_path: null,
              ws_port: port ? parseInt(port) : null,
              listen_addr: null,
              binary_path: null,
              capabilities: caps,
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
