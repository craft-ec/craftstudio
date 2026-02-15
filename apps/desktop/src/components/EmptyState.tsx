import { useState, useEffect } from "react";
import { Play, FolderOpen, Server, AlertCircle, HardDrive } from "lucide-react";
import { useInstanceStore, generateId } from "../store/instanceStore";
import { DEFAULT_INSTANCE } from "../types/config";
import { invoke } from "@tauri-apps/api/core";

interface LocalDaemonConfig {
  data_dir: string;
  name: string;
  has_api_key: boolean;
  has_data: boolean;
  ws_port: number | null;
}

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
  const [localConfigs, setLocalConfigs] = useState<LocalDaemonConfig[]>([]);
  const [scanning, setScanning] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextIndex = instances.length;

  // Scan for existing local daemon configs on mount
  useEffect(() => {
    (async () => {
      try {
        const configs = await invoke<LocalDaemonConfig[]>("discover_local_daemons");
        setLocalConfigs(configs);
      } catch (e) {
        console.warn("Failed to discover local daemons:", e);
      } finally {
        setScanning(false);
      }
    })();
  }, []);

  const startLocal = async () => {
    setStarting(true);
    setError(null);
    try {
      const result = await invoke<{ pid: number; ws_port: number; data_dir: string }>("start_datacraft_daemon", {
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
      }), { dataDir: result.data_dir });
    } catch (e) {
      const msg = String(e);
      if (msg.includes("not found")) {
        setError("datacraft-daemon not found. Run: cargo install --path crates/daemon");
      } else {
        setError(msg);
      }
    } finally {
      setStarting(false);
    }
  };

  const loadExisting = async (config: LocalDaemonConfig) => {
    const port = config.ws_port ?? 9091;
    setError(null);
    try {
      // Start the daemon with this data dir
      const result = await invoke<{ pid: number; ws_port: number; data_dir: string }>("start_datacraft_daemon", {
        config: {
          data_dir: config.data_dir,
          socket_path: null,
          ws_port: port,
          listen_addr: null,
          binary_path: null,
        },
      });
      addInstance(makeInstanceConfig(nextIndex, {
        name: config.name,
        url: `ws://127.0.0.1:${result.ws_port}`,
        autoStart: true,
      }), { dataDir: result.data_dir });
    } catch (e) {
      const msg = String(e);
      // If daemon is already running on that port, just connect
      if (msg.includes("already running")) {
        addInstance(makeInstanceConfig(nextIndex, {
          name: config.name,
          url: `ws://127.0.0.1:${port}`,
          autoStart: false,
        }), { dataDir: config.data_dir });
      } else {
        setError(msg);
      }
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center bg-gray-950">
      <div className="text-center max-w-lg">
        <Server className="w-16 h-16 text-craftec-500 mx-auto mb-6 opacity-50" />
        <h1 className="text-2xl font-bold text-gray-200 mb-2">CraftStudio</h1>
        <p className="text-gray-500 mb-8">
          Start a new node or load an existing configuration.
        </p>

        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-lg px-4 py-3 mb-6 flex items-start gap-2 text-left">
            <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* Start New */}
        <button
          onClick={startLocal}
          disabled={starting}
          className="flex items-center gap-3 w-full px-5 py-4 bg-craftec-600 hover:bg-craftec-500 disabled:opacity-50 rounded-xl font-medium transition-colors mb-6"
        >
          <Play size={20} />
          <div className="text-left">
            <p className="font-medium">{starting ? "Starting..." : "Start a New Node"}</p>
            <p className="text-xs text-craftec-200 opacity-70">Spawn a fresh daemon instance</p>
          </div>
        </button>

        {/* Existing Configs */}
        {scanning ? (
          <p className="text-sm text-gray-500 animate-pulse">Scanning for existing configs...</p>
        ) : localConfigs.length > 0 ? (
          <div className="text-left">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <FolderOpen size={12} /> Existing Configurations
            </p>
            <div className="space-y-2">
              {localConfigs.map((config) => (
                <button
                  key={config.data_dir}
                  onClick={() => loadExisting(config)}
                  className="flex items-center gap-3 w-full px-4 py-3 bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors text-left"
                >
                  <HardDrive size={16} className="text-gray-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-200">{config.name}</p>
                    <p className="text-xs text-gray-500 font-mono truncate">{config.data_dir}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {config.has_data && (
                      <span className="text-xs px-1.5 py-0.5 bg-craftec-600/20 text-craftec-400 rounded">has data</span>
                    )}
                    {config.ws_port && (
                      <span className="text-xs text-gray-500">:{config.ws_port}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-600">No existing daemon configurations found.</p>
        )}
      </div>
    </div>
  );
}
