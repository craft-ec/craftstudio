import { useState } from "react";
import { Plus, X, Play, Square } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useInstanceStore } from "../store/instanceStore";

interface Props {
  onAddInstance: () => void;
}

export default function InstanceTabBar({ onAddInstance }: Props) {
  const instances = useInstanceStore((s) => s.instances);
  const activeId = useInstanceStore((s) => s.activeId);
  const connectionStatus = useInstanceStore((s) => s.connectionStatus);
  const setActive = useInstanceStore((s) => s.setActive);
  const removeInstance = useInstanceStore((s) => s.removeInstance);
  const logActivity = useInstanceStore((s) => s.logActivity);
  const initClient = useInstanceStore((s) => s.initClient);
  const [busy, setBusy] = useState(false);

  const statusDot = (id: string) => {
    const status = connectionStatus[id] ?? "disconnected";
    if (status === "connected") return "🟢";
    if (status === "connecting") return "🟡";
    return "🔴";
  };

  const startAll = async () => {
    setBusy(true);
    try {
      for (const inst of instances) {
        if (!inst.dataDir) continue;
        const status = connectionStatus[inst.id] ?? "disconnected";
        if (status === "connected") continue; // already running
        try {
          await invoke("start_datacraft_daemon", {
            config: {
              data_dir: inst.dataDir,
              socket_path: inst.socket_path,
              ws_port: inst.ws_port,
              listen_addr: null,
              binary_path: null,
              capabilities: inst.capabilities,
            },
          });
          logActivity(inst.id, "Daemon started", "success");
          initClient(inst.id);
        } catch (e) {
          const msg = String(e);
          if (!msg.includes("already running") && !msg.includes("already in use")) {
            logActivity(inst.id, `Start failed: ${msg}`, "error");
          } else {
            initClient(inst.id);
          }
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const stopAll = async () => {
    setBusy(true);
    try {
      const running = await invoke<Array<{ pid: number; ws_port: number }>>("list_datacraft_daemons");
      for (const inst of instances) {
        const match = running.find((d) => d.ws_port === inst.ws_port);
        if (match) {
          try {
            await invoke("stop_datacraft_daemon", { pid: match.pid });
            logActivity(inst.id, "Daemon stopped", "info");
          } catch (e) {
            logActivity(inst.id, `Stop failed: ${e}`, "warn");
          }
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-10 bg-gray-900 border-b border-gray-800 flex items-center px-2 gap-1 shrink-0" data-tauri-drag-region>
      {instances.map((inst) => (
        <button
          key={inst.id}
          onClick={() => setActive(inst.id)}
          className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-sm transition-colors max-w-[200px] ${
            activeId === inst.id
              ? "bg-gray-950 text-white border-t border-x border-gray-700"
              : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
          }`}
        >
          <span className="text-xs">{statusDot(inst.id)}</span>
          <span className="truncate">{inst.name}</span>
          <span
            onClick={(e) => {
              e.stopPropagation();
              removeInstance(inst.id);
            }}
            className="ml-1 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity"
          >
            <X size={12} />
          </span>
        </button>
      ))}
      <button
        onClick={onAddInstance}
        className="flex items-center justify-center w-7 h-7 text-gray-500 hover:text-gray-200 hover:bg-gray-800 rounded transition-colors"
        title="New instance"
      >
        <Plus size={14} />
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Start All / Stop All */}
      <div className="flex items-center gap-1 mr-1">
        <button
          onClick={startAll}
          disabled={busy}
          className="flex items-center gap-1 px-2 py-1 text-xs text-green-400 hover:bg-green-900/30 rounded transition-colors disabled:opacity-50"
          title="Start all instances"
        >
          <Play size={12} />
          <span>Start All</span>
        </button>
        <button
          onClick={stopAll}
          disabled={busy}
          className="flex items-center gap-1 px-2 py-1 text-xs text-red-400 hover:bg-red-900/30 rounded transition-colors disabled:opacity-50"
          title="Stop all instances"
        >
          <Square size={12} />
          <span>Stop All</span>
        </button>
      </div>
    </div>
  );
}
