import { useEffect } from "react";
import { User, Copy, CheckCircle } from "lucide-react";
import { useIdentityStore } from "../../store/identityStore";
import { useActiveInstance } from "../../hooks/useActiveInstance";
import { useConfigStore } from "../../store/configStore";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";

export default function IdentityPage() {
  const { did } = useIdentityStore();
  const setDid = useIdentityStore((s) => s.setDid);
  const instance = useActiveInstance();
  const keypairPath = instance?.keypair_path ?? "";
  const cluster = useConfigStore((s) => s.config.solana.cluster);
  const [copied, setCopied] = useState(false);

  // Reload identity when keypair path changes
  useEffect(() => {
    invoke<{ did: string }>("get_identity")
      .then((id) => setDid(id.did))
      .catch(() => {});
  }, [keypairPath, setDid]);

  const walletAddress = did?.startsWith("did:craftec:")
    ? did.slice("did:craftec:".length)
    : null;

  const handleCopy = async () => {
    if (walletAddress) {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <User className="text-craftec-500" /> Identity
      </h1>

      <div className="space-y-4">
        <div className="bg-gray-900 rounded-xl p-6">
          <p className="text-sm text-gray-400 mb-1">DID</p>
          <p className="font-mono text-sm break-all">{did ?? "Not initialized"}</p>
        </div>

        {walletAddress && (
          <div className="bg-gray-900 rounded-xl p-6">
            <p className="text-sm text-gray-400 mb-1">Wallet Address</p>
            <div className="flex items-center gap-2">
              <p className="font-mono text-sm break-all">{walletAddress}</p>
              <button
                onClick={handleCopy}
                className="text-gray-400 hover:text-white transition-colors shrink-0"
                title="Copy address"
              >
                {copied ? <CheckCircle size={16} className="text-green-400" /> : <Copy size={16} />}
              </button>
            </div>
          </div>
        )}

        <div className="bg-gray-900 rounded-xl p-6">
          <p className="text-sm text-gray-400 mb-1">Keypair Path</p>
          <p className="font-mono text-sm text-gray-300">{keypairPath || "No instance selected"}</p>
        </div>

        <div className="bg-gray-900 rounded-xl p-6">
          <p className="text-sm text-gray-400 mb-1">Network</p>
          <p className="text-sm">
            {cluster === "mainnet-beta" ? "Mainnet" : cluster === "devnet" ? "Devnet" : "Custom"}
          </p>
        </div>
      </div>
    </div>
  );
}
