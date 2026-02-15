import { useState } from "react";
import { Wallet, Copy, DollarSign, ArrowUpRight, ArrowDownLeft, CreditCard, CheckCircle, Clock, XCircle } from "lucide-react";
import { useWalletStore } from "../../store/walletStore";
import type { Transaction } from "../../store/walletStore";
import StatCard from "../../components/StatCard";
import Modal from "../../components/Modal";

function shortenAddr(addr: string): string {
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
  const { address, solBalance, usdcBalance, transactions, fundPool } = useWalletStore();
  const [showFund, setShowFund] = useState(false);
  const [fundAmount, setFundAmount] = useState("");
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFund = () => {
    const amount = parseFloat(fundAmount);
    if (amount > 0 && amount <= usdcBalance) {
      fundPool(amount);
      setFundAmount("");
      setShowFund(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Wallet className="text-craftec-500" /> Wallet
      </h1>

      {/* Address */}
      <div className="bg-gray-900 rounded-xl p-4 mb-6">
        <p className="text-sm text-gray-400 mb-1">Solana Address (derived from identity key)</p>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm">{shortenAddr(address)}</span>
          <button onClick={handleCopy} className="text-gray-400 hover:text-gray-200" title="Copy address">
            <Copy size={14} />
          </button>
          {copied && <span className="text-xs text-green-400">Copied!</span>}
        </div>
      </div>

      {/* Balances */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard icon={DollarSign} label="USDC Balance" value={`$${usdcBalance.toFixed(2)}`} />
        <StatCard icon={Wallet} label="SOL Balance" value={`${solBalance.toFixed(4)} SOL`} sub="~$0.05 (for fees)" />
        <div className="bg-gray-900 rounded-lg p-4 flex items-center justify-center">
          <button
            onClick={() => setShowFund(true)}
            className="px-4 py-2 bg-craftec-600 hover:bg-craftec-700 text-white rounded-lg transition-colors text-sm"
          >
            Fund Creator Pool
          </button>
        </div>
      </div>

      {/* Transaction History */}
      <div className="bg-gray-900 rounded-xl p-4">
        <h2 className="text-lg font-semibold mb-3">Transaction History</h2>
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
            disabled={!fundAmount || parseFloat(fundAmount) <= 0 || parseFloat(fundAmount) > usdcBalance}
            className="w-full py-2 bg-craftec-600 hover:bg-craftec-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors"
          >
            Fund Pool
          </button>
        </div>
      </Modal>
    </div>
  );
}
