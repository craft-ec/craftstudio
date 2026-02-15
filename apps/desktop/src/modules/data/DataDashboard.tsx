import { useState, useEffect } from "react";
import { Database, Upload, Lock, Unlock, ShieldCheck, UserPlus, UserMinus, HardDrive, FolderOpen } from "lucide-react";
import { useDataCraftStore } from "../../store/dataCraftStore";
import { useDaemonStore } from "../../store/daemonStore";
import StatCard from "../../components/StatCard";
import DataTable from "../../components/DataTable";
import Modal from "../../components/Modal";
import DaemonOffline from "../../components/DaemonOffline";
import { invoke } from "@tauri-apps/api/core";

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
}

function shortenCid(cid: string): string {
  return cid.length > 16 ? `${cid.slice(0, 8)}...${cid.slice(-8)}` : cid;
}

export default function DataDashboard() {
  const { content, accessLists, loading, error, loadContent, publishContent, grantAccess, revokeAccess, loadAccessList } = useDataCraftStore();
  const { connected } = useDaemonStore();
  const [showPublish, setShowPublish] = useState(false);
  const [showAccess, setShowAccess] = useState<string | null>(null);
  const [filePath, setFilePath] = useState("");
  const [encrypt, setEncrypt] = useState(false);
  const [accessDid, setAccessDid] = useState("");
  const [publishing, setPublishing] = useState(false);

  // Load content when daemon connects
  useEffect(() => {
    if (connected) loadContent();
  }, [connected, loadContent]);

  // Load access list when modal opens
  useEffect(() => {
    if (showAccess && connected) loadAccessList(showAccess);
  }, [showAccess, connected, loadAccessList]);

  const totalStored = content.reduce((s, c) => s + c.size, 0);
  const totalShards = content.reduce((s, c) => s + c.shards, 0);
  const totalPool = content.reduce((s, c) => s + c.poolBalance, 0);
  const avgHealth = content.length > 0 ? content.reduce((s, c) => s + c.healthRatio, 0) / content.length : 0;

  const handlePublish = async () => {
    if (!filePath.trim()) return;
    setPublishing(true);
    try {
      await publishContent(filePath.trim(), encrypt);
      setFilePath("");
      setEncrypt(false);
      setShowPublish(false);
    } catch {
      // error is in store
    } finally {
      setPublishing(false);
    }
  };

  const handleGrant = async () => {
    if (showAccess && accessDid.trim()) {
      try {
        await grantAccess(showAccess, accessDid.trim());
        setAccessDid("");
      } catch {
        // error is in store
      }
    }
  };

  const accessEntries = showAccess ? accessLists[showAccess] || [] : [];

  return (
    <div className="max-w-4xl mx-auto">
      <DaemonOffline />

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Database className="text-craftec-500" /> DataCraft
        </h1>
        <button
          onClick={() => setShowPublish(true)}
          disabled={!connected}
          className="flex items-center gap-2 px-4 py-2 bg-craftec-600 hover:bg-craftec-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors"
        >
          <Upload size={16} /> Publish Content
        </button>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg px-4 py-2 mb-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard icon={HardDrive} label="Total Stored" value={formatBytes(totalStored)} />
        <StatCard icon={Database} label="Total Shards" value={totalShards} />
        <StatCard icon={ShieldCheck} label="Avg Health" value={`${(avgHealth * 100).toFixed(0)}%`} color={avgHealth > 0.9 ? "text-green-400" : "text-yellow-400"} />
        <StatCard icon={Lock} label="Pool Balance" value={`$${totalPool.toFixed(2)}`} />
      </div>

      {/* Content Table */}
      <div className="bg-gray-900 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">My Content</h2>
          {loading && <span className="text-xs text-gray-500 animate-pulse">Loading...</span>}
        </div>
        <DataTable
          columns={[
            { key: "name", header: "Name" },
            {
              key: "cid",
              header: "CID",
              render: (item) => (
                <span className="font-mono text-xs text-gray-400">{shortenCid(String(item.cid))}</span>
              ),
            },
            { key: "size", header: "Size", render: (item) => formatBytes(Number(item.size)) },
            {
              key: "encrypted",
              header: "Enc",
              render: (item) =>
                item.encrypted ? <Lock size={14} className="text-craftec-400" /> : <Unlock size={14} className="text-gray-500" />,
            },
            { key: "shards", header: "Shards" },
            {
              key: "healthRatio",
              header: "Health",
              render: (item) => {
                const h = Number(item.healthRatio);
                return (
                  <span className={h >= 0.95 ? "text-green-400" : h >= 0.8 ? "text-yellow-400" : "text-red-400"}>
                    {(h * 100).toFixed(0)}%
                  </span>
                );
              },
            },
            {
              key: "poolBalance",
              header: "Pool",
              render: (item) => `$${Number(item.poolBalance).toFixed(2)}`,
            },
            {
              key: "actions",
              header: "",
              render: (item) => (
                <button
                  onClick={() => setShowAccess(String(item.cid))}
                  className="text-xs text-craftec-400 hover:text-craftec-300"
                >
                  Access
                </button>
              ),
            },
          ]}
          data={content as unknown as Record<string, unknown>[]}
          emptyMessage={connected ? "No content published yet" : "Connect daemon to view content"}
        />
      </div>

      {/* Publish Modal */}
      <Modal open={showPublish} onClose={() => setShowPublish(false)} title="Publish Content">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">File Path</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                placeholder="/path/to/file.csv"
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-craftec-500"
              />
              <button
                type="button"
                onClick={async () => {
                  try {
                    const selected = await invoke<string | null>("pick_file");
                    if (selected) setFilePath(selected);
                  } catch {
                    // fallback: user can type path manually
                  }
                }}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
                title="Browse files"
              >
                <FolderOpen size={16} />
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">Select or type the path to publish via daemon</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setEncrypt(!encrypt)}
              className={`w-10 h-6 rounded-full relative transition-colors ${encrypt ? "bg-craftec-600" : "bg-gray-700"}`}
            >
              <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${encrypt ? "left-5" : "left-1"}`} />
            </button>
            <span className="text-sm">Encrypt content</span>
          </div>
          <button
            onClick={handlePublish}
            disabled={!filePath.trim() || publishing}
            className="w-full py-2 bg-craftec-600 hover:bg-craftec-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors"
          >
            {publishing ? "Publishing..." : "Publish"}
          </button>
        </div>
      </Modal>

      {/* Access Control Modal */}
      <Modal open={showAccess !== null} onClose={() => setShowAccess(null)} title="Access Control">
        <div className="space-y-4">
          <p className="text-xs text-gray-400 font-mono">{showAccess ? shortenCid(showAccess) : ""}</p>

          {/* Grant access */}
          <div className="flex gap-2">
            <input
              type="text"
              value={accessDid}
              onChange={(e) => setAccessDid(e.target.value)}
              placeholder="recipient pubkey (hex)"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-craftec-500"
            />
            <button
              onClick={handleGrant}
              disabled={!accessDid.trim() || !connected}
              className="px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white rounded-lg transition-colors"
            >
              <UserPlus size={16} />
            </button>
          </div>

          {/* Access list */}
          <div className="space-y-2">
            {accessEntries.length === 0 && <p className="text-sm text-gray-500">No access granted</p>}
            {accessEntries.map((entry) => (
              <div key={entry.did} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm font-mono">{entry.did.length > 20 ? `${entry.did.slice(0, 10)}...${entry.did.slice(-10)}` : entry.did}</p>
                  {entry.grantedAt && <p className="text-xs text-gray-500">{new Date(entry.grantedAt).toLocaleDateString()}</p>}
                </div>
                <button
                  onClick={() => showAccess && revokeAccess(showAccess, entry.did)}
                  disabled={!connected}
                  className="text-red-400 hover:text-red-300 disabled:text-gray-600"
                >
                  <UserMinus size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}
