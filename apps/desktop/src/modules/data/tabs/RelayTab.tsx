import { ArrowUpDown, Database, DollarSign, Activity } from "lucide-react";
import StatCard from "../../../components/StatCard";
import TimeChart from "../../../components/TimeChart";

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
}

// Mock data
const mockRelay = {
  bytesIn: 2_340_000_000,
  bytesOut: 1_870_000_000,
  cachedCids: 342,
  cacheHitRate: 73.5,
  earnings: 18.40,
  last24h: 2.15,
};

const trafficData = Array.from({ length: 24 }, (_, i) => {
  const h = String(i).padStart(2, "0") + ":00";
  return {
    time: h,
    inbound: Math.round(40_000_000 + Math.sin(i / 4) * 25_000_000 + Math.random() * 15_000_000),
    outbound: Math.round(30_000_000 + Math.cos(i / 4) * 20_000_000 + Math.random() * 10_000_000),
  };
});

export default function RelayTab() {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Relay</h2>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard icon={ArrowUpDown} label="Bytes In" value={formatBytes(mockRelay.bytesIn)} />
        <StatCard icon={ArrowUpDown} label="Bytes Out" value={formatBytes(mockRelay.bytesOut)} />
        <StatCard icon={Database} label="Cache Hit Rate" value={`${mockRelay.cacheHitRate}%`} sub={`${mockRelay.cachedCids} CIDs cached`} color="text-blue-400" />
        <StatCard icon={DollarSign} label="Relay Earnings" value={`$${mockRelay.earnings.toFixed(2)}`} sub={`$${mockRelay.last24h.toFixed(2)} last 24h`} color="text-green-400" />
      </div>

      <div className="bg-gray-900 rounded-xl p-4 mb-6">
        <h3 className="font-semibold mb-3">Cache Statistics</h3>
        <div className="grid grid-cols-3 gap-4">
          <StatCard icon={Database} label="Cached CIDs" value={String(mockRelay.cachedCids)} />
          <StatCard icon={Activity} label="Hit Rate" value={`${mockRelay.cacheHitRate}%`} color="text-blue-400" />
          <StatCard icon={ArrowUpDown} label="Total Forwarded" value={formatBytes(mockRelay.bytesIn + mockRelay.bytesOut)} />
        </div>
      </div>

      <TimeChart
        title="Traffic Forwarded (24h)"
        data={trafficData}
        xKey="time"
        series={[
          { key: "inbound", label: "Inbound" },
          { key: "outbound", label: "Outbound" },
        ]}
        formatValue={(v) => v >= 1e9 ? `${(v / 1e9).toFixed(1)} GB` : v >= 1e6 ? `${(v / 1e6).toFixed(0)} MB` : `${(v / 1e3).toFixed(0)} KB`}
      />
    </div>
  );
}
