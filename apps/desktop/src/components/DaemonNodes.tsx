import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Play,
  Square,
  Plus,
  Server,
  ChevronDown,
  ChevronRight,
  Terminal,
} from "lucide-react";

interface DaemonInstance {
  pid: number;
  ws_port: number;
  data_dir: string;
  socket_path: string;
  listen_addr: string;
  primary: boolean;
}

interface DaemonConfig {
  data_dir: string | null;
  socket_path: string | null;
  ws_port: number | null;
  listen_addr: string | null;
  binary_path: string | null;
}

interface LogLine {
  pid: number;
  line: string;
  is_stderr: boolean;
}

export default function DaemonNodes() {
  const [daemons, setDaemons] = useState<DaemonInstance[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedLogs, setExpandedLogs] = useState<Set<number>>(new Set());
  const [logs, setLogs] = useState<Record<number, LogLine[]>>({});

  const refresh = useCallback(async () => {
    try {
      const list = await invoke<DaemonInstance[]>("list_craftobj_daemons");
      setDaemons(list);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Poll logs for expanded daemons
  useEffect(() => {
    if (expandedLogs.size === 0) return;
    const interval = setInterval(async () => {
      for (const pid of expandedLogs) {
        try {
          const current = logs[pid] || [];
          const newLines = await invoke<LogLine[]>("get_daemon_logs", {
            pid,
            since: current.length,
          });
          if (newLines.length > 0) {
            setLogs((prev) => ({
              ...prev,
              [pid]: [...(prev[pid] || []), ...newLines].slice(-200),
            }));
          }
        } catch {
          /* ignore */
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expandedLogs, logs]);

  const startDaemon = async (config: DaemonConfig) => {
    setStarting(true);
    setError(null);
    try {
      await invoke<DaemonInstance>("start_craftobj_daemon", { config });
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setStarting(false);
    }
  };

  const stopDaemon = async (pid: number) => {
    try {
      await invoke("stop_craftobj_daemon", { pid });
      setExpandedLogs((prev) => {
        const next = new Set(prev);
        next.delete(pid);
        return next;
      });
      setLogs((prev) => {
        const next = { ...prev };
        delete next[pid];
        return next;
      });
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  };

  const toggleLogs = (pid: number) => {
    setExpandedLogs((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  };

  const hasPrimary = daemons.some((d) => d.primary);

  const defaultConfig: DaemonConfig = {
    data_dir: null,
    socket_path: null,
    ws_port: null,
    listen_addr: null,
    binary_path: null,
  };

  return (
    <div className="bg-white rounded-xl p-4 mb-6">
      <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <Server className="w-5 h-5 text-craftec-500" /> Daemon Nodes
      </h2>

      {error && (
        <div className="bg-red-50 border border-red-700 rounded-lg p-3 mb-3 text-sm text-red-600">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-red-500 hover:text-red-500"
          >
            ✕
          </button>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 mb-4">
        {!hasPrimary && (
          <button
            onClick={() => startDaemon(defaultConfig)}
            disabled={starting}
            className="flex items-center gap-2 px-4 py-2 bg-craftec-600 hover:bg-craftec-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
          >
            <Play className="w-4 h-4" />
            {starting ? "Starting..." : "Start Node"}
          </button>
        )}
        <button
          onClick={() => startDaemon(defaultConfig)}
          disabled={starting}
          className="flex items-center gap-2 px-4 py-2 bg-gray-200 hover:bg-gray-50 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Node
        </button>
      </div>

      {/* Running daemons */}
      {daemons.length === 0 ? (
        <p className="text-gray-500 text-sm">
          No daemon nodes running. Start one to begin.
        </p>
      ) : (
        <div className="space-y-2">
          {daemons.map((d) => (
            <div key={d.pid} className="bg-gray-100 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <div>
                    <div className="text-sm font-medium">
                      {d.primary ? "Primary Node" : "Test Node"}{" "}
                      <span className="text-gray-500">PID {d.pid}</span>
                    </div>
                    <div className="text-xs text-gray-400">
                      WS :{d.ws_port} · {d.data_dir}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleLogs(d.pid)}
                    className="p-1.5 text-gray-400 hover:text-white rounded transition-colors"
                    title="Toggle logs"
                  >
                    <Terminal className="w-4 h-4" />
                    {expandedLogs.has(d.pid) ? (
                      <ChevronDown className="w-3 h-3 inline" />
                    ) : (
                      <ChevronRight className="w-3 h-3 inline" />
                    )}
                  </button>
                  <button
                    onClick={() => stopDaemon(d.pid)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-red-50 hover:bg-red-50 text-red-600 rounded text-sm transition-colors"
                  >
                    <Square className="w-3 h-3" /> Stop
                  </button>
                </div>
              </div>

              {/* Log panel */}
              {expandedLogs.has(d.pid) && (
                <div className="border-t border-gray-200 bg-gray-100 p-2 max-h-48 overflow-y-auto font-mono text-xs">
                  {(logs[d.pid] || []).length === 0 ? (
                    <span className="text-gray-400">Waiting for output...</span>
                  ) : (
                    (logs[d.pid] || []).map((l, i) => (
                      <div
                        key={i}
                        className={l.is_stderr ? "text-amber-500" : "text-gray-700"}
                      >
                        {l.line}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
