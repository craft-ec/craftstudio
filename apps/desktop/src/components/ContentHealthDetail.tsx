import { useState, useEffect } from "react";
import { HardDrive, ChevronDown, ChevronRight } from "lucide-react";
import { useDaemon } from "../hooks/useDaemon";
import type { ContentHealthResponse } from "../services/daemon";

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
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-[10px] font-medium text-gray-400 hover:text-gray-600">
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        Providers ({count})
      </button>
      {open && (
        <table className="w-full text-[11px] mt-0.5">
          <thead>
            <tr className="border-b border-gray-200 text-gray-400">
              <th className="text-left py-0.5 px-2">Peer</th>
              <th className="text-left py-0.5 px-2">Pieces</th>
              <th className="text-left py-0.5 px-2">Region</th>
              <th className="text-left py-0.5 px-2">Score</th>
              <th className="text-left py-0.5 px-2">Latency</th>
              <th className="text-left py-0.5 px-2">Merkle</th>
            </tr>
          </thead>
          <tbody>
            {providers.map((p) => (
              <tr key={p.peer_id} className="border-b border-gray-200/30">
                <td className="py-0.5 px-2 font-mono text-gray-500">{truncHash(p.peer_id)}{p.is_local ? ' (local)' : ''}</td>
                <td className="py-0.5 px-2">{p.piece_count}</td>
                <td className="py-0.5 px-2 text-gray-600">{p.region}</td>
                <td className="py-0.5 px-2">{(p.score * 100).toFixed(0)}%</td>
                <td className="py-0.5 px-2 text-gray-600">{p.latency_ms.toFixed(1)}ms</td>
                <td className="py-0.5 px-2 font-mono text-gray-400">{truncHash(p.merkle_root || '')}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
    return <div className="px-4 py-2 text-xs text-red-500">Error loading health: {error}</div>;
  }

  if (!data) {
    return <div className="px-4 py-2 text-xs text-gray-500 animate-pulse">Loading health data…</div>;
  }

  return (
    <div className="px-4 py-2 bg-gray-50/50">
      {/* Network summary — only fields NOT already in the row */}
      <div className="flex items-center gap-4 text-xs text-gray-600 mb-2">
        <span>
          Network Health: <span className={`font-semibold ${data.health_ratio >= 0.8 ? 'text-green-600' : data.health_ratio >= 0.5 ? 'text-amber-500' : 'text-red-500'}`}>
            {(data.health_ratio * 100).toFixed(1)}%
          </span>
        </span>
        <span>Providers: <span className="font-semibold">{data.provider_count}</span></span>
        <span>Total pieces: <span className="font-semibold">{data.network_total_pieces ?? '—'}</span></span>
        <span className="flex items-center gap-1"><HardDrive size={10} className="text-gray-400" />{formatBytes(data.local_disk_usage)}</span>
        <span>{data.has_demand ? '🔥 Hot' : '— No demand'}</span>
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
            <th className="text-left py-0.5 px-2 w-32">Coverage</th>
            <th className="text-left py-0.5 px-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {data.segments.map((seg) => {
            const networkPieces = seg.network_pieces ?? seg.rank;
            const segK = seg.k ?? data.k;
            const ratio = segK > 0 ? networkPieces / segK : 0;
            const ok = seg.network_reconstructable ?? (networkPieces >= segK);
            return (
              <tr key={seg.index} className="border-b border-gray-200/30">
                <td className="py-0.5 px-2 font-mono">{seg.index}</td>
                <td className="py-0.5 px-2">{seg.local_pieces}</td>
                <td className="py-0.5 px-2">
                  <span className={ok ? 'text-green-600' : 'text-red-500'}>{networkPieces}</span>
                </td>
                <td className="py-0.5 px-2">{segK}</td>
                <td className="py-0.5 px-2">
                  <div className="flex items-center gap-1">
                    <div className="flex-1 bg-gray-200 rounded-full h-1.5 min-w-[60px]">
                      <div className={`h-1.5 rounded-full ${ratioColor(ratio)}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                    </div>
                    <span className="text-gray-500 w-8 text-right">{(ratio * 100).toFixed(0)}%</span>
                  </div>
                </td>
                <td className="py-0.5 px-2">
                  {seg.needs_repair ? (
                    <span className="text-amber-500 font-medium">⚠️ Repair</span>
                  ) : seg.needs_degradation ? (
                    <span className="text-blue-500 font-medium">↓ Excess</span>
                  ) : (
                    <span className="text-green-600 font-medium">✓ Healthy</span>
                  )}
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
    </div>
  );
}
