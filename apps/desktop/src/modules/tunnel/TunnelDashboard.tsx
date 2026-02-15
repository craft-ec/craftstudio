import { Shield } from "lucide-react";
import { useTunnelStore } from "../../store/tunnelStore";

export default function TunnelDashboard() {
  const { status, connect, disconnect } = useTunnelStore();

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Shield className="text-craftec-500" /> TunnelCraft
      </h1>

      <div className="bg-gray-900 rounded-xl p-8 text-center">
        <div className="text-6xl mb-4">
          {status === "connected" ? "🟢" : status === "connecting" ? "🟡" : "⚫"}
        </div>
        <p className="text-lg text-gray-400 mb-6 capitalize">{status}</p>
        <button
          onClick={status === "disconnected" ? connect : disconnect}
          className={`px-8 py-3 rounded-lg font-medium transition-colors ${
            status === "disconnected"
              ? "bg-craftec-600 hover:bg-craftec-700 text-white"
              : "bg-red-600 hover:bg-red-700 text-white"
          }`}
        >
          {status === "disconnected" ? "Connect" : "Disconnect"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-6">
        <div className="bg-gray-900 rounded-lg p-4">
          <p className="text-sm text-gray-400">Exit Node</p>
          <p className="text-lg">Not selected</p>
        </div>
        <div className="bg-gray-900 rounded-lg p-4">
          <p className="text-sm text-gray-400">Hops</p>
          <p className="text-lg">2</p>
        </div>
      </div>
    </div>
  );
}
