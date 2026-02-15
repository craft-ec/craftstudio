import { useTunnelStore } from "../store/tunnelStore";
import { useDaemonStore } from "../store/daemonStore";
import { useConfigStore } from "../store/configStore";
import { usePeers } from "../hooks/usePeers";

export default function StatusBar() {
  const { status, speedUp, speedDown } = useTunnelStore();
  const { connected: daemonConnected } = useDaemonStore();
  const cluster = useConfigStore((s) => s.config.solana.cluster);
  const { total: peerCount, storage: storagePeers } = usePeers();

  const tunnelColor = status === "connected" ? "text-green-400" : status === "connecting" ? "text-yellow-400" : "text-gray-500";
  const daemonColor = daemonConnected ? "text-green-400" : "text-red-400";
  const clusterLabel = cluster === "mainnet-beta" ? "Mainnet" : cluster === "devnet" ? "Devnet" : "Custom";

  return (
    <div className="h-8 bg-gray-900 border-t border-gray-800 flex items-center px-4 text-xs gap-6">
      <span className="text-gray-400 font-medium">{clusterLabel}</span>
      <span className={daemonColor}>
        ● Daemon {daemonConnected ? "Online" : "Offline"}
      </span>
      {daemonConnected && (
        <span className="text-gray-400">
          👥 {peerCount} peers ({storagePeers} storage)
        </span>
      )}
      <span className={tunnelColor}>
        ● Tunnel {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
      <span className="text-gray-400">↑ {formatSpeed(speedUp)}</span>
      <span className="text-gray-400">↓ {formatSpeed(speedDown)}</span>
    </div>
  );
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec > 1_000_000) return `${(bytesPerSec / 1_000_000).toFixed(1)} MB/s`;
  if (bytesPerSec > 1_000) return `${(bytesPerSec / 1_000).toFixed(1)} KB/s`;
  return `${bytesPerSec} B/s`;
}
