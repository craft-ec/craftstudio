import { useState, useEffect, useCallback } from "react";
import { Globe, Activity, Users, Clock, Zap, HardDrive, Database, Receipt, MapPin } from "lucide-react";
import { useDaemon, useActiveConnection } from "../../hooks/useDaemon";
import { useActiveInstance } from "../../hooks/useActiveInstance";
import { useInstanceStore } from "../../store/instanceStore";
import StatCard from "../../components/StatCard";
import DaemonOffline from "../../components/DaemonOffline";
import NetworkHealth from "../../components/NetworkHealth";
import { usePeers } from "../../hooks/usePeers";
import type { NodeStatsResponse } from "../../services/daemon";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatUptime(secs: number): string {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
  return `${Math.floor(secs / 86400)}d ${Math.floor((secs % 86400) / 3600)}h`;
}

function truncHash(h: string): string {
  if (h.length <= 12) return h;
  return `${h.slice(0, 8)}…${h.slice(-4)}`;
}

interface Capability {
  key: string;
  label: string;
  enabled: boolean;
}

export default function NetworkPage() {
  const { connected } = useActiveConnection();
  const client = useDaemon();
  const instance = useActiveInstance();
  const updateInstance = useInstanceStore((s) => s.updateInstance);
  const caps = instance?.capabilities ?? [];
  const capabilities: Capability[] = [
    { key: "client", label: "Client", enabled: caps.includes('client') },
    { key: "storage", label: "Storage", enabled: caps.includes('storage') },
    { key: "aggregator", label: "Aggregator", enabled: caps.includes('aggregator') },
  ];
  const peerStats = usePeers();
  const [peers, setPeers] = useState<Record<string, { capabilities: string[] }>>({});
  const [networkStorage, setNetworkStorage] = useState({ total_committed: 0, total_used: 0, total_available: 0, storage_node_count: 0 });
  const [nodeStats, setNodeStats] = useState<NodeStatsResponse | null>(null);

  const loadNodeData = useCallback(async () => {
    if (!connected || !client) return;
    try {
      const [peersData, storageData, statsData] = await Promise.allSettled([
        client.listPeers(),
        client.networkStorage(),
        client.nodeStats(),
      ]);

      if (peersData.status === "fulfilled") setPeers(peersData.value || {});
      if (storageData.status === "fulfilled") setNetworkStorage(storageData.value);
      if (statsData.status === "fulfilled") setNodeStats(statsData.value);
    } catch { /* */ }
  }, [connected, client]);

  useEffect(() => { loadNodeData(); }, [loadNodeData]);

  const toggle = (key: string) => {
    if (!instance) return;
    const has = instance.capabilities.includes(key);
    const newCaps = has
      ? instance.capabilities.filter((c) => c !== key)
      : [...instance.capabilities, key];
    updateInstance(instance.id, { capabilities: newCaps });
  };

  const peerCount = Object.keys(peers).length;
  const storagePeers = Object.values(peers).filter((p) => p.capabilities.includes("Storage")).length;

  return (
    <div className="max-w-4xl mx-auto">
      <DaemonOffline />

      <NetworkHealth />

      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Globe className="text-craftec-500" /> Network Overview
      </h1>

      {/* Node Stats */}
      {nodeStats && (
        <div className="bg-white rounded-xl p-4 mb-6">
          <h2 className="text-lg font-semibold mb-3">This Node</h2>
          <div className="grid grid-cols-4 gap-4 mb-4">
            <StatCard icon={Database} label="Content" value={String(nodeStats.content_count)} sub={`${nodeStats.published_count} published · ${nodeStats.stored_count} stored`} />
            <StatCard icon={HardDrive} label="Local Pieces" value={String(nodeStats.total_local_pieces)} />
            <StatCard icon={HardDrive} label="Disk Usage" value={formatBytes(nodeStats.total_disk_usage)} />
            <StatCard icon={Receipt} label="Receipts" value={String(nodeStats.receipts_generated)} color="text-green-600" />
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-400">
            <span className="flex items-center gap-1"><Clock size={14} /> {formatUptime(nodeStats.uptime_secs)}</span>
            {nodeStats.region && <span className="flex items-center gap-1"><MapPin size={14} /> {nodeStats.region}</span>}
            <span className="font-mono text-xs" title={nodeStats.storage_root}>Root: {truncHash(nodeStats.storage_root)}</span>
            {nodeStats.capabilities.map((cap) => (
              <span key={cap} className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 text-xs">{cap}</span>
            ))}
          </div>
        </div>
      )}

      {/* Status */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard icon={Activity} label="Status" value={connected ? "Online" : "Offline"} color={connected ? "text-green-600" : "text-red-500"} />
        <StatCard icon={Users} label="Peers" value={String(peerCount)} sub={`${storagePeers} storage`} />
        <StatCard icon={Clock} label="Uptime" value={nodeStats ? formatUptime(nodeStats.uptime_secs) : "—"} />
        <StatCard icon={Zap} label="Capabilities" value={`${capabilities.filter((c) => c.enabled).length}/3`} />
      </div>

      {/* Peer Breakdown */}
      <div className="bg-white rounded-xl p-4 mb-6">
        <h2 className="text-lg font-semibold mb-3">Peer Breakdown</h2>
        <div className="grid grid-cols-4 gap-4">
          <StatCard icon={Users} label="Total" value={String(peerStats.total)} />
          <StatCard icon={Users} label="Client" value={String(peerStats.client)} />
          <StatCard icon={Users} label="Storage" value={String(peerStats.storage)} color="text-craftec-500" />
          <StatCard icon={Users} label="Aggregator" value={String(peerStats.aggregator)} />
        </div>
      </div>

      {/* Network Storage */}
      <div className="bg-white rounded-xl p-4 mb-6">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <HardDrive className="w-5 h-5 text-craftec-500" /> Network Storage
        </h2>
        <div className="grid grid-cols-4 gap-4 mb-4">
          <StatCard icon={HardDrive} label="Committed" value={formatBytes(networkStorage.total_committed)} color="text-craftec-500" />
          <StatCard icon={HardDrive} label="Used" value={formatBytes(networkStorage.total_used)} color="text-amber-500" />
          <StatCard icon={HardDrive} label="Available" value={formatBytes(networkStorage.total_available)} color="text-green-600" />
          <StatCard icon={Users} label="Storage Nodes" value={String(networkStorage.storage_node_count)} />
        </div>
        {networkStorage.total_committed > 0 && (
          <div className="w-full bg-gray-100 rounded-full h-3">
            <div
              className="bg-craftec-500 h-3 rounded-full transition-all"
              style={{ width: `${Math.min(100, (networkStorage.total_used / networkStorage.total_committed) * 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Capability Toggles */}
      <div className="bg-white rounded-xl p-4">
        <h2 className="text-lg font-semibold mb-3">Network Capabilities</h2>
        <p className="text-sm text-gray-500 mb-4">Enable capabilities to see their tabs on the DataCraft page.</p>
        <div className="space-y-3">
          {capabilities.map(({ key, label, enabled }) => (
            <div key={key} className="flex items-center justify-between">
              <span>{label}</span>
              <button
                onClick={() => toggle(key)}
                className={`w-10 h-6 rounded-full relative transition-colors ${enabled ? "bg-craftec-600" : "bg-gray-200"}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${enabled ? "left-5" : "left-1"}`} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
