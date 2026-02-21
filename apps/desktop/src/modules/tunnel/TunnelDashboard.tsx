import { useEffect, useCallback, useState } from "react";
import {
  Shield, Power, PowerOff, Wifi, WifiOff,
  Activity, Users, Zap,
  Clock, ArrowUpDown, Globe,
  RefreshCw, MapPin, CheckCircle2, Loader2,
  type LucideIcon,
} from "lucide-react";
import { useTunnelStore, type ConnectionEntry, type AvailableExit } from "../../store/tunnelStore";

// ── Helpers ─────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h}h ${m}m`;
}

/** Map ISO 3166-1 alpha-2 country code → flag emoji */
function countryFlag(code: string | null): string {
  if (!code || code.length !== 2) return "🌐";
  const base = 127397; // 127462 - 65 ('A')
  return String.fromCodePoint(...code.toUpperCase().split("").map(c => base + c.charCodeAt(0)));
}

const PRIVACY_OPTIONS = [
  { value: "direct", label: "Direct", hops: 0, description: "No anonymity — fastest speed" },
  { value: "single", label: "1 Hop", hops: 1, description: "Basic privacy" },
  { value: "double", label: "2 Hops", hops: 2, description: "Recommended — good balance" },
  { value: "triple", label: "3 Hops", hops: 3, description: "High privacy — slower" },
  { value: "quad", label: "4 Hops", hops: 4, description: "Maximum privacy — slowest" },
];


// ── Latency badge ────────────────────────────────────────

function LatencyBadge({ ms }: { ms: number | null }) {
  if (ms === null) return <span className="text-xs text-theme-muted/50 italic">—</span>;
  const color = ms < 80 ? "text-green-600 bg-green-500/10 border-green-500/20"
    : ms < 200 ? "text-amber-600 bg-amber-500/10 border-amber-500/20"
      : "text-red-400 bg-red-500/10 border-red-500/20";
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded-md border font-mono font-semibold ${color}`}>
      {ms}ms
    </span>
  );
}

// ── Score bar ────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const color = pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-14 h-1.5 rounded-full bg-theme-border overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-theme-muted font-mono">{pct}</span>
    </div>
  );
}

// ── Exit Row ─────────────────────────────────────────────

function ExitRow({
  exit,
  isSelected,
  onSelect,
  disabled,
}: {
  exit: AvailableExit;
  isSelected: boolean;
  onSelect: () => void;
  disabled: boolean;
}) {
  const flag = countryFlag(exit.country_code);
  const label = [exit.city, exit.country_code].filter(Boolean).join(", ") || exit.region;

  return (
    <div
      className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-all cursor-pointer
        ${isSelected
          ? "bg-craftec-500/15 border-craftec-500/40 text-craftec-400"
          : "hover:bg-theme-border/40 border-transparent text-theme-text hover:border-theme-border"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      onClick={!disabled ? onSelect : undefined}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-lg leading-none">{flag}</span>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate leading-tight">{label}</p>
          <p className="text-xs text-theme-muted truncate">{exit.region}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-2">
        <ScoreBar score={exit.score} />
        <LatencyBadge ms={exit.latency_ms} />
        {isSelected && <CheckCircle2 size={14} className="text-craftec-500" />}
      </div>
    </div>
  );
}

// ── Stat Card ───────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="glass-panel rounded-xl p-4 glass-panel-hover">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={16} className="text-theme-muted" />
        <span className="text-xs text-theme-muted uppercase tracking-wider font-medium">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${color ?? "text-theme-text"}`}>{value}</p>
      {sub && <p className="text-xs text-theme-muted/70 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Announce countdown hook ──────────────────────────────
// Shows actual DHT announcement timing from the daemon (120s cycle).
// Uses a local 1s tick so the display is smooth between 5s backend polls.
function useAnnounceStatus(
  enabled: boolean,
  secsAgo: number | null,
): string {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [enabled]);

  if (!enabled) return "";

  if (secsAgo !== null) {
    // Actual DHT announce happened — add local tick to the backend snapshot
    const liveSecsAgo = secsAgo + tick;
    const nextIn = Math.max(0, 120 - liveSecsAgo);
    return nextIn === 0 ? "announcing…" : `announced ${liveSecsAgo}s ago · next in ~${nextIn}s`;
  }
  // Not yet announced — show static pending (no misleading countdown).
  // announce_capabilities_now() fires immediately on connect, so this
  // transitions to 'announced 0s ago' as soon as the node connects.
  return "pending first announcement";
}

// ── Main Component ──────────────────────────────────────

export default function TunnelDashboard() {
  const { status, peerCount, credits,
    mode, privacyLevel, shardsRelayed, requestsExited,
    history, error,
    connect, disconnect, refreshStatus, fetchHistory,
    setPrivacy, setMode,
    exits, exitsLoading, selectedExit,
    fetchExits, selectExit, clearExit,
    relayAnnouncedSecsAgo, exitAnnouncedSecsAgo,
    peers, peersLoading, fetchPeers,
    proxyEnabled, proxyPort, startProxy, stopProxy,
    vpnBrowserOpen, vpnBrowserUrl, vpnBrowserResult, vpnBrowserLoading,
    vpnNavigate,
  } = useTunnelStore();

  const [exitsExpanded, setExitsExpanded] = useState(true);

  // Derive individual capability toggles from the mode string returned by daemon
  const relayEnabled = mode === "both" || mode === "full" || mode === "relay";
  const exitEnabled = mode === "client_exit" || mode === "full" || mode === "exit";

  const handleCapabilityToggle = useCallback((cap: "relay" | "exit", enabled: boolean) => {
    const newRelay = cap === "relay" ? enabled : relayEnabled;
    const newExit = cap === "exit" ? enabled : exitEnabled;
    const modeStr = newRelay && newExit ? "full"
      : newRelay ? "both"
        : newExit ? "client_exit"
          : "client";
    setMode(modeStr);
    // Eagerly re-poll so the pending→announced transition is picked up fast
    setTimeout(refreshStatus, 2000);
    setTimeout(refreshStatus, 5000);
  }, [relayEnabled, exitEnabled, setMode, refreshStatus]);

  const relayAnnounceStatus = useAnnounceStatus(relayEnabled, relayAnnouncedSecsAgo);
  const exitAnnounceStatus = useAnnounceStatus(exitEnabled, exitAnnouncedSecsAgo);

  const connected = status === "connected";

  // Poll status every 5s
  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 5000);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  // Load history on mount and after disconnect
  useEffect(() => {
    fetchHistory();
  }, [connected, fetchHistory]);

  // Fetch exits on mount, then every 30s
  useEffect(() => {
    fetchExits();
    const interval = setInterval(fetchExits, 30_000);
    return () => clearInterval(interval);
  }, [fetchExits]);

  // Fetch peers on mount, then every 30s
  useEffect(() => {
    fetchPeers();
    const interval = setInterval(fetchPeers, 30_000);
    return () => clearInterval(interval);
  }, [fetchPeers]);

  const handleConnect = useCallback(async () => {
    const hopOption = PRIVACY_OPTIONS.find(o => o.value === privacyLevel);
    await connect(hopOption?.hops);
  }, [connect, privacyLevel]);

  const isTransitioning = status === "connecting" || status === "disconnecting";

  // Status indicator
  const statusColor = connected
    ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
    : status === "connecting" || status === "disconnecting"
      ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]"
      : status === "ready"
        ? "bg-craftec-500 shadow-[0_0_8px_rgba(92,124,250,0.6)]"
        : "bg-theme-border";

  const statusLabels: Record<string, string> = {
    offline: "Offline",
    initializing: "Starting...",
    ready: "Ready",
    connecting: "Connecting...",
    connected: "Connected",
    disconnecting: "Disconnecting...",
    error: "Error",
  };
  const statusLabel = statusLabels[status] ?? status;

  return (
    <div className="max-w-4xl mx-auto">
      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="text-craftec-500" /> CraftNet
        </h1>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${statusColor} ${isTransitioning ? "animate-pulse" : ""}`} />
          <span className="text-sm text-theme-muted">{statusLabel}</span>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 mb-4 text-sm text-red-400">
          <span>{error}</span>
        </div>
      )}

      {/* ── Connection Control ──────────────────────────── */}
      <div className="glass-panel rounded-xl p-6 mb-6 space-y-4">

        {/* Row 1: Tunnel (daemon) status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${status === "offline" || status === "error"
              ? "bg-theme-border/30 text-theme-muted"
              : "bg-craftec-500/15 border border-craftec-500/25"
              }`}>
              <Shield size={18} className={status !== "offline" ? "text-craftec-400" : "text-theme-muted"} />
            </div>
            <div>
              <p className="text-sm font-semibold text-theme-text">
                Tunnel {status === "offline" ? "Offline" : status === "initializing" ? "Starting…" : "Ready"}
              </p>
              <p className="text-xs text-theme-muted">
                {status === "offline" ? "Start an instance to join the network" : `${peerCount} VPN peers connected`}
              </p>
            </div>
          </div>
          {/* Tunnel indicator */}
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${status === "offline" ? "bg-theme-muted/30"
            : status === "initializing" ? "bg-yellow-400 animate-pulse"
              : "bg-craftec-400 shadow-[0_0_8px_rgba(92,124,250,0.5)]"
            }`} />
        </div>

        <div className="border-t border-theme-border/30" />

        {/* Row 2: VPN routing status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${connected
              ? "bg-green-500/15 border border-green-500/25"
              : "bg-theme-border/30"
              }`}>
              {connected
                ? <Wifi size={18} className="text-green-400" />
                : <WifiOff size={18} className="text-theme-muted" />}
            </div>
            <div>
              <p className="text-sm font-semibold text-theme-text">
                VPN {connected ? "Connected" : isTransitioning ? (status === "connecting" ? "Connecting…" : "Disconnecting…") : "Disconnected"}
              </p>
              <p className="text-xs text-theme-muted">
                {connected
                  ? (proxyEnabled ? `SOCKS5 on 127.0.0.1:${proxyPort}` : vpnBrowserOpen ? "In-App Browser" : "No routing mode active")
                  : "Connect to route traffic through VPN"}
              </p>
            </div>
          </div>
          {/* VPN status indicator */}
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${connected ? "bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]"
            : isTransitioning ? "bg-yellow-400 animate-pulse"
              : "bg-theme-muted/30"
            }`} />
        </div>

        {/* Exit badge when connected */}
        {connected && selectedExit && (
          <div className="flex items-center gap-1.5 w-fit px-2.5 py-1 rounded-full bg-craftec-500/10 border border-craftec-500/25 text-craftec-400 text-xs">
            <MapPin size={10} />
            {countryFlag(selectedExit.country_code)}{" "}
            {[selectedExit.city, selectedExit.country_code].filter(Boolean).join(", ") || selectedExit.region}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 pt-1">
          {!connected && !isTransitioning && status !== "offline" && (
            <>
              <button
                onClick={() => { handleConnect(); useTunnelStore.setState({ vpnBrowserOpen: false }); }}
                className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm bg-craftec-600 hover:bg-craftec-500 text-white shadow-[0_0_12px_rgba(92,124,250,0.3)] border border-craftec-500 transition-all"
              >
                <Zap size={15} /> SOCKS5
              </button>
              <button
                onClick={() => { handleConnect(); useTunnelStore.setState({ vpnBrowserOpen: true }); }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm bg-theme-border/40 hover:bg-theme-border/60 text-theme-text border border-theme-border transition-all"
              >
                <Globe size={15} /> Browser
              </button>
            </>
          )}
          {connected && !isTransitioning && (
            <button
              onClick={disconnect}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 transition-all"
            >
              <PowerOff size={15} /> Disconnect
            </button>
          )}
          {isTransitioning && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-theme-muted border border-theme-border bg-theme-border/20">
              <Loader2 size={14} className="animate-spin" /> {status === "connecting" ? "Connecting…" : "Disconnecting…"}
            </div>
          )}
          {status === "offline" && (
            <p className="text-xs text-theme-muted/60 py-2">Start an instance first to enable the VPN</p>
          )}
        </div>
      </div>

      {/* ── VPN Mode Tabs (shown when connected or a mode is active) ───── */}
      {(connected || proxyEnabled || vpnBrowserOpen) && (
        <div className="glass-panel rounded-xl mb-6 overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-theme-border">
            <button
              onClick={() => useTunnelStore.setState({ vpnBrowserOpen: false })}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-2 ${!vpnBrowserOpen
                ? "border-craftec-500 text-craftec-400 bg-craftec-500/5"
                : "border-transparent text-theme-muted hover:text-theme-text hover:bg-theme-border/20"
                }`}
            >
              <Zap size={13} /> SOCKS5
              {proxyEnabled && <span className="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_5px_rgba(74,222,128,0.6)]" />}
            </button>
            <button
              onClick={() => useTunnelStore.setState({ vpnBrowserOpen: true })}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-2 ${vpnBrowserOpen
                ? "border-craftec-500 text-craftec-400 bg-craftec-500/5"
                : "border-transparent text-theme-muted hover:text-theme-text hover:bg-theme-border/20"
                }`}
            >
              <Globe size={13} /> Browser
              {vpnBrowserLoading && <Loader2 size={11} className="animate-spin" />}
            </button>
          </div>

          {/* SOCKS5 tab content */}
          {!vpnBrowserOpen && (
            <div className="p-4 flex items-start justify-between">
              <div>
                <p className="text-xs text-theme-muted mb-2">Configure your system or browser to use this proxy:</p>
                <code className="text-sm font-mono text-theme-text bg-theme-border/40 px-3 py-1.5 rounded-lg block w-fit">
                  socks5://127.0.0.1:{proxyPort}
                </code>
                <p className="text-xs text-theme-muted/50 mt-2">
                  {proxyEnabled ? "Proxy active — traffic routed through VPN exit" : "Ready to start proxy when connected"}
                </p>
              </div>
              {proxyEnabled ? (
                <button
                  onClick={stopProxy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-500/10 border border-red-500/20 transition-colors"
                >
                  <PowerOff size={11} /> Stop
                </button>
              ) : (
                <button
                  onClick={() => startProxy?.(proxyPort)}
                  disabled={!connected}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-craftec-400 hover:bg-craftec-500/10 border border-craftec-500/20 transition-colors disabled:opacity-40"
                >
                  <Power size={11} /> Start
                </button>
              )}
            </div>
          )}

          {/* Browser tab content */}
          {vpnBrowserOpen && (
            <div className="p-4">
              {/* URL bar */}
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={vpnBrowserUrl}
                  onChange={e => useTunnelStore.setState({ vpnBrowserUrl: e.target.value })}
                  onKeyDown={e => e.key === "Enter" && vpnNavigate(vpnBrowserUrl)}
                  placeholder="https://example.com"
                  className="flex-1 px-3 py-2 text-sm rounded-lg bg-theme-border/30 border border-theme-border text-theme-text placeholder:text-theme-muted/50 focus:outline-none focus:border-craftec-500/50"
                />
                <button
                  onClick={() => vpnNavigate(vpnBrowserUrl)}
                  disabled={vpnBrowserLoading}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-craftec-600 hover:bg-craftec-500 text-white transition-colors disabled:opacity-50"
                >
                  Go
                </button>
              </div>

              {/* Result */}
              {vpnBrowserResult ? (
                <div className="rounded-lg bg-theme-bg border border-theme-border overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-theme-border/30 border-b border-theme-border text-xs text-theme-muted">
                    <span className={`font-mono font-bold ${vpnBrowserResult.status >= 200 && vpnBrowserResult.status < 300 ? "text-green-400"
                      : vpnBrowserResult.status >= 400 ? "text-red-400" : "text-yellow-400"
                      }`}>{vpnBrowserResult.status || "ERR"}</span>
                    <span className="truncate">{vpnBrowserResult.url}</span>
                    <span className="ml-auto flex-shrink-0">{vpnBrowserResult.content_type.split(";")[0]}</span>
                  </div>
                  <pre className="p-3 text-xs text-theme-text/80 overflow-auto max-h-64 whitespace-pre-wrap font-mono">
                    {vpnBrowserResult.body.slice(0, 8000)}
                    {vpnBrowserResult.body.length > 8000 && "\n\n[truncated]"}
                  </pre>
                </div>
              ) : (
                <p className="text-xs text-theme-muted/60 text-center py-4">
                  {vpnBrowserLoading ? "Fetching through VPN…" : "Enter a URL and press Go to browse through the VPN tunnel"}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Stats ───────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={Users}
          label="VPN Peers"
          value={String(peerCount)}
          sub="CraftNet peers"
          color={peerCount > 0 ? "text-green-600" : "text-gray-400"}
        />
        <StatCard
          icon={Zap}
          label="Credits"
          value={credits.toLocaleString()}
        />
        <StatCard
          icon={ArrowUpDown}
          label="Relayed"
          value={String(shardsRelayed)}
          sub={`${requestsExited} exits`}
        />
        <StatCard
          icon={Activity}
          label="Mode"
          value={mode === "full" ? "Relay+Exit" : mode === "both" ? "Client+Relay" : mode === "client_exit" ? "Client+Exit" : mode.charAt(0).toUpperCase() + mode.slice(1)}
          sub={relayEnabled && exitEnabled ? "Forwarding + exiting traffic" : relayEnabled ? "Relaying traffic" : exitEnabled ? "Exiting traffic" : "Using VPN only"}
        />
      </div>

      {/* ── Configuration ───────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Privacy Level */}
        <div className="glass-panel rounded-xl p-4">
          <h3 className="text-sm font-semibold text-theme-text mb-3 flex items-center gap-2">
            <Shield size={14} className="text-craftec-400" />
            Privacy Level
          </h3>
          <div className="space-y-1.5">
            {PRIVACY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setPrivacy(opt.value)}
                disabled={connected}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${privacyLevel === opt.value
                  ? "bg-craftec-500/20 border border-craftec-500/30 text-craftec-400"
                  : "hover:bg-theme-border/50 text-theme-muted border border-transparent"
                  } ${connected ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <span className="font-medium">{opt.label}</span>
                <span className="text-xs opacity-70">{opt.description}</span>
              </button>
            ))}
          </div>
          {connected && (
            <p className="text-xs text-gray-400 mt-2">Disconnect to change privacy level</p>
          )}
        </div>

        {/* Node Capabilities */}
        <div className="glass-panel rounded-xl p-4">
          <h3 className="text-sm font-semibold text-theme-text mb-3 flex items-center gap-2">
            <Globe size={14} className="text-blue-400" />
            Node Capabilities
          </h3>
          <div className="space-y-2">
            {/* Client — always on, locked */}
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-theme-border/30 border border-theme-border opacity-70">
              <div>
                <p className="text-sm font-medium text-theme-text">Client</p>
                <p className="text-xs text-theme-muted">Use VPN — always enabled</p>
              </div>
              <div className="w-9 h-5 rounded-full bg-craftec-500 flex items-center justify-end pr-0.5 cursor-not-allowed">
                <div className="w-4 h-4 rounded-full bg-white shadow" />
              </div>
            </div>

            {/* Relay toggle */}
            <button
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-all hover:bg-theme-border/30
                border-theme-border"
              onClick={() => handleCapabilityToggle("relay", !relayEnabled)}
            >
              <div className="text-left">
                <p className="text-sm font-medium text-theme-text">Relay</p>
                <p className="text-xs text-theme-muted">Forward traffic for others, earn credits</p>
                {relayEnabled && relayAnnounceStatus && (
                  <p className="text-xs mt-0.5 font-mono"
                    style={{ color: relayAnnouncedSecsAgo !== null && relayAnnouncedSecsAgo < 35 ? "#22c55e" : "#f59e0b" }}>
                    {relayAnnounceStatus}
                  </p>
                )}
              </div>
              <div className={`w-9 h-5 rounded-full transition-colors flex items-center shrink-0 ml-3 ${relayEnabled ? "bg-craftec-500 justify-end pr-0.5" : "bg-theme-border/70 justify-start pl-0.5"
                }`}>
                <div className="w-4 h-4 rounded-full bg-white shadow" />
              </div>
            </button>

            {/* Exit toggle */}
            <button
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-all hover:bg-theme-border/30
                border-theme-border"
              onClick={() => handleCapabilityToggle("exit", !exitEnabled)}
            >
              <div className="text-left">
                <p className="text-sm font-medium text-theme-text">Exit</p>
                <p className="text-xs text-theme-muted">Execute requests at the network edge, earn credits</p>
                {exitEnabled && exitAnnounceStatus && (
                  <p className="text-xs mt-0.5 font-mono"
                    style={{ color: exitAnnouncedSecsAgo !== null && exitAnnouncedSecsAgo < 35 ? "#22c55e" : "#f59e0b" }}>
                    {exitAnnounceStatus}
                  </p>
                )}
              </div>
              <div className={`w-9 h-5 rounded-full transition-colors flex items-center shrink-0 ml-3 ${exitEnabled ? "bg-emerald-500 justify-end pr-0.5" : "bg-theme-border/70 justify-start pl-0.5"
                }`}>
                <div className="w-4 h-4 rounded-full bg-white shadow" />
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* ── Exit Node Selection ───────────────────────────── */}
      <div className="glass-panel rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3
            className="text-sm font-semibold text-theme-text flex items-center gap-2 cursor-pointer select-none"
            onClick={() => setExitsExpanded(e => !e)}
          >
            <MapPin size={14} className="text-emerald-500" />
            Exit Node
            {selectedExit ? (
              <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-craftec-500/15 border border-craftec-500/25 text-craftec-400">
                {countryFlag(selectedExit.country_code)}{" "}
                {[selectedExit.city, selectedExit.country_code].filter(Boolean).join(", ") || selectedExit.region}
              </span>
            ) : (
              <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-theme-border/50 text-theme-muted border border-theme-border">
                Auto
              </span>
            )}
          </h3>
          <button
            onClick={fetchExits}
            className="p-1.5 rounded-lg hover:bg-theme-border/50 text-theme-muted transition-colors"
            title="Refresh exit list"
          >
            {exitsLoading
              ? <Loader2 size={13} className="animate-spin" />
              : <RefreshCw size={13} />
            }
          </button>
        </div>

        {exitsExpanded && (
          <>
            {/* Auto row */}
            <div
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border mb-1 cursor-pointer transition-all
                ${!selectedExit
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600"
                  : "hover:bg-theme-border/40 border-transparent text-theme-muted hover:border-theme-border"
                }`}
              onClick={() => clearExit()}
            >
              <span className="text-base leading-none">🌐</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Auto</p>
                <p className="text-xs text-theme-muted">Best available exit (automatic)</p>
              </div>
              {!selectedExit && <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />}
            </div>

            {/* Exit rows */}
            {exitsLoading && exits.length === 0 ? (
              <div className="flex items-center justify-center py-6 text-theme-muted/50 gap-2 text-sm">
                <Loader2 size={16} className="animate-spin" />
                <span>Discovering exits...</span>
              </div>
            ) : exits.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-theme-muted/50">
                <Globe size={24} className="mb-1.5 opacity-40" />
                <p className="text-xs text-center">No exit nodes discovered yet</p>
                <p className="text-xs text-center opacity-70">Try connecting to the network first</p>
              </div>
            ) : (
              <div className="space-y-1 max-h-52 overflow-y-auto">
                {exits.map(exit => (
                  <ExitRow
                    key={exit.pubkey}
                    exit={exit}
                    isSelected={selectedExit?.pubkey === exit.pubkey}
                    onSelect={() => selectExit(exit)}
                    disabled={false}
                  />
                ))}
              </div>
            )}

            <p className="text-xs text-theme-muted/50 mt-2 text-center">
              {exits.length > 0
                ? `${exits.length} exit${exits.length === 1 ? "" : "s"} online · refreshes every 30s`
                : "Exits are discovered via DHT after connecting"
              }
            </p>
          </>
        )}
      </div>

      {/* ── Network Peers ────────────────────────────────── */}
      <div className="glass-panel rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-theme-text flex items-center gap-2">
            <Users size={14} className="text-craftec-400" />
            Network Peers
            <span className="text-xs font-normal px-1.5 py-0.5 rounded-full bg-theme-border/50 text-theme-muted border border-theme-border">
              {peers.filter(p => p.online).length}/{peers.length}
            </span>
          </h3>
          <button
            onClick={fetchPeers}
            className="p-1.5 rounded-lg hover:bg-theme-border/50 text-theme-muted transition-colors"
            title="Refresh peer list"
          >
            {peersLoading
              ? <Loader2 size={13} className="animate-spin" />
              : <RefreshCw size={13} />
            }
          </button>
        </div>

        {peers.length === 0 ? (
          <p className="text-xs text-theme-muted/60 text-center py-4">
            {peersLoading ? "Discovering peers…" : "No peers discovered yet. Start the VPN to join the network."}
          </p>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {[...peers]
              .sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0) || b.score - a.score)
              .map(peer => {
                const roleColors: Record<string, string> = {
                  relay: "bg-craftec-500/15 text-craftec-400 border-craftec-500/25",
                  exit: "bg-amber-500/15 text-amber-400 border-amber-500/25",
                };
                const loc = [peer.city, peer.country_code].filter(Boolean).join(", ") || peer.region || "";
                const lastSeen = peer.last_seen_secs < 60
                  ? `${peer.last_seen_secs}s ago`
                  : peer.last_seen_secs < 3600
                    ? `${Math.floor(peer.last_seen_secs / 60)}m ago`
                    : `${Math.floor(peer.last_seen_secs / 3600)}h ago`;

                return (
                  <div key={peer.peer_id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-theme-border/20 hover:bg-theme-border/35 transition-colors">
                    {/* Online dot */}
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${peer.online ? "bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.6)]" : "bg-theme-muted/40"}`} />

                    {/* Role badge */}
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border flex-shrink-0 uppercase tracking-wide ${roleColors[peer.role] ?? "bg-theme-border/50 text-theme-muted border-theme-border"}`}>
                      {peer.role}
                    </span>

                    {/* Peer ID + location */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-theme-text truncate">
                        {peer.peer_id.slice(0, 20)}…
                      </p>
                      {loc && <p className="text-[10px] text-theme-muted truncate">{loc}</p>}
                    </div>

                    {/* Score */}
                    <div className="flex flex-col items-end gap-0.5 flex-shrink-0 text-right">
                      <div className="flex items-center gap-1">
                        <div className="w-12 h-1 rounded-full bg-theme-border/50 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-craftec-500"
                            style={{ width: `${peer.score}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-theme-muted w-5">{peer.score}</span>
                      </div>
                      <p className="text-[10px] text-theme-muted/60">{lastSeen} · {peer.load_percent}% load</p>
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        <p className="text-xs text-theme-muted/50 mt-2 text-center">
          {peers.length > 0
            ? `${peers.length} peer${peers.length === 1 ? "" : "s"} known · refreshes every 30s`
            : "Peers discovered via DHT after connecting"}
        </p>
      </div>

      {/* ── Connection History ───────────────────────────── */}
      <div className="glass-panel rounded-xl p-4">
        <h3 className="text-sm font-semibold text-theme-text mb-3 flex items-center gap-2">
          <Clock size={14} className="text-theme-muted/70" />
          Connection History
        </h3>
        {history.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-theme-border">
                  <th className="text-left py-2 px-3 text-theme-muted font-medium text-xs uppercase tracking-wider">Connected</th>
                  <th className="text-left py-2 px-3 text-theme-muted font-medium text-xs uppercase tracking-wider">Duration</th>
                  <th className="text-left py-2 px-3 text-theme-muted font-medium text-xs uppercase tracking-wider">Region</th>
                  <th className="text-left py-2 px-3 text-theme-muted font-medium text-xs uppercase tracking-wider">Sent</th>
                  <th className="text-left py-2 px-3 text-theme-muted font-medium text-xs uppercase tracking-wider">Received</th>
                </tr>
              </thead>
              <tbody>
                {history.slice().reverse().slice(0, 10).map((entry: ConnectionEntry) => (
                  <tr key={entry.id} className="border-b border-theme-border/50 hover:bg-theme-border/20 transition-colors">
                    <td className="py-2 px-3 text-theme-text">
                      {new Date(entry.connected_at * 1000).toLocaleString()}
                    </td>
                    <td className="py-2 px-3 text-theme-text">
                      {entry.duration_secs != null ? formatDuration(entry.duration_secs) : "—"}
                    </td>
                    <td className="py-2 px-3 text-theme-muted">
                      {entry.exit_region ?? "Auto"}
                    </td>
                    <td className="py-2 px-3 text-theme-text">{formatBytes(entry.bytes_sent)}</td>
                    <td className="py-2 px-3 text-theme-text">{formatBytes(entry.bytes_received)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-theme-muted/50">
            <Clock size={28} className="mb-2 opacity-50" />
            <p className="text-sm">No connection history yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
