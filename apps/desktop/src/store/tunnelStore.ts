/**
 * Tunnel store — per-instance CraftNet VPN state via WebSocket JSON-RPC.
 *
 * Each daemon instance has its own CraftNet service accessible through
 * the unified IPC server's "tunnel.*" namespace. The tunnel store operates
 * on the active instance's DaemonClient WebSocket connection.
 */
import { create } from "zustand";
import type { DaemonClient } from "../services/daemon";

export type TunnelStatus =
  | "offline"
  | "initializing"
  | "ready"
  | "connecting"
  | "connected"
  | "disconnecting"
  | "error";

export interface NetworkPeer {
  peer_id: string;
  role: string;
  online: boolean;
  score: number;
  load_percent: number;
  uptime_secs: number;
  last_seen_secs: number;
  active_connections: number;
  country_code: string | null;
  city: string | null;
  region: string;
}

interface TunnelStatusResponse {
  status: TunnelStatus;
  connected: boolean;
  peer_count: number;
  credits: number;
  mode: string;
  privacy_level: string;
  shards_relayed: number;
  requests_exited: number;
  relay_announced_secs_ago: number | null;
  exit_announced_secs_ago: number | null;
  relay_caps_enabled_secs_ago: number | null;
  exit_caps_enabled_secs_ago: number | null;
}

export interface ConnectionEntry {
  id: number;
  connected_at: number;
  disconnected_at: number | null;
  duration_secs: number | null;
  exit_region: string | null;
  bytes_sent: number;
  bytes_received: number;
}

export interface AvailableExit {
  pubkey: string;
  country_code: string | null;
  city: string | null;
  region: string;
  score: number;
  load: number;
  latency_ms: number | null;
}

interface TunnelState {
  status: TunnelStatus;
  peerCount: number;
  credits: number;
  mode: string;
  privacyLevel: string;
  shardsRelayed: number;
  requestsExited: number;
  history: ConnectionEntry[];
  error: string | null;

  /** Seconds since relay was last announced (null = never or not a relay) */
  relayAnnouncedSecsAgo: number | null;
  /** Seconds since exit was last announced (null = never or not an exit) */
  exitAnnouncedSecsAgo: number | null;
  /** Seconds since relay capability was enabled at service level */
  relayCapsEnabledSecsAgo: number | null;
  /** Seconds since exit capability was enabled at service level */
  exitCapsEnabledSecsAgo: number | null;

  /** Available exit nodes discovered from the daemon */
  exits: AvailableExit[];
  exitsLoading: boolean;
  /** The exit the user has selected (null = auto) */
  selectedExit: AvailableExit | null;
  /** Known network peers (relays + exits) */
  peers: NetworkPeer[];
  peersLoading: boolean;

  /** SOCKS5 proxy state */
  proxyEnabled: boolean;
  proxyPort: number;
  /** VPN browser panel */
  vpnBrowserOpen: boolean;
  vpnBrowserUrl: string;
  vpnBrowserResult: { status: number; url: string; content_type: string; body: string } | null;
  vpnBrowserLoading: boolean;

  connect: (hops?: number) => Promise<void>;
  disconnect: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  setPrivacy: (level: string) => Promise<void>;
  setMode: (mode: string) => Promise<void>;
  fetchHistory: () => Promise<void>;

  /** Fetch the list of available exit nodes from the daemon */
  fetchExits: () => Promise<void>;
  /** Persistently select an exit node (survives reconnects) */
  selectExit: (exit: AvailableExit) => Promise<void>;
  /** Clear exit selection — auto-routing */
  clearExit: () => Promise<void>;
  /** Fetch known peers (relay + exit nodes) */
  fetchPeers: () => Promise<void>;
  // Proxy
  startProxy: (port?: number) => Promise<void>;
  stopProxy: () => Promise<void>;
  // VPN browser
  openVpnBrowser: () => void;
  closeVpnBrowser: () => void;
  vpnNavigate: (url: string) => Promise<void>;
}

/** Get the active instance's DaemonClient (WebSocket JSON-RPC). */
async function getActiveClient(): Promise<DaemonClient | null> {
  try {
    // Dynamic import to avoid circular dependency
    const { useInstanceStore } = await import("./instanceStore");
    const client = useInstanceStore.getState().getActiveClient();
    return client ?? null;
  } catch {
    return null;
  }
}

export const useTunnelStore = create<TunnelState>((set) => ({
  status: "offline",
  peerCount: 0,
  credits: 0,
  mode: "client",
  privacyLevel: "double",
  shardsRelayed: 0,
  requestsExited: 0,
  history: [],
  error: null,
  relayAnnouncedSecsAgo: null,
  exitAnnouncedSecsAgo: null,
  relayCapsEnabledSecsAgo: null,
  exitCapsEnabledSecsAgo: null,
  exits: [],
  exitsLoading: false,
  selectedExit: null,
  peers: [],
  peersLoading: false,
  proxyEnabled: false,
  proxyPort: 1080,
  vpnBrowserOpen: false,
  vpnBrowserUrl: "https://example.com",
  vpnBrowserResult: null,
  vpnBrowserLoading: false,

  connect: async (hops) => {
    const client = await getActiveClient();
    if (!client) {
      set({ error: "No active daemon instance" });
      return;
    }
    try {
      set({ status: "connecting", error: null });
      await client.call("tunnel.connect", { hops });
      set({ status: "connected" });
    } catch (e) {
      set({ status: "error", error: String(e) });
    }
  },

  disconnect: async () => {
    const client = await getActiveClient();
    if (!client) return;
    try {
      set({ status: "disconnecting" });
      await client.call("tunnel.disconnect");
      set({ status: "ready" });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  refreshStatus: async () => {
    const client = await getActiveClient();
    if (!client) {
      set({ status: "offline" });
      return;
    }
    try {
      const r = await client.call<TunnelStatusResponse>("tunnel.status");
      set({
        status: r.status,
        peerCount: r.peer_count,
        credits: r.credits,
        mode: r.mode,
        privacyLevel: r.privacy_level,
        shardsRelayed: r.shards_relayed,
        requestsExited: r.requests_exited,
        relayAnnouncedSecsAgo: r.relay_announced_secs_ago ?? null,
        exitAnnouncedSecsAgo: r.exit_announced_secs_ago ?? null,
        relayCapsEnabledSecsAgo: r.relay_caps_enabled_secs_ago ?? null,
        exitCapsEnabledSecsAgo: r.exit_caps_enabled_secs_ago ?? null,
        error: null,
      });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  setPrivacy: async (level) => {
    const client = await getActiveClient();
    if (!client) return;
    try {
      await client.call("tunnel.set_privacy", { level });
      set({ privacyLevel: level });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  setMode: async (mode) => {
    const client = await getActiveClient();
    if (!client) return;
    try {
      await client.call("tunnel.set_mode", { mode });
      set({ mode });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  fetchHistory: async () => {
    const client = await getActiveClient();
    if (!client) return;
    try {
      const h = await client.call<ConnectionEntry[]>("tunnel.history");
      set({ history: h });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  fetchExits: async () => {
    const client = await getActiveClient();
    if (!client) return;
    set({ exitsLoading: true });
    try {
      const exits = await client.call<AvailableExit[]>("tunnel.get_exits");
      // Sort by score desc, then latency asc
      exits.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const latA = a.latency_ms ?? 9999;
        const latB = b.latency_ms ?? 9999;
        return latA - latB;
      });
      set({ exits, exitsLoading: false });
    } catch (e) {
      set({ exitsLoading: false });
      console.warn("fetchExits failed:", e);
    }
  },

  selectExit: async (exit) => {
    const client = await getActiveClient();
    if (!client) return;
    try {
      await client.call("tunnel.set_exit", {
        region: exit.region,
        country_code: exit.country_code ?? null,
        city: exit.city ?? null,
      });
      set({ selectedExit: exit });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  clearExit: async () => {
    const client = await getActiveClient();
    if (!client) {
      set({ selectedExit: null });
      return;
    }
    try {
      // "auto" region means no preference — node picks best exit
      await client.call("tunnel.set_exit", { region: "auto", country_code: null, city: null });
      set({ selectedExit: null });
    } catch {
      // Even if call fails, clear locally so UI reflects intent
      set({ selectedExit: null });
    }
  },

  fetchPeers: async () => {
    const client = await getActiveClient();
    if (!client) { set({ peers: [] }); return; }
    set({ peersLoading: true });
    try {
      const peers = await client.call<NetworkPeer[]>("tunnel.get_peers");
      set({ peers, peersLoading: false });
    } catch (e) {
      set({ peersLoading: false });
      console.warn("fetchPeers failed:", e);
    }
  },

  startProxy: async (port = 1080) => {
    const client = await getActiveClient();
    if (!client) return;
    try {
      await client.call("tunnel.start_proxy", { port });
      set({ proxyEnabled: true, proxyPort: port });
    } catch (e) {
      console.warn("startProxy failed:", e);
    }
  },

  stopProxy: async () => {
    const client = await getActiveClient();
    if (!client) return;
    try {
      await client.call("tunnel.stop_proxy");
      set({ proxyEnabled: false });
    } catch (e) {
      console.warn("stopProxy failed:", e);
    }
  },

  openVpnBrowser: () => set({ vpnBrowserOpen: true }),
  closeVpnBrowser: () => set({ vpnBrowserOpen: false, vpnBrowserResult: null }),

  vpnNavigate: async (url: string) => {
    const client = await getActiveClient();
    if (!client) return;
    // Normalize URL
    const normalized = url.startsWith("http") ? url : `https://${url}`;
    set({ vpnBrowserLoading: true, vpnBrowserUrl: normalized });
    try {
      const result = await client.call<{ status: number; url: string; content_type: string; body: string }>(
        "tunnel.vpn_fetch", { url: normalized }
      );
      set({ vpnBrowserResult: result, vpnBrowserLoading: false, vpnBrowserUrl: result.url });
    } catch (e) {
      set({
        vpnBrowserResult: { status: 0, url: normalized, content_type: "text/plain", body: String(e) },
        vpnBrowserLoading: false,
      });
    }
  },
}));
