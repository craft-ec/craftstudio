import { useState, useEffect, useCallback } from "react";
import {
  LayoutDashboard,
  Activity,
  Users,
  HardDrive,
  FileText,
  Database,
  Layers,
  MonitorSmartphone,
} from "lucide-react";
import { useInstanceStore } from "../../store/instanceStore";
import { useDaemon, useActiveConnection } from "../../hooks/useDaemon";
import StatCard from "../../components/StatCard";
import NetworkHealth from "../../components/NetworkHealth";
// DaemonNodes removed — instance management is now via tab bar

export default function DashboardPage() {
  const instance = useInstanceStore((s) =>
    s.instances.find((i) => i.id === s.activeId)
  );
  const client = useDaemon();
  const { connected, status: connStatus } = useActiveConnection();

  const [stats, setStats] = useState({
    storedBytes: 0,
    contentCount: 0,
    shardCount: 0,
    pinnedCount: 0,
  });
  const [peerCount, setPeerCount] = useState(0);
  const [storagePeers, setStoragePeers] = useState(0);
  const did: string | null = null; // TODO: fetch from daemon

  const loadData = useCallback(async () => {
    if (!client || !connected) return;
    try {
      const [statusRes, peersRes] = await Promise.allSettled([
        client.status(),
        client.listPeers(),
      ]);
      if (statusRes.status === "fulfilled") {
        setStats({
          storedBytes: statusRes.value.stored_bytes,
          contentCount: statusRes.value.content_count,
          shardCount: statusRes.value.shard_count,
          pinnedCount: statusRes.value.pinned_count,
        });
      }
      if (peersRes.status === "fulfilled") {
        const entries = Object.values(peersRes.value || {});
        setPeerCount(entries.length);
        setStoragePeers(
          entries.filter((p) => p.capabilities.includes("Storage")).length
        );
      }
    } catch {
      /* */
    }
  }, [client, connected]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10_000);
    return () => clearInterval(interval);
  }, [loadData]);

  const formatBytes = (b: number) => {
    if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`;
    if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`;
    if (b >= 1e3) return `${(b / 1e3).toFixed(1)} KB`;
    return `${b} B`;
  };

  const caps = instance?.capabilities;

  return (
    <div className="max-w-4xl mx-auto">
      <NetworkHealth />

      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <LayoutDashboard className="text-craftec-500" /> Dashboard
      </h1>

      {/* Connection Status */}
      <div className="bg-gray-900 rounded-xl p-6 mb-6 flex items-center gap-4">
        <div
          className={`w-4 h-4 rounded-full ${
            connStatus === "connected"
              ? "bg-green-400 animate-pulse"
              : connStatus === "connecting"
              ? "bg-yellow-400 animate-pulse"
              : "bg-red-400"
          }`}
        />
        <div>
          <p className="font-semibold text-lg">
            {connStatus === "connected"
              ? "Connected"
              : connStatus === "connecting"
              ? "Connecting..."
              : "Disconnected"}
          </p>
          <p className="text-sm text-gray-500">{instance?.url ?? "—"}</p>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={Activity}
          label="Status"
          value={connected ? "Online" : "Offline"}
          color={connected ? "text-green-400" : "text-red-400"}
        />
        <StatCard
          icon={Users}
          label="Peers"
          value={String(peerCount)}
          sub={`${storagePeers} storage`}
        />
        <StatCard
          icon={HardDrive}
          label="Stored"
          value={formatBytes(stats.storedBytes)}
        />
        <StatCard
          icon={FileText}
          label="Content"
          value={String(stats.contentCount)}
          sub={`${stats.shardCount} shards`}
        />
      </div>

      {/* Capability Badges */}
      {caps && (
        <div className="bg-gray-900 rounded-xl p-4 mb-6">
          <h2 className="text-lg font-semibold mb-3">Capabilities</h2>
          <div className="flex gap-3">
            {[
              { key: "client", label: "Client", icon: MonitorSmartphone, enabled: caps.client },
              { key: "storage", label: "Storage", icon: Database, enabled: caps.storage },
              { key: "aggregator", label: "Aggregator", icon: Layers, enabled: caps.aggregator },
            ].map(({ key, label, icon: Icon, enabled }) => (
              <div
                key={key}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                  enabled
                    ? "bg-craftec-600/20 text-craftec-400 border border-craftec-600/30"
                    : "bg-gray-800 text-gray-500 border border-gray-700"
                }`}
              >
                <Icon size={14} />
                {label}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Node DID */}
      {did && (
        <div className="bg-gray-900 rounded-xl p-4 mb-6">
          <h2 className="text-lg font-semibold mb-2">Node DID</h2>
          <p className="text-sm text-gray-400 font-mono break-all">{did}</p>
        </div>
      )}
    </div>
  );
}
