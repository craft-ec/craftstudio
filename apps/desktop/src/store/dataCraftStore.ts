import { create } from "zustand";
import { useInstanceStore } from "./instanceStore";

function getDaemon() {
  const client = useInstanceStore.getState().getActiveClient();
  if (!client) throw new Error("No active daemon connection");
  return client;
}

export interface ContentItem {
  cid: string;
  name: string;
  size: number;
  encrypted: boolean;
  shards: number;
  healthRatio: number;
  poolBalance: number;
  publishedAt: string;
  role: "publisher" | "storage_provider" | "unknown";
  creator: string;
}

export interface AccessEntry {
  did: string;
  grantedAt: string;
}

interface DataCraftState {
  content: ContentItem[];
  accessLists: Record<string, AccessEntry[]>;
  loading: boolean;
  error: string | null;

  loadContent: () => Promise<void>;
  publishContent: (path: string, encrypted: boolean) => Promise<void>;
  grantAccess: (cid: string, did: string) => Promise<void>;
  revokeAccess: (cid: string, did: string) => Promise<void>;
  loadAccessList: (cid: string) => Promise<void>;
}

export const useDataCraftStore = create<DataCraftState>((set) => ({
  content: [],
  accessLists: {},
  loading: false,
  error: null,

  loadContent: async () => {
    set({ loading: true, error: null });
    try {
      const items = await getDaemon().listContent();
      const toHex = (v: unknown): string => {
        if (typeof v === 'string') return v;
        if (Array.isArray(v)) return v.map((b: number) => b.toString(16).padStart(2, '0')).join('');
        return String(v || '');
      };
      const content: ContentItem[] = (items || []).map((item: Record<string, unknown>) => {
        const cid = toHex(item.content_id || item.cid);
        return {
          cid,
          name: String(item.name || cid.slice(0, 16)),
          size: Number(item.total_size || item.size || 0),
          encrypted: Boolean(item.encrypted),
          shards: Number(item.chunk_count || item.chunks || 0),
          healthRatio: 1.0,
          poolBalance: 0,
          publishedAt: new Date().toISOString(),
          role: (item.role as "publisher" | "storage_provider") || "unknown",
          creator: String(item.creator || ""),
        };
      });
      set({ content, loading: false });
    } catch (e) {
      set({ loading: false, error: (e as Error).message });
    }
  },

  publishContent: async (path, encrypted) => {
    set({ error: null });
    try {
      const result = await getDaemon().publish(path, encrypted);
      set((state) => ({
        content: [
          {
            cid: result.cid,
            name: path.split("/").pop() || path,
            size: result.size,
            encrypted,
            shards: result.chunks,
            healthRatio: 1.0,
            poolBalance: 0,
            publishedAt: new Date().toISOString(),
            role: "publisher",
            creator: "",
          },
          ...state.content,
        ],
      }));
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  grantAccess: async (cid, did) => {
    set({ error: null });
    try {
      await getDaemon().grantAccess(cid, "", did, "");
      set((state) => ({
        accessLists: {
          ...state.accessLists,
          [cid]: [
            ...(state.accessLists[cid] || []),
            { did, grantedAt: new Date().toISOString() },
          ],
        },
      }));
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  revokeAccess: async (cid, did) => {
    set({ error: null });
    try {
      await getDaemon().revokeAccess(cid, did);
      set((state) => ({
        accessLists: {
          ...state.accessLists,
          [cid]: (state.accessLists[cid] || []).filter((e) => e.did !== did),
        },
      }));
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  loadAccessList: async (cid) => {
    try {
      const result = await getDaemon().listAccess(cid);
      const entries: AccessEntry[] = (result.authorized || []).map((did) => ({
        did,
        grantedAt: "",
      }));
      set((state) => ({
        accessLists: { ...state.accessLists, [cid]: entries },
      }));
    } catch {
      // Silently fail - will show empty list
    }
  },
}));
