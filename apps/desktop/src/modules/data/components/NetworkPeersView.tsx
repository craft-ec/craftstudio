import { useState, useEffect } from "react";
import { 
  Users, 
  HardDrive, 
  Activity, 
  Shield, 
  Zap,
  Database,
  Server,
  Globe
} from "lucide-react";
import { useDaemon, useActiveConnection } from "../../../hooks/useDaemon";
import StatCard from "../../../components/StatCard";

interface PeerInfo {
  peer_id: string;
  capabilities: string[];
  score: number;
  avg_latency_ms: number;
  storage_committed_bytes: number;
  storage_used_bytes: number;
}

interface NetworkStats {
  total_committed: number;
  total_used: number;
  total_available: number;
  storage_node_count: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function shortenPeerId(peerId: string): string {
  if (peerId.length <= 16) return peerId;
  return `${peerId.slice(0, 8)}…${peerId.slice(-8)}`;
}

function getCapabilityIcon(capability: string) {
  switch (capability.toLowerCase()) {
    case 'storage':
      return <HardDrive size={12} className="text-blue-500" />;
    case 'aggregator':
      return <Database size={12} className="text-purple-500" />;
    case 'relay':
      return <Globe size={12} className="text-green-500" />;
    case 'challenger':
      return <Shield size={12} className="text-orange-500" />;
    default:
      return <Server size={12} className="text-gray-500" />;
  }
}

function getScoreColor(score: number): string {
  if (score >= 0.8) return "text-green-600";
  if (score >= 0.5) return "text-amber-500";
  return "text-red-500";
}

function getLatencyColor(latency: number): string {
  if (latency <= 50) return "text-green-600";
  if (latency <= 150) return "text-amber-500";
  return "text-red-500";
}

export default function NetworkPeersView() {
  const daemon = useDaemon();
  const { connected } = useActiveConnection();
  const [peers, setPeers] = useState<Record<string, PeerInfo>>({});
  const [networkStats, setNetworkStats] = useState<NetworkStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!connected || !daemon) return;

    const loadPeerData = async () => {
      try {
        setLoading(true);
        const [peersData, statsData] = await Promise.allSettled([
          daemon.listPeers(),
          daemon.networkStorage()
        ]);

        if (peersData.status === 'fulfilled' && peersData.value) {
          setPeers(peersData.value);
        }
        
        if (statsData.status === 'fulfilled' && statsData.value) {
          setNetworkStats(statsData.value);
        }
      } catch (err) {
        console.error('Failed to load peer data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadPeerData();
    const interval = setInterval(loadPeerData, 15000); // Refresh every 15s
    return () => clearInterval(interval);
  }, [connected, daemon]);

  if (!connected) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Users size={32} className="mx-auto mb-2 opacity-50" />
        <p className="text-sm">Connect to daemon to see network peers</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-8 text-gray-500">
        <div className="animate-spin mb-2">
          <Activity size={32} className="mx-auto opacity-50" />
        </div>
        <p className="text-sm">Loading network information...</p>
      </div>
    );
  }

  const peerList = Object.entries(peers);
  const storagePeers = peerList.filter(([, peer]) => peer.capabilities.includes("Storage"));
  
  // Calculate network distribution balance
  const totalCommitted = storagePeers.reduce((acc, [, peer]) => acc + peer.storage_committed_bytes, 0);
  const totalUsed = storagePeers.reduce((acc, [, peer]) => acc + peer.storage_used_bytes, 0);
  const utilizationRate = totalCommitted > 0 ? (totalUsed / totalCommitted) * 100 : 0;

  // Peer distribution by capability
  const capabilityStats = {
    storage: storagePeers.length,
    aggregator: peerList.filter(([, peer]) => peer.capabilities.includes("Aggregator")).length,
    challenger: peerList.filter(([, peer]) => peer.capabilities.includes("Challenger")).length,
    relay: peerList.filter(([, peer]) => peer.capabilities.includes("Relay")).length,
  };

  // Average metrics
  const avgLatency = peerList.length > 0 
    ? peerList.reduce((acc, [, peer]) => acc + peer.avg_latency_ms, 0) / peerList.length 
    : 0;
  const avgScore = peerList.length > 0
    ? peerList.reduce((acc, [, peer]) => acc + peer.score, 0) / peerList.length
    : 0;

  return (
    <div className="space-y-4">
      {/* Network Overview Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard 
          icon={Users} 
          label="Connected Peers" 
          value={String(peerList.length)}
          sub={`${capabilityStats.storage} storage nodes`}
        />
        <StatCard 
          icon={HardDrive} 
          label="Network Storage" 
          value={formatBytes(networkStats?.total_committed || totalCommitted)}
          sub={`${formatBytes(networkStats?.total_used || totalUsed)} used (${utilizationRate.toFixed(1)}%)`}
          color={utilizationRate > 90 ? "text-red-500" : utilizationRate > 70 ? "text-amber-500" : "text-green-600"}
        />
        <StatCard 
          icon={Activity} 
          label="Avg Latency" 
          value={`${avgLatency.toFixed(0)}ms`}
          color={getLatencyColor(avgLatency)}
        />
        <StatCard 
          icon={Zap} 
          label="Avg Score" 
          value={`${(avgScore * 100).toFixed(0)}%`}
          color={getScoreColor(avgScore)}
        />
      </div>

      {/* Capability Distribution */}
      <div className="bg-gray-50 rounded-lg p-4 mb-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Network Capabilities</h4>
        <div className="grid grid-cols-4 gap-4">
          <div className="flex items-center gap-2">
            <HardDrive size={16} className="text-blue-500" />
            <span className="text-sm text-gray-600">Storage: {capabilityStats.storage}</span>
          </div>
          <div className="flex items-center gap-2">
            <Database size={16} className="text-purple-500" />
            <span className="text-sm text-gray-600">Aggregator: {capabilityStats.aggregator}</span>
          </div>
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-orange-500" />
            <span className="text-sm text-gray-600">Challenger: {capabilityStats.challenger}</span>
          </div>
          <div className="flex items-center gap-2">
            <Globe size={16} className="text-green-500" />
            <span className="text-sm text-gray-600">Relay: {capabilityStats.relay}</span>
          </div>
        </div>
      </div>

      {/* Peer List */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-3">Connected Peers ({peerList.length})</h4>
        
        {peerList.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Users size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No peers connected</p>
            <p className="text-xs text-gray-400 mt-1">Network discovery in progress...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Peer ID</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Capabilities</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Score</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Latency</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Storage</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Utilization</th>
                </tr>
              </thead>
              <tbody>
                {peerList
                  .sort((a, b) => b[1].score - a[1].score) // Sort by score desc
                  .map(([peerId, peer]) => {
                    const utilization = peer.storage_committed_bytes > 0 
                      ? (peer.storage_used_bytes / peer.storage_committed_bytes) * 100 
                      : 0;
                    const isStorageNode = peer.capabilities.includes("Storage");
                    
                    return (
                      <tr key={peerId} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 px-3">
                          <span className="font-mono text-xs text-gray-600">
                            {shortenPeerId(peerId)}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-1">
                            {peer.capabilities.map((cap) => (
                              <div key={cap} className="flex items-center gap-1" title={cap}>
                                {getCapabilityIcon(cap)}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <span className={`font-medium ${getScoreColor(peer.score)}`}>
                            {(peer.score * 100).toFixed(0)}%
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <span className={getLatencyColor(peer.avg_latency_ms)}>
                            {peer.avg_latency_ms.toFixed(0)}ms
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          {isStorageNode ? (
                            <div className="text-xs">
                              <div>{formatBytes(peer.storage_committed_bytes)} committed</div>
                              <div className="text-gray-500">{formatBytes(peer.storage_used_bytes)} used</div>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {isStorageNode && peer.storage_committed_bytes > 0 ? (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-gray-200 rounded-full h-2 min-w-[40px]">
                                <div 
                                  className={`h-2 rounded-full transition-all ${
                                    utilization > 90 ? 'bg-red-500' : 
                                    utilization > 70 ? 'bg-amber-500' : 'bg-green-500'
                                  }`}
                                  style={{ width: `${Math.min(100, utilization)}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-500 min-w-[32px]">
                                {utilization.toFixed(0)}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Storage Distribution Balance */}
      {storagePeers.length > 0 && (
        <div className="bg-blue-50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-blue-900 mb-3 flex items-center gap-2">
            <HardDrive size={16} />
            Piece Distribution Balance
          </h4>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-lg font-semibold text-blue-900">
                {formatBytes(networkStats?.total_available || (totalCommitted - totalUsed))}
              </div>
              <div className="text-xs text-blue-600">Available capacity</div>
            </div>
            <div>
              <div className="text-lg font-semibold text-blue-900">
                {storagePeers.length}
              </div>
              <div className="text-xs text-blue-600">Storage nodes active</div>
            </div>
            <div>
              <div className="text-lg font-semibold text-blue-900">
                {utilizationRate.toFixed(1)}%
              </div>
              <div className="text-xs text-blue-600">Network utilization</div>
            </div>
          </div>
          
          {/* Distribution recommendations */}
          <div className="mt-3 text-xs text-blue-700">
            {utilizationRate > 85 && (
              <div className="flex items-center gap-1 text-red-600">
                <Shield size={12} />
                <span>High utilization - consider adding more storage nodes</span>
              </div>
            )}
            {storagePeers.length < 3 && (
              <div className="flex items-center gap-1 text-amber-600">
                <Shield size={12} />
                <span>Low redundancy - network needs more storage nodes for reliability</span>
              </div>
            )}
            {storagePeers.length >= 5 && utilizationRate < 50 && (
              <div className="flex items-center gap-1 text-green-600">
                <Shield size={12} />
                <span>Healthy network - good distribution and capacity</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}