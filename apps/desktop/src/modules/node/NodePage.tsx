import { useState, useEffect, useCallback } from "react";
import { Monitor, Activity, HardDrive, ShieldCheck, DollarSign, Users, Clock, Zap } from "lucide-react";
import { daemon } from "../../services/daemon";
import { useDaemonStore } from "../../store/daemonStore";
import { useConfigStore } from "../../store/configStore";
import StatCard from "../../components/StatCard";
import DaemonOffline from "../../components/DaemonOffline";

interface Capability {
  key: string;
  label: string;
  enabled: boolean;
}

interface ChannelSummary {
  count: number;
  totalLocked: number;
  totalSpent: number;
}

interface ReceiptSummary {
  total: number;
  recent: number; // last 24h
}

export default function NodePage() {
  const { connected } = useDaemonStore();
  const { config, updateSection } = useConfigStore();
  const capabilities: Capability[] = [
    { key: "storage", label: "Storage", enabled: config.node.capabilities.storage },
    { key: "relay", label: "Relay", enabled: config.node.capabilities.relay },
    { key: "client", label: "Client", enabled: config.node.capabilities.client },
    { key: "aggregator", label: "Aggregator", enabled: config.node.capabilities.aggregator },
  ];
  const [peers, setPeers] = useState<Record<string, { capabilities: string[]; last_seen: number }>>({});
  const [channels, setChannels] = useState<ChannelSummary>({ count: 0, totalLocked: 0, totalSpent: 0 });
  const [receipts, setReceipts] = useState<ReceiptSummary>({ total: 0, recent: 0 });
  const [storedBytes, setStoredBytes] = useState(0);
  const [shardCount, setShardCount] = useState(0);

  const loadNodeData = useCallback(async () => {
    if (!connected) return;
    try {
      const [peersData, channelData, receiptData, statusData] = await Promise.allSettled([
        daemon.listPeers(),
        daemon.listChannels(),
        daemon.listStorageReceipts({ limit: 1, offset: 0 }),
        daemon.status(),
      ]);

      if (peersData.status === "fulfilled") setPeers(peersData.value || {});
      if (channelData.status === "fulfilled") {
        const chs = channelData.value.channels || [];
        setChannels({
          count: chs.length,
          totalLocked: chs.reduce((s, c) => s + c.locked_amount, 0),
          totalSpent: chs.reduce((s, c) => s + c.spent, 0),
        });
      }
      if (receiptData.status === "fulfilled") {
        setReceipts({ total: receiptData.value.total, recent: receiptData.value.receipts.length });
      }
      if (statusData.status === "fulfilled") {
        setStoredBytes(statusData.value.total_stored || 0);
        setShardCount(statusData.value.shard_count || 0);
      }
    } catch {
      // individual failures handled by allSettled
    }
  }, [connected]);

  useEffect(() => {
    loadNodeData();
  }, [loadNodeData]);

  const toggle = (key: string) => {
    const caps = { ...config.node.capabilities };
    caps[key as keyof typeof caps] = !caps[key as keyof typeof caps];
    updateSection('node', { capabilities: caps });
  };

  const peerCount = Object.keys(peers).length;
  const storagePeers = Object.values(peers).filter((p) => p.capabilities.includes("Storage")).length;

  function formatBytes(bytes: number): string {
    if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
    if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
    return `${bytes} B`;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <DaemonOffline />

      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Monitor className="text-craftec-500" /> Dashboard
      </h1>

      {/* Node Status */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard icon={Activity} label="Status" value={connected ? "Online" : "Offline"} color={connected ? "text-green-400" : "text-red-400"} />
        <StatCard icon={Users} label="Peers" value={String(peerCount)} sub={`${storagePeers} storage`} />
        <StatCard icon={Clock} label="Channels" value={String(channels.count)} sub={`${channels.totalLocked} locked`} />
        <StatCard icon={Zap} label="Capabilities" value={`${capabilities.filter((c) => c.enabled).length}/4`} />
      </div>

      {/* Storage Stats */}
      <div className="bg-gray-900 rounded-xl p-4 mb-6">
        <h2 className="text-lg font-semibold mb-3">Storage Stats</h2>
        <div className="grid grid-cols-4 gap-4">
          <StatCard icon={HardDrive} label="Total Stored" value={formatBytes(storedBytes)} />
          <StatCard icon={HardDrive} label="Shard Count" value={String(shardCount)} />
          <StatCard icon={ShieldCheck} label="Storage Receipts" value={String(receipts.total)} />
          <StatCard icon={Activity} label="Payment Channels" value={String(channels.count)} sub={`${channels.totalSpent} spent`} />
        </div>
      </div>

      {/* Earnings */}
      <div className="bg-gray-900 rounded-xl p-4 mb-6">
        <h2 className="text-lg font-semibold mb-3">Channel Summary</h2>
        <div className="grid grid-cols-3 gap-4">
          <StatCard icon={DollarSign} label="Total Locked" value={String(channels.totalLocked)} color="text-craftec-500" />
          <StatCard icon={DollarSign} label="Total Spent" value={String(channels.totalSpent)} color="text-orange-400" />
          <StatCard icon={DollarSign} label="Remaining" value={String(channels.totalLocked - channels.totalSpent)} color="text-green-400" />
        </div>
      </div>

      {/* Capability Toggles */}
      <div className="bg-gray-900 rounded-xl p-4">
        <h2 className="text-lg font-semibold mb-3">Node Capabilities</h2>
        <div className="space-y-3">
          {capabilities.map(({ key, label, enabled }) => (
            <div key={key} className="flex items-center justify-between">
              <span>{label}</span>
              <button
                onClick={() => toggle(key)}
                className={`w-10 h-6 rounded-full relative transition-colors ${enabled ? "bg-craftec-600" : "bg-gray-700"}`}
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
