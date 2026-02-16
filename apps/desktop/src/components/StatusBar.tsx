import { useTunnelStore } from "../store/tunnelStore";
import { useActiveConnection } from "../hooks/useDaemon";
import { useConfigStore } from "../store/configStore";
import { useInstanceStore } from "../store/instanceStore";
import { usePeers } from "../hooks/usePeers";

export default function StatusBar() {
  const { status, speedUp, speedDown } = useTunnelStore();
  const { connected: daemonConnected } = useActiveConnection();
  const cluster = useConfigStore((s) => s.config.solana.cluster);
  const { total: peerCount, storage: storagePeers } = usePeers();
  const activeInstance = useInstanceStore((s) =>
    s.instances.find((i) => i.id === s.activeId)
  );

  const tunnelColor = status === "connected" ? "text-green-600" : status === "connecting" ? "text-amber-500" : "text-gray-400";
  const daemonColor = daemonConnected ? "text-green-600" : "text-red-500";
  const clusterLabel = cluster === "mainnet-beta" ? "Mainnet" : cluster === "devnet" ? "Devnet" : "Custom";

  return (
    <div className="h-8 bg-white border-t border-gray-200 flex items-center px-4 text-xs gap-6">
      <span className="text-gray-500 font-medium">{clusterLabel}</span>
      {activeInstance && (
        <span className="text-gray-400">{activeInstance.name}</span>
      )}
      <span className={daemonColor}>
        ● Daemon {daemonConnected ? "Online" : "Offline"}
      </span>
      {daemonConnected && (
        <span className="text-gray-500">
          👥 {peerCount} peers ({storagePeers} storage)
        </span>
      )}
      <span className={tunnelColor}>
        ● Tunnel {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
      <span className="text-gray-500">↑ {formatSpeed(speedUp)}</span>
      <span className="text-gray-500">↓ {formatSpeed(speedDown)}</span>
    </div>
  );
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec > 1_000_000) return `${(bytesPerSec / 1_000_000).toFixed(1)} MB/s`;
  if (bytesPerSec > 1_000) return `${(bytesPerSec / 1_000).toFixed(1)} KB/s`;
  return `${bytesPerSec} B/s`;
}
