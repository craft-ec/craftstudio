import { useState } from "react";
import { Play, Globe, Server, AlertCircle } from "lucide-react";
import { useInstanceStore, generateId } from "../store/instanceStore";
import { DEFAULT_INSTANCE } from "../types/config";
import { invoke } from "@tauri-apps/api/core";

/** Derive unique per-instance paths based on index */
function makeInstanceConfig(index: number, overrides: { name: string; url: string; autoStart: boolean }) {
  const suffix = index === 0 ? "" : `-${index}`;
  return {
    id: generateId(),
    ...DEFAULT_INSTANCE,
    keypairPath: `~/.craftstudio/instances${suffix}/identity.json`,
    storagePath: `~/.craftstudio/instances${suffix}/storage`,
    port: 4001 + index,
    ...overrides,
  };
}

export default function EmptyState() {
  const { addInstance, instances } = useInstanceStore();
  const [showConnect, setShowConnect] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState("ws://127.0.0.1:9091");
  const [remoteName, setRemoteName] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextIndex = instances.length;

  const startLocal = async () => {
    setStarting(true);
    setError(null);
    try {
      const result = await invoke<{ pid: number; ws_port: number }>("start_datacraft_daemon", {
        config: {
          data_dir: null,
          socket_path: null,
          ws_port: null,
          listen_addr: null,
          binary_path: null,
        },
      });
      addInstance(makeInstanceConfig(nextIndex, {
        name: `Local Node (:${result.ws_port})`,
        url: `ws://127.0.0.1:${result.ws_port}`,
        autoStart: true,
      }));
    } catch (e) {
      const msg = String(e);
      console.error("Failed to start daemon:", msg);
      if (msg.includes("not found")) {
        setError("datacraft-daemon not found. Run: cargo install --path crates/daemon");
      } else {
        setError(msg);
      }
    } finally {
      setStarting(false);
    }
  };

  const connectRemote = () => {
    if (!remoteUrl.trim()) return;
    addInstance(makeInstanceConfig(nextIndex, {
      name: remoteName.trim() || remoteUrl.replace(/^wss?:\/\//, ""),
      url: remoteUrl.trim(),
      autoStart: false,
    }));
    setShowConnect(false);
    setRemoteUrl("ws://127.0.0.1:9091");
    setRemoteName("");
  };

  return (
    <div className="flex-1 flex items-center justify-center bg-gray-950">
      <div className="text-center max-w-md">
        <Server className="w-16 h-16 text-craftec-500 mx-auto mb-6 opacity-50" />
        <h1 className="text-2xl font-bold text-gray-200 mb-2">CraftStudio</h1>
        <p className="text-gray-500 mb-8">
          Connect to a DataCraft daemon to get started. Start a local node or connect to a remote one.
        </p>

        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-lg px-4 py-3 mb-6 flex items-start gap-2 text-left">
            <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {!showConnect ? (
          <div className="flex flex-col gap-3 items-center">
            <button
              onClick={startLocal}
              disabled={starting}
              className="flex items-center gap-2 px-6 py-3 bg-craftec-600 hover:bg-craftec-500 disabled:opacity-50 rounded-lg font-medium transition-colors w-64"
            >
              <Play size={18} />
              {starting ? "Starting..." : "Start a Node"}
            </button>
            <button
              onClick={() => setShowConnect(true)}
              className="flex items-center gap-2 px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg font-medium transition-colors w-64 text-gray-300"
            >
              <Globe size={18} />
              Connect to Daemon
            </button>
          </div>
        ) : (
          <div className="bg-gray-900 rounded-xl p-4 text-left">
            <label className="block text-sm text-gray-400 mb-1">Name (optional)</label>
            <input
              value={remoteName}
              onChange={(e) => setRemoteName(e.target.value)}
              placeholder="My Remote Node"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:border-craftec-500"
            />
            <label className="block text-sm text-gray-400 mb-1">Daemon URL</label>
            <input
              value={remoteUrl}
              onChange={(e) => setRemoteUrl(e.target.value)}
              placeholder="ws://127.0.0.1:9091"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:border-craftec-500"
            />
            <div className="flex gap-2">
              <button
                onClick={connectRemote}
                className="flex-1 px-4 py-2 bg-craftec-600 hover:bg-craftec-500 rounded-lg text-sm font-medium transition-colors"
              >
                Connect
              </button>
              <button
                onClick={() => setShowConnect(false)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
