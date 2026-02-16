import { useInstanceStore, ActivityEvent } from "../store/instanceStore";
import { CheckCircle, Info, AlertTriangle, XCircle } from "lucide-react";

const levelIcon: Record<ActivityEvent["level"], typeof Info> = {
  info: Info,
  success: CheckCircle,
  warn: AlertTriangle,
  error: XCircle,
};

const levelColor: Record<ActivityEvent["level"], string> = {
  info: "text-gray-400",
  success: "text-green-600",
  warn: "text-amber-500",
  error: "text-red-500",
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const EMPTY_LOG: ActivityEvent[] = [];

export default function ActivityLog() {
  const activeId = useInstanceStore((s) => s.activeId);
  const log = useInstanceStore((s) => (activeId ? s.activityLog[activeId] : undefined)) ?? EMPTY_LOG;

  if (log.length === 0) return null;

  return (
    <div className="bg-white rounded-xl p-4">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">Activity</h2>
      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {[...log].reverse().map((event, i) => {
          const Icon = levelIcon[event.level];
          return (
            <div key={i} className="flex items-start gap-2 text-xs">
              <Icon size={12} className={`${levelColor[event.level]} mt-0.5 shrink-0`} />
              <span className="text-gray-500 shrink-0">{formatTime(event.time)}</span>
              <span className={`${event.level === "error" ? "text-red-600" : "text-gray-700"}`}>
                {event.message}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
