import React, { useState, useEffect, useCallback } from "react";
import {
  Database, Upload, Download, Lock, Unlock, UserPlus, UserMinus,
  Pin, ChevronDown, ChevronRight, FolderOpen,
  Activity, HardDrive, Users, Shield, Share2, Layers,
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
import NetworkPeersView from "./components/NetworkPeersView";
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

function redundancyLevel(healthRatio: number, providerCount: number): { level: string; color: string; description: string } {
  if (providerCount <= 1) {
    return {
      level: "None",
      color: "text-red-500",
      description: "Single point of failure"
    };
  }
  
  if (healthRatio >= 0.9 && providerCount >= 5) {
    return {
      level: "High",
      color: "text-green-500",
      description: `Excellent redundancy across ${providerCount} nodes`
    };
  }
  
  if (healthRatio >= 0.7 && providerCount >= 3) {
    return {
      level: "Good",
      color: "text-amber-500", 
      description: `Good redundancy across ${providerCount} nodes`
    };
  }
  
  return {
    level: "Low",
    color: "text-orange-500",
    description: `Limited redundancy across ${providerCount} nodes`
  };
}

// ── Segment Expander ──────────────────────────────────

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

// ── Enhanced Content Row ──────────────────────────────────

interface ContentRowProps {
  item: ContentItem;
  isExpanded: boolean;
  onToggleExpand: (cid: string) => void;
  onShowDetail: (cid: string) => void;
  onShowAccess: (cid: string) => void;
  onDelete?: (cid: string) => void;
  isPublished: boolean;
}

function ContentRow({ item, isExpanded, onToggleExpand, onShowDetail, onShowAccess, onDelete, isPublished }: ContentRowProps) {
  const cid = item.content_id;
  const redundancy = redundancyLevel(item.health_ratio, item.provider_count);
  
  return (
    <React.Fragment>
      <tr
        className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
        onClick={() => onToggleExpand(cid)}
      >
        <td className="py-2.5 px-3 w-6">
          {isExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
        </td>
        <td className="py-2.5 px-3">
          <div className="flex flex-col">
            <span className="font-medium text-gray-900 truncate">{item.name || shortenCid(cid)}</span>
            <span className="text-xs text-gray-400 font-mono">{shortenCid(cid)}</span>
          </div>
          {item.hot && <span className="ml-1" title="Hot content">🔥</span>}
        </td>
        <td className="py-2.5 px-3 text-gray-600">{formatBytes(item.total_size)}</td>
        <td className="py-2.5 px-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${healthDot(item.health_ratio)}`} />
              <span className="text-xs text-gray-600">{(item.health_ratio * 100).toFixed(0)}%</span>
            </div>
            <div className="text-xs">
              <span className={`font-medium ${redundancy.color}`}>{redundancy.level}</span>
              <div className="text-gray-400 text-[10px]" title={redundancy.description}>
                {item.min_rank}/{item.segment_count} segments
              </div>
            </div>
          </div>
        </td>
        <td className="py-2.5 px-3 text-gray-600">{item.segment_count}</td>
        <td className="py-2.5 px-3">
          {isPublished ? (
            item.provider_count <= 1
              ? <span className="text-xs text-amber-500">Distributing</span>
              : <span className="text-xs text-green-600">{item.provider_count} nodes</span>
          ) : (
            <span className="text-xs text-blue-600">Storing pieces</span>
          )}
        </td>
        <td className="py-2.5 px-3 w-8">
          {item.pinned && <span title="Pinned"><Pin size={14} className="text-craftec-400" /></span>}
        </td>
        <td className="py-2.5 px-3 w-8">
          {item.encrypted ? <span title="Encrypted"><Lock size={14} className="text-craftec-400" /></span> : <span title="Unencrypted"><Unlock size={14} className="text-gray-300" /></span>}
        </td>
        <td className="py-2.5 px-3">
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); onShowDetail(cid); }}
              className="text-xs text-craftec-500 hover:text-craftec-600 font-medium"
            >
              Details
            </button>
            {isPublished && (
              <button
                onClick={(e) => { e.stopPropagation(); onShowAccess(cid); }}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Access
              </button>
            )}
            {onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(cid); }}
                className="text-xs text-red-400 hover:text-red-600"
              >
                Delete
              </button>
            )}
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr><td colSpan={9} className="p-0"><SegmentExpander cid={cid} /></td></tr>
      )}
    </React.Fragment>
  );
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

  // Network health & stats
  const [netHealth, setNetHealth] = useState<NetworkHealthResponse | null>(null);
  const [nodeStats, setNodeStats] = useState<any>(null);

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
  const [expandedCid, setExpandedCid] = useState<string | null>(() => localStorage.getItem("dc:expandedCid"));
  const toggleExpandCid = (cid: string) => {
    setExpandedCid(v => {
      const next = v === cid ? null : cid;
      if (next) localStorage.setItem("dc:expandedCid", next);
      else localStorage.removeItem("dc:expandedCid");
      return next;
    });
  };

  // PDP & Receipts
  const [receipts, setReceipts] = useState<StorageReceipt[]>([]);
  const [totalReceipts, setTotalReceipts] = useState(0);
  const [showPdp, setShowPdp] = useState(() => localStorage.getItem("dc:showPdp") === "true");

  // Network view
  const [showNetwork, setShowNetwork] = useState(() => localStorage.getItem("dc:showNetwork") === "true");

  // Aggregator
  const [showAggregator, setShowAggregator] = useState(() => localStorage.getItem("dc:showAggregator") === "true");

  // Persist collapsible states
  const togglePdp = () => { setShowPdp(v => { localStorage.setItem("dc:showPdp", String(!v)); return !v; }); };
  const toggleNetwork = () => { setShowNetwork(v => { localStorage.setItem("dc:showNetwork", String(!v)); return !v; }); };
  const toggleAggregator = () => { setShowAggregator(v => { localStorage.setItem("dc:showAggregator", String(!v)); return !v; }); };

  // ── Data loading ────────────────────────────────────────

  // Load content when connected; clear only on unmount (instance switch remounts via key={activeId})
  // Load content on mount and whenever connection is (re)established.
  // No clearContent on disconnect — keep stale data visible until fresh data arrives.
  useEffect(() => {
    if (connected) loadContent();
  }, [connected, loadContent]);

  // Only clear on unmount (instance switch remounts via key={activeId})
  useEffect(() => {
    return () => { clearContent(); };
  }, [clearContent]);

  useEffect(() => {
    if (!connected || !daemon) return;
    const loadNetworkData = async () => {
      try {
        const [healthData, statsData] = await Promise.allSettled([
          daemon.networkHealth(),
          daemon.nodeStats()
        ]);
        
        if (healthData.status === 'fulfilled') {
          setNetHealth(healthData.value);
        }
        if (statsData.status === 'fulfilled') {
          setNodeStats(statsData.value);
        }
      } catch (err) {
        console.error('Failed to load network data:', err);
      }
    };
    
    loadNetworkData();
    const interval = setInterval(loadNetworkData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
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

  const publishedContent = content.filter((c) => c.role === "publisher" || c.role === "unknown");
  const storedContent = content.filter((c) => c.role === "storage_provider");
  
  const totalSize = content.reduce((acc, c) => acc + c.total_size, 0);
  const avgHealth = content.length > 0
    ? content.reduce((acc, c) => acc + c.health_ratio, 0) / content.length
    : 0;
  const passRate = receipts.length > 0
    ? +((receipts.filter((r) => r.signed).length / receipts.length) * 100).toFixed(1)
    : 0;

  const accessEntries = showAccess ? accessLists[showAccess] || [] : [];

  // Distribution stats for published content
  const distributionStats = {
    fullyDistributed: publishedContent.filter(c => c.provider_count > 3).length,
    distributing: publishedContent.filter(c => c.provider_count > 1 && c.provider_count <= 3).length,
    localOnly: publishedContent.filter(c => c.provider_count <= 1).length,
  };

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

  const handleDeleteLocal = async (cid: string) => {
    try {
      await daemon?.deleteLocalContent(cid);
      loadContent();
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
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

      {/* ── Node Stats (this node only) ─────────────────── */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard 
          icon={Share2} 
          label="Published" 
          value={String(publishedContent.length)} 
          sub={`${distributionStats.fullyDistributed} distributed`}
          color={distributionStats.localOnly > distributionStats.fullyDistributed ? "text-amber-500" : "text-green-600"}
        />
        <StatCard 
          icon={HardDrive} 
          label="Storing" 
          value={String(storedContent.length)} 
          sub={`${formatBytes(nodeStats?.total_disk_usage || 0)} / ${formatBytes(nodeStats?.max_storage_bytes || 0)}`}
        />
        <StatCard 
          icon={Layers} 
          label="Local Content" 
          value={String(content.length)}
          sub={formatBytes(totalSize)}
        />
        <StatCard 
          icon={Activity} 
          label="Node Status" 
          value={connected ? "Online" : "Offline"}
          color={connected ? "text-green-600" : "text-red-500"}
        />
      </div>

      {/* ── Content Health Detail (overlay) ──────────────── */}
      {detailCid && <ContentHealthDetail cid={detailCid} onClose={() => setDetailCid(null)} />}

      {/* ── Published Content ─────────────────────────────── */}
      <div className="bg-white rounded-xl p-4 mb-6 shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <Share2 size={18} className="text-craftec-500" />
            Published Content
          </h3>
          {loading && <span className="text-xs text-gray-500 animate-pulse">Loading…</span>}
        </div>
        <p className="text-xs text-gray-400 mb-3">
          Content you published — distributed across the network after publishing. Publisher node keeps no local pieces.
        </p>

        {/* Distribution Status */}
        {publishedContent.length > 0 && (
          <div className="flex items-center gap-4 mb-4 p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-green-500"></div>
              <span className="text-sm text-gray-600">{distributionStats.fullyDistributed} distributed</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-amber-500"></div>
              <span className="text-sm text-gray-600">{distributionStats.distributing} distributing</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-red-500"></div>
              <span className="text-sm text-gray-600">{distributionStats.localOnly} local only</span>
            </div>
          </div>
        )}

        {publishedContent.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider w-6"></th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Name</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Size</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Health & Redundancy</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Segments</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Distribution Status</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider w-8"></th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider w-8"></th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {publishedContent.map((item: ContentItem) => (
                  <ContentRow
                    key={item.content_id}
                    item={item}
                    isExpanded={expandedCid === item.content_id}
                    onToggleExpand={toggleExpandCid}
                    onShowDetail={setDetailCid}
                    onShowAccess={setShowAccess}
                    onDelete={handleDeleteLocal}
                    isPublished={true}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Share2 size={32} className="mb-2 opacity-50" />
            <p className="text-sm">{connected ? "No published content yet — publish something!" : "Start the daemon to see content"}</p>
          </div>
        )}
      </div>

      {/* ── Stored Content (for network) ──────────────────── */}
      <div className="bg-white rounded-xl p-4 mb-6 shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <HardDrive size={18} className="text-blue-500" />
            Stored Content
          </h3>
          {loading && <span className="text-xs text-gray-500 animate-pulse">Loading…</span>}
        </div>
        <p className="text-xs text-gray-400 mb-3">
          Content pieces you're storing for the network — published by other users. Critical for network health.
        </p>

        {storedContent.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider w-6"></th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Name</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Size</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Health & Redundancy</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Segments</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Your Role</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider w-8"></th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider w-8"></th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {storedContent.map((item: ContentItem) => (
                  <ContentRow
                    key={item.content_id}
                    item={item}
                    isExpanded={expandedCid === item.content_id}
                    onToggleExpand={toggleExpandCid}
                    onShowDetail={setDetailCid}
                    onShowAccess={setShowAccess}
                    isPublished={false}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-gray-500">
            <HardDrive size={28} className="mb-2 opacity-50" />
            <p className="text-sm">{connected ? "Not storing any distributed content" : "Start the daemon to see content"}</p>
            {connected && !hasStorage && (
              <p className="text-xs text-gray-400 mt-1">Enable storage capability to help the network</p>
            )}
          </div>
        )}
      </div>

      {/* ── Network & Peers View (collapsible) ─────────── */}
      <div className="bg-white rounded-xl p-4 mb-6 shadow-sm border border-gray-200">
        <button
          onClick={toggleNetwork}
          className="flex items-center gap-2 w-full text-left"
        >
          {showNetwork ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
          <Users size={16} className="text-blue-500" />
          <h3 className="font-semibold">Network & Peers</h3>
          <span className="text-xs text-gray-400 ml-auto">
            {netHealth ? `${netHealth.storage_node_count} storage nodes • ${netHealth.total_providers_unique} providers` : "Loading..."}
          </span>
        </button>
        {showNetwork && (
          <div className="mt-4">
            {/* Network-level stats */}
            <div className="grid grid-cols-4 gap-4 mb-4">
              <StatCard 
                icon={Activity} 
                label="Network Health" 
                value={netHealth ? `${(netHealth.average_health_ratio * 100).toFixed(1)}%` : `${(avgHealth * 100).toFixed(0)}%`} 
                color={avgHealth >= 0.8 ? "text-green-600" : avgHealth >= 0.5 ? "text-amber-500" : "text-red-500"} 
              />
              <StatCard 
                icon={Users} 
                label="Storage Nodes" 
                value={String(netHealth?.storage_node_count ?? 0)}
                sub={`${netHealth?.total_providers_unique ?? 0} unique providers`}
              />
              <StatCard 
                icon={HardDrive} 
                label="Network Storage" 
                value={formatBytes(netHealth?.total_network_storage_used ?? 0)}
                sub={`of ${formatBytes(netHealth?.total_network_storage_committed ?? 0)}`}
              />
              <StatCard 
                icon={Layers} 
                label="Network Content" 
                value={String(netHealth?.total_content_count ?? content.length)}
                sub={`${netHealth?.healthy_content_count ?? 0} healthy, ${netHealth?.degraded_content_count ?? 0} degraded`}
              />
            </div>
            <NetworkPeersView />
          </div>
        )}
      </div>

      {/* ── PDP & Receipts (collapsible, storage only) ──── */}
      {hasStorage && (
        <div className="bg-white rounded-xl p-4 mb-6 shadow-sm border border-gray-200">
          <button
            onClick={togglePdp}
            className="flex items-center gap-2 w-full text-left"
          >
            {showPdp ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
            <Shield size={16} className="text-green-500" />
            <h3 className="font-semibold">PDP & Storage Proofs</h3>
            <span className="text-xs text-gray-400 ml-auto">
              {receipts.length > 0 ? `${passRate}% pass rate • ${totalReceipts} receipts` : "No receipts"}
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
            onClick={toggleAggregator}
            className="flex items-center gap-2 w-full text-left"
          >
            {showAggregator ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
            <Layers size={16} className="text-purple-500" />
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