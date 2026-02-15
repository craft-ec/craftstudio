import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { usePeers } from "../hooks/usePeers";

type HealthLevel = "red" | "orange" | "yellow" | "green";

function getHealth(total: number, storage: number): { level: HealthLevel; message: string } {
  if (total === 0) return { level: "red", message: "⚠️ Not connected to network — 0 peers" };
  if (storage === 0) return { level: "orange", message: "⚠️ No storage peers — data stays local only" };
  if (storage < 3) return { level: "yellow", message: `⚡ Connected to ${total} peers (${storage} storage)` };
  return { level: "green", message: `✅ Healthy — connected to ${total} peers (${storage} storage)` };
}

const levelStyles: Record<HealthLevel, string> = {
  red: "bg-red-900/30 border-red-800 text-red-300",
  orange: "bg-orange-900/30 border-orange-800 text-orange-300",
  yellow: "bg-yellow-900/30 border-yellow-800 text-yellow-300",
  green: "bg-green-900/30 border-green-800 text-green-300",
};

export default function NetworkHealth() {
  const { total, storage } = usePeers();
  const [dismissed, setDismissed] = useState(false);
  const prevLevel = useRef<HealthLevel | null>(null);

  const { level, message } = getHealth(total, storage);

  // Re-show banner when level changes
  useEffect(() => {
    if (prevLevel.current !== null && prevLevel.current !== level) {
      setDismissed(false);
    }
    prevLevel.current = level;
  }, [level]);

  if (dismissed) return null;

  return (
    <div className={`flex items-center justify-between rounded-lg border px-4 py-2 mb-4 text-sm ${levelStyles[level]}`}>
      <span>{message}</span>
      <button onClick={() => setDismissed(true)} className="ml-4 opacity-60 hover:opacity-100">
        <X size={14} />
      </button>
    </div>
  );
}

export { usePeers };
export type { HealthLevel };
