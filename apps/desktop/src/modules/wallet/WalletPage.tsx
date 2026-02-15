import { useState } from "react";
import { Wallet, Copy, DollarSign, ArrowUpRight, ArrowDownLeft, CreditCard, CheckCircle, Clock, XCircle } from "lucide-react";
import { useWalletStore } from "../../store/walletStore";
import { useDaemonStore } from "../../store/daemonStore";
import type { Transaction } from "../../store/walletStore";
import StatCard from "../../components/StatCard";
import Modal from "../../components/Modal";
import DaemonOffline from "../../components/DaemonOffline";
import TimeChart from "../../components/TimeChart";

// -- Mock chart data --
const earningsData = Array.from({ length: 30 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - 29 + i);
  return {
    day: d.toLocaleDateString("en", { month: "short", day: "numeric" }),
    pdp: +(0.5 + Math.random() * 2).toFixed(2),
    egress: +(0.1 + Math.random() * 0.8).toFixed(2),
  };
});

const poolBalanceData = Array.from({ length: 30 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - 29 + i);
  const base = 100 - i * 1.5 + Math.random() * 5;
  return { day: d.toLocaleDateString("en", { month: "short", day: "numeric" }), balance: +Math.max(base, 20).toFixed(2) };
});

function shortenAddr(addr: string): string {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}...${addr.slice(-6)}`;
}

const txTypeLabel: Record<Transaction["type"], string> = {
  fund_pool: "Fund Pool",
  claim: "Claim Earnings",
  subscribe: "Subscribe",
  receive: "Received",
};

const txTypeIcon: Record<Transaction["type"], typeof ArrowUpRight> = {
  fund_pool: ArrowUpRight,
  claim: ArrowDownLeft,
  subscribe: CreditCard,
  receive: ArrowDownLeft,
};

const statusIcon: Record<Transaction["status"], typeof CheckCircle> = {
  confirmed: CheckCircle,
  pending: Clock,
  failed: XCircle,
};

const statusColor: Record<Transaction["status"], string> = {
  confirmed: "text-green-400",
  pending: "text-yellow-400",
  failed: "text-red-400",
};

export default function WalletPage() {
  const { address, solBalance, usdcBalance, transactions, fundPool, error } = useWalletStore();
  const { connected } = useDaemonStore();
  const [showFund, setShowFund] = useState(false);
  const [fundAmount, setFundAmount] = useState("");
  const [copied, setCopied] = useState(false);
  const [funding, setFunding] = useState(false);

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFund = async () => {
    const amount = parseFloat(fundAmount);
    if (amount > 0) {
      setFunding(true);
      try {
        await fundPool(amount);
        setFundAmount("");
        setShowFund(false);
      } catch {
        // error in store
      } finally {
        setFunding(false);
      }
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <DaemonOffline />

      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Wallet className="text-craftec-500" /> Wallet
      </h1>

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg px-4 py-2 mb-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Address */}
      <div className="bg-gray-900 rounded-xl p-4 mb-6">
        <p className="text-sm text-gray-400 mb-1">Solana Address (derived from identity key)</p>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm">{address ? shortenAddr(address) : "Not loaded"}</span>
          {address && (
            <button onClick={handleCopy} className="text-gray-400 hover:text-gray-200" title="Copy address">
              <Copy size={14} />
            </button>
          )}
          {copied && <span className="text-xs text-green-400">Copied!</span>}
        </div>
      </div>

      {/* Balances */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard icon={DollarSign} label="USDC Balance" value={`$${usdcBalance.toFixed(2)}`} />
        <StatCard icon={Wallet} label="SOL Balance" value={`${solBalance.toFixed(4)} SOL`} sub="for tx fees" />
        <div className="bg-gray-900 rounded-lg p-4 flex items-center justify-center">
          <button
            onClick={() => setShowFund(true)}
            disabled={!connected}
            className="px-4 py-2 bg-craftec-600 hover:bg-craftec-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors text-sm"
          >
            Fund Creator Pool
          </button>
        </div>
      </div>

      {/* Earnings & Pool Charts */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <TimeChart
          title="Earnings — Last 30 Days (USDC)"
          data={earningsData}
          xKey="day"
          series={[
            { key: "pdp", label: "PDP Rewards" },
            { key: "egress", label: "Egress Revenue", color: "#06b6d4" },
          ]}
          formatValue={(v) => `$${v.toFixed(2)}`}
        />
        <TimeChart
          title="Creator Pool Balance (USDC)"
          data={poolBalanceData}
          xKey="day"
          series={[{ key: "balance", label: "Balance" }]}
          type="area"
          formatValue={(v) => `$${v.toFixed(0)}`}
        />
      </div>

      {/* Transaction History */}
      <div className="bg-gray-900 rounded-xl p-4">
        <h2 className="text-lg font-semibold mb-3">Transaction History</h2>
        {transactions.length === 0 ? (
          <p className="text-sm text-gray-500">No transactions yet</p>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => {
              const TxIcon = txTypeIcon[tx.type];
              const StatusIcon = statusIcon[tx.status];
              const isOutgoing = tx.type === "fund_pool" || tx.type === "subscribe";
              return (
                <div key={tx.signature} className="flex items-center justify-between bg-gray-800/50 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-3">
                    <TxIcon size={16} className={isOutgoing ? "text-orange-400" : "text-green-400"} />
                    <div>
                      <p className="text-sm">{txTypeLabel[tx.type]}</p>
                      <p className="text-xs text-gray-500 font-mono">{tx.signature}</p>
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <div>
                      <p className={`text-sm ${isOutgoing ? "text-orange-400" : "text-green-400"}`}>
                        {isOutgoing ? "-" : "+"}{tx.amount.toFixed(2)} {tx.token}
                      </p>
                      <p className="text-xs text-gray-500">{new Date(tx.timestamp).toLocaleDateString()}</p>
                    </div>
                    <StatusIcon size={14} className={statusColor[tx.status]} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Fund Modal */}
      <Modal open={showFund} onClose={() => setShowFund(false)} title="Fund Creator Pool">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Amount (USDC)</label>
            <input
              type="number"
              value={fundAmount}
              onChange={(e) => setFundAmount(e.target.value)}
              placeholder="10.00"
              min="0.01"
              step="0.01"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-craftec-500"
            />
            <p className="text-xs text-gray-500 mt-1">Available: ${usdcBalance.toFixed(2)} USDC</p>
          </div>
          <button
            onClick={handleFund}
            disabled={!fundAmount || parseFloat(fundAmount) <= 0 || funding}
            className="w-full py-2 bg-craftec-600 hover:bg-craftec-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors"
          >
            {funding ? "Funding..." : "Fund Pool"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
