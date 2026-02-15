/**
 * Singleton JSON-RPC 2.0 client over WebSocket for DataCraft daemon.
 *
 * Auto-reconnects, tracks request IDs, supports timeouts.
 * All pages go through this — never instantiate WebSocket directly.
 *
 * URL is read from config store; call `daemon.setUrl()` to change it.
 */

import { getConfig } from "./config";

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

  get connected(): boolean {
    return this._connected;
  }

  get url(): string {
    return this._url;
  }

  constructor(url?: string) {
    // Read from cached config if available, otherwise use default
    const cfg = getConfig();
    this._url = url ?? `${cfg.daemons.datacraft.url}/ws`;
  }

  /** Initialize connection. Called after config is loaded. */
  init() {
    const cfg = getConfig();
    this._url = `${cfg.daemons.datacraft.url}/ws`;
    this.connect();
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
      const ws = new WebSocket(this._url);

      ws.onopen = () => {
        this._connected = true;
        this.notifyConnection(true);
        console.log("[daemon] connected to", this._url);
      };

      ws.onclose = () => {
        this._connected = false;
        this.notifyConnection(false);
        this.rejectAll("WebSocket closed");
        console.log("[daemon] disconnected");
        this.scheduleReconnect();
      };

      ws.onerror = () => ws.close();

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
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
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
    return this.call<{ cid: string; size: number; chunks: number; key?: string }>(
      "publish",
      { path, encrypted }
    );
  }

  fetch(cid: string, output?: string, key?: string) {
    return this.call<{ path: string }>("fetch", { cid, ...(output && { output }), ...(key && { key }) });
  }

  listContent() {
    return this.call<Array<{ cid: string; name?: string; size: number; chunks: number; pinned: boolean }>>("list");
  }

  status() {
    return this.call<{ total_stored: number; shard_count: number }>("status");
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

  // Channels
  openChannel(sender: string, receiver: string, amount: number) {
    return this.call("channel.open", { sender, receiver, amount });
  }

  issueVoucher(channelId: string, amount: number, nonce: number, signature?: string) {
    return this.call("channel.voucher", { channel_id: channelId, amount, nonce, ...(signature && { signature }) });
  }

  closeChannel(channelId: string) {
    return this.call("channel.close", { channel_id: channelId });
  }

  listChannels(peer?: string) {
    return this.call<{
      channels: Array<{
        channel_id: string;
        sender: string;
        receiver: string;
        locked_amount: number;
        spent: number;
        remaining: number;
        nonce: number;
      }>;
    }>("channel.list", peer ? { peer } : undefined);
  }

  // Receipts
  listStorageReceipts(opts?: { limit?: number; offset?: number; cid?: string; node?: string }) {
    return this.call<{
      receipts: Array<{
        cid: string;
        storage_node: string;
        challenger: string;
        shard_index: number;
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

  openSettlementChannel(payee: string, amount: number) {
    return this.call("settlement.open_channel", { payee, amount });
  }

  closeSettlementChannel(user: string, node: string, amount: number, nonce: number, voucherSignature?: string) {
    return this.call("settlement.close_channel", { user, node, amount, nonce, ...(voucherSignature && { voucher_signature: voucherSignature }) });
  }

  // Peers
  listPeers() {
    return this.call<Record<string, { capabilities: string[]; last_seen: number }>>("peers");
  }
}

/** Singleton daemon client — call daemon.init() after config is loaded */
export const daemon = new DaemonClient();
export type { DaemonClient };
