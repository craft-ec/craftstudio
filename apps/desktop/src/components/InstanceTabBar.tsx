import { useState } from "react";
import { Plus, X, Play, Square } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useInstanceStore } from "../store/instanceStore";
import { destroyClient } from "../services/daemon";

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
    if (status === "connected") return "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]";
    if (status === "connecting") return "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]";
    return "bg-theme-border";
  };

  const startAll = async () => {
    setBusy(true);
    try {
      for (const inst of instances) {
        if (!inst.dataDir) continue;
        const status = connectionStatus[inst.id] ?? "disconnected";
        if (status === "connected") continue;
        try {
          await invoke("start_craftobj_daemon", {
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
      for (const inst of instances) {
        const status = connectionStatus[inst.id] ?? "disconnected";
        if (status !== "connected") continue;
        try {
          // Stop daemon via Tauri command using pid (same as restartInstance)
          const running = await invoke<Array<{ pid: number; ws_port: number }>>("list_craftobj_daemons");
          const match = running.find((d) => d.ws_port === inst.ws_port);
          if (match) {
            await invoke("stop_craftobj_daemon", { pid: match.pid });
          }
          destroyClient(inst.id);
          logActivity(inst.id, "Daemon stopped", "info");
        } catch (e) {
          logActivity(inst.id, `Stop failed: ${e}`, "warn");
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-11 bg-theme-bg border-b border-theme-border flex items-center px-3 gap-1 shrink-0" data-tauri-drag-region>
      {instances.map((inst) => (
        <button
          key={inst.id}
          onClick={() => setActive(inst.id)}
          className={`group flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors max-w-[200px] ${activeId === inst.id
              ? "bg-theme-card text-theme-text shadow-sm border border-theme-border font-medium"
              : "text-theme-muted hover:text-theme-text hover:bg-theme-card/60"
            }`}
        >
          <span className={`w-2 h-2 rounded-full ${statusDot(inst.id)}`} />
          <span className="truncate">{inst.name}</span>
          <span
            onClick={(e) => {
              e.stopPropagation();
              removeInstance(inst.id);
            }}
            className="ml-1 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity"
          >
            <X size={12} />
          </span>
        </button>
      ))}
      <button
        onClick={onAddInstance}
        className="flex items-center justify-center w-7 h-7 text-theme-muted hover:text-theme-text hover:bg-theme-border/50 rounded-lg transition-colors"
        title="New instance"
      >
        <Plus size={14} />
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-1 mr-1">
        <button
          onClick={startAll}
          disabled={busy}
          className="flex items-center gap-1 px-2.5 py-1 text-xs text-green-500 hover:bg-green-500/10 rounded-lg transition-colors disabled:opacity-50"
          title="Start all instances"
        >
          <Play size={12} />
          <span>Start All</span>
        </button>
        <button
          onClick={stopAll}
          disabled={busy}
          className="flex items-center gap-1 px-2.5 py-1 text-xs text-red-500 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
          title="Stop all instances"
        >
          <Square size={12} />
          <span>Stop All</span>
        </button>
      </div>
    </div>
  );
}
