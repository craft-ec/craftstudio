import { Wallet } from "lucide-react";

export default function WalletPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Wallet className="text-craftec-500" /> Wallet
      </h1>
      <div className="bg-gray-900 rounded-xl p-6">
        <p className="text-gray-400">No wallet connected</p>
        <button className="mt-4 px-6 py-2 bg-craftec-600 hover:bg-craftec-700 text-white rounded-lg transition-colors">
          Connect Wallet
        </button>
      </div>
    </div>
  );
}
