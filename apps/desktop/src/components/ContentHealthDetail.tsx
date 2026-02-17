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
      <div className="bg-white rounded-xl p-4 mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-red-500">Error loading health: {error}</span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700"><X size={16} /></button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white rounded-xl p-4 mb-4 animate-pulse">
        <span className="text-sm text-gray-500">Loading health data…</span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl p-4 mb-4 border border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-lg">{data.name}</h3>
          <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
            <span className="font-mono">{truncHash(data.content_id)}</span>
            <span>·</span>
            <span>{formatBytes(data.original_size)}</span>
            <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">{data.role}</span>
            <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">{data.stage}</span>
            {data.pinned && <Pin size={12} className="text-craftec-400" />}
          </div>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-700"><X size={16} /></button>
      </div>

      {/* Health summary */}
      <div className="flex items-center gap-6 mb-4 text-sm">
        <div>
          <span className="text-gray-500">Health:</span>
          <span className={`ml-1 font-semibold ${data.health_ratio >= 0.8 ? 'text-green-600' : data.health_ratio >= 0.5 ? 'text-amber-500' : 'text-red-500'}`}>
            {(data.health_ratio * 100).toFixed(1)}%
          </span>
        </div>
        <div>
          <span className="text-gray-500">Min rank:</span>
          <span className={`ml-1 font-semibold ${data.min_rank >= data.k * 0.8 ? 'text-green-600' : data.min_rank >= data.k * 0.5 ? 'text-amber-500' : 'text-red-500'}`}>
            {data.min_rank}
          </span>
          <span className="text-gray-400">/{data.k}</span>
        </div>
        <div>
          <span className="text-gray-500">Providers:</span>
          <span className={`ml-1 font-semibold ${data.provider_count >= 5 ? 'text-green-600' : data.provider_count >= 3 ? 'text-amber-500' : 'text-red-500'}`}>
            {data.provider_count}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <HardDrive size={14} className="text-gray-400" />
          <span className="text-gray-600">{formatBytes(data.local_disk_usage)}</span>
        </div>
      </div>

      {/* Segment health table */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-gray-700">Per-Segment Health ({data.segments.length} segments)</h4>
          <div className="text-xs text-gray-500">
            k={data.k} required for reconstruction
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-1 px-2 text-gray-400 font-medium text-xs uppercase">Segment</th>
                <th className="text-left py-1 px-2 text-gray-400 font-medium text-xs uppercase">Local Pieces</th>
                <th className="text-left py-1 px-2 text-gray-400 font-medium text-xs uppercase">Network Rank</th>
                <th className="text-left py-1 px-2 text-gray-400 font-medium text-xs uppercase">Redundancy Level</th>
                <th className="text-left py-1 px-2 text-gray-400 font-medium text-xs uppercase w-48">Coverage</th>
              </tr>
            </thead>
            <tbody>
              {data.segments.map((seg) => {
                const ratio = data.k > 0 ? seg.rank / data.k : 0;
                const redundancyLevel = seg.rank >= data.k * 1.5 ? 'High' : 
                                       seg.rank >= data.k ? 'Good' : 
                                       seg.rank >= data.k * 0.7 ? 'Low' : 'Critical';
                const levelColor = seg.rank >= data.k * 1.5 ? 'text-green-600' :
                                  seg.rank >= data.k ? 'text-blue-600' :
                                  seg.rank >= data.k * 0.7 ? 'text-amber-500' : 'text-red-500';
                
                return (
                  <tr key={seg.index} className="border-b border-gray-200/50 hover:bg-gray-50">
                    <td className="py-2 px-2">
                      <span className="font-mono text-sm font-medium">{seg.index}</span>
                    </td>
                    <td className="py-2 px-2">
                      <span className="text-gray-600">{seg.local_pieces}</span>
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold ${levelColor}`}>{seg.rank}</span>
                        <span className="text-gray-400 text-xs">/{data.k} min</span>
                      </div>
                    </td>
                    <td className="py-2 px-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        redundancyLevel === 'High' ? 'bg-green-100 text-green-700' :
                        redundancyLevel === 'Good' ? 'bg-blue-100 text-blue-700' :
                        redundancyLevel === 'Low' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {redundancyLevel}
                      </span>
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-2 min-w-[80px]">
                          <div className={`h-2 rounded-full transition-all ${ratioColor(ratio)}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 w-10 text-right font-medium">{(ratio * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        {/* Summary stats */}
        <div className="flex items-center gap-6 mt-3 p-3 bg-gray-50 rounded-lg text-xs">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span className="text-gray-600">
              {data.segments.filter(s => s.rank >= data.k * 1.5).length} high redundancy
            </span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
            <span className="text-gray-600">
              {data.segments.filter(s => s.rank >= data.k && s.rank < data.k * 1.5).length} good redundancy
            </span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-amber-500"></div>
            <span className="text-gray-600">
              {data.segments.filter(s => s.rank >= data.k * 0.7 && s.rank < data.k).length} low redundancy
            </span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-red-500"></div>
            <span className="text-gray-600">
              {data.segments.filter(s => s.rank < data.k * 0.7).length} critical
            </span>
          </div>
        </div>
      </div>

      {/* Providers */}
      {data.providers.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-400 mb-2">Providers ({data.provider_count})</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-1 px-2 text-gray-400 font-medium">Peer</th>
                  <th className="text-left py-1 px-2 text-gray-400 font-medium">Region</th>
                  <th className="text-left py-1 px-2 text-gray-400 font-medium">Score</th>
                  <th className="text-left py-1 px-2 text-gray-400 font-medium">Latency</th>
                </tr>
              </thead>
              <tbody>
                {data.providers.map((p) => (
                  <tr key={p.peer_id} className="border-b border-gray-200/50">
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
