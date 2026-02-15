import { Monitor } from "lucide-react";

export default function NodePage() {
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Monitor className="text-craftec-500" /> Node Capabilities
      </h1>
      <div className="bg-gray-900 rounded-xl p-6 space-y-4">
        {[
          { label: "Tunnel Relay", enabled: false },
          { label: "Tunnel Exit", enabled: false },
          { label: "Storage Node", enabled: false },
          { label: "Data Relay", enabled: false },
        ].map(({ label, enabled }) => (
          <div key={label} className="flex items-center justify-between">
            <span>{label}</span>
            <div className={`w-10 h-6 rounded-full ${enabled ? "bg-craftec-600" : "bg-gray-700"} relative cursor-pointer`}>
              <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${enabled ? "left-5" : "left-1"}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
