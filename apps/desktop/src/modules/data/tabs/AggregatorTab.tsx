import { useState, useEffect, useCallback } from "react";
import { Layers, Receipt, Send, ShieldCheck, Clock, CheckCircle, AlertCircle, Inbox } from "lucide-react";
import { useDaemon } from "../../../hooks/useDaemon";
import { useActiveConnection } from "../../../hooks/useDaemon";
import StatCard from "../../../components/StatCard";
import DataTable from "../../../components/DataTable";

interface AggregatorStatus {
  epochsProcessed: number;
  currentEpoch: number;
  receiptsThisEpoch: number;
  distributionsPosted: number;
  proofStatus: "idle" | "generating" | "submitted" | "failed";
}

interface Distribution {
  epoch: number;
  txHash: string;
  recipients: number;
  totalAmount: number;
  timestamp: string;
}

function ProofStatusBadge({ status }: { status: string }) {
  const styles: Record<string, { icon: typeof CheckCircle; color: string; label: string }> = {
    idle: { icon: Clock, color: "text-gray-400", label: "Idle" },
    generating: { icon: ShieldCheck, color: "text-amber-500", label: "Generating…" },
    submitted: { icon: CheckCircle, color: "text-green-600", label: "Submitted" },
    failed: { icon: AlertCircle, color: "text-red-500", label: "Failed" },
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
  const daemon = useDaemon();
  const { connected } = useActiveConnection();
  const [aggStatus, setAggStatus] = useState<AggregatorStatus | null>(null);
  const [distributions, setDistributions] = useState<Distribution[]>([]);
  const [aggAvailable, setAggAvailable] = useState(false);

  const load = useCallback(async () => {
    if (!connected) return;
    try {
      // NOTE: "aggregator.status" RPC is planned but not yet implemented in the daemon handler.
      // When the daemon doesn't recognize the method, the catch block sets aggAvailable=false,
      // which shows the "Aggregator not running" placeholder — this is the expected behavior.
      const result = await daemon?.call<{
        epochs_processed: number;
        current_epoch: number;
        receipts_this_epoch: number;
        distributions_posted: number;
        proof_status: string;
        distributions: Array<{
          epoch: number;
          tx_hash: string;
          recipients: number;
          total_amount: number;
          timestamp: string;
        }>;
      }>("aggregator.status");

      if (!result) return;
      setAggAvailable(true);
      setAggStatus({
        epochsProcessed: result.epochs_processed,
        currentEpoch: result.current_epoch,
        receiptsThisEpoch: result.receipts_this_epoch,
        distributionsPosted: result.distributions_posted,
        proofStatus: result.proof_status as AggregatorStatus["proofStatus"],
      });
      setDistributions(
        (result.distributions || []).map((d) => ({
          epoch: d.epoch,
          txHash: d.tx_hash,
          recipients: d.recipients,
          totalAmount: d.total_amount,
          timestamp: d.timestamp,
        }))
      );
    } catch {
      // aggregator.status not available — aggregator not running
      setAggAvailable(false);
    }
  }, [connected]);

  useEffect(() => { load(); }, [load]);

  if (!connected) {
    return (
      <div>
        <h2 className="text-lg font-semibold mb-4">Aggregator</h2>
        <div className="flex flex-col items-center justify-center py-16 text-gray-500">
          <Inbox size={40} className="mb-3 opacity-50" />
          <p className="text-sm">Start the daemon to see aggregator data</p>
        </div>
      </div>
    );
  }

  if (!aggAvailable) {
    return (
      <div>
        <h2 className="text-lg font-semibold mb-4">Aggregator</h2>
        <div className="flex flex-col items-center justify-center py-16 text-gray-500">
          <Layers size={40} className="mb-3 opacity-50" />
          <p className="text-sm font-medium">Aggregator not running</p>
          <p className="text-xs mt-1">Enable the Aggregator capability on the Node page to use this tab</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Aggregator</h2>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard icon={Layers} label="Epochs Processed" value={String(aggStatus?.epochsProcessed ?? 0)} />
        <StatCard icon={Receipt} label="Receipts (epoch)" value={String(aggStatus?.receiptsThisEpoch ?? 0)} sub={`Epoch #${aggStatus?.currentEpoch ?? 0}`} />
        <StatCard icon={Send} label="Distributions" value={String(aggStatus?.distributionsPosted ?? 0)} />
        <div className="bg-white rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck size={16} className="text-craftec-500" />
            <span className="text-sm text-gray-400">Proof Status</span>
          </div>
          <ProofStatusBadge status={aggStatus?.proofStatus ?? "idle"} />
        </div>
      </div>

      {/* Distributions */}
      <div className="bg-white rounded-xl p-4">
        <h3 className="font-semibold mb-3">Recent Distributions</h3>
        <DataTable
          columns={[
            { key: "epoch", header: "Epoch" },
            { key: "txHash", header: "Tx Hash", render: (item) => (
              <span className="font-mono text-xs text-craftec-400">{String(item.txHash)}</span>
            )},
            { key: "recipients", header: "Recipients" },
            { key: "totalAmount", header: "Amount", render: (item) => (
              <span className="text-green-600">${Number(item.totalAmount).toFixed(2)}</span>
            )},
            { key: "timestamp", header: "Time", render: (item) => new Date(String(item.timestamp)).toLocaleString() },
          ]}
          data={distributions as unknown as Record<string, unknown>[]}
          emptyMessage="No distributions yet"
        />
      </div>
    </div>
  );
}
