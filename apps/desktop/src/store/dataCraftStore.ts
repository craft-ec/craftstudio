import { create } from "zustand";

export interface ContentItem {
  cid: string;
  name: string;
  size: number;
  encrypted: boolean;
  shards: number;
  healthRatio: number;
  poolBalance: number;
  publishedAt: string;
}

export interface AccessEntry {
  did: string;
  grantedAt: string;
}

interface DataCraftState {
  content: ContentItem[];
  accessLists: Record<string, AccessEntry[]>;
  publishContent: (name: string, encrypted: boolean) => void;
  grantAccess: (cid: string, did: string) => void;
  revokeAccess: (cid: string, did: string) => void;
}

const mockContent: ContentItem[] = [
  {
    cid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    name: "project-report.pdf",
    size: 2_450_000,
    encrypted: true,
    shards: 8,
    healthRatio: 1.0,
    poolBalance: 5.25,
    publishedAt: "2026-02-10T08:30:00Z",
  },
  {
    cid: "bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenpcqf4te",
    name: "dataset-v2.csv",
    size: 15_800_000,
    encrypted: false,
    shards: 24,
    healthRatio: 0.92,
    poolBalance: 12.50,
    publishedAt: "2026-02-08T14:15:00Z",
  },
  {
    cid: "bafybeiczsscdsbs7ffqz55asqdf3smv6klcw3gofszvwlyarci47bgf354",
    name: "model-weights.bin",
    size: 128_000_000,
    encrypted: true,
    shards: 96,
    healthRatio: 0.88,
    poolBalance: 45.00,
    publishedAt: "2026-01-28T22:00:00Z",
  },
];

const mockAccessLists: Record<string, AccessEntry[]> = {
  "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi": [
    { did: "did:craftec:7sK9x...mQ3p", grantedAt: "2026-02-11T10:00:00Z" },
    { did: "did:craftec:3nR2y...kL8w", grantedAt: "2026-02-12T16:30:00Z" },
  ],
};

export const useDataCraftStore = create<DataCraftState>((set) => ({
  content: mockContent,
  accessLists: mockAccessLists,
  publishContent: (name, encrypted) =>
    set((state) => ({
      content: [
        {
          cid: `bafyrei${Math.random().toString(36).slice(2, 20)}`,
          name,
          size: Math.floor(Math.random() * 50_000_000),
          encrypted,
          shards: Math.floor(Math.random() * 30) + 4,
          healthRatio: 1.0,
          poolBalance: 0,
          publishedAt: new Date().toISOString(),
        },
        ...state.content,
      ],
    })),
  grantAccess: (cid, did) =>
    set((state) => ({
      accessLists: {
        ...state.accessLists,
        [cid]: [
          ...(state.accessLists[cid] || []),
          { did, grantedAt: new Date().toISOString() },
        ],
      },
    })),
  revokeAccess: (cid, did) =>
    set((state) => ({
      accessLists: {
        ...state.accessLists,
        [cid]: (state.accessLists[cid] || []).filter((e) => e.did !== did),
      },
    })),
}));
