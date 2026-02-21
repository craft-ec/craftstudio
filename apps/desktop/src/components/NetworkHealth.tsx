import { useState, useEffect } from "react";
import { Activity, HardDrive, Users, Shield, Receipt } from "lucide-react";
import { useDaemon, useActiveConnection } from "../hooks/useDaemon";
import StatCard from "./StatCard";
import type { NetworkHealthResponse } from "../services/daemon";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function healthColor(ratio: number): string {
  if (ratio >= 0.8) return "bg-green-500";
  if (ratio >= 0.5) return "bg-yellow-500";
  return "bg-red-500";
}

export default function NetworkHealth() {
  const daemon = useDaemon();
  const { connected } = useActiveConnection();
  const [data, setData] = useState<NetworkHealthResponse | null>(null);

  useEffect(() => {
    if (!connected || !daemon) return;
    daemon.networkHealth().then(setData).catch(() => setData(null));
  }, [connected, daemon]);

  if (!connected || !data) return null;

  const ratio = data.average_health_ratio;

  return (
    <div className="mb-6">
      {/* Health ratio bar */}
      <div className="glass-panel rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium flex items-center gap-2 text-theme-text">
            <Activity size={16} className="text-craftec-400" /> Network Health
          </span>
          <span className="text-sm font-semibold text-theme-text">{(ratio * 100).toFixed(1)}%</span>
        </div>
        <div className="w-full bg-theme-border rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all ${healthColor(ratio)} shadow-[0_0_10px_currentColor]`}
            style={{ width: `${Math.min(100, ratio * 100)}%` }}
          />
        </div>
        <div className="flex items-center gap-4 mt-2 text-xs text-theme-muted">
          <span className="text-green-500">{data.healthy_content_count} healthy</span>
          {data.degraded_content_count > 0 && (
            <span className="text-red-400">{data.degraded_content_count} degraded</span>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard icon={Shield} label="Content" value={String(data.total_content_count)} sub={`${data.healthy_content_count} healthy`} />
        <StatCard icon={Users} label="Storage Nodes" value={String(data.storage_node_count)} sub={`${data.total_providers_unique} providers`} />
        <StatCard icon={HardDrive} label="Network Storage" value={formatBytes(data.total_network_storage_used)} sub={`of ${formatBytes(data.total_network_storage_committed)}`} />
        <StatCard icon={Receipt} label="Receipts (epoch)" value={String(data.receipts_this_epoch)} color="text-green-600" />
      </div>
    </div>
  );
}
