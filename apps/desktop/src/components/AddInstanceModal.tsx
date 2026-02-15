import { useState } from "react";
import { Play, Globe } from "lucide-react";
import Modal from "./Modal";
import { useInstanceStore, generateId } from "../store/instanceStore";
import { DEFAULT_INSTANCE } from "../types/config";
import { invoke } from "@tauri-apps/api/core";

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
  const [mode, setMode] = useState<"choose" | "remote">("choose");
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
      handleClose();
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

  const connectRemote = () => {
    if (!remoteUrl.trim()) return;
    addInstance(makeInstanceConfig(nextIndex, {
      name: remoteName.trim() || remoteUrl.replace(/^wss?:\/\//, ""),
      url: remoteUrl.trim(),
      autoStart: false,
    }));
    handleClose();
  };

  const handleClose = () => {
    setMode("choose");
    setRemoteUrl("ws://127.0.0.1:9091");
    setRemoteName("");
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

      {mode === "choose" ? (
        <div className="flex flex-col gap-3">
          <button
            onClick={startLocal}
            disabled={starting}
            className="flex items-center gap-3 px-4 py-3 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg text-left transition-colors"
          >
            <Play size={18} className="text-craftec-500" />
            <div>
              <p className="font-medium">{starting ? "Starting..." : "Start a Local Node"}</p>
              <p className="text-xs text-gray-500">Spawn a new daemon on this machine</p>
            </div>
          </button>
          <button
            onClick={() => setMode("remote")}
            className="flex items-center gap-3 px-4 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-left transition-colors"
          >
            <Globe size={18} className="text-craftec-500" />
            <div>
              <p className="font-medium">Connect to Remote Daemon</p>
              <p className="text-xs text-gray-500">Enter a WebSocket URL</p>
            </div>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Name (optional)</label>
            <input
              value={remoteName}
              onChange={(e) => setRemoteName(e.target.value)}
              placeholder="My Remote Node"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-craftec-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Daemon URL</label>
            <input
              value={remoteUrl}
              onChange={(e) => setRemoteUrl(e.target.value)}
              placeholder="ws://127.0.0.1:9091"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-craftec-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={connectRemote}
              className="flex-1 px-4 py-2 bg-craftec-600 hover:bg-craftec-500 rounded-lg text-sm font-medium transition-colors"
            >
              Connect
            </button>
            <button
              onClick={() => setMode("choose")}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-400 transition-colors"
            >
              Back
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
