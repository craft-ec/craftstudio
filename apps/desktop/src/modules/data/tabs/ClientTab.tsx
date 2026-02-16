import { useState, useEffect, useCallback } from "react";
import { Upload, Lock, Unlock, UserPlus, UserMinus, Download, DollarSign, FolderOpen } from "lucide-react";
import { useDataCraftStore } from "../../../store/dataCraftStore";
import { useActiveConnection } from "../../../hooks/useDaemon";
import { useDaemon } from "../../../hooks/useDaemon";
import StatCard from "../../../components/StatCard";
import DataTable from "../../../components/DataTable";
import Modal from "../../../components/Modal";
import { invoke } from "@tauri-apps/api/core";
import NetworkHealth from "../../../components/NetworkHealth";
import { usePeers } from "../../../hooks/usePeers";

function ProviderBadge({ count }: { count: number }) {
  if (count <= 1) return <span className="text-xs text-amber-500">Local only</span>;
  return <span className="text-xs text-green-600">{count} nodes</span>;
}

function healthBarColor(ratio: number): string {
  if (ratio >= 0.8) return "bg-green-500";
  if (ratio >= 0.5) return "bg-yellow-500";
  return "bg-red-500";
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
}

function shortenCid(cid: string): string {
  return cid.length > 16 ? `${cid.slice(0, 8)}...${cid.slice(-8)}` : cid;
}

interface ChannelInfo {
  channel_id: string;
  sender: string;
  receiver: string;
  locked_amount: number;
  spent: number;
  remaining: number;
  nonce: number;
}

export default function ClientTab() {
  const daemon = useDaemon();
  const { content, accessLists, loading, error, loadContent, publishContent, grantAccess, revokeAccess, loadAccessList } = useDataCraftStore();
  const { connected } = useActiveConnection();
  const [showPublish, setShowPublish] = useState(false);
  const [showAccess, setShowAccess] = useState<string | null>(null);
  const [filePath, setFilePath] = useState("");
  const [encrypt, setEncrypt] = useState(false);
  const [accessDid, setAccessDid] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [showNoStorageConfirm, setShowNoStorageConfirm] = useState(false);
  const { storage: storagePeerCount } = usePeers();

  useEffect(() => {
    if (connected) loadContent();
  }, [connected, loadContent]);

  const loadChannels = useCallback(async () => {
    if (!connected) return;
    try {
      const result = await daemon?.listChannels();
      setChannels(result?.channels || []);
    } catch { /* */ }
  }, [connected]);

  useEffect(() => { loadChannels(); }, [loadChannels]);

  useEffect(() => {
    if (showAccess && connected) loadAccessList(showAccess);
  }, [showAccess, connected, loadAccessList]);

  const totalLocked = channels.reduce((s, c) => s + c.locked_amount, 0);

  const published = content.filter((c) => c.role === "publisher" || c.role === "unknown");

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
          onClick={() => {
            if (storagePeerCount === 0) {
              setShowNoStorageConfirm(true);
            } else {
              setShowPublish(true);
            }
          }}
          disabled={!connected}
          className="flex items-center gap-2 px-4 py-2 bg-craftec-600 hover:bg-craftec-700 disabled:bg-gray-200 disabled:text-gray-500 text-white rounded-lg transition-colors text-sm"
        >
          <Upload size={16} /> Publish Content
        </button>
      </div>

      <NetworkHealth />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 mb-4 text-sm text-red-600">{error}</div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard icon={Upload} label="Published" value={String(published.length)} />
        <StatCard icon={Download} label="Channels" value={String(channels.length)} />
        <StatCard icon={DollarSign} label="Total Locked" value={totalLocked > 0 ? String(totalLocked) : "0"} color="text-green-600" />
      </div>

      {/* My Published Content */}
      <div className="bg-white rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">My Published Content</h3>
          {loading && <span className="text-xs text-gray-500 animate-pulse">Loading...</span>}
        </div>
        <DataTable
          columns={[
            { key: "name", header: "Name", render: (item) => (
              <span>{String(item.name)}{item.hot ? <span className="ml-1" title="Hot content">🔥</span> : null}</span>
            )},
            { key: "content_id", header: "CID", render: (item) => <span className="font-mono text-xs text-gray-400">{shortenCid(String(item.content_id))}</span> },
            { key: "total_size", header: "Size", render: (item) => formatBytes(Number(item.total_size)) },
            { key: "encrypted", header: "Enc", render: (item) => item.encrypted ? <Lock size={14} className="text-craftec-400" /> : <Unlock size={14} className="text-gray-500" /> },
            { key: "segments", header: "Segments", render: (item) => <span>{String(item.segment_count || 0)}</span> },
            { key: "health", header: "Health", render: (item) => {
              const ratio = Number(item.health_ratio || 0);
              return (
                <div className="flex items-center gap-2 w-28">
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div className={`h-2 rounded-full ${healthBarColor(ratio)}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                  </div>
                  <span className="text-xs text-gray-400 w-8 text-right">{(ratio * 100).toFixed(0)}%</span>
                </div>
              );
            }},
            { key: "providers", header: "Distribution", render: (item) => <ProviderBadge count={Number(item.provider_count || 0)} /> },
            { key: "stage", header: "Stage", render: (item) => <span className="text-xs text-gray-400">{String(item.stage || "")}</span> },
            { key: "actions", header: "", render: (item) => (
              <button onClick={() => setShowAccess(String(item.content_id))} className="text-xs text-craftec-400 hover:text-craftec-300">Access</button>
            )},
          ]}
          data={published as unknown as Record<string, unknown>[]}
          emptyMessage={connected ? "No content published yet" : "Start the daemon to see live data"}
        />
      </div>

      {/* Payment Channels */}
      <div className="bg-white rounded-xl p-4">
        <h3 className="font-semibold mb-3">Payment Channels</h3>
        <DataTable
          columns={[
            { key: "channel_id", header: "Channel", render: (item) => <span className="font-mono text-xs text-gray-400">{shortenCid(String(item.channel_id))}</span> },
            { key: "receiver", header: "Peer", render: (item) => <span className="font-mono text-xs text-gray-400">{shortenCid(String(item.receiver))}</span> },
            { key: "locked_amount", header: "Locked", render: (item) => <span className="text-craftec-400">{String(item.locked_amount)}</span> },
            { key: "spent", header: "Spent", render: (item) => String(item.spent) },
            { key: "remaining", header: "Remaining", render: (item) => <span className="text-green-600">{String(item.remaining)}</span> },
          ]}
          data={channels as unknown as Record<string, unknown>[]}
          emptyMessage={connected ? "No payment channels open" : "Start the daemon to see live data"}
        />
      </div>

      {/* Publish Modal */}
      <Modal open={showPublish} onClose={() => setShowPublish(false)} title="Publish Content">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">File Path</label>
            <div className="flex gap-2">
              <input type="text" value={filePath} onChange={(e) => setFilePath(e.target.value)} placeholder="/path/to/file.csv"
                className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-craftec-500" />
              <button type="button" onClick={async () => { try { const s = await invoke<string | null>("pick_file"); if (s) setFilePath(s); } catch {} }}
                className="px-3 py-2 bg-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors" title="Browse files">
                <FolderOpen size={16} />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setEncrypt(!encrypt)} className={`w-10 h-6 rounded-full relative transition-colors ${encrypt ? "bg-craftec-600" : "bg-gray-200"}`}>
              <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${encrypt ? "left-5" : "left-1"}`} />
            </button>
            <span className="text-sm">Encrypt content</span>
          </div>
          <button onClick={handlePublish} disabled={!filePath.trim() || publishing}
            className="w-full py-2 bg-craftec-600 hover:bg-craftec-700 disabled:bg-gray-200 disabled:text-gray-500 text-white rounded-lg transition-colors">
            {publishing ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                Publishing — chunking, encoding, announcing to DHT...
              </span>
            ) : "Publish"}
          </button>
        </div>
      </Modal>

      {/* No Storage Peers Confirmation */}
      <Modal open={showNoStorageConfirm} onClose={() => setShowNoStorageConfirm(false)} title="No Storage Peers">
        <div className="space-y-4">
          <p className="text-sm text-gray-700">No storage peers connected. Content will only exist locally. Continue?</p>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowNoStorageConfirm(false)} className="px-4 py-2 bg-gray-200 hover:bg-gray-50 text-white rounded-lg transition-colors text-sm">Cancel</button>
            <button onClick={() => { setShowNoStorageConfirm(false); setShowPublish(true); }} className="px-4 py-2 bg-craftec-600 hover:bg-craftec-700 text-white rounded-lg transition-colors text-sm">Publish Locally</button>
          </div>
        </div>
      </Modal>

      {/* Access Control Modal */}
      <Modal open={showAccess !== null} onClose={() => setShowAccess(null)} title="Access Control">
        <div className="space-y-4">
          <p className="text-xs text-gray-400 font-mono">{showAccess ? shortenCid(showAccess) : ""}</p>
          <div className="flex gap-2">
            <input type="text" value={accessDid} onChange={(e) => setAccessDid(e.target.value)} placeholder="recipient pubkey (hex)"
              className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-craftec-500" />
            <button onClick={handleGrant} disabled={!accessDid.trim() || !connected}
              className="px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-200 text-white rounded-lg transition-colors">
              <UserPlus size={16} />
            </button>
          </div>
          <div className="space-y-2">
            {accessEntries.length === 0 && <p className="text-sm text-gray-500">No access granted</p>}
            {accessEntries.map((entry) => (
              <div key={entry.did} className="flex items-center justify-between bg-gray-100 rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm font-mono">{entry.did.length > 20 ? `${entry.did.slice(0, 10)}...${entry.did.slice(-10)}` : entry.did}</p>
                  {entry.grantedAt && <p className="text-xs text-gray-500">{new Date(entry.grantedAt).toLocaleDateString()}</p>}
                </div>
                <button onClick={() => showAccess && revokeAccess(showAccess, entry.did)} disabled={!connected} className="text-red-500 hover:text-red-600 disabled:text-gray-400">
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
