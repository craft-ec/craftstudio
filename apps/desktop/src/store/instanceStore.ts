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

    // Dedup: track recent events to suppress repeated spam
    const recentEvents = new Map<string, number>(); // key → timestamp
    const DEDUP_WINDOW_MS = 10_000; // suppress identical events within 10s

    // Subscribe to daemon server-push events and categorize them
    client.onEvent((method, params) => {
      const p = (params ?? {}) as Record<string, unknown>;

      // Dedup: skip if we saw the same event type + key recently
      const dedupeKey = `${method}:${p.peer_id ?? p.content_id ?? ""}`;
      const now = Date.now();
      const lastSeen = recentEvents.get(dedupeKey);
      if (lastSeen && now - lastSeen < DEDUP_WINDOW_MS) return;
      recentEvents.set(dedupeKey, now);
      // Prune old entries
      if (recentEvents.size > 200) {
        for (const [k, t] of recentEvents) { if (now - t > DEDUP_WINDOW_MS) recentEvents.delete(k); }
      }

      let category: ActivityCategory = "system";
      let level: ActivityEvent["level"] = "info";
      let msg = method.replace(/_/g, " ");

      // -- Categorize --
      // Announcements / DHT
      if (["capability_announced", "capability_published", "provider_announced", "content_reannounced", "providers_resolved", "manifest_retrieved"].includes(method)) {
        category = "announcement";
      }
      // Gossip / network
      else if (["storage_receipt_received", "removal_notice_received", "challenger_round_completed", "shard_requested", "peer_connected", "peer_disconnected", "peer_discovered"].includes(method)) {
        category = "gossip";
      }
      // User-initiated actions
      else if (["content_published", "content_distributed", "access_granted", "access_revoked", "channel_opened", "channel_closed", "pool_funded", "removal_published"].includes(method)) {
        category = "action";
      }
      // Maintenance
      else if (["maintenance_cycle_started", "maintenance_cycle_completed", "distribution_skipped", "discovery_status"].includes(method)) {
        category = "system";
      }

      // -- Levels --
      if (["content_published", "access_granted", "channel_opened", "pool_funded", "peer_connected", "content_distributed", "provider_announced", "maintenance_cycle_completed"].includes(method)) {
        level = "success";
      }
      if (["dht_error", "distribution_skipped"].includes(method) || method.includes("error")) level = "error";
      if (["peer_disconnected", "removal_notice_received"].includes(method)) level = "warn";

      // -- Build descriptive messages --
      const short = (s: unknown) => typeof s === "string" ? s.slice(0, 12) + "…" : "";

      switch (method) {
        // Startup
        case "daemon_started":
          msg = "Daemon started — initializing P2P network";
          break;
        case "listening_on":
          msg = `Listening on ${p.address ?? ""}`;
          break;
        case "discovery_status":
          msg = `Network: ${p.total_peers ?? 0} peers (${p.storage_peers ?? 0} storage) — ${p.action ?? ""}`;
          break;

        // Peers
        case "peer_discovered":
          msg = `mDNS: discovered peer ${short(p.peer_id)} at ${p.address ?? ""}`;
          break;
        case "peer_connected": {
          const total = Number(p.total_peers ?? 0);
          msg = total === 1
            ? `First peer connected: ${short(p.peer_id)} at ${p.address ?? "?"} — network discovery active`
            : `Peer connected: ${short(p.peer_id)} — ${total} peers in swarm`;
          level = "success";
          break;
        }
        case "peer_disconnected": {
          const remaining = Number(p.remaining_peers ?? 0);
          msg = remaining === 0
            ? `Peer ${short(p.peer_id)} disconnected — no peers remaining, will keep searching`
            : `Peer ${short(p.peer_id)} disconnected — ${remaining} peer${remaining > 1 ? "s" : ""} remaining`;
          break;
        }

        // Capabilities
        case "capability_announced": {
          const caps = p.capabilities as string[] ?? [];
          const isStorage = caps.includes("Storage");
          const committed = Number(p.storage_committed ?? 0);
          const used = Number(p.storage_used ?? 0);
          const avail = committed - used;
          if (isStorage && committed > 0) {
            msg = `Storage node ${short(p.peer_id)} online — ${formatBytes(avail)} available of ${formatBytes(committed)} committed (${Math.round(used / committed * 100)}% used)`;
            level = "success";
          } else if (isStorage) {
            msg = `Storage node ${short(p.peer_id)} online — no storage limit configured`;
          } else {
            msg = `Peer ${short(p.peer_id)} joined as ${caps.join(", ").toLowerCase()}`;
          }
          break;
        }
        case "capability_published": {
          const caps = p.capabilities as string[] ?? [];
          const committed = Number(p.storage_committed ?? 0);
          const used = Number(p.storage_used ?? 0);
          const isStorage = caps.includes("Storage");
          if (isStorage && committed > 0) {
            const avail = committed - used;
            msg = `Broadcasting: storage node with ${formatBytes(avail)} available of ${formatBytes(committed)} (${Math.round(used / committed * 100)}% used)`;
          } else if (isStorage) {
            msg = `Broadcasting: storage node (no storage limit set — configure max_storage_bytes)`;
            level = "warn";
          } else {
            msg = `Broadcasting: ${caps.join(", ").toLowerCase()} node`;
          }
          break;
        }

        // Content operations
        case "content_published":
          msg = `Content stored locally: ${formatBytes(Number(p.size ?? 0))} → ${p.chunks ?? 0} chunks × ${p.shards ?? "?"} shards — announcing to network...`;
          break;
        case "provider_announced":
          msg = `Content ${short(p.content_id)} announced to DHT — storage nodes can now discover and store it`;
          break;
        case "content_reannounced":
          msg = `Re-announced ${short(p.content_id)} to DHT`;
          break;

        // Content status (full picture)
        case "content_status": {
          const stage = String(p.stage ?? "unknown");
          const summary = String(p.summary ?? "");
          const size = formatBytes(Number(p.size ?? 0));
          const name = p.name ? String(p.name) : short(p.content_id);
          msg = `📦 ${name} (${size}) [${stage}] — ${summary}`;
          if (stage === "distributed") level = "success";
          else if (stage === "degraded") level = "error";
          else if (stage === "chunked") level = "warn";
          category = "action";
          break;
        }

        // DHT results
        case "providers_resolved": {
          const count = Number(p.count ?? 0);
          if (count > 0) {
            msg = `Content ${short(p.content_id)} has ${count} provider${count > 1 ? "s" : ""} — data is available on the network`;
            level = "success";
          } else {
            msg = `Content ${short(p.content_id)} has no providers yet — shards need to be distributed to storage nodes`;
            level = "warn";
          }
          break;
        }
        case "manifest_retrieved":
          msg = `Retrieved manifest for ${short(p.content_id)} (${p.chunks ?? 0} chunks)`;
          break;
        case "dht_error": {
          const errMsg = String(p.error ?? "unknown");
          const next = p.next_action ? ` → ${p.next_action}` : "";
          if (errMsg.includes("no results")) {
            msg = `No DHT results for ${short(p.content_id)} — network may still be bootstrapping${next}`;
            level = "warn";
          } else {
            msg = `DHT error for ${short(p.content_id)}: ${errMsg}${next}`;
            level = "error";
          }
          break;
        }

        // Distribution
        case "content_distributed": {
          const pushed = Number(p.shards_pushed ?? 0);
          const total = Number(p.total_shards ?? 0);
          const peers = Number(p.target_peers ?? 0);
          if (pushed >= total) {
            msg = `Content ${short(p.content_id)} fully distributed — ${pushed} shards across ${peers} storage node${peers > 1 ? "s" : ""}`;
          } else {
            msg = `Content ${short(p.content_id)} partially distributed — ${pushed}/${total} shards sent to ${peers} node${peers > 1 ? "s" : ""}`;
            level = "warn";
          }
          break;
        }
        case "distribution_skipped": {
          const retry = Number(p.retry_secs ?? 600);
          msg = `Cannot distribute: ${p.reason ?? "unknown reason"} — retrying in ${retry >= 60 ? Math.round(retry / 60) + "min" : retry + "s"}`;
          level = "warn";
          break;
        }

        // Maintenance
        case "maintenance_cycle_started": {
          const na = Number(p.needs_announce ?? 0);
          const nd = Number(p.needs_distribute ?? 0);
          if (na === 0 && nd === 0) {
            msg = `Maintenance check: all ${p.content_count ?? 0} items healthy — nothing to do`;
          } else {
            const parts = [];
            if (na > 0) parts.push(`${na} to re-announce`);
            if (nd > 0) parts.push(`${nd} to distribute`);
            msg = `Maintenance starting: ${parts.join(", ")}`;
          }
          break;
        }
        case "maintenance_cycle_completed": {
          const a = Number(p.announced ?? 0);
          const d = Number(p.distributed ?? 0);
          const next = p.next_run_secs ? ` — next check in ${Math.round(Number(p.next_run_secs) / 60)}min` : "";
          if (a === 0 && d === 0) {
            msg = `Maintenance complete — no changes needed${next}`;
          } else {
            const parts = [];
            if (a > 0) parts.push(`announced ${a}`);
            if (d > 0) parts.push(`distributed ${d}`);
            msg = `Maintenance complete: ${parts.join(", ")}${next}`;
            level = "success";
          }
          break;
        }

        // Gossip
        case "storage_receipt_received":
          msg = `Storage receipt: ${short(p.content_id)} from ${short(p.storage_node)}`;
          break;
        case "removal_notice_received":
          msg = `Removal notice for ${short(p.content_id)} from ${short(p.creator)} (${p.valid ? "valid" : "INVALID"})`;
          break;
        case "shard_requested":
          msg = `Shard requested: ${short(p.content_id)} chunk ${p.chunk ?? "?"} shard ${p.shard ?? "?"} by ${short(p.peer_id)}`;
          break;
        case "challenger_round_completed":
          msg = `PDP challenger completed ${p.rounds ?? 0} rounds`;
          break;

        // Access & payments
        case "access_granted":
          msg = `Access granted to ${short(p.recipient)} for ${short(p.content_id)}`;
          break;
        case "access_revoked":
          msg = `Access revoked for ${short(p.recipient)} on ${short(p.content_id)}`;
          break;
        case "channel_opened":
          msg = `Payment channel opened: ${short(p.channel_id)} with ${short(p.receiver)}`;
          break;
        case "channel_closed":
          msg = `Payment channel closed: ${short(p.channel_id)}`;
          break;
        case "pool_funded":
          msg = `Pool funded: ${p.amount ?? 0} for ${short(p.creator)}`;
          break;
        case "removal_published":
          msg = `Content removed: ${short(p.content_id)}`;
          break;
      }

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
