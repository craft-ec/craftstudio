import { WifiOff, RefreshCw } from "lucide-react";
import { useActiveConnection } from "../hooks/useDaemon";
import { useDaemon } from "../hooks/useDaemon";

/** Banner shown when daemon WebSocket is disconnected. */
export default function DaemonOffline() {
  const { connected } = useActiveConnection();
  const client = useDaemon();

  if (connected) return null;

  return (
    <div className="bg-red-900/30 border border-red-800 rounded-lg px-4 py-3 mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2 text-red-300 text-sm">
        <WifiOff size={16} />
        <span>Daemon offline — connect the DataCraft daemon to see real data</span>
      </div>
      <button
        onClick={() => client?.reconnect()}
        className="flex items-center gap-1 px-3 py-1 bg-red-800 hover:bg-red-700 text-red-200 rounded text-xs transition-colors"
      >
        <RefreshCw size={12} /> Reconnect
      </button>
    </div>
  );
}
