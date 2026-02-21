import { useEffect, useState } from "react";
import { User, Copy, CheckCircle, Shield, Fingerprint, Globe } from "lucide-react";
import { useIdentityStore } from "../../store/identityStore";
import { useActiveInstance } from "../../hooks/useActiveInstance";
import { useConfigStore } from "../../store/configStore";
import { useTunnelStore } from "../../store/tunnelStore";

export default function IdentityPage() {
  const { did, loading, refreshDid } = useIdentityStore();
  const instance = useActiveInstance();
  const cluster = useConfigStore((s) => s.config.solana.cluster);
  const tunnelStatus = useTunnelStore((s) => s.status);
  const tunnelMode = useTunnelStore((s) => s.mode);
  const [copied, setCopied] = useState<string | null>(null);

  // Reload identity when active instance changes
  useEffect(() => {
    if (instance?.ws_port) {
      refreshDid(instance.ws_port);
    }
  }, [instance?.ws_port, instance?.id, refreshDid]);

  const walletAddress = did?.startsWith("did:craftec:")
    ? did.slice("did:craftec:".length)
    : null;

  const handleCopy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };


  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <User className="text-craftec-500" /> Identity
      </h1>

      {/* DID Card */}
      <div className="bg-white rounded-xl p-6 mb-4 border border-gray-200 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Fingerprint size={16} className="text-craftec-500" />
          <p className="text-sm font-semibold text-gray-700">Node Identity (DID)</p>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
            Loading...
          </div>
        ) : did ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="font-mono text-sm break-all text-gray-900">{did}</p>
              <button
                onClick={() => handleCopy(did, "did")}
                className="text-gray-400 hover:text-craftec-500 transition-colors shrink-0"
                title="Copy DID"
              >
                {copied === "did" ? <CheckCircle size={14} className="text-green-500" /> : <Copy size={14} />}
              </button>
            </div>
            <p className="text-xs text-gray-400">
              Derived from <code className="bg-gray-100 px-1 rounded">{instance?.dataDir ?? "~"}/node.key</code>
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-400">No daemon running — start an instance to generate an identity</p>
        )}
      </div>

      {/* Wallet Address */}
      {walletAddress && (
        <div className="bg-white rounded-xl p-6 mb-4 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Shield size={16} className="text-amber-500" />
            <p className="text-sm font-semibold text-gray-700">Wallet Address</p>
          </div>
          <div className="flex items-center gap-2">
            <p className="font-mono text-sm break-all text-gray-900">{walletAddress}</p>
            <button
              onClick={() => handleCopy(walletAddress, "wallet")}
              className="text-gray-400 hover:text-craftec-500 transition-colors shrink-0"
              title="Copy address"
            >
              {copied === "wallet" ? <CheckCircle size={14} className="text-green-500" /> : <Copy size={14} />}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Same ed25519 key used for both CraftOBJ and CraftNet
          </p>
        </div>
      )}

      {/* Instance Info */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-400 mb-1 uppercase tracking-wider font-medium">Network</p>
          <p className="text-sm font-semibold">
            {cluster === "mainnet-beta" ? "Mainnet" : cluster === "devnet" ? "Devnet" : "Custom"}
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-400 mb-1 uppercase tracking-wider font-medium">CraftNet Mode</p>
          <p className="text-sm font-semibold capitalize">{tunnelMode}</p>
        </div>
      </div>

      {/* Instance Details */}
      {instance && (
        <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Globe size={16} className="text-gray-500" />
            <p className="text-sm font-semibold text-gray-700">Instance Details</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Data Directory</p>
              <p className="font-mono text-xs text-gray-600 break-all">{instance.dataDir}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">WebSocket Port</p>
              <p className="font-mono text-xs text-gray-600">{instance.ws_port}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Capabilities</p>
              <div className="flex gap-1 flex-wrap">
                {instance.capabilities.map((c) => (
                  <span key={c} className="bg-craftec-600/10 text-craftec-500 text-xs px-2 py-0.5 rounded-full font-medium capitalize">{c}</span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Tunnel Status</p>
              <p className={`text-xs font-medium ${tunnelStatus === "connected" ? "text-green-600" : "text-gray-600"}`}>
                {tunnelStatus === "connected" ? "● Connected" : tunnelStatus === "offline" ? "○ Offline" : "◐ " + tunnelStatus}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
