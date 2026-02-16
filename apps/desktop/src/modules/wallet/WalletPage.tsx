import { useState, useEffect, useCallback } from "react";
import { Wallet, Copy, DollarSign, ArrowUpRight, ArrowDownLeft, CreditCard, CheckCircle, Clock, XCircle, Inbox } from "lucide-react";
import { useWalletStore } from "../../store/walletStore";
import { useActiveConnection } from "../../hooks/useDaemon";
import { useDaemon } from "../../hooks/useDaemon";
import type { Transaction } from "../../store/walletStore";
import StatCard from "../../components/StatCard";
import Modal from "../../components/Modal";
import DaemonOffline from "../../components/DaemonOffline";

interface ChannelInfo {
  channel_id: string;
  sender: string;
  receiver: string;
  locked_amount: number;
  spent: number;
  remaining: number;
  nonce: number;
}

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
  confirmed: "text-green-600",
  pending: "text-amber-500",
  failed: "text-red-500",
};

export default function WalletPage() {
  const daemon = useDaemon();
  const { address, solBalance, usdcBalance, transactions, fundPool, error } = useWalletStore();
  const { connected } = useActiveConnection();
  const [showFund, setShowFund] = useState(false);
  const [fundAmount, setFundAmount] = useState("");
  const [copied, setCopied] = useState(false);
  const [funding, setFunding] = useState(false);
  const [channels, setChannels] = useState<ChannelInfo[]>([]);

  const loadChannels = useCallback(async () => {
    if (!connected) return;
    try {
      const result = await daemon?.listChannels();
      setChannels(result?.channels || []);
    } catch { /* */ }
  }, [connected]);

  useEffect(() => { loadChannels(); }, [loadChannels]);

  const totalLocked = channels.reduce((s, c) => s + c.locked_amount, 0);
  const totalSpent = channels.reduce((s, c) => s + c.spent, 0);
  const totalRemaining = channels.reduce((s, c) => s + c.remaining, 0);

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
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 mb-4 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Address */}
      <div className="bg-white rounded-xl p-4 mb-6">
        <p className="text-sm text-gray-400 mb-1">Solana Address (derived from identity key)</p>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm">{address ? shortenAddr(address) : "Connect wallet to view address"}</span>
          {address && (
            <button onClick={handleCopy} className="text-gray-400 hover:text-gray-800" title="Copy address">
              <Copy size={14} />
            </button>
          )}
          {copied && <span className="text-xs text-green-600">Copied!</span>}
        </div>
      </div>

      {/* Balances */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard icon={DollarSign} label="USDC Balance" value={address ? `$${usdcBalance.toFixed(2)}` : "—"} />
        <StatCard icon={Wallet} label="SOL Balance" value={address ? `${solBalance.toFixed(4)} SOL` : "—"} sub={address ? "for tx fees" : undefined} />
        <div className="bg-white rounded-lg p-4 flex items-center justify-center">
          <button
            onClick={() => setShowFund(true)}
            disabled={!connected}
            className="px-4 py-2 bg-craftec-600 hover:bg-craftec-700 disabled:bg-gray-200 disabled:text-gray-500 text-white rounded-lg transition-colors text-sm"
          >
            Fund Creator Pool
          </button>
        </div>
      </div>

      {/* Channel Summary */}
      <div className="bg-white rounded-xl p-4 mb-6">
        <h2 className="text-lg font-semibold mb-3">Payment Channels</h2>
        {channels.length > 0 ? (
          <>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <StatCard icon={DollarSign} label="Total Locked" value={String(totalLocked)} color="text-craftec-500" />
              <StatCard icon={DollarSign} label="Total Spent" value={String(totalSpent)} color="text-orange-400" />
              <StatCard icon={DollarSign} label="Remaining" value={String(totalRemaining)} color="text-green-600" />
            </div>
            <div className="space-y-2">
              {channels.map((ch) => (
                <div key={ch.channel_id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm font-mono text-gray-700">{shortenAddr(ch.channel_id)}</p>
                    <p className="text-xs text-gray-500">→ {shortenAddr(ch.receiver)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-craftec-400">{ch.locked_amount} locked</p>
                    <p className="text-xs text-gray-500">{ch.remaining} remaining</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-gray-500">
            <Inbox size={32} className="mb-2 opacity-50" />
            <p className="text-sm">{connected ? "No payment channels open" : "Start the daemon to see channel data"}</p>
          </div>
        )}
      </div>

      {/* Transaction History */}
      <div className="bg-white rounded-xl p-4">
        <h2 className="text-lg font-semibold mb-3">Transaction History</h2>
        {transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-500">
            <Inbox size={32} className="mb-2 opacity-50" />
            <p className="text-sm">No transactions yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => {
              const TxIcon = txTypeIcon[tx.type];
              const StatusIcon = statusIcon[tx.status];
              const isOutgoing = tx.type === "fund_pool" || tx.type === "subscribe";
              return (
                <div key={tx.signature} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-3">
                    <TxIcon size={16} className={isOutgoing ? "text-orange-400" : "text-green-600"} />
                    <div>
                      <p className="text-sm">{txTypeLabel[tx.type]}</p>
                      <p className="text-xs text-gray-500 font-mono">{tx.signature}</p>
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <div>
                      <p className={`text-sm ${isOutgoing ? "text-orange-400" : "text-green-600"}`}>
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
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-craftec-500"
            />
            <p className="text-xs text-gray-500 mt-1">Available: {address ? `$${usdcBalance.toFixed(2)} USDC` : "Connect wallet first"}</p>
          </div>
          <button
            onClick={handleFund}
            disabled={!fundAmount || parseFloat(fundAmount) <= 0 || funding}
            className="w-full py-2 bg-craftec-600 hover:bg-craftec-700 disabled:bg-gray-200 disabled:text-gray-500 text-white rounded-lg transition-colors"
          >
            {funding ? "Funding..." : "Fund Pool"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
