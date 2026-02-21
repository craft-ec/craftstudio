import { useState, useEffect } from "react";
import { HardDrive, ChevronDown, ChevronRight, Clock } from "lucide-react";
import { useDaemon } from "../hooks/useDaemon";
import type { ContentHealthResponse, HealthSnapshot, HealthAction } from "../services/daemon";
import HealthTimeline from "./HealthTimeline";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function truncHash(h: string): string {
  if (h.length <= 12) return h;
  return `${h.slice(0, 8)}…${h.slice(-4)}`;
}

function ratioColor(ratio: number): string {
  if (ratio >= 0.8) return "bg-green-500";
  if (ratio >= 0.5) return "bg-yellow-500";
  return "bg-red-500";
}

function ProvidersList({ providers, count }: { providers: ContentHealthResponse['providers']; count: number }) {
  const [open, setOpen] = useState(false);
  // Only show peers that actually hold pieces for this content.
  // Peers with piece_count === 0 are connected peers, not providers.
  const actualProviders = providers.filter((p) => p.piece_count > 0);
  const displayCount = actualProviders.length;
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-[10px] font-medium text-gray-400 hover:text-gray-600">
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        Providers ({displayCount}{displayCount !== count ? ` of ${count} peers` : ''})
      </button>
      {open && (
        actualProviders.length === 0 ? (
          <p className="text-[10px] text-gray-400 px-2 mt-0.5">No peers holding pieces yet</p>
        ) : (
          <table className="w-full text-[11px] mt-0.5">
            <thead>
              <tr className="border-b border-gray-200 text-gray-400">
                <th className="text-left py-0.5 px-2">Peer</th>
                <th className="text-left py-0.5 px-2">Pieces</th>
                <th className="text-left py-0.5 px-2">Region</th>
                <th className="text-left py-0.5 px-2">Score</th>
                <th className="text-left py-0.5 px-2">Latency</th>
              </tr>
            </thead>
            <tbody>
              {actualProviders.map((p) => (
                <tr key={p.peer_id} className="border-b border-gray-200/30">
                  <td className="py-0.5 px-2 font-mono text-gray-500">{truncHash(p.peer_id)}{p.is_local ? ' (local)' : ''}</td>
                  <td className="py-0.5 px-2">{p.piece_count}</td>
                  <td className="py-0.5 px-2 text-gray-600">{p.region ?? '—'}</td>
                  <td className="py-0.5 px-2">{p.score != null ? `${(p.score * 100).toFixed(0)}%` : '—'}</td>
                  <td className="py-0.5 px-2 text-gray-600">{p.latency_ms != null ? `${p.latency_ms.toFixed(1)}ms` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </div>
  );
}


function formatCountdown(lastScanTime: number | null, intervalSecs: number): string {
  if (!lastScanTime) return "—";
  const nextScanMs = lastScanTime + intervalSecs * 1000;
  const now = Date.now();
  const diffMs = nextScanMs - now;
  if (diffMs <= 0) return "imminent";
  const mins = Math.floor(diffMs / 60000);
  const secs = Math.floor((diffMs % 60000) / 1000);
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function formatAction(action: HealthAction): string {
  if (action.Repaired) return `Repaired seg ${action.Repaired.segment} @${action.Repaired.offset}`;
  if (action.Degraded) return `Degraded seg ${action.Degraded.segment}`;
  return "—";
}

function HealthScanSection({ cid, lastScanTime, intervalSecs }: { cid: string; lastScanTime: number | null; intervalSecs: number }) {
  const daemon = useDaemon();
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<HealthSnapshot[] | null>(null);
  const [countdown, setCountdown] = useState(() => formatCountdown(lastScanTime, intervalSecs));

  // Update countdown every second
  useEffect(() => {
    if (!lastScanTime) return;
    const id = setInterval(() => setCountdown(formatCountdown(lastScanTime, intervalSecs)), 1000);
    return () => clearInterval(id);
  }, [lastScanTime, intervalSecs]);

  // Fetch history when opened
  useEffect(() => {
    if (!open || !daemon || history) return;
    daemon.contentHealthHistory(cid).then(r => setHistory(r.snapshots)).catch(() => setHistory([]));
  }, [open, daemon, cid, history]);

  return (
    <div className="mt-1">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-[10px] font-medium text-gray-400 hover:text-gray-600">
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <Clock size={10} />
        HealthScan
        <span className="ml-1 text-gray-500 font-normal">
          Next scan in: <span className="font-semibold">{countdown}</span>
        </span>
      </button>
      {open && (
        <div className="mt-1 max-h-48 overflow-y-auto">
          {history === null ? (
            <div className="text-[10px] text-gray-400 animate-pulse px-2">Loading scan history…</div>
          ) : history.length === 0 ? (
            <div className="text-[10px] text-gray-400 px-2">No scan history yet</div>
          ) : (
            <table className="w-full text-[10px]">
              <thead>
                <tr className="border-b border-gray-200 text-gray-400">
                  <th className="text-left py-0.5 px-2">Time</th>
                  <th className="text-left py-0.5 px-2">Health</th>
                  <th className="text-left py-0.5 px-2">Providers</th>
                  <th className="text-left py-0.5 px-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {history.slice().reverse().map((snap, i) => (
                  <tr key={i} className="border-b border-gray-200/30">
                    <td className="py-0.5 px-2 text-gray-500 whitespace-nowrap">{new Date(snap.timestamp).toLocaleTimeString()}</td>
                    <td className="py-0.5 px-2">
                      <span className={snap.health_ratio >= 0.8 ? 'text-green-600' : snap.health_ratio >= 0.5 ? 'text-amber-500' : 'text-red-500'}>
                        {(snap.health_ratio * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-0.5 px-2">{snap.provider_count}</td>
                    <td className="py-0.5 px-2 text-gray-500">
                      {snap.actions.length === 0 ? '—' : snap.actions.map(formatAction).join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  cid: string;
}

export default function ContentHealthDetail({ cid }: Props) {
  const daemon = useDaemon();
  const [data, setData] = useState<ContentHealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!daemon || !cid) return;
    setData(null);
    setError(null);
    daemon.contentHealth(cid).then(setData).catch((e) => setError(e.message));
  }, [daemon, cid]);

  if (error) {
    // Storage-only nodes don't have the content manifest — health details
    // are only available on nodes that published (or fetched) the content.
    const isManifestMissing = error.toLowerCase().includes("manifest") || error.toLowerCase().includes("not found");
    if (isManifestMissing) {
      return (
        <div className="px-4 py-3 bg-blue-50/60 text-xs text-blue-700 flex items-start gap-2">
          <span className="mt-0.5">ℹ️</span>
          <span>
            Health details require the content manifest, which only exists on the node that published this content.
            This node stores pieces only — per-segment health is tracked by the publisher.
          </span>
        </div>
      );
    }
    return <div className="px-4 py-2 text-xs text-red-500">Error loading health: {error}</div>;
  }

  if (!data) {
    return <div className="px-4 py-2 text-xs text-gray-500 animate-pulse">Loading health data…</div>;
  }

  const scanned = data.health_scanned;

  return (
    <div className="px-4 py-2 bg-gray-50/50">
      {/* Banner when not yet scanned */}
      {!scanned && (
        <div className="mb-2 px-2 py-1 rounded bg-amber-50 border border-amber-200 text-xs text-amber-700">
          ⏳ Pending first health scan — network data shown is local only
        </div>
      )}

      {/* Network summary — only fields NOT already in the row */}
      <div className="flex items-center gap-4 text-xs text-gray-600 mb-2">
        <span>
          Network Health: {scanned ? (
            <span className={`font-semibold ${data.health_ratio >= 0.8 ? 'text-green-600' : data.health_ratio >= 0.5 ? 'text-amber-500' : 'text-red-500'}`}>
              {(data.health_ratio * 100).toFixed(1)}%
            </span>
          ) : <span className="text-gray-400">—</span>}
        </span>
        <span>Providers: <span className="font-semibold">{scanned ? data.provider_count : '—'}</span></span>
        <span>Total pieces: <span className="font-semibold">{scanned ? (data.network_total_pieces ?? '—') : '—'}</span></span>
        <span className="flex items-center gap-1"><HardDrive size={10} className="text-gray-400" />{formatBytes(data.local_disk_usage)}</span>
        <span>{data.has_demand ? '🔥 Hot' : '— No demand'}</span>
        {(() => {
          const regions = [...new Set((data.providers ?? []).map(p => p.region).filter(Boolean))];
          return regions.length > 0 ? (
            <span title={regions.join(', ')}>🌐 <span className="font-semibold">{regions.length}</span> region{regions.length !== 1 ? 's' : ''}</span>
          ) : null;
        })()}
        <span>Target: <span className="font-semibold">{data.tier_min_ratio}x</span></span>
      </div>

      {/* Merged segment table */}
      <table className="w-full text-xs mb-2">
        <thead>
          <tr className="border-b border-gray-200 text-gray-400 font-medium">
            <th className="text-left py-0.5 px-2">Seg</th>
            <th className="text-left py-0.5 px-2">Local Pieces</th>
            <th className="text-left py-0.5 px-2">Network Pieces</th>
            <th className="text-left py-0.5 px-2">k</th>
            <th className="text-left py-0.5 px-2" title="True rank: linearly independent pieces (GF(256)). Rank ≥ k means reconstructable.">Rank</th>
            <th className="text-left py-0.5 px-2 w-32">Coverage</th>
            <th className="text-left py-0.5 px-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {data.segments.map((seg) => {
            // network_pieces is the sum of piece counts from all providers (via HealthQuery)
            const networkPieces = seg.network_pieces ?? 0;
            const segK = seg.k ?? data.k;
            const ratio = segK > 0 ? networkPieces / segK : 0;
            const ok = networkPieces >= segK;
            return (
              <tr key={seg.index} className="border-b border-gray-200/30">
                <td className="py-0.5 px-2 font-mono">{seg.index}</td>
                <td className="py-0.5 px-2">{seg.local_pieces}</td>
                <td className="py-0.5 px-2">
                  {scanned ? (
                    <span className={ok ? 'text-green-600' : 'text-red-500'}>{networkPieces}</span>
                  ) : <span className="text-gray-400">—</span>}
                </td>
                <td className="py-0.5 px-2">{segK}</td>
                <td className="py-0.5 px-2" title={seg.rank != null ? `${seg.rank} / ${segK} linearly independent pieces` : undefined}>
                  {seg.rank != null ? (() => {
                    const rankRatio = segK > 0 ? seg.rank / segK : 0;
                    const rankColor = rankRatio >= 1 ? 'text-green-600' : rankRatio >= 0.5 ? 'text-amber-500' : 'text-red-500';
                    return <span className={`font-mono ${rankColor}`}>{seg.rank}/{segK}</span>;
                  })() : <span className="text-gray-400">—</span>}
                </td>
                <td className="py-0.5 px-2">
                  {scanned ? (
                    <div className="flex items-center gap-1">
                      <div className="flex-1 bg-gray-200 rounded-full h-1.5 min-w-[60px]">
                        <div className={`h-1.5 rounded-full ${ratioColor(ratio)}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                      </div>
                      <span className="text-gray-500 w-8 text-right">{(ratio * 100).toFixed(0)}%</span>
                    </div>
                  ) : <span className="text-gray-400">—</span>}
                </td>
                <td className="py-0.5 px-2">
                  {scanned ? (
                    seg.needs_repair ? (
                      <span className="text-amber-500 font-medium">⚠️ Repair</span>
                    ) : seg.needs_degradation ? (
                      <span className="text-blue-500 font-medium">↓ Excess</span>
                    ) : (
                      <span className="text-green-600 font-medium">✓ Healthy</span>
                    )
                  ) : <span className="text-gray-400">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Providers (collapsible) */}
      {data.providers.length > 0 && (
        <ProvidersList providers={data.providers} count={data.provider_count} />
      )}

      {/* HealthScan */}
      <HealthScanSection cid={cid} lastScanTime={data.last_scan_time} intervalSecs={data.health_scan_interval_secs} />

      {/* Health Timeline */}
      <HealthTimeline cid={cid} />
    </div>
  );
}
