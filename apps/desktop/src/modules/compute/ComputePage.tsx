import { useState } from "react";
import {
  Cpu, Play, Clock, CheckCircle, XCircle, ChevronDown, ChevronRight,
  Loader, Zap,
} from "lucide-react";
import StatCard from "../../components/StatCard";
import Modal from "../../components/Modal";
import { useComputeStore, type ComputeJob } from "../../store/computeStore";

function shortenCid(cid: string): string {
  if (cid.length <= 16) return cid;
  return `${cid.slice(0, 10)}…${cid.slice(-6)}`;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function statusBadge(status: ComputeJob["status"]) {
  const map = {
    queued: { bg: "bg-gray-100 text-gray-600", icon: Clock, label: "Queued" },
    running: { bg: "bg-blue-50 text-blue-600", icon: Loader, label: "Running" },
    completed: { bg: "bg-green-50 text-green-600", icon: CheckCircle, label: "Completed" },
    failed: { bg: "bg-red-50 text-red-600", icon: XCircle, label: "Failed" },
  };
  const s = map[status];
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.bg}`}>
      <Icon size={12} className={status === "running" ? "animate-spin" : ""} />
      {s.label}
    </span>
  );
}

function attestationBadge(status: ComputeJob["attestationStatus"]) {
  const map = {
    pending: "text-amber-500",
    verified: "text-green-600",
    failed: "text-red-500",
    none: "text-gray-400",
  };
  return <span className={`text-xs font-medium ${map[status]}`}>{status === "none" ? "—" : status}</span>;
}

export default function ComputePage() {
  const { jobs, nodeStats, submitJob } = useComputeStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showSubmit, setShowSubmit] = useState(false);
  const [programCid, setProgramCid] = useState("");
  const [inputCid, setInputCid] = useState("");
  const [profile, setProfile] = useState<"cpu" | "gpu">("cpu");

  const handleSubmit = () => {
    if (!programCid.trim() || !inputCid.trim()) return;
    submitJob(programCid.trim(), inputCid.trim(), profile);
    setProgramCid("");
    setInputCid("");
    setProfile("cpu");
    setShowSubmit(false);
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Cpu className="text-craftec-500" /> CraftCOM
        </h1>
        <button
          onClick={() => setShowSubmit(true)}
          className="flex items-center gap-2 px-4 py-2 bg-craftec-600 hover:bg-craftec-700 text-white rounded-lg transition-colors text-sm font-medium"
        >
          <Play size={16} /> Submit Job
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard icon={Cpu} label="CPU Capacity" value={`${nodeStats.runningJobs}/${nodeStats.cpuCapacity}`} sub="cores in use" />
        <StatCard icon={Zap} label="GPU Capacity" value={String(nodeStats.gpuCapacity)} sub="available GPUs" color="text-purple-500" />
        <StatCard icon={CheckCircle} label="Completed" value={String(nodeStats.completedCount)} sub={`${nodeStats.failedCount} failed`} color="text-green-600" />
        <StatCard icon={Loader} label="Running" value={String(nodeStats.runningJobs)} sub="active jobs" color="text-blue-500" />
      </div>

      {/* Jobs Table */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <h3 className="font-semibold text-lg flex items-center gap-2 mb-4">
          <Play size={18} className="text-craftec-500" />
          Compute Jobs
        </h3>

        {jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Cpu size={32} className="mb-2 opacity-50" />
            <p className="text-sm">No compute jobs yet — submit one!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider w-6"></th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Job ID</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Program</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Status</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Profile</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Input</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Output</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Duration</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium text-xs uppercase tracking-wider">Attestation</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <JobRow
                    key={job.id}
                    job={job}
                    expanded={expandedId === job.id}
                    onToggle={() => setExpandedId(expandedId === job.id ? null : job.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Submit Modal */}
      <Modal open={showSubmit} onClose={() => setShowSubmit(false)} title="Submit Compute Job">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Program CID</label>
            <input type="text" value={programCid} onChange={(e) => setProgramCid(e.target.value)} placeholder="bafybeig..."
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-craftec-500" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Input Data CID</label>
            <input type="text" value={inputCid} onChange={(e) => setInputCid(e.target.value)} placeholder="bafkrei..."
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-craftec-500" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Execution Profile</label>
            <div className="flex gap-3">
              <button onClick={() => setProfile("cpu")}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border transition-colors text-sm ${
                  profile === "cpu" ? "border-craftec-500 bg-craftec-50 text-craftec-600" : "border-gray-200 text-gray-500 hover:bg-gray-50"
                }`}>
                <Cpu size={16} /> CPU
              </button>
              <button onClick={() => setProfile("gpu")}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border transition-colors text-sm ${
                  profile === "gpu" ? "border-purple-500 bg-purple-50 text-purple-600" : "border-gray-200 text-gray-500 hover:bg-gray-50"
                }`}>
                <Zap size={16} /> GPU
              </button>
            </div>
          </div>
          <button onClick={handleSubmit} disabled={!programCid.trim() || !inputCid.trim()}
            className="w-full py-2 bg-craftec-600 hover:bg-craftec-700 disabled:bg-gray-200 disabled:text-gray-500 text-white rounded-lg transition-colors">
            Submit Job
          </button>
        </div>
      </Modal>
    </div>
  );
}

function JobRow({ job, expanded, onToggle }: { job: ComputeJob; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors" onClick={onToggle}>
        <td className="py-2.5 px-3">
          {expanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
        </td>
        <td className="py-2.5 px-3 font-mono text-xs text-gray-600">{job.id}</td>
        <td className="py-2.5 px-3 font-mono text-xs">{shortenCid(job.programCid)}</td>
        <td className="py-2.5 px-3">{statusBadge(job.status)}</td>
        <td className="py-2.5 px-3">
          <span className={`text-xs font-medium ${job.profile === "gpu" ? "text-purple-500" : "text-gray-600"}`}>
            {job.profile.toUpperCase()}
          </span>
        </td>
        <td className="py-2.5 px-3 font-mono text-xs text-gray-400">{shortenCid(job.inputCid)}</td>
        <td className="py-2.5 px-3 font-mono text-xs text-gray-400">{job.outputCid ? shortenCid(job.outputCid) : "—"}</td>
        <td className="py-2.5 px-3 text-gray-600 text-xs">{formatDuration(job.executionTimeMs)}</td>
        <td className="py-2.5 px-3">{attestationBadge(job.attestationStatus)}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={9} className="p-0">
            <div className="bg-gray-50 p-4 border-b border-gray-200">
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <span className="text-xs text-gray-400">Submitted</span>
                  <p className="text-sm">{new Date(job.submittedAt).toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-400">Completed</span>
                  <p className="text-sm">{job.completedAt ? new Date(job.completedAt).toLocaleString() : "—"}</p>
                </div>
              </div>
              {job.result && (
                <div className="mb-3">
                  <span className="text-xs text-gray-400">Result</span>
                  <p className={`text-sm ${job.status === "failed" ? "text-red-600" : "text-green-600"}`}>{job.result}</p>
                </div>
              )}
              {job.logs.length > 0 && (
                <div>
                  <span className="text-xs text-gray-400">Logs</span>
                  <div className="bg-gray-900 text-green-400 rounded-lg p-3 mt-1 font-mono text-xs max-h-32 overflow-y-auto">
                    {job.logs.map((line, i) => (
                      <div key={i}>{line}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
