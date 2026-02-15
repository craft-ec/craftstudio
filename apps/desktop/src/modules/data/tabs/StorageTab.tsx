import { useState, useEffect, useCallback } from "react";
import { HardDrive, ShieldCheck, DollarSign, Activity, Inbox } from "lucide-react";
import { useDaemon } from "../../../hooks/useDaemon";
import { useActiveConnection } from "../../../hooks/useDaemon";
import StatCard from "../../../components/StatCard";
import TimeChart from "../../../components/TimeChart";

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
}

interface StorageReceipt {
  cid: string;
  storage_node: string;
  challenger: string;
  shard_index: number;
  timestamp: number;
  signed: boolean;
}

export default function StorageTab() {
  const daemon = useDaemon();
  const { connected } = useActiveConnection();
  const [storedBytes, setStoredBytes] = useState(0);
  const [shardCount, setShardCount] = useState(0);
  const [receipts, setReceipts] = useState<StorageReceipt[]>([]);
  const [totalReceipts, setTotalReceipts] = useState(0);

  const load = useCallback(async () => {
    if (!connected) return;
    try {
      const [status, receiptData] = await Promise.allSettled([
        daemon?.status(),
        daemon?.listStorageReceipts({ limit: 100 }),
      ]);
      if (status.status === "fulfilled" && status.value) {
        setStoredBytes(status.value.stored_bytes || 0);
        setShardCount(status.value.shard_count || 0);
      }
      if (receiptData.status === "fulfilled" && receiptData.value) {
        setReceipts(receiptData.value.receipts || []);
        setTotalReceipts(receiptData.value.total || 0);
      }
    } catch { /* */ }
  }, [connected]);

  useEffect(() => { load(); }, [load]);

  // Build PDP chart from receipt timestamps (group by day)
  const pdpChartData = (() => {
    if (receipts.length === 0) return [];
    const byDay = new Map<string, { total: number; signed: number }>();
    for (const r of receipts) {
      const day = new Date(r.timestamp * 1000).toLocaleDateString("en", { weekday: "short" });
      const entry = byDay.get(day) || { total: 0, signed: 0 };
      entry.total++;
      if (r.signed) entry.signed++;
      byDay.set(day, entry);
    }
    return Array.from(byDay.entries()).map(([day, { total, signed }]) => ({
      day,
      rate: total > 0 ? +((signed / total) * 100).toFixed(1) : 0,
    }));
  })();

  // Build bandwidth-like chart from receipt timestamps (group by hour, last 24h)
  const bandwidthChartData = (() => {
    if (receipts.length === 0) return [];
    const now = Date.now() / 1000;
    const last24h = receipts.filter((r) => now - r.timestamp < 86400);
    if (last24h.length === 0) return [];
    const byHour = new Map<string, number>();
    for (const r of last24h) {
      const h = new Date(r.timestamp * 1000).getHours();
      const key = String(h).padStart(2, "0") + ":00";
      byHour.set(key, (byHour.get(key) || 0) + 1);
    }
    return Array.from(byHour.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([time, count]) => ({ time, challenges: count }));
  })();

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

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard icon={HardDrive} label="Stored" value={formatBytes(storedBytes)} />
        <StatCard icon={HardDrive} label="Shards" value={String(shardCount)} />
        <StatCard icon={ShieldCheck} label="PDP Pass Rate" value={receipts.length > 0 ? `${passRate}%` : "—"} color="text-green-400" />
        <StatCard icon={DollarSign} label="Receipts" value={String(totalReceipts)} sub={connected ? undefined : "offline"} />
      </div>

      {/* PDP Stats */}
      <div className="bg-gray-900 rounded-xl p-4 mb-6">
        <h3 className="font-semibold mb-3">PDP Statistics</h3>
        <div className="grid grid-cols-2 gap-4">
          <StatCard icon={ShieldCheck} label="Challenges Served" value={String(totalReceipts)} />
          <StatCard icon={Activity} label="Pass Rate" value={receipts.length > 0 ? `${passRate}%` : "—"} color="text-green-400" />
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {bandwidthChartData.length > 0 ? (
          <TimeChart
            title="Challenges — Last 24h"
            data={bandwidthChartData}
            xKey="time"
            series={[{ key: "challenges", label: "Challenges" }]}
            formatValue={(v) => String(Math.round(v))}
          />
        ) : (
          <div className="bg-gray-900 rounded-xl p-4">
            <h3 className="font-semibold mb-2">Challenges — Last 24h</h3>
            <EmptyState message="No challenge data yet" />
          </div>
        )}
        {pdpChartData.length > 0 ? (
          <TimeChart
            title="PDP Pass Rate by Day"
            data={pdpChartData}
            xKey="day"
            series={[{ key: "rate", label: "Pass %" }]}
            type="area"
            formatValue={(v) => `${v}%`}
          />
        ) : (
          <div className="bg-gray-900 rounded-xl p-4">
            <h3 className="font-semibold mb-2">PDP Pass Rate by Day</h3>
            <EmptyState message="No PDP data yet" />
          </div>
        )}
      </div>

      {!connected && (
        <div className="bg-gray-900 rounded-xl p-4 text-center text-sm text-gray-500">
          Start the daemon to see live storage data
        </div>
      )}
    </div>
  );
}
