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

export type ActivityCategory = "announcement" | "gossip" | "action" | "system";

export interface ActivityEvent {
  time: number;
  message: string;
  level: "info" | "success" | "error" | "warn";
  category: ActivityCategory;
}

interface InstanceState {
  instances: InstanceConfig[];
  activeId: string | null;
  connectionStatus: Record<string, "connected" | "disconnected" | "connecting">;
  activityLog: Record<string, ActivityEvent[]>;
  apiKeys: Record<string, string>;

  addInstance: (instance: InstanceConfig, opts?: { apiKey?: string }) => Promise<void>;
  logActivity: (id: string, message: string, level?: ActivityEvent["level"], category?: ActivityCategory) => void;
  removeInstance: (id: string) => void;
  setActive: (id: string | null) => void;
  updateInstance: (id: string, patch: Partial<InstanceConfig>) => Promise<void>;
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

  logActivity: (id, message, level = "info", category = "system") => {
    set((s) => ({
      activityLog: {
        ...s.activityLog,
        [id]: [...(s.activityLog[id] || []), { time: Date.now(), message, level, category }].slice(-100),
      },
    }));
  },

  addInstance: async (instance, opts?) => {
    const { apiKey } = opts ?? {};

    // If a config already exists in the dataDir, READ it instead of overwriting
    let finalConfig = instance;
    if (instance.dataDir) {
      try {
        const existing = await readInstanceConfig(instance.dataDir);
        // Check if it has real data (not just defaults)
        if (existing.capabilities && existing.capabilities.length > 0 && existing.ws_port > 0) {
          // Merge: existing config wins, but keep id/dataDir from the ref
          finalConfig = { ...existing, id: instance.id, dataDir: instance.dataDir };
        } else {
          // No existing config — write the new one
          await writeInstanceConfig(instance.dataDir, instance);
        }
      } catch {
        // No config file exists — write the new one
        await writeInstanceConfig(instance.dataDir, instance).catch((e) =>
          console.error("[instanceStore] Failed to write instance config:", e)
        );
      }
    }

    set((s) => ({
      instances: [...s.instances, finalConfig],
      activeId: finalConfig.id,
      ...(apiKey ? { apiKeys: { ...s.apiKeys, [finalConfig.id]: apiKey } } : {}),
    }));

    get().initClient(finalConfig.id);
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

  updateInstance: async (id, patch) => {
    const needsRestart = RESTART_REQUIRED_FIELDS.some((f) => f in patch);

    set((s) => ({
      instances: s.instances.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    }));

    // Write full updated config to {dataDir}/config.json
    const instance = get().instances.find((i) => i.id === id);
    if (instance?.dataDir) {
      await writeInstanceConfig(instance.dataDir, instance).catch((e) =>
        console.error("[instanceStore] Failed to write instance config:", e)
      );

      // Push daemon-relevant fields via WS if connected and hot-reloadable
      if (!needsRestart) {
        const daemonFields = ['capability_announce_interval_secs', 'reannounce_interval_secs',
          'reannounce_threshold_secs', 'challenger_interval_secs', 'max_storage_bytes'];
        const daemonPatch: Record<string, unknown> = {};
        for (const key of daemonFields) {
          if (key in patch) daemonPatch[key] = (patch as Record<string, unknown>)[key];
        }
        if (Object.keys(daemonPatch).length > 0) {
          const client = getClient(id);
          if (client?.connected) {
            client.setDaemonConfig(daemonPatch).catch(console.error);
          }
        }
      }
    }

    // Restart daemon if required fields changed — config is written, safe to restart
    if (needsRestart) {
      await get().restartInstance(id);
    }
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
        logActivity(id, "WebSocket connected — daemon online", "success", "system");
        client.status().then((s) => {
          if (s) {
            logActivity(id, `Node has ${s.content_count} content items, ${s.shard_count} shards (${formatBytes(s.stored_bytes)})`, "info", "system");
          }
        }).catch(() => {});
        client.listPeers().then((peers) => {
          if (peers) {
            const count = Object.keys(peers).length;
            const storage = Object.values(peers).filter(p => p.capabilities.includes("Storage")).length;
            if (count > 0) {
              logActivity(id, `Connected to ${count} peers (${storage} storage nodes)`, "success", "announcement");
            } else {
              logActivity(id, "No peers found yet — DHT discovery in progress", "warn", "announcement");
            }
          }
        }).catch(() => {});
      } else {
        logActivity(id, "Disconnected from daemon", "error", "system");
      }
      set((s) => ({
        connectionStatus: {
          ...s.connectionStatus,
          [id]: connected ? "connected" : "disconnected",
        },
      }));
    });

    // Subscribe to daemon server-push events and categorize them
    // Event method names are snake_case DaemonEvent variants:
    //   peer_connected, peer_disconnected, listening_on, daemon_started,
    //   capability_announced, capability_published, provider_announced, content_reannounced,
    //   storage_receipt_received, removal_notice_received,
    //   content_published, access_granted, access_revoked, channel_opened, channel_closed,
    //   pool_funded, removal_published, content_distributed,
    //   providers_resolved, manifest_retrieved, dht_error,
    //   challenger_round_completed, shard_requested
    client.onEvent((method, params) => {
      const p = (params ?? {}) as Record<string, unknown>;

      let category: ActivityCategory = "system";
      let level: ActivityEvent["level"] = "info";
      let msg = method.replace(/_/g, " ");

      // Announcements
      if (["capability_announced", "capability_published", "provider_announced", "content_reannounced", "providers_resolved", "manifest_retrieved"].includes(method)) {
        category = "announcement";
      }
      // Gossip
      else if (["storage_receipt_received", "removal_notice_received", "challenger_round_completed", "shard_requested", "peer_connected", "peer_disconnected", "peer_discovered"].includes(method)) {
        category = "gossip";
      }
      // Actions
      else if (["content_published", "content_distributed", "access_granted", "access_revoked", "channel_opened", "channel_closed", "pool_funded", "removal_published"].includes(method)) {
        category = "action";
      }

      // Levels
      if (["content_published", "access_granted", "channel_opened", "pool_funded", "peer_connected", "content_distributed", "provider_announced"].includes(method)) {
        level = "success";
      }
      if (["dht_error"].includes(method) || method.includes("error")) level = "error";
      if (["peer_disconnected", "removal_notice_received"].includes(method)) level = "warn";

      // Build descriptive messages
      if (method === "peer_connected") msg = `Peer connected: ${p.peer_id ?? ""}`;
      else if (method === "peer_disconnected") msg = `Peer disconnected: ${p.peer_id ?? ""}`;
      else if (method === "capability_announced") msg = `Peer ${(p.peer_id as string)?.slice(0, 12) ?? ""}… capabilities: ${(p.capabilities as string[])?.join(", ") ?? ""}`;
      else if (method === "content_published") msg = `Published content (${p.chunks ?? 0} chunks, ${formatBytes(Number(p.size ?? 0))})`;
      else if (method === "content_distributed") msg = `Distributed ${p.shards_pushed ?? 0} shards for ${(p.content_id as string)?.slice(0, 12) ?? ""}…`;
      else if (method === "provider_announced") msg = `Announced as provider for ${(p.content_id as string)?.slice(0, 12) ?? ""}…`;
      else if (method === "providers_resolved") msg = `Found ${p.count ?? 0} providers for ${(p.content_id as string)?.slice(0, 12) ?? ""}…`;
      else if (method === "dht_error") msg = `DHT error: ${p.error ?? "unknown"}`;
      else if (method === "listening_on") msg = `Listening on ${p.address ?? ""}`;
      else if (method === "daemon_started") msg = "Daemon started";
      else if (method === "access_granted") msg = `Access granted to ${(p.recipient as string)?.slice(0, 12) ?? ""}…`;
      else if (method === "channel_opened") msg = `Payment channel opened: ${(p.channel_id as string)?.slice(0, 12) ?? ""}…`;
      else if (method === "storage_receipt_received") msg = `Storage receipt: ${(p.content_id as string)?.slice(0, 12) ?? ""}… from ${(p.storage_node as string)?.slice(0, 12) ?? ""}…`;

      logActivity(id, msg, level, category);
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
