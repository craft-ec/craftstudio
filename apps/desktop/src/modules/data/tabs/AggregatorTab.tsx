import { Layers, Receipt, Send, ShieldCheck, Clock, CheckCircle, AlertCircle } from "lucide-react";
import StatCard from "../../../components/StatCard";
import DataTable from "../../../components/DataTable";

// Mock data
const mockAggregator = {
  epochsProcessed: 127,
  currentEpoch: 128,
  receiptsThisEpoch: 4_231,
  distributionsPosted: 126,
  proofStatus: "generating" as const, // "idle" | "generating" | "submitted" | "failed"
};

const mockDistributions = [
  { epoch: 127, txHash: "5Kx9…vQr7", recipients: 48, totalAmount: 156.30, timestamp: "2025-02-15T12:00:00Z" },
  { epoch: 126, txHash: "3Mn2…pWe4", recipients: 52, totalAmount: 162.10, timestamp: "2025-02-15T00:00:00Z" },
  { epoch: 125, txHash: "8Jf4…tYb1", recipients: 45, totalAmount: 148.75, timestamp: "2025-02-14T12:00:00Z" },
  { epoch: 124, txHash: "2Lp7…kRz9", recipients: 50, totalAmount: 155.00, timestamp: "2025-02-14T00:00:00Z" },
  { epoch: 123, txHash: "9Xa3…mNc6", recipients: 47, totalAmount: 151.20, timestamp: "2025-02-13T12:00:00Z" },
];

function ProofStatusBadge({ status }: { status: string }) {
  const styles: Record<string, { icon: typeof CheckCircle; color: string; label: string }> = {
    idle: { icon: Clock, color: "text-gray-400", label: "Idle" },
    generating: { icon: ShieldCheck, color: "text-yellow-400", label: "Generating…" },
    submitted: { icon: CheckCircle, color: "text-green-400", label: "Submitted" },
    failed: { icon: AlertCircle, color: "text-red-400", label: "Failed" },
  };
  const s = styles[status] || styles.idle;
  const Icon = s.icon;
  return (
    <span className={`flex items-center gap-1.5 text-sm ${s.color}`}>
      <Icon size={14} className={status === "generating" ? "animate-pulse" : ""} />
      {s.label}
    </span>
  );
}

export default function AggregatorTab() {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Aggregator</h2>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard icon={Layers} label="Epochs Processed" value={String(mockAggregator.epochsProcessed)} />
        <StatCard icon={Receipt} label="Receipts (epoch)" value={String(mockAggregator.receiptsThisEpoch)} sub={`Epoch #${mockAggregator.currentEpoch}`} />
        <StatCard icon={Send} label="Distributions" value={String(mockAggregator.distributionsPosted)} />
        <div className="bg-gray-900 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck size={16} className="text-craftec-500" />
            <span className="text-sm text-gray-400">Proof Status</span>
          </div>
          <ProofStatusBadge status={mockAggregator.proofStatus} />
        </div>
      </div>

      {/* Distributions */}
      <div className="bg-gray-900 rounded-xl p-4">
        <h3 className="font-semibold mb-3">Recent Distributions</h3>
        <DataTable
          columns={[
            { key: "epoch", header: "Epoch" },
            { key: "txHash", header: "Tx Hash", render: (item) => (
              <span className="font-mono text-xs text-craftec-400">{String(item.txHash)}</span>
            )},
            { key: "recipients", header: "Recipients" },
            { key: "totalAmount", header: "Amount", render: (item) => (
              <span className="text-green-400">${Number(item.totalAmount).toFixed(2)}</span>
            )},
            { key: "timestamp", header: "Time", render: (item) => new Date(String(item.timestamp)).toLocaleString() },
          ]}
          data={mockDistributions as unknown as Record<string, unknown>[]}
          emptyMessage="No distributions yet"
        />
      </div>
    </div>
  );
}
