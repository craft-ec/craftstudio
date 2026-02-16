import { useState, useEffect, useCallback } from "react";
import { HardDrive, ShieldCheck, DollarSign, Activity, Inbox, ChevronDown, ChevronRight } from "lucide-react";
import { useDaemon, useActiveConnection } from "../../../hooks/useDaemon";
import StatCard from "../../../components/StatCard";
import ContentHealthDetail from "../../../components/ContentHealthDetail";
import type { ContentDetailedItem, SegmentDetail } from "../../../services/daemon";

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

function healthBarColor(ratio: number): string {
  if (ratio >= 0.8) return "bg-green-500";
  if (ratio >= 0.5) return "bg-yellow-500";
  return "bg-red-500";
}

interface StorageReceipt {
  cid: string;
  storage_node: string;
  challenger: string;
  shard_index: number;
  timestamp: number;
  signed: boolean;
}

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
    <div className="px-4 py-2 bg-gray-950 border-t border-gray-800">
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
              <tr key={seg.index} className="border-t border-gray-800/30">
                <td className="py-1 px-2 font-mono">{seg.index}</td>
                <td className="py-1 px-2">{seg.local_pieces}/{seg.k}</td>
                <td className="py-1 px-2">
                  <div className="bg-gray-800 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full ${healthBarColor(ratio)}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                  </div>
                </td>
                <td className="py-1 px-2">
                  {seg.reconstructable
                    ? <span className="text-green-400">✓</span>
                    : <span className="text-gray-600">✗</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function StorageTab() {
  const daemon = useDaemon();
  const { connected } = useActiveConnection();
  const [items, setItems] = useState<ContentDetailedItem[]>([]);
  const [receipts, setReceipts] = useState<StorageReceipt[]>([]);
  const [totalReceipts, setTotalReceipts] = useState(0);
  const [expandedCid, setExpandedCid] = useState<string | null>(null);
  const [detailCid, setDetailCid] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!connected || !daemon) return;
    try {
      const [listRes, receiptRes] = await Promise.allSettled([
        daemon.contentListDetailed(),
        daemon.listStorageReceipts({ limit: 100 }),
      ]);
      if (listRes.status === "fulfilled") setItems(listRes.value || []);
      if (receiptRes.status === "fulfilled" && receiptRes.value) {
        setReceipts(receiptRes.value.receipts || []);
        setTotalReceipts(receiptRes.value.total || 0);
      }
    } catch { /* */ }
  }, [connected, daemon]);

  useEffect(() => { load(); }, [load]);

  const stored = items.filter((c) => c.role === "storage_provider");
  const storedBytes = items.reduce((acc, c) => acc + (c.local_disk_usage || 0), 0);
  const passRate = receipts.length > 0
    ? +((receipts.filter((r) => r.signed).length / receipts.length) * 100).toFixed(1)
    : 0;

  const EmptyState = ({ message }: { message: string }) => (
    <div className="flex flex-col items-center justify-center py-8 text-gray-500">
      <Inbox size={32} className="mb-2 opacity-50" />
      <p className="text-sm">{message}</p>
    </div>
  );

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Storage</h2>

      {/* Detail view */}
      {detailCid && <ContentHealthDetail cid={detailCid} onClose={() => setDetailCid(null)} />}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard icon={HardDrive} label="Stored" value={formatBytes(storedBytes)} />
        <StatCard icon={HardDrive} label="Content" value={String(items.length)} />
        <StatCard icon={ShieldCheck} label="PDP Pass Rate" value={receipts.length > 0 ? `${passRate}%` : "—"} color="text-green-400" />
        <StatCard icon={DollarSign} label="Receipts" value={String(totalReceipts)} sub={connected ? undefined : "offline"} />
      </div>

      {/* Content list */}
      <div className="bg-gray-900 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Stored Content</h3>
          {stored.length > 0 && (
            <span className="text-xs text-gray-500">{stored.length} items · {formatBytes(stored.reduce((acc, c) => acc + c.size, 0))}</span>
          )}
        </div>
        {items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left py-2 px-3 text-gray-400 font-medium w-6"></th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium">Name</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium">CID</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium">Size</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium w-36">Health</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium">Role</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium">Stage</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const cid = item.content_id;
                  const isExpanded = expandedCid === cid;
                  return (
                    <tr key={cid} className="group">
                      <td colSpan={8} className="p-0">
                        <div
                          className="flex items-center border-b border-gray-800/50 hover:bg-gray-800/30 cursor-pointer"
                          onClick={() => setExpandedCid(isExpanded ? null : cid)}
                        >
                          <div className="py-2 px-3 w-6">
                            {isExpanded ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />}
                          </div>
                          <div className="py-2 px-3 flex-1 min-w-0">
                            <span className="truncate">{item.name || shortenCid(cid)}</span>
                            {item.hot && <span className="ml-1" title="Hot content">🔥</span>}
                          </div>
                          <div className="py-2 px-3">
                            <span className="font-mono text-xs text-gray-400">{shortenCid(cid)}</span>
                          </div>
                          <div className="py-2 px-3">{formatBytes(item.size)}</div>
                          <div className="py-2 px-3 w-36">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-gray-800 rounded-full h-2">
                                <div className={`h-2 rounded-full ${healthBarColor(item.health_ratio)}`} style={{ width: `${Math.min(100, item.health_ratio * 100)}%` }} />
                              </div>
                              <span className="text-xs text-gray-400 w-8 text-right">{(item.health_ratio * 100).toFixed(0)}%</span>
                            </div>
                          </div>
                          <div className="py-2 px-3">
                            <span className="px-1.5 py-0.5 rounded text-xs bg-gray-800 text-gray-300">{item.role}</span>
                          </div>
                          <div className="py-2 px-3 text-xs text-gray-400">{item.stage}</div>
                          <div className="py-2 px-3">
                            <button
                              onClick={(e) => { e.stopPropagation(); setDetailCid(cid); }}
                              className="text-xs text-craftec-400 hover:text-craftec-300"
                            >
                              Details
                            </button>
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
          <EmptyState message={connected ? "Not storing any content yet" : "Start the daemon to see stored content"} />
        )}
      </div>

      {/* PDP Stats */}
      <div className="bg-gray-900 rounded-xl p-4 mb-6">
        <h3 className="font-semibold mb-3">PDP Statistics</h3>
        <div className="grid grid-cols-2 gap-4">
          <StatCard icon={ShieldCheck} label="Challenges Served" value={String(totalReceipts)} />
          <StatCard icon={Activity} label="Pass Rate" value={receipts.length > 0 ? `${passRate}%` : "—"} color="text-green-400" />
        </div>
      </div>

      {!connected && (
        <div className="bg-gray-900 rounded-xl p-4 text-center text-sm text-gray-500">
          Start the daemon to see live storage data
        </div>
      )}
    </div>
  );
}
