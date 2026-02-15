import { useState, useEffect } from "react";
import { Play, HardDrive, Globe } from "lucide-react";
import Modal from "./Modal";
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

interface Props {
  open: boolean;
  onClose: () => void;
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

export default function AddInstanceModal({ open, onClose }: Props) {
  const { addInstance, instances } = useInstanceStore();
  const [localConfigs, setLocalConfigs] = useState<LocalDaemonConfig[]>([]);
  const [mode, setMode] = useState<"list" | "remote">("list");
  const [remoteUrl, setRemoteUrl] = useState("ws://127.0.0.1:9091");
  const [remoteName, setRemoteName] = useState("");
  const [remoteApiKey, setRemoteApiKey] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextIndex = instances.length;

  // Scan for existing configs when modal opens
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const configs = await invoke<LocalDaemonConfig[]>("discover_local_daemons");
        // Filter out configs already loaded as instances
        const existingDirs = new Set(Object.values(useInstanceStore.getState().dataDirs));
        setLocalConfigs(configs.filter(c => !existingDirs.has(c.data_dir)));
      } catch {
        setLocalConfigs([]);
      }
    })();
  }, [open]);

  const startLocal = async () => {
    setStarting(true);
    setError(null);
    try {
      const result = await invoke<{ pid: number; ws_port: number; data_dir: string }>("start_datacraft_daemon", {
        config: { data_dir: null, socket_path: null, ws_port: null, listen_addr: null, binary_path: null },
      });
      addInstance(makeInstanceConfig(nextIndex, {
        name: `Local Node (:${result.ws_port})`,
        url: `ws://127.0.0.1:${result.ws_port}`,
        autoStart: true,
      }), { dataDir: result.data_dir });
      handleClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setStarting(false);
    }
  };

  const loadExisting = (config: LocalDaemonConfig) => {
    const port = config.ws_port ?? 9091;
    addInstance(makeInstanceConfig(nextIndex, {
      name: config.name,
      url: `ws://127.0.0.1:${port}`,
      autoStart: false,
    }), { dataDir: config.data_dir });
    handleClose();
  };

  const connectRemote = () => {
    if (!remoteUrl.trim()) return;
    addInstance(makeInstanceConfig(nextIndex, {
      name: remoteName.trim() || remoteUrl.replace(/^wss?:\/\//, ""),
      url: remoteUrl.trim(),
      autoStart: false,
    }), remoteApiKey.trim() ? { apiKey: remoteApiKey.trim() } : undefined);
    handleClose();
  };

  const handleClose = () => {
    setMode("list");
    setRemoteUrl("ws://127.0.0.1:9091");
    setRemoteName("");
    setRemoteApiKey("");
    setError(null);
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Add Instance">
      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-lg px-3 py-2 mb-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {mode === "list" ? (
        <div className="space-y-3">
          {/* Start new */}
          <button
            onClick={startLocal}
            disabled={starting}
            className="flex items-center gap-3 w-full px-4 py-3 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg text-left transition-colors"
          >
            <Play size={16} className="text-craftec-500" />
            <div>
              <p className="text-sm font-medium">{starting ? "Starting..." : "Start a New Node"}</p>
              <p className="text-xs text-gray-500">Spawn a fresh daemon</p>
            </div>
          </button>

          {/* Existing configs */}
          {localConfigs.length > 0 && (
            <>
              <p className="text-xs text-gray-500 uppercase tracking-wider pt-1">Existing</p>
              {localConfigs.map((config) => (
                <button
                  key={config.data_dir}
                  onClick={() => loadExisting(config)}
                  className="flex items-center gap-3 w-full px-4 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-left transition-colors"
                >
                  <HardDrive size={16} className="text-gray-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{config.name}</p>
                    <p className="text-xs text-gray-500 font-mono truncate">{config.data_dir}</p>
                  </div>
                  {config.has_data && (
                    <span className="text-xs px-1.5 py-0.5 bg-craftec-600/20 text-craftec-400 rounded shrink-0">data</span>
                  )}
                </button>
              ))}
            </>
          )}

          {/* Remote option */}
          <button
            onClick={() => setMode("remote")}
            className="flex items-center gap-3 w-full px-4 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-left transition-colors"
          >
            <Globe size={16} className="text-gray-400" />
            <div>
              <p className="text-sm font-medium">Connect to Remote</p>
              <p className="text-xs text-gray-500">Enter URL manually</p>
            </div>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Name (optional)</label>
            <input value={remoteName} onChange={(e) => setRemoteName(e.target.value)} placeholder="My Remote Node"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-craftec-500" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Daemon URL</label>
            <input value={remoteUrl} onChange={(e) => setRemoteUrl(e.target.value)} placeholder="ws://127.0.0.1:9091"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-craftec-500" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">API Key</label>
            <input value={remoteApiKey} onChange={(e) => setRemoteApiKey(e.target.value)} placeholder="From daemon's data_dir/api_key"
              type="password" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-craftec-500" />
          </div>
          <div className="flex gap-2">
            <button onClick={connectRemote} className="flex-1 px-4 py-2 bg-craftec-600 hover:bg-craftec-500 rounded-lg text-sm font-medium transition-colors">Connect</button>
            <button onClick={() => setMode("list")} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-400 transition-colors">Back</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
