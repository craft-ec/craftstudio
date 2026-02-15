import { User } from "lucide-react";
import { useIdentityStore } from "../../store/identityStore";

export default function IdentityPage() {
  const { did } = useIdentityStore();

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <User className="text-craftec-500" /> Identity
      </h1>
      <div className="bg-gray-900 rounded-xl p-6">
        <p className="text-sm text-gray-400">DID</p>
        <p className="font-mono text-sm">{did ?? "Not initialized"}</p>
      </div>
    </div>
  );
}
