/**
 * Singleton JSON-RPC 2.0 client over WebSocket for CraftOBJ daemon.
 *
 * Auto-reconnects, tracks request IDs, supports timeouts.
 * All pages go through this — never instantiate WebSocket directly.
 *
 * URL is read from config store; call `daemon.setUrl()` to change it.
 */

import { invoke } from '@tauri-apps/api/core';
import type { InstanceConfig } from '../types/config';

// ── RLNC Health & Statistics types ──────────────────────

export interface SegmentHealth {
  index: number;
  local_pieces: number;
  rank: number;
  network_pieces?: number;
  network_reconstructable?: boolean;
  k?: number;
  needs_repair?: boolean;
  needs_degradation?: boolean;
}

export interface ProviderInfo {
  peer_id: string;
  piece_count: number;
  segment_pieces?: number[];
  region?: string;
  score?: number;
  latency_ms?: number;
  merkle_root?: string;
  last_seen?: number;
  is_local?: boolean;
}

export interface ContentHealthResponse {
  content_id: string;
  name: string;
  original_size: number;
  segment_count: number;
  k: number;
  segments: SegmentHealth[];
  min_rank: number;
  health_ratio: number;
  provider_count: number;
  providers: ProviderInfo[];
  pinned: boolean;
  role: string;
  stage: string;
  local_disk_usage: number;
  network_total_pieces: number;
  local_health_ratio: number;
  has_demand: boolean;
  tier_min_ratio: number;
  health_scanned: boolean;
}

export interface ContentDetailedItem {
  content_id: string;
  name?: string;
  total_size: number;
  segment_count: number;
  pinned: boolean;
  encrypted?: boolean;
  local_pieces?: number;
  provider_count?: number;
  role?: string;
  stage?: string;
  min_rank: number;
  health_ratio: number;
  local_disk_usage: number;
  network_total_pieces?: number;
  hot?: boolean;
  has_demand?: boolean;
  tier_min_ratio?: number;
  health_scanned?: boolean;
}

export interface SegmentDetail {
  index: number;
  k: number;
  local_pieces: number;
  piece_ids: string[];
  reconstructable: boolean;
}

export interface ContentSegmentsResponse {
  content_id: string;
  segments: SegmentDetail[];
}

export interface NetworkHealthResponse {
  total_content_count: number;
  total_stored_bytes: number;
  total_local_bytes: number;
  total_network_storage_committed: number;
  total_network_storage_used: number;
  storage_node_count: number;
  healthy_content_count: number;
  degraded_content_count: number;
  average_health_ratio: number;
  total_providers_unique: number;
  receipts_this_epoch: number;
}

export interface NodeStatsResponse {
  content_count: number;
  published_count: number;
  stored_count: number;
  total_local_pieces: number;
  total_disk_usage: number;
  max_storage_bytes: number;
  storage_root: string;
  capabilities: string[];
  region: string;
  receipts_generated: number;
  uptime_secs: number;
}

// ── Health History types ────────────────────────────────

export interface HealthSnapshotSegment {
  index: number;
  rank: number;
  k: number;
  total_pieces: number;
  provider_count: number;
}

export interface HealthAction {
  Repaired?: { segment: number; offset: number };
  Degraded?: { segment: number };
}

export interface HealthSnapshot {
  timestamp: number;
  content_id: string;
  segment_count: number;
  segments: HealthSnapshotSegment[];
  provider_count: number;
  health_ratio: number;
  actions: HealthAction[];
}

export interface HealthHistoryResponse {
  snapshots: HealthSnapshot[];
}

const RECONNECT_MS = 3_000;
const REQUEST_TIMEOUT_MS = 30_000;

type Pending = {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type ConnectionListener = (connected: boolean) => void;
type EventListener = (method: string, params: unknown) => void;

class DaemonClient {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _connected = false;
  private connectionListeners = new Set<ConnectionListener>();
  private eventListeners = new Set<EventListener>();
  private destroyed = false;
  private _url: string;
  private _apiKey: string | null = null;
  private _dataDir: string | undefined;

  get connected(): boolean {
    return this._connected;
  }

  get url(): string {
    return this._url;
  }

  constructor(url?: string) {
    this._url = url ?? 'ws://127.0.0.1:9091/ws';
  }

  /** Initialize connection. Called after config is loaded. */
  async init(dataDir?: string) {
    await this.loadApiKey(dataDir);
    this.connect();
  }

  /** Load the API key from the daemon's well-known file via Tauri. */
  private async loadApiKey(dataDir?: string) {
    try {
      this._apiKey = await invoke<string>('get_daemon_api_key', { dataDir: dataDir ?? null });
    } catch (err) {
      console.warn('[daemon] Failed to load API key:', err);
      this._apiKey = null;
    }
  }

  /** Build the WebSocket URL with API key query parameter. */
  private buildWsUrl(): string {
    if (this._apiKey) {
      const sep = this._url.includes('?') ? '&' : '?';
      return `${this._url}${sep}key=${this._apiKey}`;
    }
    return this._url;
  }

  /** Update the daemon URL and reconnect. */
  setUrl(baseUrl: string) {
    const wsUrl = `${baseUrl}/ws`;
    if (wsUrl === this._url && this._connected) return;
    this._url = wsUrl;
    this.ws?.close();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.connect();
  }

  // ── connection lifecycle ──────────────────────────────────

  private connect() {
    if (this.destroyed) return;
    try {
      const ws = new WebSocket(this.buildWsUrl());

      ws.onopen = () => {
        this._connected = true;
        this.notifyConnection(true);
        console.log("[daemon] connected to", this._url);
      };

      ws.onclose = (ev) => {
        this._connected = false;
        this.notifyConnection(false);
        this.rejectAll("WebSocket closed");
        console.log("[daemon] disconnected — code:", ev.code, "reason:", ev.reason, "wasClean:", ev.wasClean);
        this.scheduleReconnect();
      };

      ws.onerror = (ev) => {
        console.error("[daemon] ws error:", ev);
        ws.close();
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.id !== undefined && this.pending.has(msg.id)) {
            const p = this.pending.get(msg.id)!;
            this.pending.delete(msg.id);
            clearTimeout(p.timer);
            if (msg.error) p.reject(new Error(msg.error.message));
            else p.resolve(msg.result);
          } else if (msg.method) {
            // Server-push event
            this.eventListeners.forEach((fn) => fn(msg.method, msg.params));
          }
        } catch {
          /* ignore malformed */
        }
      };

      this.ws = ws;
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.destroyed) return;
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      // Reload API key on reconnect — it may not have existed on first attempt
      if (!this._apiKey && this._dataDir) {
        await this.loadApiKey(this._dataDir);
      }
      this.connect();
    }, RECONNECT_MS);
  }

  private rejectAll(reason: string) {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
      this.pending.delete(id);
    }
  }

  /** Set API key directly (for remote connections where key is provided by user). */
  setApiKey(key: string | null) {
    this._apiKey = key;
  }

  /** Start connecting (public entry point for multi-instance use). */
  async start(dataDir?: string, apiKey?: string) {
    this.destroyed = false;
    this._dataDir = dataDir;
    if (apiKey) {
      this._apiKey = apiKey;
    } else {
      await this.loadApiKey(dataDir);
    }
    this.connect();
  }

  /** Force a reconnect (e.g. from UI "Reconnect" button) */
  reconnect() {
    this.ws?.close();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.connect();
  }

  destroy() {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.rejectAll("Client destroyed");
  }

  // ── listeners ─────────────────────────────────────────────

  onConnection(fn: ConnectionListener): () => void {
    this.connectionListeners.add(fn);
    // Fire current state immediately
    fn(this._connected);
    return () => this.connectionListeners.delete(fn);
  }

  onEvent(fn: EventListener): () => void {
    this.eventListeners.add(fn);
    return () => this.eventListeners.delete(fn);
  }

  private notifyConnection(connected: boolean) {
    this.connectionListeners.forEach((fn) => fn(connected));
  }

  // ── RPC call ──────────────────────────────────────────────

  call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error("Daemon offline"));
      }

      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Request timeout"));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      });

      this.ws.send(
        JSON.stringify({ jsonrpc: "2.0", id, method, ...(params !== undefined && { params }) })
      );
    });
  }

  // ── typed helpers ─────────────────────────────────────────

  // Data
  publish(path: string, encrypted = false) {
    return this.call<{ cid: string; size: number; segments: number; key?: string }>(
      "publish",
      { path, encrypted }
    );
  }

  fetch(cid: string, output?: string, key?: string) {
    return this.call<{ path: string }>("fetch", { cid, ...(output && { output }), ...(key && { key }) });
  }

  deleteLocalContent(cid: string) {
    return this.call<{ deleted: boolean }>("data.delete_local", { cid });
  }

  listContent() {
    return this.call<Array<{ content_id: string; name?: string; total_size: number; segment_count: number; pinned: boolean }>>("list");
  }

  status() {
    return this.call<{ stored_bytes: number; content_count: number; piece_count: number; pinned_count: number }>("status");
  }

  // Access
  grantAccess(cid: string, creatorSecret: string, recipientPubkey: string, contentKey: string) {
    return this.call("access.grant", {
      cid,
      creator_secret: creatorSecret,
      recipient_pubkey: recipientPubkey,
      content_key: contentKey,
    });
  }

  revokeAccess(cid: string, recipientPubkey: string) {
    return this.call("access.revoke", { cid, recipient_pubkey: recipientPubkey });
  }

  revokeRotate(
    cid: string,
    creatorSecret: string,
    recipientPubkey: string,
    contentKey: string,
    authorized: string[]
  ) {
    return this.call("access.revoke_rotate", {
      cid,
      creator_secret: creatorSecret,
      recipient_pubkey: recipientPubkey,
      content_key: contentKey,
      authorized,
    });
  }

  listAccess(cid: string) {
    return this.call<{ cid: string; creator: string; authorized: string[] }>("access.list", { cid });
  }

  // Receipts
  listStorageReceipts(opts?: { limit?: number; offset?: number; cid?: string; node?: string }) {
    return this.call<{
      receipts: Array<{
        cid: string;
        storage_node: string;
        challenger: string;
        segment_index: number;
        timestamp: number;
        signed: boolean;
      }>;
      total: number;
    }>("receipt.storage.list", opts as Record<string, unknown>);
  }

  // Settlement
  createPool(creator: string, tier?: number) {
    return this.call("settlement.create_pool", { creator, tier: tier ?? 2 });
  }

  fundPool(creator: string, amount: number) {
    return this.call<{ signature: string; confirmed: boolean }>("settlement.fund_pool", {
      creator,
      amount,
    });
  }

  claimPdp(pool: string, operator: string, weight: number, merkleProof: string[], leafIndex?: number) {
    return this.call("settlement.claim", { pool, operator, weight, merkle_proof: merkleProof, leaf_index: leafIndex ?? 0 });
  }

  // Daemon config
  getDaemonConfig() {
    return this.call<Partial<InstanceConfig>>('get-config');
  }

  setDaemonConfig(patch: Partial<InstanceConfig>) {
    return this.call('set-config', { config: JSON.stringify(patch) });
  }

  // ── RLNC Health & Statistics ────────────────────────────

  contentHealth(cid: string) {
    return this.call<ContentHealthResponse>("content.health", { cid });
  }

  contentHealthHistory(cid: string, since?: number) {
    return this.call<HealthHistoryResponse>("content.health_history", { cid, since });
  }

  contentListDetailed() {
    return this.call<ContentDetailedItem[]>("content.list_detailed");
  }

  contentSegments(cid: string) {
    return this.call<ContentSegmentsResponse>("content.segments", { cid });
  }

  networkHealth() {
    return this.call<NetworkHealthResponse>("network.health");
  }

  nodeStats() {
    return this.call<NodeStatsResponse>("node.stats");
  }

  // Lifecycle
  shutdown() {
    return this.call<{ status: string }>("shutdown");
  }

  // Peers
  listPeers() {
    return this.call<Record<string, { capabilities: string[]; score: number; avg_latency_ms: number; storage_committed_bytes: number; storage_used_bytes: number }>>("peers");
  }

  // Connected peers (libp2p connected set)
  connectedPeers() {
    return this.call<{ peers: string[] }>("connected_peers");
  }

  // Node capabilities
  nodeCapabilities() {
    return this.call<{ capabilities: string[] }>("node.capabilities");
  }

  // Extend content with new RLNC pieces
  extend(cid: string) {
    return this.call<{ cid: string; pieces_generated: number }>("extend", { cid });
  }

  // Receipts
  receiptsCount() {
    return this.call<{ storage: number }>("receipts.count");
  }

  receiptsQuery(opts?: { cid?: string; node?: string; from?: number; to?: number }) {
    return this.call<{ receipts: Array<{ type: string; cid: string; segment_index: number; piece_id: string; storage_node: string; challenger: string; timestamp: number }> }>(
      "receipts.query",
      opts as Record<string, unknown>,
    );
  }

  // Data providers
  dataProviders(cid: string) {
    return this.call<{ cid: string; provider_count: number; providers: string[] }>("data.providers", { cid });
  }

  // Data removal (creator-signed network removal)
  dataRemove(cid: string, creatorSecret: string, reason?: string) {
    return this.call<{ cid: string; removed: boolean; creator: string; timestamp: number }>(
      "data.remove",
      { cid, creator_secret: creatorSecret, ...(reason && { reason }) },
    );
  }

  // Payment channels
  channelOpen(sender: string, receiver: string, amount: number) {
    return this.call<{ channel_id: string; sender: string; receiver: string; locked_amount: number }>(
      "channel.open",
      { sender, receiver, amount },
    );
  }

  channelVoucher(channelId: string, amount: number, nonce: number, signature?: string) {
    return this.call<{ channel_id: string; cumulative_amount: number; nonce: number; valid: boolean }>(
      "channel.voucher",
      { channel_id: channelId, amount, nonce, ...(signature && { signature }) },
    );
  }

  channelClose(channelId: string) {
    return this.call<{ channel_id: string; status: string; final_spent: number; locked_amount: number; remaining: number }>(
      "channel.close",
      { channel_id: channelId },
    );
  }

  channelList(peer?: string) {
    return this.call<{ channels: Array<{ channel_id: string; sender: string; receiver: string; locked_amount: number; spent: number; remaining: number; nonce: number }> }>(
      "channel.list",
      peer ? { peer } : undefined,
    );
  }

  // Settlement (on-chain)
  settlementOpenChannel(payee: string, amount: number) {
    return this.call<{ signature: string; confirmed: boolean; payee: string; amount: number }>(
      "settlement.open_channel",
      { payee, amount },
    );
  }

  settlementCloseChannel(user: string, node: string, amount: number, nonce: number, voucherSignature?: string) {
    return this.call<{ signature: string; confirmed: boolean; user: string; node: string; amount: number }>(
      "settlement.close_channel",
      { user, node, amount, nonce, ...(voucherSignature && { voucher_signature: voucherSignature }) },
    );
  }

  // Network storage summary
  networkStorage() {
    return this.call<{ total_committed: number; total_used: number; total_available: number; storage_node_count: number }>("network.storage");
  }
}

// ── Multi-instance client management ────────────────────────

const clients = new Map<string, DaemonClient>();

export function createClient(instanceId: string, url: string): DaemonClient {
  const existing = clients.get(instanceId);
  if (existing) {
    existing.destroy();
  }
  const client = new DaemonClient(url);
  clients.set(instanceId, client);
  return client;
}

export function getClient(instanceId: string): DaemonClient | undefined {
  return clients.get(instanceId);
}

export function destroyClient(instanceId: string): void {
  const client = clients.get(instanceId);
  if (client) {
    client.destroy();
    clients.delete(instanceId);
  }
}

export function destroyAllClients(): void {
  for (const [id, client] of clients) {
    client.destroy();
    clients.delete(id);
  }
}

/** @deprecated Use createClient/getClient instead. Kept for backward compat during migration. */
export const daemon = new DaemonClient();

export { DaemonClient };
