import { Settings } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Settings className="text-craftec-500" /> Settings
      </h1>
      <div className="bg-gray-900 rounded-xl p-6 space-y-4">
        <div>
          <p className="text-sm text-gray-400">Theme</p>
          <p>Dark (default)</p>
        </div>
        <div>
          <p className="text-sm text-gray-400">Daemon WebSocket Port</p>
          <p className="font-mono">9091</p>
        </div>
        <div>
          <p className="text-sm text-gray-400">Solana Network</p>
          <p>Devnet</p>
        </div>
      </div>
    </div>
  );
}
