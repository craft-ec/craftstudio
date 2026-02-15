import { useState, useRef, useEffect } from "react";
import { useInstanceStore, type ActivityEvent, type ActivityCategory } from "../store/instanceStore";
import {
  CheckCircle, Info, AlertTriangle, XCircle,
  Radio, MessageSquare, Zap,
} from "lucide-react";

const levelIcon: Record<ActivityEvent["level"], typeof Info> = {
  info: Info,
  success: CheckCircle,
  warn: AlertTriangle,
  error: XCircle,
};

const levelColor: Record<ActivityEvent["level"], string> = {
  info: "text-gray-400",
  success: "text-green-400",
  warn: "text-yellow-400",
  error: "text-red-400",
};

const categoryMeta: Record<ActivityCategory, { label: string; color: string; icon: typeof Info }> = {
  announcement: { label: "Announce", color: "bg-purple-500/20 text-purple-400", icon: Radio },
  gossip: { label: "Gossip", color: "bg-blue-500/20 text-blue-400", icon: MessageSquare },
  action: { label: "Action", color: "bg-craftec-500/20 text-craftec-400", icon: Zap },
  system: { label: "System", color: "bg-gray-500/20 text-gray-400", icon: Info },
};

type Filter = "all" | ActivityCategory;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "announcement", label: "Announcements" },
  { key: "gossip", label: "Gossip" },
  { key: "action", label: "Actions" },
];

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const EMPTY_LOG: ActivityEvent[] = [];

export default function DataCraftActivity() {
  const [filter, setFilter] = useState<Filter>("all");
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeId = useInstanceStore((s) => s.activeId);
  const log = useInstanceStore((s) => (activeId ? s.activityLog[activeId] : undefined)) ?? EMPTY_LOG;

  const filtered = filter === "all" ? log : log.filter((e) => e.category === filter);
  const reversed = [...filtered].reverse();

  // Auto-scroll to top on new events
  const lastLen = useRef(log.length);
  useEffect(() => {
    if (log.length > lastLen.current && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
    lastLen.current = log.length;
  }, [log.length]);

  return (
    <div className="bg-gray-900 rounded-xl p-4 mt-6">
      <h2 className="text-sm font-semibold text-gray-300 mb-3">Activity Feed</h2>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-3">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
              filter === f.key
                ? "bg-craftec-500/20 text-craftec-400"
                : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Event list */}
      <div ref={scrollRef} className="space-y-1 max-h-64 overflow-y-auto">
        {reversed.length === 0 ? (
          <p className="text-xs text-gray-600 text-center py-4">No activity yet</p>
        ) : (
          reversed.map((event, i) => {
            const Icon = levelIcon[event.level];
            const cat = categoryMeta[event.category ?? "system"];
            return (
              <div key={i} className="flex items-start gap-2 text-xs py-0.5">
                <Icon size={12} className={`${levelColor[event.level]} mt-0.5 shrink-0`} />
                <span className="text-gray-500 shrink-0">{formatTime(event.time)}</span>
                <span className={`px-1.5 py-0 rounded text-[10px] leading-4 shrink-0 ${cat.color}`}>
                  {cat.label}
                </span>
                <span className={event.level === "error" ? "text-red-300" : "text-gray-300"}>
                  {event.message}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
