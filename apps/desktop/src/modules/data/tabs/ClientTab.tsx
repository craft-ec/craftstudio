import { useState, useEffect } from "react";
import { Upload, Lock, Unlock, UserPlus, UserMinus, Download, DollarSign, FolderOpen } from "lucide-react";
import { useDataCraftStore } from "../../../store/dataCraftStore";
import { useDaemonStore } from "../../../store/daemonStore";
import StatCard from "../../../components/StatCard";
import DataTable from "../../../components/DataTable";
import Modal from "../../../components/Modal";
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

// Mock download history
const mockDownloads = [
  { cid: "bafk…abc123def456", name: "dataset-v2.csv", size: 15_400_000, fetchedAt: "2025-02-14T10:30:00Z" },
  { cid: "bafk…789xyz000111", name: "model-weights.bin", size: 245_000_000, fetchedAt: "2025-02-13T16:45:00Z" },
  { cid: "bafk…feed00dead00", name: "images.tar.gz", size: 89_000_000, fetchedAt: "2025-02-12T08:20:00Z" },
];

// Mock pool data
const mockPools = [
  { cid: "bafk…a1b2c3d4e5f6", name: "report.pdf", balance: 12.50, funded: 25.00 },
  { cid: "bafk…1122334455aa", name: "dataset-v2.csv", balance: 8.75, funded: 10.00 },
];

export default function ClientTab() {
  const { content, accessLists, loading, error, loadContent, publishContent, grantAccess, revokeAccess, loadAccessList } = useDataCraftStore();
  const { connected } = useDaemonStore();
  const [showPublish, setShowPublish] = useState(false);
  const [showAccess, setShowAccess] = useState<string | null>(null);
  const [filePath, setFilePath] = useState("");
  const [encrypt, setEncrypt] = useState(false);
  const [accessDid, setAccessDid] = useState("");
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (connected) loadContent();
  }, [connected, loadContent]);

  useEffect(() => {
    if (showAccess && connected) loadAccessList(showAccess);
  }, [showAccess, connected, loadAccessList]);

  const totalPool = content.reduce((s, c) => s + c.poolBalance, 0) + mockPools.reduce((s, p) => s + p.balance, 0);

  const handlePublish = async () => {
    if (!filePath.trim()) return;
    setPublishing(true);
    try {
      await publishContent(filePath.trim(), encrypt);
      setFilePath("");
      setEncrypt(false);
      setShowPublish(false);
    } catch {
      // error in store
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
        // error in store
      }
    }
  };

  const accessEntries = showAccess ? accessLists[showAccess] || [] : [];

  return (
    <div>
      {/* Header with publish button */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Client</h2>
        <button
          onClick={() => setShowPublish(true)}
          disabled={!connected}
          className="flex items-center gap-2 px-4 py-2 bg-craftec-600 hover:bg-craftec-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors text-sm"
        >
          <Upload size={16} /> Publish Content
        </button>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg px-4 py-2 mb-4 text-sm text-red-300">{error}</div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard icon={Upload} label="Published" value={String(content.length)} />
        <StatCard icon={Download} label="Fetched" value={String(mockDownloads.length)} />
        <StatCard icon={DollarSign} label="Pool Balance" value={`$${totalPool.toFixed(2)}`} color="text-green-400" />
      </div>

      {/* My Published Content */}
      <div className="bg-gray-900 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">My Published Content</h3>
          {loading && <span className="text-xs text-gray-500 animate-pulse">Loading...</span>}
        </div>
        <DataTable
          columns={[
            { key: "name", header: "Name" },
            { key: "cid", header: "CID", render: (item) => <span className="font-mono text-xs text-gray-400">{shortenCid(String(item.cid))}</span> },
            { key: "size", header: "Size", render: (item) => formatBytes(Number(item.size)) },
            { key: "encrypted", header: "Enc", render: (item) => item.encrypted ? <Lock size={14} className="text-craftec-400" /> : <Unlock size={14} className="text-gray-500" /> },
            { key: "shards", header: "Shards" },
            { key: "actions", header: "", render: (item) => (
              <button onClick={() => setShowAccess(String(item.cid))} className="text-xs text-craftec-400 hover:text-craftec-300">Access</button>
            )},
          ]}
          data={content as unknown as Record<string, unknown>[]}
          emptyMessage={connected ? "No content published yet" : "Connect daemon to view content"}
        />
      </div>

      {/* Download History */}
      <div className="bg-gray-900 rounded-xl p-4 mb-6">
        <h3 className="font-semibold mb-3">Download History</h3>
        <DataTable
          columns={[
            { key: "name", header: "Name" },
            { key: "cid", header: "CID", render: (item) => <span className="font-mono text-xs text-gray-400">{shortenCid(String(item.cid))}</span> },
            { key: "size", header: "Size", render: (item) => formatBytes(Number(item.size)) },
            { key: "fetchedAt", header: "Fetched", render: (item) => new Date(String(item.fetchedAt)).toLocaleDateString() },
          ]}
          data={mockDownloads as unknown as Record<string, unknown>[]}
          emptyMessage="No content fetched yet"
        />
      </div>

      {/* Creator Pool Management */}
      <div className="bg-gray-900 rounded-xl p-4">
        <h3 className="font-semibold mb-3">Creator Pools</h3>
        <DataTable
          columns={[
            { key: "name", header: "Content" },
            { key: "cid", header: "CID", render: (item) => <span className="font-mono text-xs text-gray-400">{shortenCid(String(item.cid))}</span> },
            { key: "balance", header: "Balance", render: (item) => <span className="text-green-400">${Number(item.balance).toFixed(2)}</span> },
            { key: "funded", header: "Total Funded", render: (item) => `$${Number(item.funded).toFixed(2)}` },
            { key: "actions", header: "", render: () => (
              <button className="text-xs text-craftec-400 hover:text-craftec-300">Fund</button>
            )},
          ]}
          data={mockPools as unknown as Record<string, unknown>[]}
          emptyMessage="No creator pools"
        />
      </div>

      {/* Publish Modal */}
      <Modal open={showPublish} onClose={() => setShowPublish(false)} title="Publish Content">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">File Path</label>
            <div className="flex gap-2">
              <input type="text" value={filePath} onChange={(e) => setFilePath(e.target.value)} placeholder="/path/to/file.csv"
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-craftec-500" />
              <button type="button" onClick={async () => { try { const s = await invoke<string | null>("pick_file"); if (s) setFilePath(s); } catch {} }}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors" title="Browse files">
                <FolderOpen size={16} />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setEncrypt(!encrypt)} className={`w-10 h-6 rounded-full relative transition-colors ${encrypt ? "bg-craftec-600" : "bg-gray-700"}`}>
              <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${encrypt ? "left-5" : "left-1"}`} />
            </button>
            <span className="text-sm">Encrypt content</span>
          </div>
          <button onClick={handlePublish} disabled={!filePath.trim() || publishing}
            className="w-full py-2 bg-craftec-600 hover:bg-craftec-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors">
            {publishing ? "Publishing..." : "Publish"}
          </button>
        </div>
      </Modal>

      {/* Access Control Modal */}
      <Modal open={showAccess !== null} onClose={() => setShowAccess(null)} title="Access Control">
        <div className="space-y-4">
          <p className="text-xs text-gray-400 font-mono">{showAccess ? shortenCid(showAccess) : ""}</p>
          <div className="flex gap-2">
            <input type="text" value={accessDid} onChange={(e) => setAccessDid(e.target.value)} placeholder="recipient pubkey (hex)"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-craftec-500" />
            <button onClick={handleGrant} disabled={!accessDid.trim() || !connected}
              className="px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white rounded-lg transition-colors">
              <UserPlus size={16} />
            </button>
          </div>
          <div className="space-y-2">
            {accessEntries.length === 0 && <p className="text-sm text-gray-500">No access granted</p>}
            {accessEntries.map((entry) => (
              <div key={entry.did} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm font-mono">{entry.did.length > 20 ? `${entry.did.slice(0, 10)}...${entry.did.slice(-10)}` : entry.did}</p>
                  {entry.grantedAt && <p className="text-xs text-gray-500">{new Date(entry.grantedAt).toLocaleDateString()}</p>}
                </div>
                <button onClick={() => showAccess && revokeAccess(showAccess, entry.did)} disabled={!connected} className="text-red-400 hover:text-red-300 disabled:text-gray-600">
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
