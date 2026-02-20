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
      const running = await invoke<Array<{ pid: number; ws_port: number }>>("list_craftobj_daemons");
      const match = running.find((d) => d.ws_port === instance.ws_port);
      if (match) {
        await invoke("stop_craftobj_daemon", { pid: match.pid });
        logActivity(id, "Daemon stopped", "info");
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (e) {
      logActivity(id, `Stop failed: ${e}`, "warn");
    }

    try {
      await invoke("start_craftobj_daemon", {
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
            logActivity(id, `Node has ${s.content_count} content items, ${s.piece_count} pieces (${formatBytes(s.stored_bytes)})`, "info", "system");
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
      if (["provider_announced", "content_reannounced", "providers_resolved", "manifest_retrieved"].includes(method)) {
        category = "announcement";
      }
      // Gossip / network
      else if (["challenger_round_completed", "peer_connected", "peer_disconnected", "peer_discovered", "content_critical", "content_degraded", "peer_going_offline", "peer_heartbeat_timeout"].includes(method)) {
        category = "gossip";
      }
      // User-initiated actions
      else if (["content_published", "content_distributed", "access_granted", "access_revoked", "pool_funded", "removal_published", "distribution_progress", "channel_opened", "channel_closed"].includes(method)) {
        category = "action";
      }
      // Maintenance / system
      else if (["maintenance_cycle_started", "maintenance_cycle_completed", "discovery_status", "content_evicted", "content_retired", "disk_space_warning", "gc_completed", "storage_pressure", "aggregation_complete"].includes(method)) {
        category = "system";
      }

      // -- Levels --
      if (["content_published", "access_granted", "pool_funded", "peer_connected", "content_distributed", "provider_announced", "maintenance_cycle_completed", "channel_opened", "aggregation_complete"].includes(method)) {
        level = "success";
      }
      if (["dht_error", "content_critical"].includes(method) || method.includes("error")) level = "error";
      if (["peer_disconnected", "content_degraded", "content_evicted", "disk_space_warning", "peer_going_offline", "peer_heartbeat_timeout", "storage_pressure"].includes(method)) level = "warn";

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
        // Content operations
        case "content_published":
          msg = `Content stored locally: ${formatBytes(Number(p.size ?? p.total_size ?? 0))} → ${p.segment_count ?? 0} segments — encoding and announcing to network...`;
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
            msg = `Content ${short(p.content_id)} has no providers yet — pieces need to be distributed to storage nodes`;
            level = "warn";
          }
          break;
        }
        case "manifest_retrieved":
          msg = `Retrieved manifest for ${short(p.content_id)} (${p.segment_count ?? 0} segments)`;
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
          const pushed = Number(p.pieces_pushed ?? p.shards_pushed ?? 0);
          const total = Number(p.total_pieces ?? p.total_shards ?? 0);
          const peers = Number(p.target_peers ?? 0);
          if (pushed >= total) {
            msg = `Content ${short(p.content_id)} fully distributed — ${pushed} pieces across ${peers} storage node${peers > 1 ? "s" : ""}`;
          } else {
            msg = `Content ${short(p.content_id)} partially distributed — ${pushed}/${total} pieces sent to ${peers} node${peers > 1 ? "s" : ""}`;
            level = "warn";
          }
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
        // Payment channels removed from design
        case "pool_funded":
          msg = `Pool funded: ${p.amount ?? 0} for ${short(p.creator)}`;
          break;
        case "removal_published":
          msg = `Content removed: ${short(p.content_id)}`;
          break;

        // Content health
        case "content_critical":
          msg = `⚠️ Content ${short(p.content_id)} critically degraded — health ${Math.round(Number(p.health ?? 0) * 100)}%, ${p.providers ?? 0} providers`;
          level = "error";
          category = "gossip";
          break;
        case "content_degraded":
          msg = `Content ${short(p.content_id)} degraded — health ${Math.round(Number(p.health ?? 0) * 100)}%, ${p.providers ?? 0} providers`;
          level = "warn";
          category = "gossip";
          break;

        // Eviction / retirement
        case "content_evicted":
          msg = `Content ${short(p.content_id)} evicted: ${p.reason ?? "unknown"}`;
          level = "warn";
          category = "system";
          break;
        case "content_retired":
          msg = `Content ${short(p.content_id)} retired: ${p.reason ?? "unknown"}`;
          level = "info";
          category = "system";
          break;

        // Disk space
        case "disk_space_warning":
          msg = `⚠️ Disk space warning: ${p.percent ?? 0}% used (${formatBytes(Number(p.used_bytes ?? 0))} / ${formatBytes(Number(p.total_bytes ?? 0))})`;
          level = "warn";
          category = "system";
          break;

        // Distribution progress
        case "distribution_progress":
          msg = `Distributing ${short(p.content_id)}: ${p.pieces_pushed ?? 0}/${p.total_pieces ?? 0} pieces to ${p.peers_active ?? 0} peers`;
          level = "info";
          category = "action";
          break;

        // GC
        case "gc_completed":
          msg = `GC completed: removed ${p.deleted_count ?? 0} items (${formatBytes(Number(p.deleted_bytes ?? 0))})`;
          level = "info";
          category = "system";
          break;

        // Peer lifecycle
        case "peer_going_offline":
          msg = `Peer ${short(p.peer_id)} going offline`;
          level = "warn";
          category = "gossip";
          break;
        case "peer_heartbeat_timeout":
          msg = `Peer ${short(p.peer_id)} heartbeat timeout — marking offline`;
          level = "warn";
          category = "gossip";
          break;

        // Storage pressure
        case "storage_pressure":
          msg = `Storage pressure detected — ${formatBytes(Number(p.available_bytes ?? 0))} available (threshold: ${formatBytes(Number(p.threshold_bytes ?? 0))})`;
          level = "warn";
          category = "system";
          break;

        // Payment channels
        case "channel_opened":
          msg = `Payment channel opened with ${short(p.receiver)}: ${p.amount ?? 0}`;
          level = "success";
          category = "action";
          break;
        case "channel_closed":
          msg = `Payment channel ${short(p.channel_id)} closed`;
          level = "info";
          category = "action";
          break;

        // Aggregation
        case "aggregation_complete":
          msg = `Aggregation epoch completed — ${p.receipt_count ?? 0} receipts, root ${short(p.merkle_root)}`;
          level = "success";
          category = "system";
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
        invoke<{ pid: number; ws_port: number; data_dir: string }>("start_craftobj_daemon", {
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
          // Delay to let the daemon's WS server start listening
          setTimeout(() => get().initClient(inst.id), 1500);
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
