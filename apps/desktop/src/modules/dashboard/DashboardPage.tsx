import { useState, useEffect, useCallback } from "react";
import {
  LayoutDashboard,
  Activity,
  Users,
  HardDrive,
  FileText,
  Database,
  Layers,
  MonitorSmartphone,
  RotateCw,
  Power,
  PowerOff,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useInstanceStore } from "../../store/instanceStore";
import { useDaemon, useActiveConnection } from "../../hooks/useDaemon";
// daemon client accessed via useDaemon hook
import StatCard from "../../components/StatCard";
import NetworkHealth from "../../components/NetworkHealth";
import ActivityLog from "../../components/ActivityLog";

export default function DashboardPage() {
  const instance = useInstanceStore((s) =>
    s.instances.find((i) => i.id === s.activeId)
  );
  const client = useDaemon();
  const { connected, status: connStatus } = useActiveConnection();

  const [stats, setStats] = useState({
    storedBytes: 0,
    contentCount: 0,
    pieceCount: 0,
    pinnedCount: 0,
  });
  const [peerCount, setPeerCount] = useState(0);
  const [storagePeers, setStoragePeers] = useState(0);
  const [restarting, setRestarting] = useState(false);
  const did: string | null = null; // TODO: fetch from daemon

  const logActivity = useInstanceStore((s) => s.logActivity);
  const initClient = useInstanceStore((s) => s.initClient);

  const restartInstance = useInstanceStore((s) => s.restartInstance);

  const handleRestart = useCallback(async () => {
    if (!instance || restarting) return;
    setRestarting(true);
    try {
      await restartInstance(instance.id);
    } finally {
      setRestarting(false);
    }
  }, [instance, restarting, restartInstance]);

  const handleStop = useCallback(async () => {
    if (!instance) return;
    logActivity(instance.id, "Stopping daemon...", "warn");
    try {
      // Use Tauri command to abort the in-process daemon task (not WS RPC which can kill the process)
      await invoke('stop_craftobj_daemon', { pid: instance.pid });
      logActivity(instance.id, "Daemon stopped", "success");
    } catch (e) {
      logActivity(instance.id, `Stop failed: ${e}`, "error");
    }
  }, [instance, logActivity]);

  const handleStart = useCallback(async () => {
    if (!instance) return;
    logActivity(instance.id, "Starting daemon...", "info");
    try {
      await invoke('start_craftobj_daemon', {
        config: {
          data_dir: instance.dataDir,
          socket_path: instance.socket_path,
          ws_port: instance.ws_port,
          listen_addr: null,
          binary_path: null,
          capabilities: instance.capabilities.length > 0 ? instance.capabilities : ["client"],
        },
      });
      logActivity(instance.id, "Daemon started", "success");
      await new Promise(r => setTimeout(r, 1000));
      initClient(instance.id);
    } catch (e) {
      logActivity(instance.id, `Start failed: ${e}`, "error");
    }
  }, [instance, logActivity, initClient]);

  const loadData = useCallback(async () => {
    if (!client || !connected) return;
    try {
      const [statusRes, peersRes] = await Promise.allSettled([
        client.status(),
        client.listPeers(),
      ]);
      if (statusRes.status === "fulfilled") {
        setStats({
          storedBytes: statusRes.value.stored_bytes,
          contentCount: statusRes.value.content_count,
          pieceCount: statusRes.value.piece_count,
          pinnedCount: statusRes.value.pinned_count,
        });
      }
      if (peersRes.status === "fulfilled") {
        const entries = Object.values(peersRes.value || {});
        setPeerCount(entries.length);
        setStoragePeers(
          entries.filter((p) => p.capabilities.includes("Storage")).length
        );
      }
    } catch {
      /* */
    }
  }, [client, connected]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10_000);
    return () => clearInterval(interval);
  }, [loadData]);

  const formatBytes = (b: number) => {
    if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`;
    if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`;
    if (b >= 1e3) return `${(b / 1e3).toFixed(1)} KB`;
    return `${b} B`;
  };

  const caps = instance?.capabilities;

  return (
    <div className="max-w-4xl mx-auto">
      <NetworkHealth />

      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <LayoutDashboard className="text-craftec-500" /> Dashboard
      </h1>

      {/* Connection Status */}
      <div className="bg-white rounded-xl p-6 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div
            className={`w-4 h-4 rounded-full ${
              connStatus === "connected"
                ? "bg-green-500 animate-pulse"
                : connStatus === "connecting"
                ? "bg-amber-400 animate-pulse"
                : "bg-red-500"
            }`}
          />
          <div>
            <p className="font-semibold text-lg">
              {connStatus === "connected"
                ? "Connected"
                : connStatus === "connecting"
                ? "Connecting..."
                : "Disconnected"}
            </p>
            <p className="text-sm text-gray-500">{instance ? `ws://127.0.0.1:${instance.ws_port}` : "—"}</p>
          </div>
        </div>
        {instance && (
          <div className="flex items-center gap-2">
            {connected ? (
              <>
                <button
                  onClick={handleRestart}
                  disabled={restarting}
                  title="Restart daemon"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-gray-100 hover:bg-gray-50 text-gray-700 hover:text-amber-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RotateCw size={14} className={restarting ? "animate-spin" : ""} />
                  Restart
                </button>
                <button
                  onClick={handleStop}
                  title="Stop daemon"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-gray-100 hover:bg-gray-50 text-gray-700 hover:text-red-500 transition-colors"
                >
                  <PowerOff size={14} />
                  Stop
                </button>
              </>
            ) : (
              <button
                onClick={handleStart}
                title="Start daemon"
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-craftec-600/20 hover:bg-craftec-600/30 text-craftec-400 border border-craftec-600/30 transition-colors"
              >
                <Power size={14} />
                Start
              </button>
            )}
          </div>
        )}
      </div>

      {/* Activity Log */}
      <div className="mb-6">
        <ActivityLog />
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={Activity}
          label="Status"
          value={connected ? "Online" : "Offline"}
          color={connected ? "text-green-600" : "text-red-500"}
        />
        <StatCard
          icon={Users}
          label="Peers"
          value={connected ? String(peerCount) : "—"}
          sub={connected ? `${storagePeers} storage` : "Not running"}
        />
        <StatCard
          icon={HardDrive}
          label="Stored"
          value={connected ? formatBytes(stats.storedBytes) : "—"}
        />
        <StatCard
          icon={FileText}
          label="Content"
          value={connected ? String(stats.contentCount) : "—"}
          sub={connected ? `${stats.pieceCount} pieces` : undefined}
        />
      </div>

      {/* Capability Badges */}
      {caps && (
        <div className="bg-white rounded-xl p-4 mb-6">
          <h2 className="text-lg font-semibold mb-3">Capabilities</h2>
          <div className="flex gap-3">
            {[
              { key: "client", label: "Client", icon: MonitorSmartphone },
              { key: "storage", label: "Storage", icon: Database },
              { key: "aggregator", label: "Aggregator", icon: Layers },
            ].map(({ key, label, icon: Icon }) => {
              const enabled = caps.includes(key);
              return (
                <div
                  key={key}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                    enabled
                      ? "bg-craftec-600/20 text-craftec-400 border border-craftec-600/30"
                      : "bg-gray-100 text-gray-500 border border-gray-200"
                  }`}
                >
                  <Icon size={14} />
                  {label}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Node DID */}
      {did && (
        <div className="bg-white rounded-xl p-4 mb-6">
          <h2 className="text-lg font-semibold mb-2">Node DID</h2>
          <p className="text-sm text-gray-400 font-mono break-all">{did}</p>
        </div>
      )}
    </div>
  );
}
