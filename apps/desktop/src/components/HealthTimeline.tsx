import { useState, useEffect, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Tooltip } from "recharts";
import { useDaemon } from "../hooks/useDaemon";
import type { HealthSnapshot } from "../services/daemon";

// ── Time range options ──────────────────────────────────

const RANGES = [
  { label: "1h", ms: 3_600_000 },
  { label: "6h", ms: 21_600_000 },
  { label: "24h", ms: 86_400_000 },
] as const;

// ── Event derivation from consecutive snapshots ─────────

interface HealthEvent {
  time: string;       // HH:MM:SS
  timestamp: number;
  segment: number | null;
  icon: string;
  message: string;
}

function deriveEvents(snapshots: HealthSnapshot[]): HealthEvent[] {
  const events: HealthEvent[] = [];
  for (let i = 0; i < snapshots.length; i++) {
    const snap = snapshots[i];
    const prev = i > 0 ? snapshots[i - 1] : null;
    const time = new Date(snap.timestamp).toLocaleTimeString("en-GB", { hour12: false });

    // Actions taken
    for (const action of snap.actions) {
      if (action.Repaired) {
        events.push({
          time, timestamp: snap.timestamp, segment: action.Repaired.segment,
          icon: "🔧", message: `Repaired — offset #${action.Repaired.offset}`,
        });
      }
      if (action.Degraded) {
        events.push({
          time, timestamp: snap.timestamp, segment: action.Degraded.segment,
          icon: "↓", message: `Degraded — dropped 1 piece`,
        });
      }
    }

    // Piece count changes per segment (compare with previous)
    if (prev) {
      for (const seg of snap.segments) {
        const prevSeg = prev.segments.find(s => s.index === seg.index);
        const pieces = seg.total_pieces;
        const prevPieces = prevSeg ? prevSeg.total_pieces : pieces;
        if (prevSeg && prevPieces !== pieces) {
          const icon = pieces < seg.k ? "⚠️" : pieces > seg.k * 1.5 ? "📈" : "✓";
          events.push({
            time, timestamp: snap.timestamp, segment: seg.index,
            icon, message: `Pieces ${prevPieces}→${pieces} (k=${seg.k})`,
          });
        }
      }

      // Provider count changes
      if (snap.provider_count !== prev.provider_count) {
        events.push({
          time, timestamp: snap.timestamp, segment: null,
          icon: snap.provider_count > prev.provider_count ? "🟢" : "🔴",
          message: `Providers ${prev.provider_count}→${snap.provider_count}`,
        });
      }
    }
  }
  return events.reverse(); // newest first
}

// ── Last Scan Panel ─────────────────────────────────────

function LastScanPanel({ latest }: { latest: HealthSnapshot }) {
  const ago = Math.round((Date.now() - latest.timestamp) / 1000);
  const nextIn = Math.max(0, 30 - ago);
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-600 mb-2 px-1">
      <span className="font-medium">Last scan: <span className="text-gray-800">{ago}s ago</span></span>
      <span className="text-gray-400">Next: ~{nextIn}s</span>
      <span className="text-gray-400">|</span>
      {latest.segments.map(seg => {
        const pieces = seg.total_pieces;
        const ratio = seg.k > 0 ? pieces / seg.k : 0;
        const action = latest.actions.find(a => a.Repaired?.segment === seg.index || a.Degraded?.segment === seg.index);
        let status = "✓ Healthy";
        let cls = "text-green-600";
        if (action?.Repaired) { status = `🔧 Repaired (#${action.Repaired.offset})`; cls = "text-blue-600"; }
        else if (action?.Degraded) { status = "↓ Degraded"; cls = "text-amber-600"; }
        else if (ratio < 1.0) { status = "💀 Dead"; cls = "text-red-600"; }
        else if (ratio < 1.5) { status = "⚠️ Needs repair"; cls = "text-amber-500"; }
        return (
          <span key={seg.index}>
            Seg {seg.index}: <span className={cls}>{status}</span>
          </span>
        );
      })}
    </div>
  );
}

// ── Event Log ───────────────────────────────────────────

function EventLog({ events, segFilter }: { events: HealthEvent[]; segFilter: number | null }) {
  const [limit, setLimit] = useState(50);
  const filtered = segFilter === null ? events : events.filter(e => e.segment === segFilter || e.segment === null);
  const shown = filtered.slice(0, limit);

  return (
    <div className="mt-2">
      <div className="max-h-48 overflow-y-auto bg-gray-900 rounded text-[10px] font-mono text-gray-300 p-2">
        {shown.length === 0 && <div className="text-gray-500">No events yet</div>}
        {shown.map((e, i) => (
          <div key={i} className="leading-5 hover:bg-gray-800/50">
            <span className="text-gray-500">{e.time}</span>
            {"  "}
            <span className="text-gray-400 w-12 inline-block">{e.segment !== null ? `Seg ${e.segment}` : "All   "}</span>
            {"  "}
            <span>{e.icon} {e.message}</span>
          </div>
        ))}
      </div>
      {filtered.length > limit && (
        <button onClick={() => setLimit(l => l + 50)} className="text-[10px] text-blue-500 mt-1 hover:underline">
          Load more ({filtered.length - limit} remaining)
        </button>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────

interface Props {
  cid: string;
}

export default function HealthTimeline({ cid }: Props) {
  const daemon = useDaemon();
  const [snapshots, setSnapshots] = useState<HealthSnapshot[]>([]);
  const [range, setRange] = useState<typeof RANGES[number]>(RANGES[0]);
  const [segFilter, setSegFilter] = useState<number | null>(null);

  useEffect(() => {
    if (!daemon || !cid) return;
    const since = Date.now() - range.ms;
    daemon.contentHealthHistory(cid, since).then(r => setSnapshots(r.snapshots)).catch(() => { });

    // Poll every 30s
    const iv = setInterval(() => {
      const s = Date.now() - range.ms;
      daemon.contentHealthHistory(cid, s).then(r => setSnapshots(r.snapshots)).catch(() => { });
    }, 30_000);
    return () => clearInterval(iv);
  }, [daemon, cid, range]);

  const chartData = useMemo(() =>
    snapshots.map(s => ({
      time: new Date(s.timestamp).toLocaleTimeString("en-GB", { hour12: false, hour: "2-digit", minute: "2-digit" }),
      health: parseFloat(s.health_ratio.toFixed(3)),
      providers: s.provider_count,
    })),
    [snapshots]);

  const events = useMemo(() => deriveEvents(snapshots), [snapshots]);
  const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  const segments = latest ? latest.segments.map(s => s.index) : [];

  if (snapshots.length === 0) {
    return <div className="px-4 py-2 text-[11px] text-gray-400">No health history yet — data appears after the first HealthScan cycle.</div>;
  }

  return (
    <div className="px-4 py-2">
      {/* Last Scan */}
      {latest && <LastScanPanel latest={latest} />}

      {/* Time range selector */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] text-gray-400 font-medium">Timeline</span>
        {RANGES.map(r => (
          <button
            key={r.label}
            onClick={() => setRange(r)}
            className={`text-[10px] px-1.5 py-0.5 rounded ${r.label === range.label ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <XAxis dataKey="time" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
            <YAxis domain={[0, 'auto']} tick={{ fontSize: 9 }} width={30} />
            <Tooltip contentStyle={{ fontSize: 11 }} />
            <ReferenceLine y={1.5} stroke="#22c55e" strokeDasharray="3 3" label={{ value: "1.5x", fontSize: 9, fill: "#22c55e" }} />
            <ReferenceLine y={1.2} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: "1.2x", fontSize: 9, fill: "#f59e0b" }} />
            <ReferenceLine y={1.0} stroke="#ef4444" strokeDasharray="3 3" label={{ value: "1.0x", fontSize: 9, fill: "#ef4444" }} />
            <Line type="monotone" dataKey="health" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Event Log */}
      <div className="flex items-center gap-2 mt-2 mb-1">
        <span className="text-[10px] text-gray-400 font-medium">Event Log</span>
        <select
          value={segFilter ?? "all"}
          onChange={e => setSegFilter(e.target.value === "all" ? null : parseInt(e.target.value))}
          className="text-[10px] border border-gray-200 rounded px-1 py-0.5"
        >
          <option value="all">All segments</option>
          {segments.map(s => <option key={s} value={s}>Seg {s}</option>)}
        </select>
      </div>
      <EventLog events={events} segFilter={segFilter} />
    </div>
  );
}
