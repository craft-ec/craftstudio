import { useTunnelStore } from "../store/tunnelStore";
import { useActiveConnection } from "../hooks/useDaemon";
import { useConfigStore } from "../store/configStore";
import { useInstanceStore } from "../store/instanceStore";
import { usePeers } from "../hooks/usePeers";

export default function StatusBar() {
  const tunnelStatus = useTunnelStore((s) => s.status) ?? "offline";
  const shardsRelayed = useTunnelStore((s) => s.shardsRelayed) ?? 0;
  const requestsExited = useTunnelStore((s) => s.requestsExited) ?? 0;
  const { connected: daemonConnected } = useActiveConnection();
  const cluster = useConfigStore((s) => s.config?.solana?.cluster ?? "devnet");
  const { total: peerCount, storage: storagePeers } = usePeers();
  const activeInstance = useInstanceStore((s) =>
    s.instances.find((i) => i.id === s.activeId)
  );

  const tunnelColor = tunnelStatus === "connected" ? "text-green-600" : tunnelStatus === "connecting" ? "text-amber-500" : "text-gray-400";
  const daemonColor = daemonConnected ? "text-green-600" : "text-red-500";
  const clusterLabel = cluster === "mainnet-beta" ? "Mainnet" : cluster === "devnet" ? "Devnet" : "Custom";

  return (
    <div className="h-8 bg-theme-card border-t border-theme-border flex items-center px-4 text-xs gap-6">
      <span className="text-theme-muted font-medium">{clusterLabel}</span>
      {activeInstance?.name && (
        <span className="text-theme-muted/70">{activeInstance.name}</span>
      )}
      <span className={daemonColor}>
        ● Daemon {daemonConnected ? "Online" : "Offline"}
      </span>
      {daemonConnected && (
        <span className="text-theme-muted">
          👥 {peerCount} peers ({storagePeers} storage)
        </span>
      )}
      <span className={tunnelColor}>
        ● Tunnel {tunnelStatus.charAt(0).toUpperCase() + tunnelStatus.slice(1)}
      </span>
      {tunnelStatus !== "offline" && (
        <>
          <span className="text-theme-muted">↑ {shardsRelayed} relayed</span>
          <span className="text-theme-muted">↓ {requestsExited} exits</span>
        </>
      )}
    </div>
  );
}
