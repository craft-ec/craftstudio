import { useState, useEffect, useCallback } from "react";
import { Globe, Activity, Users, Clock, Zap, DollarSign } from "lucide-react";
import { useDaemon, useActiveConnection } from "../../hooks/useDaemon";
import { useConfigStore } from "../../store/configStore";
import StatCard from "../../components/StatCard";
import DaemonOffline from "../../components/DaemonOffline";
import NetworkHealth from "../../components/NetworkHealth";
import { usePeers } from "../../hooks/usePeers";

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

export default function NetworkPage() {
  const { connected } = useActiveConnection();
  const client = useDaemon();
  const { config, updateSection } = useConfigStore();
  const capabilities: Capability[] = [
    { key: "client", label: "Client", enabled: config.node.capabilities.client },
    { key: "storage", label: "Storage", enabled: config.node.capabilities.storage },
    { key: "aggregator", label: "Aggregator", enabled: config.node.capabilities.aggregator },
  ];
  const peerStats = usePeers();
  const [peers, setPeers] = useState<Record<string, { capabilities: string[]; last_seen: number }>>({});
  const [channels, setChannels] = useState<ChannelSummary>({ count: 0, totalLocked: 0, totalSpent: 0 });
  const [uptime, setUptime] = useState("—");

  const loadNodeData = useCallback(async () => {
    if (!connected || !client) return;
    try {
      const [peersData, channelData, statusData] = await Promise.allSettled([
        client.listPeers(),
        client.listChannels(),
        client.status(),
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
      if (statusData.status === "fulfilled") {
        setUptime(connected ? "Connected" : "—");
      }
    } catch { /* */ }
  }, [connected, client]);

  useEffect(() => { loadNodeData(); }, [loadNodeData]);

  const toggle = (key: string) => {
    const caps = { ...config.node.capabilities };
    caps[key as keyof typeof caps] = !caps[key as keyof typeof caps];
    updateSection("node", { capabilities: caps });
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

      {/* Status */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard icon={Activity} label="Status" value={connected ? "Online" : "Offline"} color={connected ? "text-green-400" : "text-red-400"} />
        <StatCard icon={Users} label="Peers" value={String(peerCount)} sub={`${storagePeers} storage`} />
        <StatCard icon={Clock} label="Uptime" value={uptime} />
        <StatCard icon={Zap} label="Capabilities" value={`${capabilities.filter((c) => c.enabled).length}/3`} />
      </div>

      {/* Channel Summary */}
      <div className="bg-gray-900 rounded-xl p-4 mb-6">
        <h2 className="text-lg font-semibold mb-3">Payment Channels</h2>
        <div className="grid grid-cols-3 gap-4">
          <StatCard icon={DollarSign} label="Active Channels" value={String(channels.count)} />
          <StatCard icon={DollarSign} label="Total Locked" value={String(channels.totalLocked)} color="text-craftec-500" />
          <StatCard icon={DollarSign} label="Remaining" value={String(channels.totalLocked - channels.totalSpent)} color="text-green-400" />
        </div>
      </div>

      {/* Peer Breakdown */}
      <div className="bg-gray-900 rounded-xl p-4 mb-6">
        <h2 className="text-lg font-semibold mb-3">Peer Breakdown</h2>
        <div className="grid grid-cols-4 gap-4">
          <StatCard icon={Users} label="Total" value={String(peerStats.total)} />
          <StatCard icon={Users} label="Client" value={String(peerStats.client)} />
          <StatCard icon={Users} label="Storage" value={String(peerStats.storage)} color="text-craftec-500" />
          <StatCard icon={Users} label="Aggregator" value={String(peerStats.aggregator)} />
        </div>
      </div>

      {/* Capability Toggles */}
      <div className="bg-gray-900 rounded-xl p-4">
        <h2 className="text-lg font-semibold mb-3">Network Capabilities</h2>
        <p className="text-sm text-gray-500 mb-4">Enable capabilities to see their tabs on the DataCraft page.</p>
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
