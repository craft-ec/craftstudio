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

/** Sync instance UI state FROM daemon config file (daemon config is source of truth) */
async function syncInstanceFromDaemonConfig(instance: InstanceConfig): Promise<Partial<InstanceConfig> | null> {
  if (!instance.dataDir) return null;
  try {
    const daemonCfg = await readDaemonConfig(instance.dataDir);
    const patch: Partial<InstanceConfig> = {};
    // Sync capabilities
    const caps = {
      client: daemonCfg.capabilities.includes('client'),
      storage: daemonCfg.capabilities.includes('storage'),
      aggregator: daemonCfg.capabilities.includes('aggregator'),
    };
    if (JSON.stringify(caps) !== JSON.stringify(instance.capabilities)) {
      patch.capabilities = caps;
    }
    // Sync listen port
    if (daemonCfg.listen_port && daemonCfg.listen_port !== instance.port) {
      patch.port = daemonCfg.listen_port;
    }
    // Sync max storage
    const maxGB = Math.round(daemonCfg.max_storage_bytes / 1e9);
    if (maxGB > 0 && maxGB !== instance.maxStorageGB) {
      patch.maxStorageGB = maxGB;
    }
    // Sync ws_port into URL if different
    if (daemonCfg.ws_port) {
      const expectedUrl = `ws://127.0.0.1:${daemonCfg.ws_port}`;
      if (instance.url !== expectedUrl) {
        patch.url = expectedUrl;
      }
    }
    return Object.keys(patch).length > 0 ? patch : null;
  } catch {
    return null;
  }
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

    // Write initial daemon config only if one doesn't exist yet
    if (instance.dataDir) {
      readDaemonConfig(instance.dataDir).then((existing) => {
        // If we got back defaults (no file), write initial config
        if (existing.ws_port === DEFAULT_DAEMON_CONFIG.ws_port && existing.listen_port === DEFAULT_DAEMON_CONFIG.listen_port) {
          const caps = capabilitiesToArray(instance.capabilities);
          const port = parseInt(instance.url.match(/:(\d+)/)?.[1] ?? "9091");
          const initial: DaemonConfig = {
            ...structuredClone(DEFAULT_DAEMON_CONFIG),
            capabilities: caps,
            ws_port: port,
            listen_port: instance.port,
            max_storage_bytes: instance.maxStorageGB * 1e9,
          };
          writeDaemonConfig(instance.dataDir, initial).catch((e) =>
            console.error("[instanceStore] Failed to write initial daemon config:", e)
          );
        }
      }).catch(() => {});
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

    // Update daemon config file — only write the fields that changed
    const instance = get().instances.find((i) => i.id === id);
    if (instance?.dataDir) {
      readDaemonConfig(instance.dataDir).then((existing) => {
        const daemonPatch: Partial<DaemonConfig> = {};
        if (patch.capabilities !== undefined) {
          daemonPatch.capabilities = capabilitiesToArray(patch.capabilities as InstanceConfig['capabilities']);
        }
        if (patch.port !== undefined) daemonPatch.listen_port = patch.port;
        if (patch.maxStorageGB !== undefined) daemonPatch.max_storage_bytes = patch.maxStorageGB * 1e9;
        if (patch.url !== undefined) {
          const wsPort = parseInt(patch.url.match(/:(\d+)/)?.[1] ?? "9091");
          daemonPatch.ws_port = wsPort;
        }
        if (Object.keys(daemonPatch).length > 0) {
          const updated = { ...existing, ...daemonPatch };
          writeDaemonConfig(instance.dataDir, updated).catch((e) =>
            console.error("[instanceStore] Failed to update daemon config:", e)
          );
          // Push via WS if connected and hot-reloadable
          const client = getClient(id);
          if (client?.connected && !hadRestartField) {
            client.setDaemonConfig(daemonPatch as Partial<DaemonConfig>).catch(console.error);
          }
        }
        return;
      }).catch((e) => console.error("[instanceStore] Failed to update daemon config:", e));
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

    // Config is already on disk — daemon will read it on start. No need to rewrite.

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
      // Sync UI state from daemon config files, then auto-start
      for (const inst of config.instances) {
        // Read daemon config and sync instance state FROM it
        if (inst.dataDir) {
          syncInstanceFromDaemonConfig(inst).then((patch) => {
            if (patch) {
              set((s) => ({
                instances: s.instances.map((i) => (i.id === inst.id ? { ...i, ...patch } : i)),
              }));
              get().persistToConfig();
            }
          }).catch(() => {});
        }
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
