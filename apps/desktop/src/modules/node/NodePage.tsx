import { useState } from "react";
import { Monitor, Activity, HardDrive, ShieldCheck, DollarSign, Users, Clock, Zap } from "lucide-react";
import StatCard from "../../components/StatCard";

interface Capability {
  key: string;
  label: string;
  enabled: boolean;
}

export default function NodePage() {
  const [capabilities, setCapabilities] = useState<Capability[]>([
    { key: "tunnel_relay", label: "Tunnel Relay", enabled: true },
    { key: "tunnel_exit", label: "Tunnel Exit", enabled: false },
    { key: "data_storage", label: "Storage Node", enabled: true },
    { key: "data_relay", label: "Data Relay", enabled: true },
  ]);

  const toggle = (key: string) => {
    setCapabilities((prev) =>
      prev.map((c) => (c.key === key ? { ...c, enabled: !c.enabled } : c))
    );
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Monitor className="text-craftec-500" /> Dashboard
      </h1>

      {/* Node Status */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard icon={Activity} label="Status" value="Online" color="text-green-400" />
        <StatCard icon={Users} label="Peers" value="12" sub="3 relay, 9 storage" />
        <StatCard icon={Clock} label="Uptime" value="4d 7h 23m" />
        <StatCard icon={Zap} label="Capabilities" value={`${capabilities.filter((c) => c.enabled).length}/4`} />
      </div>

      {/* Storage Stats */}
      <div className="bg-gray-900 rounded-xl p-4 mb-6">
        <h2 className="text-lg font-semibold mb-3">Storage Stats</h2>
        <div className="grid grid-cols-4 gap-4">
          <StatCard icon={HardDrive} label="Total Stored" value="2.4 GB" sub="of 50 GB limit" />
          <StatCard icon={HardDrive} label="Shards Served" value="1,247" sub="last 24h" />
          <StatCard icon={ShieldCheck} label="PDP Pass Rate" value="98.7%" color="text-green-400" sub="142/144 challenges" />
          <StatCard icon={Activity} label="Bandwidth Used" value="18.3 GB" sub="this month" />
        </div>
      </div>

      {/* Earnings */}
      <div className="bg-gray-900 rounded-xl p-4 mb-6">
        <h2 className="text-lg font-semibold mb-3">Earnings Summary</h2>
        <div className="grid grid-cols-3 gap-4">
          <StatCard icon={DollarSign} label="PDP Rewards" value="$14.25" sub="this month" color="text-green-400" />
          <StatCard icon={DollarSign} label="Egress Revenue" value="$8.70" sub="this month" color="text-green-400" />
          <StatCard icon={DollarSign} label="Total Earned" value="$156.42" sub="all time" color="text-craftec-500" />
        </div>
      </div>

      {/* Capability Toggles */}
      <div className="bg-gray-900 rounded-xl p-4">
        <h2 className="text-lg font-semibold mb-3">Node Capabilities</h2>
        <div className="space-y-3">
          {capabilities.map(({ key, label, enabled }) => (
            <div key={key} className="flex items-center justify-between">
              <span>{label}</span>
              <button
                onClick={() => toggle(key)}
                className={`w-10 h-6 rounded-full relative transition-colors ${enabled ? "bg-craftec-600" : "bg-gray-700"}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${enabled ? "left-5" : "left-1"}`} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
