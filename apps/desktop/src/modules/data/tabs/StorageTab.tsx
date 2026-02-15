import { useState, useEffect, useCallback } from "react";
import { HardDrive, ShieldCheck, DollarSign, Activity } from "lucide-react";
import { daemon } from "../../../services/daemon";
import { useDaemonStore } from "../../../store/daemonStore";
import StatCard from "../../../components/StatCard";
import TimeChart from "../../../components/TimeChart";

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
}

// Mock data
const bandwidthData = Array.from({ length: 24 }, (_, i) => {
  const h = String(i).padStart(2, "0") + ":00";
  const base = 50_000_000 + Math.sin(i / 3) * 30_000_000;
  return { time: h, bytes: Math.round(base + Math.random() * 20_000_000) };
});

const shardHealthData = [
  "bafk…a1b2", "bafk…c3d4", "bafk…e5f6", "bafk…7890", "bafk…abcd",
  "bafk…ef01", "bafk…2345", "bafk…6789", "bafk…face", "bafk…dead",
].map((cid, i) => ({ cid, shards: Math.round(120 - i * 8 + Math.random() * 15) }));

const pdpData = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(); d.setDate(d.getDate() - 6 + i);
  return { day: d.toLocaleDateString("en", { weekday: "short" }), rate: +(95 + Math.random() * 5).toFixed(1) };
});

// Mock earnings
const mockEarnings = { total: 42.75, last24h: 3.20, challenges: 1847, passRate: 98.2 };

export default function StorageTab() {
  const { connected } = useDaemonStore();
  const [storedBytes, setStoredBytes] = useState(0);
  const [shardCount, setShardCount] = useState(0);

  const load = useCallback(async () => {
    if (!connected) return;
    try {
      const status = await daemon.status();
      setStoredBytes(status.total_stored || 0);
      setShardCount(status.shard_count || 0);
    } catch { /* */ }
  }, [connected]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Storage</h2>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard icon={HardDrive} label="Stored" value={formatBytes(storedBytes)} />
        <StatCard icon={HardDrive} label="Shards" value={String(shardCount)} />
        <StatCard icon={ShieldCheck} label="PDP Pass Rate" value={`${mockEarnings.passRate}%`} color="text-green-400" />
        <StatCard icon={DollarSign} label="Earnings" value={`$${mockEarnings.total.toFixed(2)}`} sub={`$${mockEarnings.last24h.toFixed(2)} last 24h`} color="text-green-400" />
      </div>

      {/* PDP Stats */}
      <div className="bg-gray-900 rounded-xl p-4 mb-6">
        <h3 className="font-semibold mb-3">PDP Statistics</h3>
        <div className="grid grid-cols-2 gap-4">
          <StatCard icon={ShieldCheck} label="Challenges Served" value={String(mockEarnings.challenges)} />
          <StatCard icon={Activity} label="Pass Rate (7d avg)" value={`${mockEarnings.passRate}%`} color="text-green-400" />
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <TimeChart
          title="Bandwidth — Bytes Served (24h)"
          data={bandwidthData}
          xKey="time"
          series={[{ key: "bytes", label: "Bytes" }]}
          formatValue={(v) => v >= 1e9 ? `${(v / 1e9).toFixed(1)} GB` : v >= 1e6 ? `${(v / 1e6).toFixed(0)} MB` : `${(v / 1e3).toFixed(0)} KB`}
        />
        <TimeChart
          title="PDP Pass Rate (7 days)"
          data={pdpData}
          xKey="day"
          series={[{ key: "rate", label: "Pass %" }]}
          type="area"
          formatValue={(v) => `${v}%`}
        />
      </div>

      <TimeChart
        title="Storage Health — Shards per CID (Top 10)"
        data={shardHealthData}
        xKey="cid"
        series={[{ key: "shards", label: "Shards" }]}
        type="bar"
        height={200}
      />
    </div>
  );
}
