import { create } from "zustand";

export interface ComputeJob {
  id: string;
  programCid: string;
  status: "queued" | "running" | "completed" | "failed";
  inputCid: string;
  outputCid: string | null;
  profile: "cpu" | "gpu";
  submittedAt: number;
  completedAt: number | null;
  executionTimeMs: number | null;
  logs: string[];
  attestationStatus: "pending" | "verified" | "failed" | "none";
  result: string | null;
}

interface ComputeState {
  jobs: ComputeJob[];
  loading: boolean;
  error: string | null;
  nodeStats: {
    cpuCapacity: number;
    gpuCapacity: number;
    runningJobs: number;
    completedCount: number;
    failedCount: number;
  };
  loadJobs: () => void;
  submitJob: (programCid: string, inputCid: string, profile: "cpu" | "gpu") => void;
}

// Mock data
const mockJobs: ComputeJob[] = [
  {
    id: "job-001",
    programCid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oczn",
    status: "completed",
    inputCid: "bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzd",
    outputCid: "bafkreiabcdef1234567890abcdef1234567890ab",
    profile: "cpu",
    submittedAt: Date.now() - 3600000,
    completedAt: Date.now() - 3500000,
    executionTimeMs: 12450,
    logs: ["[INFO] Loading program...", "[INFO] Processing input data...", "[INFO] Computation complete", "[INFO] Output written to CID"],
    attestationStatus: "verified",
    result: "Success: 1024 records processed",
  },
  {
    id: "job-002",
    programCid: "bafybeie5gq4jnaenirfkl5rgq33ndkbmop3mpkr",
    status: "running",
    inputCid: "bafkreixyz789abc123def456ghi789jkl012mno",
    outputCid: null,
    profile: "gpu",
    submittedAt: Date.now() - 120000,
    completedAt: null,
    executionTimeMs: null,
    logs: ["[INFO] Loading program...", "[INFO] GPU initialized", "[INFO] Processing batch 3/10..."],
    attestationStatus: "pending",
    result: null,
  },
  {
    id: "job-003",
    programCid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oczn",
    status: "failed",
    inputCid: "bafkreiqwerty123456789asdf",
    outputCid: null,
    profile: "cpu",
    submittedAt: Date.now() - 7200000,
    completedAt: Date.now() - 7190000,
    executionTimeMs: 2300,
    logs: ["[INFO] Loading program...", "[ERROR] Invalid input format", "[ERROR] Job aborted"],
    attestationStatus: "none",
    result: "Error: Invalid input format at byte 256",
  },
  {
    id: "job-004",
    programCid: "bafybeiabc123def456ghi789jkl012mno345pqr",
    status: "queued",
    inputCid: "bafkreimnopqrstuvwxyz1234567890abcdefgh",
    outputCid: null,
    profile: "cpu",
    submittedAt: Date.now() - 30000,
    completedAt: null,
    executionTimeMs: null,
    logs: [],
    attestationStatus: "none",
    result: null,
  },
];

export const useComputeStore = create<ComputeState>((set) => ({
  jobs: mockJobs,
  loading: false,
  error: null,
  nodeStats: {
    cpuCapacity: 8,
    gpuCapacity: 2,
    runningJobs: 1,
    completedCount: 47,
    failedCount: 3,
  },
  loadJobs: () => {
    set({ loading: true });
    setTimeout(() => set({ loading: false }), 300);
  },
  submitJob: (programCid, inputCid, profile) => {
    const newJob: ComputeJob = {
      id: `job-${String(Date.now()).slice(-6)}`,
      programCid,
      status: "queued",
      inputCid,
      outputCid: null,
      profile,
      submittedAt: Date.now(),
      completedAt: null,
      executionTimeMs: null,
      logs: [],
      attestationStatus: "none",
      result: null,
    };
    set((s) => ({ jobs: [newJob, ...s.jobs] }));
  },
}));
