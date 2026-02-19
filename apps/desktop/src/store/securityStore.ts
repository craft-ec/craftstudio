import { create } from "zustand";

export interface SigningGroup {
  id: string;
  name: string;
  members: string[];
  threshold: number;
  totalMembers: number;
  createdAt: number;
  status: "active" | "pending" | "expired";
}

export interface ProgramDerivedKey {
  programCid: string;
  publicKey: string;
  derivedAt: number;
  usageCount: number;
}

export interface Attestation {
  id: string;
  programCid: string;
  requestedAt: number;
  completedAt: number | null;
  status: "pending" | "verified" | "rejected" | "expired";
  groupId: string;
  signers: number;
  requiredSigners: number;
}

interface SecurityState {
  groups: SigningGroup[];
  keys: ProgramDerivedKey[];
  attestations: Attestation[];
  loading: boolean;
  error: string | null;
  loadAll: () => void;
  createGroup: (name: string, members: string[], threshold: number) => void;
}

const mockGroups: SigningGroup[] = [
  {
    id: "grp-001",
    name: "Primary Signers",
    members: ["peer-abc123", "peer-def456", "peer-ghi789", "peer-jkl012", "peer-mno345"],
    threshold: 3,
    totalMembers: 5,
    createdAt: Date.now() - 86400000 * 7,
    status: "active",
  },
  {
    id: "grp-002",
    name: "Backup Recovery",
    members: ["peer-abc123", "peer-pqr678", "peer-stu901"],
    threshold: 2,
    totalMembers: 3,
    createdAt: Date.now() - 86400000 * 3,
    status: "active",
  },
  {
    id: "grp-003",
    name: "Test Group",
    members: ["peer-abc123", "peer-def456"],
    threshold: 2,
    totalMembers: 2,
    createdAt: Date.now() - 3600000,
    status: "pending",
  },
];

const mockKeys: ProgramDerivedKey[] = [
  { programCid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oczn", publicKey: "0x04a1b2c3d4e5f6...abcdef", derivedAt: Date.now() - 86400000, usageCount: 23 },
  { programCid: "bafybeie5gq4jnaenirfkl5rgq33ndkbmop3mpkr", publicKey: "0x04f7e8d9c0b1a2...fedcba", derivedAt: Date.now() - 43200000, usageCount: 5 },
];

const mockAttestations: Attestation[] = [
  { id: "att-001", programCid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oczn", requestedAt: Date.now() - 600000, completedAt: Date.now() - 580000, status: "verified", groupId: "grp-001", signers: 3, requiredSigners: 3 },
  { id: "att-002", programCid: "bafybeie5gq4jnaenirfkl5rgq33ndkbmop3mpkr", requestedAt: Date.now() - 300000, completedAt: null, status: "pending", groupId: "grp-001", signers: 1, requiredSigners: 3 },
  { id: "att-003", programCid: "bafybeiabc123def456ghi789jkl012mno345pqr", requestedAt: Date.now() - 7200000, completedAt: Date.now() - 7100000, status: "rejected", groupId: "grp-002", signers: 0, requiredSigners: 2 },
];

export const useSecurityStore = create<SecurityState>((set) => ({
  groups: mockGroups,
  keys: mockKeys,
  attestations: mockAttestations,
  loading: false,
  error: null,
  loadAll: () => {
    set({ loading: true });
    setTimeout(() => set({ loading: false }), 300);
  },
  createGroup: (name, members, threshold) => {
    const newGroup: SigningGroup = {
      id: `grp-${String(Date.now()).slice(-6)}`,
      name,
      members,
      threshold,
      totalMembers: members.length,
      createdAt: Date.now(),
      status: "pending",
    };
    set((s) => ({ groups: [...s.groups, newGroup] }));
  },
}));
