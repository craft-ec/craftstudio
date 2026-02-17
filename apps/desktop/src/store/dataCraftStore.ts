import { create } from "zustand";
import { useInstanceStore } from "./instanceStore";

function getDaemon() {
  const client = useInstanceStore.getState().getActiveClient();
  if (!client) throw new Error("No active daemon connection");
  return client;
}

export interface ContentItem {
  content_id: string;
  name: string;
  total_size: number;
  encrypted: boolean;
  segment_count: number;
  local_pieces: number;
  provider_count: number;
  health_ratio: number;
  min_rank: number;
  local_disk_usage: number;
  hot: boolean;
  pinned: boolean;
  role: "publisher" | "storage_provider" | "unknown";
  stage: string;
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

  clearContent: () => void;
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

  clearContent: () => {
    set({ content: [], accessLists: {}, loading: false, error: null });
  },

  loadContent: async () => {
    set({ loading: true, error: null });
    try {
      const items = await getDaemon().contentListDetailed();
      const content: ContentItem[] = (items || []).map((item) => ({
        content_id: item.content_id,
        name: item.name || item.content_id.slice(0, 16),
        total_size: item.total_size || 0,
        encrypted: item.encrypted ?? false,
        segment_count: item.segment_count || 0,
        local_pieces: item.local_pieces ?? 0,
        provider_count: item.provider_count ?? 0,
        health_ratio: item.health_ratio || 0,
        min_rank: item.min_rank || 0,
        local_disk_usage: item.local_disk_usage || 0,
        hot: item.hot ?? false,
        pinned: item.pinned,
        role: (item.role as "publisher" | "storage_provider") || "unknown",
        stage: item.stage || "",
      }));
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
            content_id: result.cid,
            name: path.split("/").pop() || path,
            total_size: result.size,
            encrypted,
            segment_count: 0,
            local_pieces: 0,
            provider_count: 0,
            health_ratio: 0,
            min_rank: 0,
            local_disk_usage: 0,
            hot: false,
            pinned: false,
            role: "publisher",
            stage: "publishing",
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
