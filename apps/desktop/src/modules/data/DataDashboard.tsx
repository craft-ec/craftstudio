import { useState } from "react";
import { Database, Upload, Lock, Unlock, ShieldCheck, UserPlus, UserMinus, HardDrive } from "lucide-react";
import { useDataCraftStore } from "../../store/dataCraftStore";
import StatCard from "../../components/StatCard";
import DataTable from "../../components/DataTable";
import Modal from "../../components/Modal";

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
  const { content, accessLists, publishContent, grantAccess, revokeAccess } = useDataCraftStore();
  const [showPublish, setShowPublish] = useState(false);
  const [showAccess, setShowAccess] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [encrypt, setEncrypt] = useState(false);
  const [accessDid, setAccessDid] = useState("");

  const totalStored = content.reduce((s, c) => s + c.size, 0);
  const totalShards = content.reduce((s, c) => s + c.shards, 0);
  const totalPool = content.reduce((s, c) => s + c.poolBalance, 0);
  const avgHealth = content.length > 0 ? content.reduce((s, c) => s + c.healthRatio, 0) / content.length : 0;

  const handlePublish = () => {
    if (fileName.trim()) {
      publishContent(fileName.trim(), encrypt);
      setFileName("");
      setEncrypt(false);
      setShowPublish(false);
    }
  };

  const handleGrant = () => {
    if (showAccess && accessDid.trim()) {
      grantAccess(showAccess, accessDid.trim());
      setAccessDid("");
    }
  };

  const accessEntries = showAccess ? accessLists[showAccess] || [] : [];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Database className="text-craftec-500" /> DataCraft
        </h1>
        <button
          onClick={() => setShowPublish(true)}
          className="flex items-center gap-2 px-4 py-2 bg-craftec-600 hover:bg-craftec-700 text-white rounded-lg transition-colors"
        >
          <Upload size={16} /> Publish Content
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard icon={HardDrive} label="Total Stored" value={formatBytes(totalStored)} />
        <StatCard icon={Database} label="Total Shards" value={totalShards} />
        <StatCard icon={ShieldCheck} label="Avg Health" value={`${(avgHealth * 100).toFixed(0)}%`} color={avgHealth > 0.9 ? "text-green-400" : "text-yellow-400"} />
        <StatCard icon={Lock} label="Pool Balance" value={`$${totalPool.toFixed(2)}`} />
      </div>

      {/* Content Table */}
      <div className="bg-gray-900 rounded-xl p-4 mb-6">
        <h2 className="text-lg font-semibold mb-3">My Content</h2>
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
          emptyMessage="No content published yet"
        />
      </div>

      {/* Publish Modal */}
      <Modal open={showPublish} onClose={() => setShowPublish(false)} title="Publish Content">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">File Name</label>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="e.g. my-dataset.csv"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-craftec-500"
            />
            <p className="text-xs text-gray-500 mt-1">In a real build, this would open a file picker via Tauri IPC</p>
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
            disabled={!fileName.trim()}
            className="w-full py-2 bg-craftec-600 hover:bg-craftec-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors"
          >
            Publish
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
              placeholder="did:craftec:..."
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-craftec-500"
            />
            <button
              onClick={handleGrant}
              disabled={!accessDid.trim()}
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
                  <p className="text-sm font-mono">{entry.did}</p>
                  <p className="text-xs text-gray-500">{new Date(entry.grantedAt).toLocaleDateString()}</p>
                </div>
                <button
                  onClick={() => showAccess && revokeAccess(showAccess, entry.did)}
                  className="text-red-400 hover:text-red-300"
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
