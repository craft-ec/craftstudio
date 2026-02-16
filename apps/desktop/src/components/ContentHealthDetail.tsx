import { useState, useEffect } from "react";
import { X, Pin, HardDrive } from "lucide-react";
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

interface Props {
  cid: string;
  onClose: () => void;
}

export default function ContentHealthDetail({ cid, onClose }: Props) {
  const daemon = useDaemon();
  const [data, setData] = useState<ContentHealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!daemon || !cid) return;
    daemon.contentHealth(cid).then(setData).catch((e) => setError(e.message));
  }, [daemon, cid]);

  if (error) {
    return (
      <div className="bg-gray-900 rounded-xl p-4 mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-red-400">Error loading health: {error}</span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X size={16} /></button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-gray-900 rounded-xl p-4 mb-4 animate-pulse">
        <span className="text-sm text-gray-500">Loading health data…</span>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-xl p-4 mb-4 border border-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-lg">{data.name}</h3>
          <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
            <span className="font-mono">{truncHash(data.content_id)}</span>
            <span>·</span>
            <span>{formatBytes(data.original_size)}</span>
            <span className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-300">{data.role}</span>
            <span className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-300">{data.stage}</span>
            {data.pinned && <Pin size={12} className="text-craftec-400" />}
          </div>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X size={16} /></button>
      </div>

      {/* Health summary */}
      <div className="flex items-center gap-4 mb-4 text-sm">
        <span>Health: <strong>{(data.health_ratio * 100).toFixed(1)}%</strong></span>
        <span>Min rank: <strong>{data.min_rank}</strong>/{data.k}</span>
        <span className="flex items-center gap-1"><HardDrive size={14} /> {formatBytes(data.local_disk_usage)}</span>
      </div>

      {/* Segment health table */}
      <div className="mb-4">
        <h4 className="text-sm font-medium text-gray-400 mb-2">Segments ({data.segments.length})</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left py-1 px-2 text-gray-400 font-medium">Idx</th>
                <th className="text-left py-1 px-2 text-gray-400 font-medium">Pieces</th>
                <th className="text-left py-1 px-2 text-gray-400 font-medium">Rank</th>
                <th className="text-left py-1 px-2 text-gray-400 font-medium w-48">Rank/k</th>
              </tr>
            </thead>
            <tbody>
              {data.segments.map((seg) => {
                const ratio = data.k > 0 ? seg.rank / data.k : 0;
                return (
                  <tr key={seg.index} className="border-b border-gray-800/50">
                    <td className="py-1 px-2 font-mono text-xs">{seg.index}</td>
                    <td className="py-1 px-2">{seg.local_pieces}</td>
                    <td className="py-1 px-2">{seg.rank}</td>
                    <td className="py-1 px-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-800 rounded-full h-2">
                          <div className={`h-2 rounded-full ${ratioColor(ratio)}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                        </div>
                        <span className="text-xs text-gray-400 w-10 text-right">{(ratio * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Providers */}
      {data.providers.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-400 mb-2">Providers ({data.provider_count})</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left py-1 px-2 text-gray-400 font-medium">Peer</th>
                  <th className="text-left py-1 px-2 text-gray-400 font-medium">Region</th>
                  <th className="text-left py-1 px-2 text-gray-400 font-medium">Score</th>
                  <th className="text-left py-1 px-2 text-gray-400 font-medium">Latency</th>
                </tr>
              </thead>
              <tbody>
                {data.providers.map((p) => (
                  <tr key={p.peer_id} className="border-b border-gray-800/50">
                    <td className="py-1 px-2 font-mono text-xs text-gray-400">{truncHash(p.peer_id)}</td>
                    <td className="py-1 px-2">{p.region}</td>
                    <td className="py-1 px-2">{(p.score * 100).toFixed(0)}%</td>
                    <td className="py-1 px-2">{p.latency_ms.toFixed(1)} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
