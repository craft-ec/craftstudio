import { useTunnelStore } from "../store/tunnelStore";

export default function StatusBar() {
  const { status, speedUp, speedDown } = useTunnelStore();

  const statusColor = status === "connected" ? "text-green-400" : status === "connecting" ? "text-yellow-400" : "text-gray-500";

  return (
    <div className="h-8 bg-gray-900 border-t border-gray-800 flex items-center px-4 text-xs gap-6">
      <span className={statusColor}>
        ● {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
      <span className="text-gray-400">↑ {formatSpeed(speedUp)}</span>
      <span className="text-gray-400">↓ {formatSpeed(speedDown)}</span>
      <span className="text-gray-400">◎ 0 peers</span>
    </div>
  );
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec > 1_000_000) return `${(bytesPerSec / 1_000_000).toFixed(1)} MB/s`;
  if (bytesPerSec > 1_000) return `${(bytesPerSec / 1_000).toFixed(1)} KB/s`;
  return `${bytesPerSec} B/s`;
}
