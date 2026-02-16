import { useState, useEffect, useCallback } from "react";
import {
  Database, Upload, Download, Lock, Unlock, UserPlus, UserMinus,
  Pin, ChevronDown, ChevronRight, FolderOpen, Inbox,
  Activity, HardDrive, Users, Shield,
} from "lucide-react";
import { useActiveInstance } from "../../hooks/useActiveInstance";
import { useDaemon, useActiveConnection } from "../../hooks/useDaemon";
import { useDataCraftStore } from "../../store/dataCraftStore";
import { usePeers } from "../../hooks/usePeers";
import DaemonOffline from "../../components/DaemonOffline";
import DataCraftActivity from "../../components/DataCraftActivity";
import StatCard from "../../components/StatCard";
import ContentHealthDetail from "../../components/ContentHealthDetail";
import Modal from "../../components/Modal";
import AggregatorTab from "./tabs/AggregatorTab";
import { invoke } from "@tauri-apps/api/core";
import type { ContentItem } from "../../store/dataCraftStore";
import type { NetworkHealthResponse, SegmentDetail } from "../../services/daemon";

// ── Helpers ─────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function shortenCid(cid: string): string {
  if (cid.length <= 12) return cid;
  return `${cid.slice(0, 8)}…${cid.slice(-4)}`;
}

function healthDot(ratio: number): string {
  if (ratio >= 0.8) return "bg-green-500";
  if (ratio >= 0.5) return "bg-amber-500";
  return "bg-red-500";
}

function healthBarColor(ratio: number): string {
  if (ratio >= 0.8) return "bg-green-500";
  if (ratio >= 0.5) return "bg-yellow-500";
  return "bg-red-500";
}

function roleBadge(role: string): { label: string; cls: string } {
  switch (role) {
    case "publisher": return { label: "Publisher", cls: "bg-blue-100 text-blue-700" };
    case "storage_provider": return { label: "Storage", cls: "bg-purple-100 text-purple-700" };
    default: return { label: "Both", cls: "bg-gray-100 text-gray-700" };
  }
}

// ── Segment Expander (from StorageTab) ──────────────────

function SegmentExpander({ cid }: { cid: string }) {
  const daemon = useDaemon();
  const [segments, setSegments] = useState<SegmentDetail[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!daemon) return;
    daemon.contentSegments(cid).then((r) => setSegments(r.segments)).catch(() => setSegments([])).finally(() => setLoading(false));
  }, [daemon, cid]);

  if (loading) return <div className="px-4 py-2 text-xs text-gray-500 animate-pulse">Loading segments…</div>;
  if (!segments || segments.length === 0) return <div className="px-4 py-2 text-xs text-gray-500">No segment data</div>;

  return (
    <div className="px-4 py-2 bg-gray-50 border-t border-gray-200">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500">
            <th className="text-left py-1 px-2">Segment</th>
            <th className="text-left py-1 px-2">Pieces/k</th>
            <th className="text-left py-1 px-2 w-32">Coverage</th>
            <th className="text-left py-1 px-2">Reconstructable</th>
          </tr>
        </thead>
        <tbody>
          {segments.map((seg) => {
            const ratio = seg.k > 0 ? seg.local_pieces / seg.k : 0;
            return (
              <tr key={seg.index} className="border-t border-gray-200/30">
                <td className="py-1 px-2 font-mono">{seg.index}</td>
                <td className="py-1 px-2">{seg.local_pieces}/{seg.k}</td>
                <td className="py-1 px-2">
                  <div className="bg-gray-100 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full ${healthBarColor(ratio)}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                  </div>
                </td>
                <td className="py-1 px-2">
                  {seg.reconstructable ? <span className="text-green-600">✓</span> : <span className="text-gray-400">✗</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface StorageReceipt {
  cid: string;
  storage_node: string;
  challenger: string;
  segment_index: number;
  timestamp: number;
  signed: boolean;
}

// ── Main Component ──────────────────────────────────────

export default function DataDashboard() {
  const instance = useActiveInstance();
  const caps = instance?.capabilities ?? [];
  const hasStorage = caps.includes("storage");
  const hasAggregator = caps.includes("aggregator");

  const daemon = useDaemon();
  const { connected } = useActiveConnection();
  const { content, accessLists, loading, error, clearContent, loadContent, publishContent, grantAccess, revokeAccess, loadAccessList } = useDataCraftStore();
  const { storage: storagePeerCount } = usePeers();

  // Network health
  const [netHealth, setNetHealth] = useState<NetworkHealthResponse | null>(null);

  // Publish modal
  const [showPublish, setShowPublish] = useState(false);
  const [filePath, setFilePath] = useState("");
  const [encrypt, setEncrypt] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showNoStorageConfirm, setShowNoStorageConfirm] = useState(false);

  // Access modal
  const [showAccess, setShowAccess] = useState<string | null>(null);
  const [accessDid, setAccessDid] = useState("");

  // Content detail
  const [detailCid, setDetailCid] = useState<string | null>(null);
  const [expandedCid, setExpandedCid] = useState<string | null>(null);

  // PDP & Receipts
  const [receipts, setReceipts] = useState<StorageReceipt[]>([]);
  const [totalReceipts, setTotalReceipts] = useState(0);
  const [showPdp, setShowPdp] = useState(false);

  // Aggregator
  const [showAggregator, setShowAggregator] = useState(false);

  // ── Data loading ────────────────────────────────────────

  // Clear stale data on mount (instance switch remounts via key={activeId})
  useEffect(() => {
    clearContent();
    if (connected) loadContent();
  }, [connected, loadContent, clearContent]);

  useEffect(() => {
    if (!connected || !daemon) return;
    daemon.networkHealth().then(setNetHealth).catch(() => setNetHealth(null));
  }, [connected, daemon]);

  const loadReceipts = useCallback(async () => {
    if (!connected || !daemon || !hasStorage) return;
    try {
      const result = await daemon.listStorageReceipts({ limit: 100 });
      if (result) {
        setReceipts(result.receipts || []);
        setTotalReceipts(result.total || 0);
      }
    } catch { /* */ }
  }, [connected, daemon, hasStorage]);

  useEffect(() => { loadReceipts(); }, [loadReceipts]);

  useEffect(() => {
    if (showAccess && connected) loadAccessList(showAccess);
  }, [showAccess, connected, loadAccessList]);

  // ── Computed stats ──────────────────────────────────────

  const totalSize = content.reduce((acc, c) => acc + c.total_size, 0);
  const avgHealth = content.length > 0
    ? content.reduce((acc, c) => acc + c.health_ratio, 0) / content.length
    : 0;
  const passRate = receipts.length > 0
    ? +((receipts.filter((r) => r.signed).length / receipts.length) * 100).toFixed(1)
    : 0;

  const accessEntries = showAccess ? accessLists[showAccess] || [] : [];

  // ── Handlers ────────────────────────────────────────────

  const handlePublish = async () => {
    if (!filePath.trim()) return;
    setPublishing(true);
    try {
      await publishContent(filePath.trim(), encrypt);
      setFilePath("");
      setEncrypt(false);
      setShowPublish(false);
    } catch { /* error in store */ }
    finally { setPublishing(false); }
  };

  const handleGrant = async () => {
    if (showAccess && accessDid.trim()) {
      try {
        await grantAccess(showAccess, accessDid.trim());
        setAccessDid("");
      } catch { /* error in store */ }
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <DaemonOffline />

      {/* ── Header & Actions ─────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Database className="text-craftec-500" /> DataCraft
        </h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (storagePeerCount === 0) setShowNoStorageConfirm(true);
              else setShowPublish(true);
            }}
            disabled={!connected}
            className="flex items-center gap-2 px-4 py-2 bg-craftec-600 hover:bg-craftec-700 disabled:bg-gray-200 disabled:text-gray-500 text-white rounded-lg transition-colors text-sm font-medium"
          >
            <Upload size={16} /> Publish
          </button>
          <button
            disabled={!connected}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 text-gray-700 rounded-lg transition-colors text-sm"
          >
            <Download size={16} /> Fetch
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 mb-4 text-sm text-red-600">{error}</div>
      )}

      {/* ── Overview Stats ───────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard icon={Database} label="Total Content" value={String(content.length)} />
        <StatCard icon={HardDrive} label="Total Size" value={formatBytes(totalSize)} />
        <StatCard icon={Activity} label="Network Health" value={netHealth ? `${(netHealth.average_health_ratio * 100).toFixed(1)}%` : `${(avgHealth * 100).toFixed(0)}%`} color={avgHealth >= 0.8 ? "text-green-600" : avgHealth >= 0.5 ? "text-amber-500" : "text-red-500"} />
        <StatCard icon={Users} label="Active Providers" value={String(netHealth?.total_providers_unique ?? 0)} />
      </div>

      {/* ── Content Health Detail (overlay) ──────────────── */}
      {detailCid && <ContentHealthDetail cid={detailCid} onClose={() => setDetailCid(null)} />}

      {/* ── My Content Table ─────────────────────────────── */}
      <div className="bg-white rounded-xl p-4 mb-6 shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-lg">My Content</h3>
          {loading && <span className="text-xs text-gray-500 animate-pulse">Loading…</span>}
        </div>

        {content.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider w-6"></th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Name</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Size</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Health</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Role</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Segments</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Providers</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider w-8"></th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider w-8"></th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {content.map((item: ContentItem) => {
                  const cid = item.content_id;
                  const isExpanded = expandedCid === cid;
                  const badge = roleBadge(item.role);
                  return (
                    <tr key={cid} className="group">
                      <td colSpan={10} className="p-0">
                        <div
                          className="flex items-center border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                          onClick={() => setExpandedCid(isExpanded ? null : cid)}
                        >
                          <div className="py-2.5 px-3 w-6">
                            {isExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                          </div>
                          <div className="py-2.5 px-3 flex-1 min-w-0">
                            <span className="font-medium text-gray-900 truncate">{item.name || shortenCid(cid)}</span>
                            {item.hot && <span className="ml-1" title="Hot content">🔥</span>}
                          </div>
                          <div className="py-2.5 px-3 text-gray-600">{formatBytes(item.total_size)}</div>
                          <div className="py-2.5 px-3">
                            <div className="flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full ${healthDot(item.health_ratio)}`} />
                              <span className="text-xs text-gray-600">{(item.health_ratio * 100).toFixed(0)}%</span>
                            </div>
                          </div>
                          <div className="py-2.5 px-3">
                            <span className={`px-1.5 py-0.5 rounded text-xs ${badge.cls}`}>{badge.label}</span>
                          </div>
                          <div className="py-2.5 px-3 text-gray-600">{item.segment_count}</div>
                          <div className="py-2.5 px-3">
                            {item.provider_count <= 1
                              ? <span className="text-xs text-amber-500">Local only</span>
                              : <span className="text-xs text-green-600">{item.provider_count} nodes</span>
                            }
                          </div>
                          <div className="py-2.5 px-3 w-8">
                            {item.pinned && <span title="Pinned"><Pin size={14} className="text-craftec-400" /></span>}
                          </div>
                          <div className="py-2.5 px-3 w-8">
                            {item.encrypted ? <span title="Encrypted"><Lock size={14} className="text-craftec-400" /></span> : <span title="Unencrypted"><Unlock size={14} className="text-gray-300" /></span>}
                          </div>
                          <div className="py-2.5 px-3 flex items-center gap-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); setDetailCid(cid); }}
                              className="text-xs text-craftec-500 hover:text-craftec-600 font-medium"
                            >
                              Details
                            </button>
                            {(item.role === "publisher" || item.role === "unknown") && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setShowAccess(cid); }}
                                className="text-xs text-gray-500 hover:text-gray-700"
                              >
                                Access
                              </button>
                            )}
                          </div>
                        </div>
                        {isExpanded && <SegmentExpander cid={cid} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Inbox size={32} className="mb-2 opacity-50" />
            <p className="text-sm">{connected ? "No content yet — publish something!" : "Start the daemon to see content"}</p>
          </div>
        )}
      </div>

      {/* ── PDP & Receipts (collapsible, storage only) ──── */}
      {hasStorage && (
        <div className="bg-white rounded-xl p-4 mb-6 shadow-sm border border-gray-200">
          <button
            onClick={() => setShowPdp(!showPdp)}
            className="flex items-center gap-2 w-full text-left"
          >
            {showPdp ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
            <h3 className="font-semibold">PDP & Receipts</h3>
            <span className="text-xs text-gray-400 ml-auto">
              {receipts.length > 0 ? `${passRate}% pass rate · ${totalReceipts} receipts` : "No receipts"}
            </span>
          </button>
          {showPdp && (
            <div className="mt-4">
              <div className="grid grid-cols-3 gap-4 mb-4">
                <StatCard icon={Shield} label="PDP Pass Rate" value={receipts.length > 0 ? `${passRate}%` : "—"} color="text-green-600" />
                <StatCard icon={Database} label="Total Receipts" value={String(totalReceipts)} />
                <StatCard icon={Activity} label="Challenges Served" value={String(totalReceipts)} />
              </div>
              {receipts.length > 0 && (
                <>
                  <h4 className="text-sm font-medium text-gray-500 mb-2">Recent Receipts</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">CID</th>
                          <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Segment</th>
                          <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Signed</th>
                          <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {receipts.slice(0, 5).map((r, i) => (
                          <tr key={i} className="border-b border-gray-100">
                            <td className="py-2 px-3 font-mono text-xs text-gray-400">{shortenCid(r.cid)}</td>
                            <td className="py-2 px-3 text-gray-600">{r.segment_index}</td>
                            <td className="py-2 px-3">{r.signed ? <span className="text-green-600">✓</span> : <span className="text-red-500">✗</span>}</td>
                            <td className="py-2 px-3 text-xs text-gray-400">{new Date(r.timestamp * 1000).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Aggregator Status (collapsible, aggregator only) */}
      {hasAggregator && (
        <div className="bg-white rounded-xl p-4 mb-6 shadow-sm border border-gray-200">
          <button
            onClick={() => setShowAggregator(!showAggregator)}
            className="flex items-center gap-2 w-full text-left"
          >
            {showAggregator ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
            <h3 className="font-semibold">Aggregator Status</h3>
          </button>
          {showAggregator && (
            <div className="mt-4">
              <AggregatorTab />
            </div>
          )}
        </div>
      )}

      {/* ── Publish Modal ────────────────────────────────── */}
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
                Publishing — chunking, encoding, announcing to DHT…
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
            <button onClick={() => setShowNoStorageConfirm(false)} className="px-4 py-2 bg-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors text-sm">Cancel</button>
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
                  <p className="text-sm font-mono">{entry.did.length > 20 ? `${entry.did.slice(0, 10)}…${entry.did.slice(-10)}` : entry.did}</p>
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

      <DataCraftActivity />
    </div>
  );
}
